"""Lead generation module — sales pipeline from first enquiry to client.

Authenticated (module key ``leads``):
  GET    /leads                          list + filters
  GET    /leads/stats                    pipeline KPIs
  GET    /leads/meta                     statuses / sources / priorities
  GET    /leads/assignees                staff users a lead can be assigned to
  GET    /leads/export                   CSV download
  POST   /leads/import                   CSV upload (Admin)
  GET    /leads/capture-form             public web-form settings (Admin)
  PATCH  /leads/capture-form             enable/disable, headline (Admin)
  POST   /leads/capture-form/regenerate  rotate the public token (Admin)
  POST   /leads                          create
  GET    /leads/{id}                     detail + activity timeline
  PATCH  /leads/{id}                     update (status changes are logged)
  DELETE /leads/{id}                     delete (Admin)
  POST   /leads/{id}/activities          log a call / note / visit
  POST   /leads/{id}/convert             convert to a Client (Admin)

Public (no login, token-guarded):
  GET    /public/lead-form/{token}
  POST   /public/lead-form/{token}

Visibility: Admins see every lead in their tenant; other staff see only
leads assigned to them or created by them.
"""
import csv
import io
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Client, Notification
from app.models.leads import (Lead, LeadActivity, LeadCaptureForm, LEAD_STATUSES,
                              OPEN_STATUSES, LEAD_SOURCES, LEAD_PRIORITIES, ACTIVITY_TYPES)
from app.models.tenant import Tenant
from app.core.security import require_roles, _effective_modules
from app.core.tenant_scope import tenant_scope, ensure_tenant_owned, assert_same_tenant
from app.crud import client_out

router = APIRouter(tags=["leads"])

STAFF_ROLES = ("Admin", "SiteEngineer", "Accountant", "ProcurementOfficer")
CONTACT_TYPES = {"Call", "Email", "WhatsApp", "Meeting", "SiteVisit"}
EDITABLE_FIELDS = ("name", "company", "email", "phone", "location", "project_type",
                   "requirement", "budget", "source", "status", "priority",
                   "assigned_to", "next_follow_up", "lost_reason")
CSV_COLUMNS = ["name", "phone", "email", "company", "location", "project_type",
               "requirement", "budget", "source", "status", "priority",
               "next_follow_up", "assigned_to", "created_at"]
MAX_IMPORT_ROWS = 2000
MAX_BUDGET = Decimal("999999999999.99")   # Numeric(14, 2)


# --------------------------------------------------------------------------
# Dependencies & helpers
# --------------------------------------------------------------------------

def leads_user(user: User = Depends(require_roles(*STAFF_ROLES))) -> User:
    """Staff user whose tenant (and per-user override) includes ``leads``."""
    if user.role == "SuperAdmin":
        return user
    if "leads" not in (_effective_modules(user) or []):
        raise HTTPException(status_code=403, detail="Leads module is not enabled for your account")
    return user


def leads_admin(user: User = Depends(leads_user)) -> User:
    if user.role not in ("Admin", "SuperAdmin"):
        raise HTTPException(status_code=403, detail="Only Admins can do this")
    return user


def _is_admin(user: User) -> bool:
    return user.role in ("Admin", "SuperAdmin")


def _visible(query, user: User):
    query = tenant_scope(query, Lead, user)
    if not _is_admin(user):
        query = query.filter(or_(Lead.assigned_to == user.id, Lead.created_by == user.id))
    return query


def _get_lead(db: Session, lead_id: int, user: User) -> Lead:
    lead = db.get(Lead, lead_id)
    assert_same_tenant(lead, user, "lead")
    if not _is_admin(user) and user.id not in (lead.assigned_to, lead.created_by):
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


def _clean(v, maxlen: int = 255) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s[:maxlen] if s else None


def _digits(phone: Optional[str]) -> str:
    d = re.sub(r"\D", "", phone or "")
    return d[-10:] if len(d) >= 10 else d


def _parse_budget(v) -> Optional[Decimal]:
    if v in (None, ""):
        return None
    try:
        d = Decimal(str(v).replace(",", "").replace("₹", "").strip())
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=422, detail="Budget must be a number")
    if not d.is_finite():
        raise HTTPException(status_code=422, detail="Budget must be a number")
    if d < 0:
        raise HTTPException(status_code=422, detail="Budget cannot be negative")
    if d > MAX_BUDGET:
        raise HTTPException(status_code=422, detail="Budget is too large")
    return d.quantize(Decimal("0.01"))


