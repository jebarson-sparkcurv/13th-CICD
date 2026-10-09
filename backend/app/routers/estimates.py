import os
import secrets
import smtplib
from datetime import date, datetime, timedelta, timezone
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.core.tenant_scope import assert_same_tenant, ensure_tenant_owned, tenant_scope
from app.database import get_db
from app.models import Project, User
from app.models.finance import (Estimate, EstimateApprovalEvent, EstimateCategory, EstimateStatus,
                                EstimateRequirement, RequirementMaster)

router = APIRouter(tags=["estimates"])
STAFF = require_roles("Admin", "Accountant", "SiteEngineer", "ProcurementOfficer")

DEFAULT_CATEGORIES = ["Civil Works", "Electrical", "Plumbing", "Interior", "Structural"]
DEFAULT_STATUSES = ["Draft", "Pending Approval", "Approved", "Rejected"]


def ensure_defaults(db):
    if db.query(EstimateCategory).count() == 0:
        for n in DEFAULT_CATEGORIES:
            db.add(EstimateCategory(name=n))
        db.commit()
    if db.query(EstimateStatus).count() == 0:
        for n in DEFAULT_STATUSES:
            db.add(EstimateStatus(name=n))
        db.commit()


class NameIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


@router.get("/estimate-categories")
def list_categories(db: Session = Depends(get_db), user: User = Depends(STAFF)):
    ensure_defaults(db)
    return [{"id": c.id, "name": c.name} for c in
            db.query(EstimateCategory).order_by(EstimateCategory.name).all()]


@router.post("/estimate-categories", status_code=201)
def create_category(body: NameIn, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    name = body.name.strip()
    existing = db.query(EstimateCategory).filter(EstimateCategory.name.ilike(name)).first()
    if existing:
        return {"id": existing.id, "name": existing.name}
    c = EstimateCategory(name=name)
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name}


@router.get("/estimate-statuses")
def list_statuses(db: Session = Depends(get_db), user: User = Depends(STAFF)):
    ensure_defaults(db)
    return [{"id": s.id, "name": s.name} for s in
            db.query(EstimateStatus).order_by(EstimateStatus.name).all()]


@router.post("/estimate-statuses", status_code=201)
def create_status(body: NameIn, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    name = body.name.strip()
    existing = db.query(EstimateStatus).filter(EstimateStatus.name.ilike(name)).first()
    if existing:
        return {"id": existing.id, "name": existing.name}
    s = EstimateStatus(name=name)
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name}


class EstimateCreate(BaseModel):
    client_id: int
    project_name: Optional[str] = None
    phase: Optional[str] = None
    category_id: int
    drawing_url: Optional[str] = None
    drawing_filename: Optional[str] = None
    total_amount: Optional[float] = None
    status_id: int
    estimate_date: Optional[date] = None
    requirements: Optional[list["RequirementRow"]] = None


class RequirementRow(BaseModel):
    requirement_name: str = Field(min_length=1, max_length=200)
    price: float = Field(gt=0)


