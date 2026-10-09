import json
from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_roles
from app.database import get_db
from app.models import (Notification, Phase, Project, ProjectChangeOrder,
                        ProjectChangeOrderEvent, ProjectChangeOrderRevision, User)

router = APIRouter(tags=["change-orders"])
CONTRACTOR = require_roles("Admin", "SiteEngineer")
CATEGORIES = ["Client Modification", "Rework", "Design Change", "Site Condition"]


def f(x):
    return float(x) if x is not None else 0.0


def co_totals(db, project_id):
    cos = db.query(ProjectChangeOrder).filter(ProjectChangeOrder.project_id == project_id).all()
    approved = round(sum(f(c.approved_cost if c.approved_cost is not None else c.estimated_cost)
                         for c in cos if c.status == "Approved"), 2)
    pending = round(sum(f(c.estimated_cost) for c in cos
                        if c.status in ("Pending Client Review", "Revision Requested")), 2)
    return approved, pending, sum(1 for c in cos if c.status == "Approved")


def approved_co_entries(db, project_id):
    return [{"date": c.approval_date.date().isoformat() if c.approval_date else None,
             "type": "variation",
             "description": f"Variation: {c.co_number} — {c.title} ({c.category})",
             "amount": f(c.approved_cost if c.approved_cost is not None else c.estimated_cost)}
            for c in db.query(ProjectChangeOrder)
            .filter(ProjectChangeOrder.project_id == project_id,
                    ProjectChangeOrder.status == "Approved").all()]


def co_out(c, users=None, phases=None, detail=False):
    users = users or {}
    out = {"id": c.id, "project_id": c.project_id, "phase_id": c.phase_id,
           "phase_name": (phases or {}).get(c.phase_id), "co_number": c.co_number,
           "title": c.title, "description": c.description, "category": c.category,
           "requested_by": users.get(c.requested_by), "date_requested": c.date_requested.isoformat() if c.date_requested else None,
           "estimated_cost": f(c.estimated_cost), "estimated_time_impact_days": c.estimated_time_impact_days or 0,
           "status": c.status, "approved_cost": f(c.approved_cost) if c.approved_cost is not None else None,
           "approval_date": c.approval_date.isoformat() if c.approval_date else None,
           "approved_by": users.get(c.approved_by),
           "paid_at": c.paid_at.isoformat() if c.paid_at else None,
           "attachments": json.loads(c.attachments) if c.attachments else [],
           "version_count": len(c.revisions),
           "revisions": [{"version": r.version, "estimated_cost": f(r.estimated_cost),
                          "estimated_time_impact_days": r.estimated_time_impact_days or 0,
                          "note": r.note, "by": users.get(r.created_by),
                          "at": r.created_at.isoformat() if r.created_at else None} for r in c.revisions],
           "events": [{"action": e.action, "comment": e.comment, "by": users.get(e.actor_id),
                       "at": e.created_at.isoformat() if e.created_at else None} for e in c.events]}
    return out


def check_co_access(user, project):
    if user.role == "Vendor":
        raise HTTPException(status_code=403, detail="Not authorized")
    if user.role == "Client" and project.client_id != user.client_id:
        raise HTTPException(status_code=403, detail="Not authorized for this project")


def log_event(db, co, user, action, comment=None):
    db.add(ProjectChangeOrderEvent(change_order_id=co.id, action=action, comment=comment, actor_id=user.id))


def notify_clients(db, project, actor, title, message):
    clients = db.query(User).filter(User.role == "Client", User.client_id == project.client_id,
                                    User.status != "Disabled").all()
    for u in clients:
        if u.id != actor.id:
            db.add(Notification(user_id=u.id, type="ChangeOrder", title=title,
                                message=message, project_id=project.id))


def notify_team(db, project, actor, title, message):
    ids = {u.id for u in db.query(User).filter(User.role == "Admin", User.status != "Disabled").all()}
    if project.site_engineer_id:
        ids.add(project.site_engineer_id)
    ids.discard(actor.id)
    for uid in ids:
        db.add(Notification(user_id=uid, type="ChangeOrder", title=title,
                            message=message, project_id=project.id))