def _parse_dt(v) -> Optional[datetime]:
    if v in (None, ""):
        return None
    if isinstance(v, datetime):
        dt = v
    else:
        try:
            dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid follow-up date")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("Asia/Kolkata"))
    return dt


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def _choice(v, allowed, field):
    if v not in allowed:
        raise HTTPException(status_code=422, detail=f"Invalid {field}: {v}")
    return v


def _validate_assignee(db: Session, assignee_id, user: User) -> Optional[int]:
    if assignee_id in (None, ""):
        return None
    try:
        u = db.get(User, int(assignee_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Assignee must be an active staff user")
    if not u or u.role not in STAFF_ROLES or u.status == "Disabled":
        raise HTTPException(status_code=422, detail="Assignee must be an active staff user")
    if user.role != "SuperAdmin" and u.tenant_id != user.tenant_id:
        raise HTTPException(status_code=422, detail="Assignee must be an active staff user")
    return u.id


def _notify(db: Session, user_ids, ntype: str, title: str, message: str, link: str):
    for uid in {u for u in user_ids if u}:
        db.add(Notification(user_id=uid, type=ntype, title=title, message=message, link=link))


def _tenant_admin_ids(db: Session, tenant_id: int):
    return [u.id for u in db.query(User).filter(User.tenant_id == tenant_id, User.role == "Admin",
                                                 User.status != "Disabled").all()]


def _log(db: Session, lead: Lead, atype: str, content: str, user: Optional[User]):
    db.add(LeadActivity(lead_id=lead.id, type=atype, content=content,
                        created_by=user.id if user else None))


def lead_out(lead: Lead, with_activities: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    out = {
        "id": lead.id, "name": lead.name, "company": lead.company, "email": lead.email,
        "phone": lead.phone, "location": lead.location, "project_type": lead.project_type,
        "requirement": lead.requirement,
        "budget": float(lead.budget) if lead.budget is not None else None,
        "source": lead.source, "status": lead.status, "priority": lead.priority,
        "assigned_to": lead.assigned_to,
        "assignee_name": lead.assignee.name if lead.assignee else None,
        "next_follow_up": _iso(lead.next_follow_up),
        "follow_up_overdue": bool(lead.next_follow_up and lead.status in OPEN_STATUSES
                                  and lead.next_follow_up < now),
        "last_contacted_at": _iso(lead.last_contacted_at),
        "lost_reason": lead.lost_reason,
        "converted_client_id": lead.converted_client_id,
        "converted_at": _iso(lead.converted_at),
        "created_at": _iso(lead.created_at), "updated_at": _iso(lead.updated_at),
    }
    if with_activities:
        out["activities"] = [{
            "id": a.id, "type": a.type, "content": a.content,
            "author_name": a.author.name if a.author else ("Web form" if a.type == "Enquiry" else None),
            "created_at": _iso(a.created_at),
        } for a in lead.activities]
    return out


def _apply_fields(db: Session, lead: Lead, body: dict, user: User) -> list[str]:
    """Copy editable fields from ``body`` onto ``lead``; returns a list of
    human-readable change notes for the timeline."""
    notes = []
    if "name" in body:
        name = _clean(body.get("name"))
        if not name:
            raise HTTPException(status_code=422, detail="Lead name is required")
        lead.name = name
    for k, maxlen in (("company", 255), ("email", 255), ("phone", 40), ("location", 255),
                      ("project_type", 100)):
        if k in body:
            setattr(lead, k, _clean(body.get(k), maxlen))
    if "requirement" in body:
        lead.requirement = _clean(body.get("requirement"), 5000)
    if "lost_reason" in body:
        lead.lost_reason = _clean(body.get("lost_reason"), 2000)
    if "budget" in body:
        lead.budget = _parse_budget(body.get("budget"))
    if "source" in body and body.get("source"):
        lead.source = _choice(body["source"], LEAD_SOURCES, "source")
    if "priority" in body and body.get("priority"):
        lead.priority = _choice(body["priority"], LEAD_PRIORITIES, "priority")
    if "next_follow_up" in body:
        lead.next_follow_up = _parse_dt(body.get("next_follow_up"))
    if "assigned_to" in body:
        new_assignee = _validate_assignee(db, body.get("assigned_to"), user)
        if new_assignee != lead.assigned_to:
            lead.assigned_to = new_assignee
            if new_assignee:
                assignee = db.get(User, new_assignee)
                notes.append(f"Assigned to {assignee.name}")
            else:
                notes.append("Unassigned")
    if "status" in body and body.get("status") and body["status"] != lead.status:
        if lead.converted_client_id:
            raise HTTPException(status_code=409, detail="This lead is converted to a client; its status stays Won")
        new_status = _choice(body["status"], LEAD_STATUSES, "status")
        notes.append(f"Status: {lead.status} → {new_status}")
        lead.status = new_status
    if lead.status == "Lost" and not lead.lost_reason and "status" in body:
        raise HTTPException(status_code=422, detail="Please give a reason when marking a lead Lost")
    if not lead.email and not lead.phone:
        raise HTTPException(status_code=422, detail="Add at least a phone number or an email")
    return notes


def _find_duplicate(db: Session, tenant_id: int, phone: Optional[str], email: Optional[str],
                    exclude_id: Optional[int] = None) -> Optional[Lead]:
    conds = []
    d = _digits(phone)
    if len(d) >= 7:
        conds.append(func.right(func.regexp_replace(Lead.phone, r"\D", "", "g"), 10) == d)
    if email:
        conds.append(func.lower(Lead.email) == email.strip().lower())
    if not conds:
        return None
    q = db.query(Lead).filter(Lead.tenant_id == tenant_id, or_(*conds))
    if exclude_id:
        q = q.filter(Lead.id != exclude_id)
    return q.order_by(Lead.created_at.desc()).first()


# --------------------------------------------------------------------------
# Static routes (declared before /leads/{lead_id})
# --------------------------------------------------------------------------

@router.get("/leads/meta")
def leads_meta(_: User = Depends(leads_user)):
    return {"statuses": LEAD_STATUSES, "open_statuses": OPEN_STATUSES, "sources": LEAD_SOURCES,
            "priorities": LEAD_PRIORITIES, "activity_types": [t for t in ACTIVITY_TYPES
                                                              if t not in ("StatusChange", "Enquiry", "System")]}


@router.get("/leads/assignees")
def leads_assignees(db: Session = Depends(get_db), user: User = Depends(leads_user)):
    q = db.query(User).filter(User.role.in_(STAFF_ROLES), User.status != "Disabled")
    if user.role != "SuperAdmin":
        q = q.filter(User.tenant_id == user.tenant_id)
    return [{"id": u.id, "name": u.name, "role": u.role} for u in q.order_by(User.name).all()]


def _csv_safe(v) -> str:
    """Neutralise spreadsheet formulas in user-supplied text (CSV injection)."""
    if v is None:
        return ""
    s = str(v)
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r") and not isinstance(v, (int, float)):
        return "'" + s
    return s


def _filtered(db: Session, user: User, status=None, source=None, assigned_to=None, q=None,
              follow_up=None, include_closed=True, tz="Asia/Kolkata"):
    query = _visible(db.query(Lead), user)
    if status:
        query = query.filter(Lead.status.in_(status.split(",")))
    elif not include_closed:
        query = query.filter(Lead.status.in_(OPEN_STATUSES))
    if source:
        query = query.filter(Lead.source == source)
    if assigned_to == "me":
        query = query.filter(Lead.assigned_to == user.id)
    elif assigned_to == "none":
        query = query.filter(Lead.assigned_to.is_(None))
    elif assigned_to:
        if not str(assigned_to).isdigit():
            raise HTTPException(status_code=422, detail="Invalid assigned_to filter")
        query = query.filter(Lead.assigned_to == int(assigned_to))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Lead.name.ilike(like), Lead.company.ilike(like),
                                 Lead.email.ilike(like), Lead.phone.ilike(like),
                                 Lead.location.ilike(like)))
    if follow_up:
        now = datetime.now(timezone.utc)
        start, end = _today_bounds(tz)
        query = query.filter(Lead.status.in_(OPEN_STATUSES), Lead.next_follow_up.isnot(None))
        if follow_up == "overdue":
            query = query.filter(Lead.next_follow_up < now)
        elif follow_up == "today":
            query = query.filter(Lead.next_follow_up >= start, Lead.next_follow_up < end)
        elif follow_up == "upcoming":
            query = query.filter(Lead.next_follow_up >= now)
    return query


def _today_bounds(tz: str):
    try:
        zone = ZoneInfo(tz)
    except Exception:  # noqa: BLE001
        zone = ZoneInfo("Asia/Kolkata")
    local = datetime.now(zone)
    start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


@router.get("/leads/stats")
def leads_stats(db: Session = Depends(get_db), user: User = Depends(leads_user),
                tz: str = "Asia/Kolkata"):
    leads = _visible(db.query(Lead), user).all()
    now = datetime.now(timezone.utc)
    start, end = _today_bounds(tz)
    month_start = datetime.now(start.tzinfo).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    by_status = {s: 0 for s in LEAD_STATUSES}
    by_source: dict[str, int] = defaultdict(int)
    pipeline_value = won_value = 0.0
    overdue = due_today = new_this_month = 0
    for l in leads:
        by_status[l.status] = by_status.get(l.status, 0) + 1
        by_source[l.source] += 1
        b = float(l.budget or 0)
        if l.status in OPEN_STATUSES:
            pipeline_value += b
            if l.next_follow_up:
                if l.next_follow_up < now:
                    overdue += 1
                if start <= l.next_follow_up < end:
                    due_today += 1
        elif l.status == "Won":
            won_value += b
        if l.created_at and l.created_at >= month_start:
            new_this_month += 1
    won, lost = by_status.get("Won", 0), by_status.get("Lost", 0)
    return {
        "total": len(leads),
        "open": sum(by_status[s] for s in OPEN_STATUSES),
        "by_status": by_status,
        "by_source": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        "pipeline_value": pipeline_value, "won_value": won_value,
        "win_rate": round(100 * won / (won + lost), 1) if (won + lost) else None,
        "overdue_follow_ups": overdue, "follow_ups_today": due_today,
        "new_this_month": new_this_month,
    }


@router.get("/leads/export")
def export_leads(db: Session = Depends(get_db), user: User = Depends(leads_user),
                 status: Optional[str] = None, source: Optional[str] = None,
                 assigned_to: Optional[str] = None, q: Optional[str] = None):
    rows = _filtered(db, user, status, source, assigned_to, q).order_by(Lead.created_at.desc()).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_COLUMNS)
    for l in rows:
        o = lead_out(l)
        o["assigned_to"] = o["assignee_name"] or ""
        w.writerow([_csv_safe(o.get(c)) for c in CSV_COLUMNS])
    buf.seek(0)
    stamp = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y%m%d")
    return StreamingResponse(iter(["﻿" + buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="leads_{stamp}.csv"'})


@router.post("/leads/import")
def import_leads(file: UploadFile = File(...), db: Session = Depends(get_db),
                 user: User = Depends(leads_admin)):
    # Plain ``def`` so FastAPI runs this (many sync DB calls) in its threadpool.
    raw = file.file.read(5 * 1024 * 1024 + 1)
    if len(raw) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV must be under 5 MB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="CSV has no header row")
    # Accept loose header names: "Name", "Mobile", "Phone Number", "E-mail" ...
    alias = {"mobile": "phone", "phone number": "phone", "contact": "phone", "e-mail": "email",
             "email id": "email", "city": "location", "address": "location", "type": "project_type",
             "project type": "project_type", "requirements": "requirement", "notes": "requirement",
             "value": "budget", "amount": "budget", "lead source": "source", "full name": "name",
             "customer name": "name"}
    tenant_id = user.tenant_id or 1
    created, duplicates, errors = 0, 0, []
    for i, row in enumerate(reader, start=2):
        if i - 1 > MAX_IMPORT_ROWS:
            errors.append({"row": i, "error": f"Stopped after {MAX_IMPORT_ROWS} rows"})
            break
        r = {}
        for k, v in row.items():
            if k is None:
                continue
            key = k.strip().lower()
            r[alias.get(key, key.replace(" ", "_"))] = (v or "").strip()
        if not any(r.values()):
            continue
        name = _clean(r.get("name"))
        if not name:
            errors.append({"row": i, "error": "Missing name"}); continue
        if not r.get("phone") and not r.get("email"):
            errors.append({"row": i, "error": "Missing phone and email"}); continue
        if _find_duplicate(db, tenant_id, r.get("phone"), r.get("email")):
            duplicates += 1; continue
        try:
            budget = _parse_budget(r.get("budget"))
        except HTTPException:
            errors.append({"row": i, "error": "Budget is not a number"}); continue
        source = r.get("source") if r.get("source") in LEAD_SOURCES else "Other"
        lead = Lead(name=name, company=_clean(r.get("company")), email=_clean(r.get("email")),
                    phone=_clean(r.get("phone"), 40), location=_clean(r.get("location")),
                    project_type=_clean(r.get("project_type"), 100),
                    requirement=_clean(r.get("requirement"), 5000), budget=budget,
                    source=source, status="New", priority="Medium", created_by=user.id,
                    tenant_id=tenant_id)
        db.add(lead); db.flush()
        _log(db, lead, "System", f"Imported from {file.filename or 'CSV'}", user)
        created += 1
    db.commit()
    return {"created": created, "skipped_duplicates": duplicates, "errors": errors[:50]}


def _get_or_create_form(db: Session, user: User) -> LeadCaptureForm:
    tid = user.tenant_id or 1
    f = db.query(LeadCaptureForm).filter(LeadCaptureForm.tenant_id == tid).first()
    if not f:
        f = LeadCaptureForm(tenant_id=tid, token=secrets.token_urlsafe(16), is_enabled=True)
        db.add(f); db.commit(); db.refresh(f)
    return f


def _form_out(f: LeadCaptureForm) -> dict:
    return {"token": f.token, "is_enabled": f.is_enabled, "headline": f.headline,
            "path": f"/enquiry/{f.token}"}


@router.get("/leads/capture-form")
def get_capture_form(db: Session = Depends(get_db), user: User = Depends(leads_admin)):
    return _form_out(_get_or_create_form(db, user))


@router.patch("/leads/capture-form")
def patch_capture_form(body: dict, db: Session = Depends(get_db), user: User = Depends(leads_admin)):
    f = _get_or_create_form(db, user)
    if "is_enabled" in body:
        f.is_enabled = bool(body["is_enabled"])
    if "headline" in body:
        f.headline = _clean(body.get("headline"), 200)
    db.commit(); db.refresh(f)
    return _form_out(f)


@router.post("/leads/capture-form/regenerate")
def regenerate_capture_form(db: Session = Depends(get_db), user: User = Depends(leads_admin)):
    f = _get_or_create_form(db, user)
    f.token = secrets.token_urlsafe(16)
    db.commit(); db.refresh(f)
    return _form_out(f)


# --------------------------------------------------------------------------
# CRUD
# --------------------------------------------------------------------------

@router.get("/leads")
def list_leads(db: Session = Depends(get_db), user: User = Depends(leads_user),
               status: Optional[str] = None, source: Optional[str] = None,
               assigned_to: Optional[str] = None, q: Optional[str] = None,
               follow_up: Optional[str] = Query(None, pattern="^(overdue|today|upcoming)$"),
               include_closed: bool = True, tz: str = "Asia/Kolkata"):
    rows = (_filtered(db, user, status, source, assigned_to, q, follow_up, include_closed, tz)
            .order_by(Lead.created_at.desc(), Lead.id.desc()).limit(1000).all())
    return [lead_out(l) for l in rows]


@router.post("/leads", status_code=201)
def create_lead(body: dict, db: Session = Depends(get_db), user: User = Depends(leads_user)):
    lead = Lead(status="New", priority="Medium", source="Other", created_by=user.id)
    ensure_tenant_owned(lead, user)
    body = dict(body)
    if not _is_admin(user) and "assigned_to" not in body:
        body["assigned_to"] = user.id   # staff own the leads they add
    _apply_fields(db, lead, body, user)
    dup = _find_duplicate(db, lead.tenant_id, lead.phone, lead.email)
    if dup and not body.get("allow_duplicate"):
        if _is_admin(user) or user.id in (dup.assigned_to, dup.created_by):
            raise HTTPException(status_code=409, detail={
                "msg": f"A lead with this phone/email already exists: {dup.name} ({dup.status})",
                "duplicate_id": dup.id})
        raise HTTPException(status_code=409, detail={
            "msg": "A lead with this phone/email already exists and is handled by a colleague. Ask an Admin."})
    db.add(lead); db.flush()
    _log(db, lead, "System", f"Lead created · source {lead.source}", user)
    if lead.assigned_to and lead.assigned_to != user.id:
        _notify(db, [lead.assigned_to], "LeadAssigned", f"New lead assigned: {lead.name}",
                f"{user.name} assigned you a lead", f"/admin/leads/{lead.id}")
    db.commit(); db.refresh(lead)
    return lead_out(lead, with_activities=True)


@router.get("/leads/{lead_id}")
def get_lead(lead_id: int, db: Session = Depends(get_db), user: User = Depends(leads_user)):
    return lead_out(_get_lead(db, lead_id, user), with_activities=True)


@router.patch("/leads/{lead_id}")
def patch_lead(lead_id: int, body: dict, db: Session = Depends(get_db),
               user: User = Depends(leads_user)):
    lead = _get_lead(db, lead_id, user)
    if not _is_admin(user) and "assigned_to" in body and body["assigned_to"] != lead.assigned_to:
        raise HTTPException(status_code=403, detail="Only Admins can reassign leads")
    old_assignee = lead.assigned_to
    notes = _apply_fields(db, lead, body, user)
    for n in notes:
        _log(db, lead, "StatusChange", n, user)
    if lead.assigned_to and lead.assigned_to != old_assignee and lead.assigned_to != user.id:
        _notify(db, [lead.assigned_to], "LeadAssigned", f"Lead assigned: {lead.name}",
                f"{user.name} assigned you a lead", f"/admin/leads/{lead.id}")
    db.commit(); db.refresh(lead)
    return lead_out(lead, with_activities=True)


@router.delete("/leads/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db), user: User = Depends(leads_admin)):
    lead = _get_lead(db, lead_id, user)
    db.delete(lead); db.commit()
    return {"status": "deleted"}


@router.post("/leads/{lead_id}/activities", status_code=201)
def add_activity(lead_id: int, body: dict, db: Session = Depends(get_db),
                 user: User = Depends(leads_user)):
    lead = _get_lead(db, lead_id, user)
    atype = body.get("type") or "Note"
    if atype not in ACTIVITY_TYPES or atype in ("StatusChange", "Enquiry", "System"):
        raise HTTPException(status_code=422, detail=f"Invalid activity type: {atype}")
    content = _clean(body.get("content"), 5000)
    if not content:
        raise HTTPException(status_code=422, detail="Add a short note about this activity")
    _log(db, lead, atype, content, user)
    if atype in CONTACT_TYPES:
        lead.last_contacted_at = datetime.now(timezone.utc)
        if lead.status == "New":
            _log(db, lead, "StatusChange", "Status: New → Contacted", user)
            lead.status = "Contacted"
        if atype == "SiteVisit" and lead.status in ("Contacted", "Qualified"):
            _log(db, lead, "StatusChange", f"Status: {lead.status} → SiteVisit", user)
            lead.status = "SiteVisit"
    if "next_follow_up" in body:
        lead.next_follow_up = _parse_dt(body.get("next_follow_up"))
    lead.updated_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(lead)
    return lead_out(lead, with_activities=True)


@router.post("/leads/{lead_id}/convert")
def convert_lead(lead_id: int, body: Optional[dict] = None, db: Session = Depends(get_db),
                 user: User = Depends(leads_admin)):
    body = body or {}
    lead = _get_lead(db, lead_id, user)
    if lead.converted_client_id:
        raise HTTPException(status_code=409, detail="This lead is already converted to a client")
    if body.get("client_id"):
        try:
            client = db.get(Client, int(body["client_id"]))
        except (TypeError, ValueError):
            client = None
        if not client or client.tenant_id != lead.tenant_id:
            raise HTTPException(status_code=404, detail="Client not found")
        note = f"Linked to existing client {client.name}"
    else:
        client = Client(name=lead.name, company=lead.company, email=lead.email, phone=lead.phone,
                        address=lead.location, notes=lead.requirement, tenant_id=lead.tenant_id)
        db.add(client); db.flush()
        note = f"Converted to client {client.name}"
    old = lead.status
    lead.status = "Won"
    lead.converted_client_id = client.id
    lead.converted_at = datetime.now(timezone.utc)
    lead.next_follow_up = None
    if old != "Won":
        _log(db, lead, "StatusChange", f"Status: {old} → Won", user)
    _log(db, lead, "System", note, user)
    db.commit(); db.refresh(lead); db.refresh(client)
    return {"lead": lead_out(lead, with_activities=True), "client": client_out(client)}


# --------------------------------------------------------------------------
# Public enquiry form
# --------------------------------------------------------------------------

_RATE: dict[str, deque] = defaultdict(deque)
RATE_LIMIT, RATE_WINDOW = 5, 600   # 5 submissions / 10 min / IP


def _client_ip(request: Request) -> str:
    # nginx's $proxy_add_x_forwarded_for *appends* the real peer address, so the
    # last entry is the one our proxy vouches for; earlier ones are client-supplied.
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[-1].strip()
    return request.client.host if request.client else "?"


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    if len(_RATE) > 10000:           # bound memory: drop idle keys
        for k in [k for k, q in _RATE.items() if not q or now - q[-1] > RATE_WINDOW]:
            del _RATE[k]
    q = _RATE[ip]
    while q and now - q[0] > RATE_WINDOW:
        q.popleft()
    if len(q) >= RATE_LIMIT:
        return True
    q.append(now)
    return False


def _public_form(db: Session, token: str) -> tuple[LeadCaptureForm, Tenant]:
    f = db.query(LeadCaptureForm).filter(LeadCaptureForm.token == token).first()
    t = db.get(Tenant, f.tenant_id) if f else None
    if not f or not t or not t.is_active or not f.is_enabled \
            or "leads" not in (t.allowed_modules or []):
        raise HTTPException(status_code=404, detail="This enquiry form is not available")
    return f, t


@router.get("/public/lead-form/{token}")
def public_form_info(token: str, db: Session = Depends(get_db)):
    f, t = _public_form(db, token)
    return {"company_name": t.name, "headline": f.headline,
            "project_types": ["Residential", "Commercial", "Interior", "Renovation",
                              "Villa", "Apartment", "Industrial", "Other"]}


@router.post("/public/lead-form/{token}", status_code=201)
def public_form_submit(token: str, body: dict, request: Request, db: Session = Depends(get_db)):
    f, t = _public_form(db, token)
    if _clean(body.get("website")):          # honeypot — bots fill every field
        return {"status": "received"}
    if _rate_limited(f"{token}:{_client_ip(request)}"):
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.")
    name = _clean(body.get("name"), 120)
    phone = _clean(body.get("phone"), 40)
    email = _clean(body.get("email"), 200)
    if not name:
        raise HTTPException(status_code=422, detail="Please enter your name")
    if not phone and not email:
        raise HTTPException(status_code=422, detail="Please enter a phone number or email")
    if phone and len(_digits(phone)) < 7:
        raise HTTPException(status_code=422, detail="Please enter a valid phone number")
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=422, detail="Please enter a valid email")
    try:
        budget = _parse_budget(body.get("budget"))
    except HTTPException:
        budget = None
    requirement = _clean(body.get("requirement"), 3000)
    project_type = _clean(body.get("project_type"), 100)
    location = _clean(body.get("location"), 200)

    summary = " · ".join(x for x in [project_type, location,
                                       f"Budget ₹{budget:,.0f}" if budget else None] if x)
    enquiry_note = (summary + ("\n" if summary and requirement else "") + (requirement or "")) or "New web enquiry"
    admins = _tenant_admin_ids(db, t.id)

    existing = _find_duplicate(db, t.id, phone, email)
    if existing and existing.status in OPEN_STATUSES:
        _log(db, existing, "Enquiry", "Enquired again via web form\n" + enquiry_note, None)
        existing.updated_at = datetime.now(timezone.utc)
        _notify(db, admins + [existing.assigned_to], "LeadEnquiry",
                f"Repeat enquiry: {existing.name}", "Existing lead submitted the web form again",
                f"/admin/leads/{existing.id}")
        db.commit()
        return {"status": "received"}

    lead = Lead(tenant_id=t.id, name=name, phone=phone, email=email, location=location,
                project_type=project_type, requirement=requirement, budget=budget,
                source="Website", status="New", priority="Medium",
                next_follow_up=datetime.now(timezone.utc) + timedelta(hours=24))
    db.add(lead); db.flush()
    _log(db, lead, "Enquiry", enquiry_note, None)
    _notify(db, admins, "LeadNew", f"New web enquiry: {name}",
            summary or "Submitted the website enquiry form", f"/admin/leads/{lead.id}")
    db.commit()
    return {"status": "received"}