@router.get("/requirements-master")
def list_requirements_master(db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return [{"id": r.id, "name": r.name} for r in
            db.query(RequirementMaster).order_by(RequirementMaster.name).all()]


@router.get("/estimate-phase-options")
def estimate_phase_options(project_name: str = "", db: Session = Depends(get_db),
                           user: User = Depends(STAFF)):
    name = (project_name or "").strip()
    if not name:
        return {"project_id": None, "phases": []}
    from app.models import Phase
    project = db.query(Project).filter(Project.name.ilike(name)).first()
    if not project:
        return {"project_id": None, "phases": []}
    phases = db.query(Phase).filter(Phase.project_id == project.id).order_by(Phase.sequence_order).all()
    return {"project_id": project.id, "project_name": project.name,
            "phases": [p.name for p in phases]}


def upsert_requirement_master(db, name):
    if not db.query(RequirementMaster).filter(RequirementMaster.name.ilike(name)).first():
        db.add(RequirementMaster(name=name))


def sync_phase_to_project(db, project_name, phase_name, tenant_id=None):
    if not (project_name and phase_name):
        return None
    from app.models import Phase
    q = db.query(Project).filter(Project.name.ilike(project_name.strip()))
    if tenant_id is not None:
        q = q.filter(Project.tenant_id == tenant_id)
    project = q.first()
    if not project:
        return None
    return ensure_phase_on_project(db, project, phase_name)


def ensure_phase_on_project(db, project, phase_name):
    """Create the phase on the project if missing; return the phase id."""
    from app.models import Phase
    name = (phase_name or "").strip()
    if not name:
        return None
    existing = db.query(Phase).filter(Phase.project_id == project.id,
                                      Phase.name.ilike(name)).first()
    if existing:
        return existing.id
    max_seq = max([p.sequence_order for p in
                   db.query(Phase).filter(Phase.project_id == project.id).all()] or [0])
    ph = Phase(project_id=project.id, name=name, sequence_order=max_seq + 1)
    db.add(ph)
    db.flush()
    return ph.id


def estimate_out(e, events=None, clients=None, reqs=None):
    return {"id": e.id, "project_name": e.project_name, "phase": e.phase,
            "client_id": e.client_id,
            "client_name": (clients or {}).get(e.client_id),
            "category_id": e.category_id, "category": e.category.name if e.category else None,
            "drawing_url": e.drawing_url, "drawing_filename": e.drawing_filename,
            "total_amount": float(e.total_amount),
            "status_id": e.status_id, "current_status": e.status.name if e.status else None,
            "approval_state": e.approval_state or "pending",
            "client_email": e.client_email,
            "sent_at": e.sent_at.isoformat() if e.sent_at else None,
            "approved_at": e.approved_at.isoformat() if e.approved_at else None,
            "rejected_at": e.rejected_at.isoformat() if e.rejected_at else None,
            "rejection_reason": e.rejection_reason,
            "linked_project_id": e.linked_project_id,
            "awaiting_response": bool(e.sent_at and (e.approval_state or "pending") == "pending"),
            "events": events or [],
            "requirements": reqs or [],
            "estimate_date": e.estimate_date.isoformat() if e.estimate_date else None,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "updated_at": e.updated_at.isoformat() if e.updated_at else None}


@router.get("/estimates")
def list_estimates(db: Session = Depends(get_db), user: User = Depends(STAFF)):
    ensure_defaults(db)
    from app.models import Client
    clients = {c.id: c.name for c in db.query(Client).all()}
    req_map = {}
    for r in db.query(EstimateRequirement).order_by(EstimateRequirement.id).all():
        req_map.setdefault(r.estimate_id, []).append(
            {"requirement_name": r.requirement_name, "price": float(r.price)})
    return [estimate_out(e, clients=clients, reqs=req_map.get(e.id)) for e in
            tenant_scope(db.query(Estimate), Estimate, user).order_by(Estimate.created_at.desc()).all()]


@router.get("/estimate-clients")
def estimate_clients(db: Session = Depends(get_db), user: User = Depends(STAFF)):
    from app.models import Client
    return [{"id": c.id, "name": c.name, "email": c.email}
            for c in tenant_scope(db.query(Client), Client, user).order_by(Client.name).all()]


@router.post("/estimates", status_code=201)
def create_estimate(body: EstimateCreate, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    from app.models import Client
    client = db.get(Client, body.client_id)
    if not client:
        raise HTTPException(status_code=422, detail="Client is required — select a valid client")
    assert_same_tenant(client, user, "client")
    if not db.get(EstimateCategory, body.category_id):
        raise HTTPException(status_code=422, detail="Invalid category")
    if not db.get(EstimateStatus, body.status_id):
        raise HTTPException(status_code=422, detail="Invalid status")
    reqs = body.requirements or []
    if reqs:
        total = round(sum(r.price for r in reqs), 2)
    else:
        total = body.total_amount or 0
    if not total or total <= 0:
        raise HTTPException(status_code=422,
                            detail="Add at least one requirement with a price, or enter a total amount greater than 0")
    e = Estimate(client_id=client.id,
                 project_name=(body.project_name or "").strip() or None,
                 phase=(body.phase or "").strip() or None,
                 category_id=body.category_id, drawing_url=body.drawing_url,
                 drawing_filename=body.drawing_filename, total_amount=total,
                 status_id=body.status_id, created_by=user.id,
                 estimate_date=body.estimate_date or date.today(),
                 client_email=client.email or None)
    ensure_tenant_owned(e, user)
    db.add(e)
    db.flush()
    out_reqs = []
    for r in reqs:
        name = r.requirement_name.strip()
        db.add(EstimateRequirement(estimate_id=e.id, requirement_name=name, price=r.price))
        upsert_requirement_master(db, name)
        out_reqs.append({"requirement_name": name, "price": r.price})
    synced_phase_id = sync_phase_to_project(db, e.project_name, e.phase,
                                            tenant_id=getattr(user, "tenant_id", None))
    db.commit()
    db.refresh(e)
    out = estimate_out(e, clients={client.id: client.name}, reqs=out_reqs)
    out["synced_phase_id"] = synced_phase_id
    return out


@router.delete("/estimates/{estimate_id}", status_code=204)
def delete_estimate(estimate_id: int, db: Session = Depends(get_db),
                    user: User = Depends(require_roles("Admin", "Accountant"))):
    e = db.get(Estimate, estimate_id)
    assert_same_tenant(e, user, "estimate")
    db.query(EstimateApprovalEvent).filter(EstimateApprovalEvent.estimate_id == estimate_id).delete()
    db.delete(e)
    db.commit()


# ---------- Approval workflow ----------

def log_event(db, estimate_id, action, actor, detail=None):
    db.add(EstimateApprovalEvent(estimate_id=estimate_id, action=action, actor=actor, detail=detail))


def now_utc():
    return datetime.now(timezone.utc)


def get_estimate_or_404(db, estimate_id, user=None):
    e = db.get(Estimate, estimate_id)
    if not e:
        raise HTTPException(status_code=404, detail="Estimate not found")
    if user is not None:
        assert_same_tenant(e, user, "estimate")
    return e


def fmt_inr(n):
    return f"Rs. {float(n):,.2f}"


def display_name(estimate):
    return estimate.project_name or f"Estimate #{estimate.id}"


def send_approval_email(estimate, approve_url, reject_url, reqs=None, client_name=None):
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "465"))
    sender = os.environ.get("SMTP_EMAIL")
    password = os.environ.get("SMTP_PASSWORD")
    if not (host and sender and password):
        raise RuntimeError("SMTP not configured — set SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD in backend/.env")
    drawing = ""
    if estimate.drawing_url:
        base = os.environ.get("FRONTEND_URL", "")
        drawing = f'<p><b>Drawing:</b> <a href="{base}/api/uploads/{estimate.drawing_url.split("/")[-1]}">{estimate.drawing_filename or "View drawing"}</a></p>'
    req_html = ""
    if reqs:
        rows = "".join(
            f'<tr><td style="padding:6px 10px;border:1px solid #e2e8f0">{r["requirement_name"]}</td>'
            f'<td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right">{fmt_inr(r["price"])}</td></tr>'
            for r in reqs)
        req_html = f"""
        <p style="margin-bottom:6px"><b>Requirements</b></p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr><th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f8fafc;text-align:left">Requirement</th>
              <th style="padding:6px 10px;border:1px solid #e2e8f0;background:#f8fafc;text-align:right">Price</th></tr>
          {rows}
          <tr><td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right"><b>Total</b></td>
              <td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:right"><b>{fmt_inr(estimate.total_amount)}</b></td></tr>
        </table>"""
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0">
      <div style="background:#0f172a;color:#fff;padding:18px 24px">
        <h2 style="margin:0">SITERA <span style="color:#f59e0b">— Estimate Approval Request</span></h2>
      </div>
      <div style="padding:24px">
        <p>You have received a project estimate for review:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b">Client</td><td style="padding:6px 0"><b>{client_name or "—"}</b></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Project Name</td><td style="padding:6px 0"><b>{display_name(estimate)}</b></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Phase</td><td style="padding:6px 0">{estimate.phase or "—"}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Category</td><td style="padding:6px 0">{estimate.category.name if estimate.category else "—"}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Status</td><td style="padding:6px 0">{estimate.status.name if estimate.status else "—"}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Total Amount</td><td style="padding:6px 0"><b style="font-size:16px">{fmt_inr(estimate.total_amount)}</b></td></tr>
        </table>
        {req_html}
        {drawing}
        <div style="margin:28px 0;text-align:center">
          <a href="{approve_url}" style="background:#059669;color:#fff;padding:12px 28px;text-decoration:none;font-weight:bold;margin-right:12px">APPROVE</a>
          <a href="{reject_url}" style="background:#dc2626;color:#fff;padding:12px 28px;text-decoration:none;font-weight:bold">REJECT</a>
        </div>
        <p style="color:#94a3b8;font-size:12px">These links are single-use and expire in 14 days. No login required.</p>
      </div>
    </div>"""
    msg = MIMEText(html, "html")
    msg["Subject"] = f"Estimate approval request — {display_name(estimate)} ({fmt_inr(estimate.total_amount)})"
    msg["From"] = f"Sitera <{sender}>"
    msg["To"] = estimate.client_email
    with smtplib.SMTP_SSL(host, port, timeout=20) as server:
        server.login(sender, password)
        server.sendmail(sender, [estimate.client_email], msg.as_string())


class SendApprovalIn(BaseModel):
    client_email: EmailStr


@router.post("/estimates/{estimate_id}/send-approval")
def send_for_approval(estimate_id: int, body: SendApprovalIn, request: Request,
                      db: Session = Depends(get_db), user: User = Depends(STAFF)):
    e = get_estimate_or_404(db, estimate_id)
    if e.linked_project_id:
        raise HTTPException(status_code=422, detail="A project has already been created from this estimate")
    token = secrets.token_urlsafe(32)
    e.client_email = body.client_email
    e.approval_token = token
    e.token_expires_at = now_utc() + timedelta(days=14)
    e.token_used = False
    e.approval_state = "pending"
    e.sent_at = now_utc()
    e.approved_at = None
    e.rejected_at = None
    e.rejection_reason = None
    pending = db.query(EstimateStatus).filter(EstimateStatus.name.ilike("Pending Approval")).first()
    if pending:
        e.status_id = pending.id
    base = (os.environ.get("FRONTEND_URL")
            or request.headers.get("origin")
            or (f"{request.headers.get('x-forwarded-proto', request.url.scheme)}://{request.headers.get('x-forwarded-host') or request.headers.get('host', '')}")
            ).rstrip("/")
    approve_url = f"{base}/estimate-approval/{e.id}/{token}?action=approve"
    reject_url = f"{base}/estimate-approval/{e.id}/{token}?action=reject"
    email_sent, email_error = True, None
    reqs = [{"requirement_name": r.requirement_name, "price": float(r.price)} for r in
            db.query(EstimateRequirement).filter(EstimateRequirement.estimate_id == e.id)
            .order_by(EstimateRequirement.id).all()]
    from app.models import Client
    client = db.get(Client, e.client_id) if e.client_id else None
    try:
        send_approval_email(e, approve_url, reject_url, reqs=reqs,
                            client_name=client.name if client else None)
    except Exception as ex:
        email_sent = False
        email_error = str(ex)
        if "535" in email_error or "BadCredentials" in email_error:
            email_error = "Email login rejected by the mail server (check SMTP_EMAIL / SMTP_PASSWORD — Gmail requires an App Password with 2-Step Verification)"
    log_event(db, e.id, "sent for approval" + ("" if email_sent else " (email failed — link shared manually)"),
              user.name, f"to {body.client_email}")
    db.commit()
    db.refresh(e)
    return {**estimate_out(e, reqs=reqs), "email_sent": email_sent, "email_error": email_error,
            "approve_url": approve_url, "reject_url": reject_url}


def check_token(e, token):
    if not e.approval_token or not secrets.compare_digest(e.approval_token, token):
        raise HTTPException(status_code=403, detail="Invalid approval link")
    if e.token_used:
        raise HTTPException(status_code=410, detail="This approval link has already been used")
    if e.token_expires_at and now_utc() > e.token_expires_at:
        raise HTTPException(status_code=410, detail="This approval link has expired")


@router.get("/public/estimate-approval/{estimate_id}/{token}")
def public_estimate_view(estimate_id: int, token: str, db: Session = Depends(get_db)):
    e = get_estimate_or_404(db, estimate_id)
    check_token(e, token)
    return {"id": e.id, "project_name": display_name(e), "phase": e.phase,
            "category": e.category.name if e.category else None,
            "current_status": e.status.name if e.status else None,
            "total_amount": float(e.total_amount),
            "drawing_url": e.drawing_url, "drawing_filename": e.drawing_filename,
            "approval_state": e.approval_state}


class PublicDecisionIn(BaseModel):
    action: str
    reason: Optional[str] = None


def apply_decision(db, e, action, actor, reason=None):
    if action == "approve":
        e.approval_state = "approved"
        e.approved_at = now_utc()
        e.rejected_at = None
        e.rejection_reason = None
        log_event(db, e.id, "approved", actor)
    else:
        e.approval_state = "rejected"
        e.rejected_at = now_utc()
        e.approved_at = None
        e.rejection_reason = (reason or "").strip() or None
        log_event(db, e.id, "rejected", actor, e.rejection_reason)
    st = db.query(EstimateStatus).filter(
        EstimateStatus.name.ilike("Approved" if action == "approve" else "Rejected")).first()
    if st:
        e.status_id = st.id


@router.post("/public/estimate-approval/{estimate_id}/{token}")
def public_estimate_decision(estimate_id: int, token: str, body: PublicDecisionIn,
                             db: Session = Depends(get_db)):
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=422, detail="action must be approve or reject")
    e = get_estimate_or_404(db, estimate_id)
    check_token(e, token)
    e.token_used = True
    apply_decision(db, e, body.action, f"Client via email link ({e.client_email})", body.reason)
    db.commit()
    return {"approval_state": e.approval_state, "project_name": display_name(e),
            "rejection_reason": e.rejection_reason}


@router.post("/estimates/{estimate_id}/decision")
def manual_decision(estimate_id: int, body: PublicDecisionIn, db: Session = Depends(get_db),
                    user: User = Depends(STAFF)):
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=422, detail="action must be approve or reject")
    e = get_estimate_or_404(db, estimate_id)
    if e.linked_project_id:
        raise HTTPException(status_code=422, detail="A project has already been created from this estimate")
    apply_decision(db, e, body.action, f"{user.name} (manual override)", body.reason)
    e.token_used = True
    db.commit()
    db.refresh(e)
    return estimate_out(e)


class LinkProjectIn(BaseModel):
    project_id: int


@router.post("/estimates/{estimate_id}/link-project")
def link_project(estimate_id: int, body: LinkProjectIn, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("Admin"))):
    e = get_estimate_or_404(db, estimate_id)
    if e.approval_state != "approved":
        raise HTTPException(status_code=422, detail="Estimate must be approved before creating a project")
    if e.linked_project_id:
        raise HTTPException(status_code=422, detail="Estimate already linked to a project")
    project = db.get(Project, body.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    assert_same_tenant(project, user, "project")
    e.linked_project_id = body.project_id

    # Carry over the estimate's phase (and any other approved estimates that
    # share the same project_name in this tenant) to the newly created project.
    synced_phase_ids = []
    if e.phase:
        pid = ensure_phase_on_project(db, project, e.phase)
        if pid:
            synced_phase_ids.append(pid)
    if e.project_name:
        siblings = tenant_scope(db.query(Estimate), Estimate, user).filter(
            Estimate.id != e.id,
            Estimate.project_name.ilike(e.project_name.strip()),
            Estimate.approval_state == "approved",
            Estimate.linked_project_id.is_(None),
        ).all()
        for sib in siblings:
            if not sib.phase:
                continue
            pid = ensure_phase_on_project(db, project, sib.phase)
            if pid and pid not in synced_phase_ids:
                synced_phase_ids.append(pid)
            sib.linked_project_id = project.id
            log_event(db, sib.id, "project created", user.name,
                      f"linked to project #{project.id} via estimate #{e.id}")

    log_event(db, e.id, "project created", user.name, f"project #{body.project_id}")
    db.commit()
    db.refresh(e)
    out = estimate_out(e)
    out["synced_phase_ids"] = synced_phase_ids
    return out


@router.get("/estimates/{estimate_id}/events")
def estimate_events(estimate_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    get_estimate_or_404(db, estimate_id)
    return [{"action": ev.action, "actor": ev.actor, "detail": ev.detail,
             "at": ev.created_at.isoformat() if ev.created_at else None}
            for ev in db.query(EstimateApprovalEvent)
            .filter(EstimateApprovalEvent.estimate_id == estimate_id)
            .order_by(EstimateApprovalEvent.created_at.desc()).all()]