class COCreate(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    category: str = "Client Modification"
    phase_id: Optional[int] = None
    estimated_cost: float = Field(ge=0)
    estimated_time_impact_days: int = Field(default=0, ge=0)
    attachments: List[dict] = []
    submit: bool = True


class CORevise(BaseModel):
    estimated_cost: float = Field(ge=0)
    estimated_time_impact_days: int = Field(default=0, ge=0)
    note: Optional[str] = None


class COAction(BaseModel):
    comment: Optional[str] = None
    confirm: bool = False


def _maps(db, project_id):
    users = {u.id: u.name for u in db.query(User).all()}
    phases = {p.id: p.name for p in db.query(Phase).filter(Phase.project_id == project_id).all()}
    return users, phases


def get_co_or_404(db, co_id):
    co = db.get(ProjectChangeOrder, co_id)
    if not co:
        raise HTTPException(status_code=404, detail="Change order not found")
    return co


@router.get("/projects/{project_id}/change-orders")
def list_change_orders(project_id: int, phase_id: Optional[int] = None, category: Optional[str] = None,
                       status: Optional[str] = None, db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    check_co_access(user, project)
    q = db.query(ProjectChangeOrder).filter(ProjectChangeOrder.project_id == project_id)
    if phase_id:
        q = q.filter(ProjectChangeOrder.phase_id == phase_id)
    if category:
        q = q.filter(ProjectChangeOrder.category == category)
    if status:
        q = q.filter(ProjectChangeOrder.status == status)
    users, phases = _maps(db, project_id)
    cos = q.order_by(ProjectChangeOrder.created_at.desc()).all()
    approved, pending, n_approved = co_totals(db, project_id)
    budget = f(project.budget or 0)
    return {"summary": {"original_budget": budget, "approved_variations": approved,
                        "revised_contract_value": round(budget + approved, 2),
                        "pending_co_value": pending, "approved_count": n_approved,
                        "increase_pct": round(approved / budget * 100, 2) if budget else 0},
            "change_orders": [co_out(c, users, phases) for c in cos]}


@router.post("/projects/{project_id}/change-orders", status_code=201)
def create_change_order(project_id: int, body: COCreate, db: Session = Depends(get_db),
                        user: User = Depends(CONTRACTOR)):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if body.category not in CATEGORIES:
        raise HTTPException(status_code=422, detail=f"category must be one of {CATEGORIES}")
    if body.phase_id and not db.query(Phase).filter(Phase.id == body.phase_id,
                                                    Phase.project_id == project_id).first():
        raise HTTPException(status_code=422, detail="Phase does not belong to this project")
    seq = db.query(ProjectChangeOrder).filter(ProjectChangeOrder.project_id == project_id).count() + 1
    co = ProjectChangeOrder(project_id=project_id, phase_id=body.phase_id,
                            co_number=f"CO-{project_id}-{seq:03d}", title=body.title.strip(),
                            description=body.description, category=body.category,
                            requested_by=user.id, date_requested=date.today(),
                            estimated_cost=body.estimated_cost,
                            estimated_time_impact_days=body.estimated_time_impact_days,
                            attachments=json.dumps(body.attachments) if body.attachments else None,
                            status="Pending Client Review" if body.submit else "Draft")
    co.revisions.append(ProjectChangeOrderRevision(
        version=1, estimated_cost=body.estimated_cost,
        estimated_time_impact_days=body.estimated_time_impact_days,
        note="Initial estimate", created_by=user.id))
    db.add(co)
    db.flush()
    log_event(db, co, user, "Created")
    if body.submit:
        log_event(db, co, user, "Submitted for client review")
        notify_clients(db, project, user,
                       f"Change order awaiting your review: {co.co_number}",
                       f"{co.title} — est. ₹{body.estimated_cost:,.0f}, +{body.estimated_time_impact_days} days ({project.name})")
    db.commit()
    db.refresh(co)
    users, phases = _maps(db, project_id)
    return co_out(co, users, phases)


@router.post("/change-orders/{co_id}/approve")
def approve_co(co_id: int, body: COAction, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    co = get_co_or_404(db, co_id)
    project = db.get(Project, co.project_id)
    check_co_access(user, project)
    if user.role not in ("Client", "Admin"):
        raise HTTPException(status_code=403, detail="Only the client (or Admin) can approve")
    if not body.confirm:
        raise HTTPException(status_code=422, detail="Explicit approval confirmation required (confirm=true)")
    if co.status not in ("Pending Client Review", "Revision Requested"):
        raise HTTPException(status_code=422, detail=f"Cannot approve from status '{co.status}'")
    co.status = "Approved"
    co.approved_cost = co.estimated_cost
    co.approval_date = datetime.now(timezone.utc)
    co.approved_by = user.id
    log_event(db, co, user, "Approved", body.comment)
    notify_team(db, project, user, f"Change order APPROVED: {co.co_number}",
                f"{user.name} approved '{co.title}' at ₹{f(co.approved_cost):,.0f} ({project.name})")
    db.commit()
    db.refresh(co)
    users, phases = _maps(db, co.project_id)
    return co_out(co, users, phases)


class COPayment(BaseModel):
    amount: float = Field(gt=0)
    payment_method: Optional[str] = "BankTransfer"
    reference_no: Optional[str] = None


@router.post("/change-orders/{co_id}/record-payment")
def record_co_payment(co_id: int, body: COPayment, db: Session = Depends(get_db),
                      user: User = Depends(require_roles("Admin", "Accountant"))):
    co = get_co_or_404(db, co_id)
    project = db.get(Project, co.project_id)
    if co.status != "Approved":
        raise HTTPException(status_code=422, detail="Payment can only be recorded on an approved change order")
    if co.paid_at:
        raise HTTPException(status_code=422, detail="Payment already recorded for this change order")
    from app.models.finance import Payment
    from app.models import Client
    method = body.payment_method or "BankTransfer"
    db.add(Payment(project_id=co.project_id, client_id=project.client_id,
                   amount=body.amount, payment_direction="incoming",
                   payment_method=method, reference_no=body.reference_no,
                   received_by=user.id, payment_date=date.today(),
                   notes=f"Change order payment — {co.co_number}: {co.title}"))
    co.paid_at = datetime.now(timezone.utc)
    log_event(db, co, user, "Payment Recorded",
              f"₹{body.amount:,.0f} via {method}" + (f" (ref {body.reference_no})" if body.reference_no else ""))
    client = db.get(Client, project.client_id) if project.client_id else None
    receipt_sent, receipt_error = False, None
    if client and client.email:
        try:
            send_co_receipt_email(client, project, co, body.amount, method, body.reference_no)
            receipt_sent = True
            log_event(db, co, user, "Receipt Emailed", f"Receipt sent to {client.email}")
        except Exception as ex:
            receipt_error = str(ex)
    notify_team(db, project, user, f"Payment received: {co.co_number}",
                f"₹{body.amount:,.0f} recorded against '{co.title}' ({project.name})")
    db.commit()
    db.refresh(co)
    users, phases = _maps(db, co.project_id)
    return {**co_out(co, users, phases), "receipt_sent": receipt_sent,
            "receipt_error": receipt_error,
            "receipt_to": client.email if client and client.email else None}


def send_co_receipt_email(client, project, co, amount, method, reference_no):
    import os
    import smtplib
    import ssl
    from email.mime.text import MIMEText
    host = os.environ.get("SMTP_HOST")
    port = int(os.environ.get("SMTP_PORT", "465"))
    sender = os.environ.get("SMTP_EMAIL")
    password = os.environ.get("SMTP_PASSWORD")
    if not (host and sender and password):
        raise RuntimeError("SMTP not configured")
    ref = f'<tr><td style="padding:6px 0;color:#64748b">Reference No.</td><td style="padding:6px 0">{reference_no}</td></tr>' if reference_no else ""
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e2e8f0">
      <div style="background:#0f172a;color:#fff;padding:18px 24px">
        <h2 style="margin:0">SITERA <span style="color:#10b981">— Payment Receipt</span></h2>
      </div>
      <div style="padding:24px">
        <p>Dear {client.name},</p>
        <p>We confirm receipt of your payment towards the approved change order:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#64748b">Project</td><td style="padding:6px 0"><b>{project.name}</b></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Change Order</td><td style="padding:6px 0">{co.co_number} — {co.title}</td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Amount Paid</td><td style="padding:6px 0"><b style="font-size:16px">₹{amount:,.2f}</b></td></tr>
          <tr><td style="padding:6px 0;color:#64748b">Payment Method</td><td style="padding:6px 0">{method}</td></tr>
          {ref}
          <tr><td style="padding:6px 0;color:#64748b">Date</td><td style="padding:6px 0">{date.today().isoformat()}</td></tr>
        </table>
        <p style="color:#64748b;font-size:12px;margin-top:18px">This amount has been credited to your project's balance sheet. Thank you for your business.</p>
      </div>
    </div>"""
    msg = MIMEText(html, "html")
    msg["Subject"] = f"Payment Receipt — {co.co_number} · {project.name}"
    msg["From"] = sender
    msg["To"] = client.email
    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            s.login(sender, password)
            s.sendmail(sender, [client.email], msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ctx)
            s.login(sender, password)
            s.sendmail(sender, [client.email], msg.as_string())


@router.post("/change-orders/{co_id}/reject")
def reject_co(co_id: int, body: COAction, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    co = get_co_or_404(db, co_id)
    project = db.get(Project, co.project_id)
    check_co_access(user, project)
    if user.role not in ("Client", "Admin"):
        raise HTTPException(status_code=403, detail="Only the client (or Admin) can reject")
    if co.status not in ("Pending Client Review", "Revision Requested"):
        raise HTTPException(status_code=422, detail=f"Cannot reject from status '{co.status}'")
    co.status = "Rejected"
    log_event(db, co, user, "Rejected", body.comment)
    notify_team(db, project, user, f"Change order rejected: {co.co_number}",
                f"{user.name} rejected '{co.title}'" + (f": {body.comment}" if body.comment else ""))
    db.commit()
    db.refresh(co)
    users, phases = _maps(db, co.project_id)
    return co_out(co, users, phases)


@router.post("/change-orders/{co_id}/request-revision")
def request_revision(co_id: int, body: COAction, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    co = get_co_or_404(db, co_id)
    project = db.get(Project, co.project_id)
    check_co_access(user, project)
    if user.role not in ("Client", "Admin"):
        raise HTTPException(status_code=403, detail="Only the client (or Admin) can request revision")
    if not (body.comment or "").strip():
        raise HTTPException(status_code=422, detail="A comment is required when requesting a revision")
    if co.status != "Pending Client Review":
        raise HTTPException(status_code=422, detail=f"Cannot request revision from status '{co.status}'")
    co.status = "Revision Requested"
    log_event(db, co, user, "Revision requested", body.comment)
    notify_team(db, project, user, f"Revision requested: {co.co_number}",
                f"{user.name} on '{co.title}': {body.comment}")
    db.commit()
    db.refresh(co)
    users, phases = _maps(db, co.project_id)
    return co_out(co, users, phases)


@router.post("/change-orders/{co_id}/revise")
def revise_co(co_id: int, body: CORevise, db: Session = Depends(get_db),
              user: User = Depends(CONTRACTOR)):
    co = get_co_or_404(db, co_id)
    project = db.get(Project, co.project_id)
    if co.status not in ("Revision Requested", "Rejected", "Draft", "Pending Client Review"):
        raise HTTPException(status_code=422, detail=f"Cannot revise an {co.status} change order")
    version = len(co.revisions) + 1
    co.revisions.append(ProjectChangeOrderRevision(
        version=version, estimated_cost=body.estimated_cost,
        estimated_time_impact_days=body.estimated_time_impact_days,
        note=body.note, created_by=user.id))
    co.estimated_cost = body.estimated_cost
    co.estimated_time_impact_days = body.estimated_time_impact_days
    co.status = "Pending Client Review"
    log_event(db, co, user, f"Revised estimate (v{version})", body.note)
    notify_clients(db, project, user, f"Revised estimate for {co.co_number}",
                   f"'{co.title}' v{version}: ₹{body.estimated_cost:,.0f}, +{body.estimated_time_impact_days} days ({project.name})")
    db.commit()
    db.refresh(co)
    users, phases = _maps(db, co.project_id)
    return co_out(co, users, phases)
