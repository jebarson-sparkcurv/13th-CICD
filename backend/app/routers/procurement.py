import uuid
from datetime import datetime, timezone
from pathlib import Path as FSPath

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Project
from app.models.procurement import (Vendor, BidPackage, BidInvitation, Bid, PurchaseOrder,
                                    POLineItem, Subcontract, ChangeOrder, PayApplication,
                                    PayApplicationLineItem, LienWaiver, MaterialDelivery,
                                    ProcurementDocument, CostCodeBudget)
from app.schemas.procurement import (BidPackageCreate, BidPackagePatch, InviteIn, BidCreate,
                                     BidPatch, AwardIn, POCreate, POPatch, POLineItemCreate,
                                     POLineItemPatch, SubCreate, SubPatch, COCreate, COPatch,
                                     PayAppCreate, PayAppPatch, PayAppLineItemCreate,
                                     LienWaiverCreate, LienWaiverPatch, DeliveryCreate,
                                     DeliveryPatch, ProcDocPatch)
from app.core.security import get_current_user, require_roles
from app.crud.procurement import (co_total, committed_amount, is_pending_approval,
                                  is_over_budget, insurance_current, insurance_expiring_soon,
                                  cost_code_allocated, po_out, sub_out, co_out, payapp_out,
                                  payapp_line_out, waiver_out, delivery_out, pdoc_out,
                                  po_line_out, f)
from app.routers.projects import get_project_or_404
from app.routers.uploads import UPLOAD_DIR

router = APIRouter(tags=["procurement"])
STAFF = require_roles("Admin", "SiteEngineer")
ADMIN = require_roles("Admin")


def get_commitment(db, ctype, cid):
    model = PurchaseOrder if ctype == "po" else Subcontract
    c = db.get(model, cid)
    if not c:
        raise HTTPException(status_code=404, detail="Commitment not found")
    return c


def now():
    return datetime.now(timezone.utc)


# ---------- Bidding ----------
@router.post("/projects/{project_id}/bid-packages", status_code=201)
def create_bid_package(project_id: int, body: BidPackageCreate, db: Session = Depends(get_db),
                       user: User = Depends(STAFF)):
    get_project_or_404(db, project_id)
    bp = BidPackage(project_id=project_id, created_by=user.id, **body.model_dump())
    db.add(bp); db.commit(); db.refresh(bp)
    return bp_out(db, bp)


def bp_out(db, bp):
    invites = db.query(BidInvitation).filter(BidInvitation.bid_package_id == bp.id).all()
    bids = db.query(Bid).filter(Bid.bid_package_id == bp.id).all()
    return {"id": bp.id, "project_id": bp.project_id, "title": bp.title,
            "scope_description": bp.scope_description, "cost_code": bp.cost_code,
            "status": bp.status, "bid_due_date": bp.bid_due_date.isoformat() if bp.bid_due_date else None,
            "invitations": [{"id": i.id, "vendor_id": i.vendor_id,
                             "vendor_name": i.vendor.name if i.vendor else None,
                             "response_status": i.response_status} for i in invites],
            "bids": [{"id": b.id, "vendor_id": b.vendor_id,
                      "vendor_name": b.vendor.name if b.vendor else None,
                      "amount": f(b.amount), "notes": b.notes, "is_leveled": b.is_leveled,
                      "status": b.status} for b in bids]}


@router.get("/projects/{project_id}/bid-packages")
def list_bid_packages(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    bps = db.query(BidPackage).filter(BidPackage.project_id == project_id).all()
    return [bp_out(db, bp) for bp in bps]


@router.get("/bid-packages/{bp_id}")
def get_bid_package(bp_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    bp = db.get(BidPackage, bp_id)
    if not bp:
        raise HTTPException(status_code=404, detail="Bid package not found")
    return bp_out(db, bp)


@router.patch("/bid-packages/{bp_id}")
def patch_bid_package(bp_id: int, body: BidPackagePatch, db: Session = Depends(get_db),
                      user: User = Depends(STAFF)):
    bp = db.get(BidPackage, bp_id)
    if not bp:
        raise HTTPException(status_code=404, detail="Bid package not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(bp, k, v)
    db.commit(); db.refresh(bp)
    return bp_out(db, bp)


@router.post("/bid-packages/{bp_id}/invite", status_code=201)
def invite_vendors(bp_id: int, body: InviteIn, db: Session = Depends(get_db),
                   user: User = Depends(STAFF)):
    bp = db.get(BidPackage, bp_id)
    if not bp:
        raise HTTPException(status_code=404, detail="Bid package not found")
    created = []
    for vid in body.vendor_ids:
        if not db.get(Vendor, vid):
            raise HTTPException(status_code=404, detail=f"Vendor {vid} not found")
        existing = db.query(BidInvitation).filter_by(bid_package_id=bp_id, vendor_id=vid).first()
        if not existing:
            inv = BidInvitation(bid_package_id=bp_id, vendor_id=vid)
            db.add(inv); created.append(inv)
    db.commit()
    return bp_out(db, bp)


@router.post("/bid-packages/{bp_id}/bids", status_code=201)
def submit_bid(bp_id: int, body: BidCreate, db: Session = Depends(get_db),
               user: User = Depends(STAFF)):
    bp = db.get(BidPackage, bp_id)
    if not bp:
        raise HTTPException(status_code=404, detail="Bid package not found")
    bid = Bid(bid_package_id=bp_id, **body.model_dump())
    db.add(bid)
    inv = db.query(BidInvitation).filter_by(bid_package_id=bp_id, vendor_id=body.vendor_id).first()
    if inv:
        inv.response_status = "Submitted"
    db.commit(); db.refresh(bid)
    return {"id": bid.id, "bid_package_id": bp_id, "vendor_id": bid.vendor_id,
            "amount": f(bid.amount), "status": bid.status}


@router.get("/bid-packages/{bp_id}/bids")
def list_bids(bp_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return bp_out(db, db.get(BidPackage, bp_id))["bids"]


@router.patch("/bids/{bid_id}")
def patch_bid(bid_id: int, body: BidPatch, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    bid = db.get(Bid, bid_id)
    if not bid:
        raise HTTPException(status_code=404, detail="Bid not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(bid, k, v)
    db.commit()
    return {"id": bid.id, "status": bid.status, "is_leveled": bid.is_leveled}


@router.post("/bid-packages/{bp_id}/award", status_code=201)
def award_bid(bp_id: int, body: AwardIn, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    bp = db.get(BidPackage, bp_id)
    bid = db.get(Bid, body.bid_id)
    if not bp or not bid or bid.bid_package_id != bp_id:
        raise HTTPException(status_code=404, detail="Bid package or bid not found")
    bid.status = "Awarded"
    bp.status = "Awarded"
    from app.models.finance import BidLineItemQuote
    quotes = db.query(BidLineItemQuote).filter_by(bid_id=bid.id).all()
    if body.commitment_type == "po":
        count = db.query(PurchaseOrder).filter_by(project_id=bp.project_id).count()
        c = PurchaseOrder(project_id=bp.project_id, vendor_id=bid.vendor_id,
                          po_number=f"PO-{bp.project_id}-{count + 1:03d}",
                          cost_code=bp.cost_code, description=bp.title,
                          original_amount=bid.amount, revised_amount=bid.amount,
                          created_by=user.id)
    else:
        count = db.query(Subcontract).filter_by(project_id=bp.project_id).count()
        c = Subcontract(project_id=bp.project_id, vendor_id=bid.vendor_id,
                        contract_number=f"SC-{bp.project_id}-{count + 1:03d}",
                        cost_code=bp.cost_code, scope_of_work=bp.scope_description,
                        original_amount=bid.amount, revised_amount=bid.amount,
                        created_by=user.id)
    db.add(c); db.commit(); db.refresh(c)
    if body.commitment_type == "po" and quotes:
        from app.models.finance import BidLineItem
        for q in quotes:
            li = db.get(BidLineItem, q.bid_line_item_id)
            db.add(POLineItem(purchase_order_id=c.id,
                              item_description=li.item_description if li else "Item",
                              unit=li.unit if li else None,
                              quantity=q.quantity_offered, unit_price=q.unit_price,
                              line_total=q.line_total))
        db.commit()
    return po_out(db, c) if body.commitment_type == "po" else sub_out(db, c)


# ---------- Purchase Orders ----------
@router.post("/projects/{project_id}/purchase-orders", status_code=201)
def create_po(project_id: int, body: POCreate, db: Session = Depends(get_db),
              user: User = Depends(STAFF)):
    get_project_or_404(db, project_id)
    if not db.get(Vendor, body.vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")
    count = db.query(PurchaseOrder).filter_by(project_id=project_id).count()
    po = PurchaseOrder(project_id=project_id, po_number=f"PO-{project_id}-{count + 1:03d}",
                       created_by=user.id, revised_amount=body.original_amount,
                       **body.model_dump())
    db.add(po); db.commit(); db.refresh(po)
    return po_out(db, po)


@router.get("/projects/{project_id}/purchase-orders")
def list_pos(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    pos = db.query(PurchaseOrder).filter_by(project_id=project_id).all()
    return [po_out(db, p) for p in pos]


@router.get("/purchase-orders/{po_id}")
def get_po(po_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return po_out(db, get_commitment(db, "po", po_id), detail=True)


@router.patch("/purchase-orders/{po_id}")
def patch_po(po_id: int, body: POPatch, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    po = get_commitment(db, "po", po_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(po, k, v)
    po.revised_amount = committed_amount(db, "po", po)
    db.commit(); db.refresh(po)
    return po_out(db, po)


@router.post("/purchase-orders/{po_id}/approve")
def approve_po(po_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    po = get_commitment(db, "po", po_id)
    if not insurance_current(db, po.vendor):
        raise HTTPException(status_code=422, detail="Vendor insurance is expired or missing — upload a current COI before approving")
    po.status = "Approved"
    po.approved_by = user.id
    db.commit(); db.refresh(po)
    return po_out(db, po)


@router.post("/purchase-orders/{po_id}/cancel")
def cancel_po(po_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    po = get_commitment(db, "po", po_id)
    po.status = "Cancelled"
    db.commit(); db.refresh(po)
    return po_out(db, po)


@router.post("/purchase-orders/{po_id}/line-items", status_code=201)
def add_po_line(po_id: int, body: POLineItemCreate, db: Session = Depends(get_db),
                user: User = Depends(STAFF)):
    get_commitment(db, "po", po_id)
    li = POLineItem(purchase_order_id=po_id, line_total=body.quantity * body.unit_price,
                    **body.model_dump())
    db.add(li); db.commit(); db.refresh(li)
    return po_line_out(li)


@router.get("/purchase-orders/{po_id}/line-items")
def list_po_lines(po_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return [po_line_out(li) for li in db.query(POLineItem).filter_by(purchase_order_id=po_id).all()]


@router.patch("/po-line-items/{li_id}")
def patch_po_line(li_id: int, body: POLineItemPatch, db: Session = Depends(get_db),
                  user: User = Depends(STAFF)):
    li = db.get(POLineItem, li_id)
    if not li:
        raise HTTPException(status_code=404, detail="Line item not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(li, k, v)
    li.line_total = (li.quantity or 0) * (li.unit_price or 0)
    db.commit(); db.refresh(li)
    return po_line_out(li)


@router.delete("/po-line-items/{li_id}", status_code=204)
def delete_po_line(li_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    li = db.get(POLineItem, li_id)
    if not li:
        raise HTTPException(status_code=404, detail="Line item not found")
    db.delete(li); db.commit()


# ---------- Subcontracts ----------
@router.post("/projects/{project_id}/subcontracts", status_code=201)
def create_sub(project_id: int, body: SubCreate, db: Session = Depends(get_db),
               user: User = Depends(STAFF)):
    get_project_or_404(db, project_id)
    if not db.get(Vendor, body.vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")
    count = db.query(Subcontract).filter_by(project_id=project_id).count()
    s = Subcontract(project_id=project_id, contract_number=f"SC-{project_id}-{count + 1:03d}",
                    created_by=user.id, revised_amount=body.original_amount, **body.model_dump())
    db.add(s); db.commit(); db.refresh(s)
    return sub_out(db, s)


@router.get("/projects/{project_id}/subcontracts")
def list_subs(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return [sub_out(db, s) for s in db.query(Subcontract).filter_by(project_id=project_id).all()]


@router.get("/subcontracts/{sub_id}")
def get_sub(sub_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return sub_out(db, get_commitment(db, "subcontract", sub_id), detail=True)


@router.patch("/subcontracts/{sub_id}")
def patch_sub(sub_id: int, body: SubPatch, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    s = get_commitment(db, "subcontract", sub_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    s.revised_amount = committed_amount(db, "subcontract", s)
    db.commit(); db.refresh(s)
    return sub_out(db, s)


@router.post("/subcontracts/{sub_id}/approve")
def approve_sub(sub_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    s = get_commitment(db, "subcontract", sub_id)
    if not insurance_current(db, s.vendor):
        raise HTTPException(status_code=422, detail="Vendor insurance is expired or missing — upload a current COI before approving")
    s.approved_by = user.id
    if s.status == "Draft":
        s.status = "PendingApproval"
    db.commit(); db.refresh(s)
    return sub_out(db, s)


@router.post("/subcontracts/{sub_id}/execute")
def execute_sub(sub_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    s = get_commitment(db, "subcontract", sub_id)
    if not insurance_current(db, s.vendor):
        raise HTTPException(status_code=422, detail="Vendor insurance is expired or missing — upload a current COI before executing")
    s.status = "Executed"
    s.executed_at = now()
    if not s.approved_by:
        s.approved_by = user.id
    db.commit(); db.refresh(s)
    return sub_out(db, s)


# ---------- Change Orders ----------
@router.post("/commitments/{ctype}/{cid}/change-orders", status_code=201)
def create_co(ctype: str, cid: int, body: COCreate, db: Session = Depends(get_db),
              user: User = Depends(STAFF)):
    if ctype not in ("po", "subcontract"):
        raise HTTPException(status_code=422, detail="commitment_type must be po or subcontract")
    get_commitment(db, ctype, cid)
    count = db.query(ChangeOrder).filter_by(commitment_type=ctype, commitment_id=cid).count()
    co = ChangeOrder(commitment_type=ctype, commitment_id=cid, co_number=f"CO-{count + 1:03d}",
                     requested_by=user.id, **body.model_dump())
    db.add(co); db.commit(); db.refresh(co)
    return co_out(co)


@router.get("/commitments/{ctype}/{cid}/change-orders")
def list_cos(ctype: str, cid: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    cos = db.query(ChangeOrder).filter_by(commitment_type=ctype, commitment_id=cid).all()
    return [co_out(co) for co in cos]


@router.patch("/change-orders/{co_id}")
def patch_co(co_id: int, body: COPatch, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    co = db.get(ChangeOrder, co_id)
    if not co:
        raise HTTPException(status_code=404, detail="Change order not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("status") in ("Approved", "Rejected") and user.role != "Admin":
        raise HTTPException(status_code=403, detail="Only Admin can approve/reject change orders")
    for k, v in data.items():
        setattr(co, k, v)
    if data.get("status") == "Approved":
        co.approved_by = user.id
        co.approved_at = now()
    db.commit()
    c = get_commitment(db, co.commitment_type, co.commitment_id)
    c.revised_amount = committed_amount(db, co.commitment_type, c)
    db.commit(); db.refresh(co)
    return co_out(co)


# ---------- Pay Applications ----------
@router.post("/commitments/{ctype}/{cid}/pay-applications", status_code=201)
def create_payapp(ctype: str, cid: int, body: PayAppCreate, db: Session = Depends(get_db),
                  user: User = Depends(STAFF)):
    c = get_commitment(db, ctype, cid)
    retainage_pct = f(c.retainage_pct) if ctype == "subcontract" else 0.0
    retainage = round(f(body.amount_this_period) * retainage_pct / 100, 2)
    count = db.query(PayApplication).filter_by(commitment_type=ctype, commitment_id=cid).count()
    pa = PayApplication(commitment_type=ctype, commitment_id=cid, application_number=count + 1,
                        period_start=body.period_start, period_end=body.period_end,
                        amount_this_period=body.amount_this_period,
                        retainage_held=retainage,
                        amount_due=f(body.amount_this_period) - retainage)
    db.add(pa); db.commit(); db.refresh(pa)
    return payapp_out(pa, detail=True)


@router.get("/commitments/{ctype}/{cid}/pay-applications")
def list_payapps(ctype: str, cid: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    pas = db.query(PayApplication).filter_by(commitment_type=ctype, commitment_id=cid).all()
    return [payapp_out(pa, detail=True) for pa in pas]


@router.get("/pay-applications/{pa_id}")
def get_payapp(pa_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    pa = db.get(PayApplication, pa_id)
    if not pa:
        raise HTTPException(status_code=404, detail="Pay application not found")
    return payapp_out(pa, detail=True)


@router.patch("/pay-applications/{pa_id}")
def patch_payapp(pa_id: int, body: PayAppPatch, db: Session = Depends(get_db),
                 user: User = Depends(STAFF)):
    pa = db.get(PayApplication, pa_id)
    if not pa:
        raise HTTPException(status_code=404, detail="Pay application not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(pa, k, v)
    if body.amount_this_period is not None:
        c = get_commitment(db, pa.commitment_type, pa.commitment_id)
        pct = f(c.retainage_pct) if pa.commitment_type == "subcontract" else 0.0
        pa.retainage_held = round(f(pa.amount_this_period) * pct / 100, 2)
        pa.amount_due = f(pa.amount_this_period) - f(pa.retainage_held)
    db.commit(); db.refresh(pa)
    return payapp_out(pa, detail=True)


@router.post("/pay-applications/{pa_id}/submit")
def submit_payapp(pa_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    pa = db.get(PayApplication, pa_id)
    if not pa:
        raise HTTPException(status_code=404, detail="Pay application not found")
    pa.status = "Submitted"
    pa.submitted_at = now()
    db.commit(); db.refresh(pa)
    return payapp_out(pa, detail=True)


@router.post("/pay-applications/{pa_id}/approve")
def approve_payapp(pa_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    pa = db.get(PayApplication, pa_id)
    if not pa:
        raise HTTPException(status_code=404, detail="Pay application not found")
    pa.status = "Approved"
    pa.approved_by = user.id
    pa.approved_at = now()
    db.commit(); db.refresh(pa)
    return payapp_out(pa, detail=True)


@router.post("/pay-applications/{pa_id}/mark-paid")
def mark_paid_payapp(pa_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    pa = db.get(PayApplication, pa_id)
    if not pa:
        raise HTTPException(status_code=404, detail="Pay application not found")
    pa.status = "Paid"
    pa.paid_at = now()
    db.commit(); db.refresh(pa)
    return payapp_out(pa, detail=True)


@router.post("/pay-applications/{pa_id}/line-items", status_code=201)
def add_payapp_line(pa_id: int, body: PayAppLineItemCreate, db: Session = Depends(get_db),
                    user: User = Depends(STAFF)):
    pa = db.get(PayApplication, pa_id)
    if not pa:
        raise HTTPException(status_code=404, detail="Pay application not found")
    sv = f(body.scheduled_value)
    completed = f(body.previous_completed) + f(body.this_period) + f(body.materials_stored)
    li = PayApplicationLineItem(pay_application_id=pa_id,
                                pct_complete=round(completed / sv * 100, 2) if sv else 0,
                                **body.model_dump())
    db.add(li); db.commit(); db.refresh(li)
    return payapp_line_out(li)


@router.get("/pay-applications/{pa_id}/line-items")
def list_payapp_lines(pa_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    lis = db.query(PayApplicationLineItem).filter_by(pay_application_id=pa_id).all()
    return [payapp_line_out(li) for li in lis]


@router.post("/pay-applications/{pa_id}/lien-waivers", status_code=201)
def add_waiver(pa_id: int, body: LienWaiverCreate, db: Session = Depends(get_db),
               user: User = Depends(STAFF)):
    pa = db.get(PayApplication, pa_id)
    if not pa:
        raise HTTPException(status_code=404, detail="Pay application not found")
    c = get_commitment(db, pa.commitment_type, pa.commitment_id)
    w = LienWaiver(pay_application_id=pa_id, vendor_id=c.vendor_id,
                   status="Received" if body.file_url else "Pending", **body.model_dump())
    db.add(w); db.commit(); db.refresh(w)
    return waiver_out(w)


@router.get("/pay-applications/{pa_id}/lien-waivers")
def list_waivers(pa_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return [waiver_out(w) for w in db.query(LienWaiver).filter_by(pay_application_id=pa_id).all()]


@router.patch("/lien-waivers/{w_id}")
def patch_waiver(w_id: int, body: LienWaiverPatch, db: Session = Depends(get_db),
                 user: User = Depends(STAFF)):
    w = db.get(LienWaiver, w_id)
    if not w:
        raise HTTPException(status_code=404, detail="Lien waiver not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(w, k, v)
    db.commit(); db.refresh(w)
    return waiver_out(w)


# ---------- Deliveries ----------
@router.post("/projects/{project_id}/deliveries", status_code=201)
def create_delivery(project_id: int, body: DeliveryCreate, db: Session = Depends(get_db),
                    user: User = Depends(STAFF)):
    get_project_or_404(db, project_id)
    dv = MaterialDelivery(project_id=project_id, received_by=user.id, **body.model_dump())
    db.add(dv); db.commit(); db.refresh(dv)
    return delivery_out(dv)


@router.get("/projects/{project_id}/deliveries")
def list_deliveries(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return [delivery_out(dv) for dv in db.query(MaterialDelivery).filter_by(project_id=project_id).all()]


@router.patch("/deliveries/{dv_id}")
def patch_delivery(dv_id: int, body: DeliveryPatch, db: Session = Depends(get_db),
                   user: User = Depends(STAFF)):
    dv = db.get(MaterialDelivery, dv_id)
    if not dv:
        raise HTTPException(status_code=404, detail="Delivery not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(dv, k, v)
    db.commit(); db.refresh(dv)
    return delivery_out(dv)


# ---------- Procurement Documents ----------
VALID_REL = ("po", "subcontract", "bid_package")


def get_related_project_id(db, rtype, rid):
    if rtype == "po":
        obj = db.get(PurchaseOrder, rid)
    elif rtype == "subcontract":
        obj = db.get(Subcontract, rid)
    else:
        obj = db.get(BidPackage, rid)
    if not obj:
        raise HTTPException(status_code=404, detail="Related record not found")
    return obj.project_id


@router.post("/procurement/{rtype}/{rid}/documents", status_code=201)
async def upload_proc_doc(rtype: str, rid: int, file: UploadFile = File(...),
                          document_name: str = Form(None), category: str = Form("Other"),
                          is_client_visible: bool = Form(False),
                          db: Session = Depends(get_db), user: User = Depends(STAFF)):
    if rtype not in VALID_REL:
        raise HTTPException(status_code=422, detail="related_type must be po, subcontract or bid_package")
    get_related_project_id(db, rtype, rid)
    ext = FSPath(file.filename or "file").suffix.lower()
    content = await file.read()
    fname = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / fname).write_bytes(content)
    doc = ProcurementDocument(related_type=rtype, related_id=rid,
                              document_name=(document_name or "").strip() or file.filename or fname,
                              file_url=f"/api/uploads/{fname}", file_type=ext.lstrip("."),
                              category=category or "Other", uploaded_by=user.id,
                              is_client_visible=is_client_visible)
    db.add(doc); db.commit(); db.refresh(doc)
    return pdoc_out(doc)


@router.get("/procurement/{rtype}/{rid}/documents")
def list_proc_docs(rtype: str, rid: int, category: str = None, search: str = None,
                   db: Session = Depends(get_db), user: User = Depends(STAFF)):
    q = db.query(ProcurementDocument).filter_by(related_type=rtype, related_id=rid)
    if category:
        q = q.filter(ProcurementDocument.category == category)
    if search:
        q = q.filter(ProcurementDocument.document_name.ilike(f"%{search}%"))
    return [pdoc_out(doc) for doc in q.order_by(ProcurementDocument.uploaded_at.desc()).all()]


@router.patch("/procurement-documents/{doc_id}")
def patch_proc_doc(doc_id: int, body: ProcDocPatch, db: Session = Depends(get_db),
                   user: User = Depends(STAFF)):
    doc = db.get(ProcurementDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(doc, k, v)
    db.commit(); db.refresh(doc)
    return pdoc_out(doc)


@router.delete("/procurement-documents/{doc_id}", status_code=204)
def delete_proc_doc(doc_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    doc = db.get(ProcurementDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(doc); db.commit()


@router.get("/clients/{client_id}/projects/{project_id}/procurement-documents")
def client_proc_docs(client_id: int, project_id: int, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    if user.role == "Client" and user.client_id != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    project = db.get(Project, project_id)
    if not project or project.client_id != client_id:
        raise HTTPException(status_code=404, detail="Project not found for this client")
    po_ids = [p.id for p in db.query(PurchaseOrder).filter_by(project_id=project_id).all()]
    sub_ids = [s.id for s in db.query(Subcontract).filter_by(project_id=project_id).all()]
    bp_ids = [b.id for b in db.query(BidPackage).filter_by(project_id=project_id).all()]
    docs = db.query(ProcurementDocument).filter(
        ProcurementDocument.is_client_visible == True).all()  # noqa: E712
    result = [doc for doc in docs if
              (doc.related_type == "po" and doc.related_id in po_ids) or
              (doc.related_type == "subcontract" and doc.related_id in sub_ids) or
              (doc.related_type == "bid_package" and doc.related_id in bp_ids)]
    return [pdoc_out(doc) for doc in result]


# ---------- Dashboard ----------
@router.get("/projects/{project_id}/procurement/dashboard-summary")
def proc_dashboard(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    project = get_project_or_404(db, project_id)
    pos = db.query(PurchaseOrder).filter_by(project_id=project_id).all()
    subs = db.query(Subcontract).filter_by(project_id=project_id).all()
    total = sum(committed_amount(db, "po", p) for p in pos if p.status != "Cancelled") + \
        sum(committed_amount(db, "subcontract", s) for s in subs if s.status not in ("Cancelled", "Terminated"))
    pending = sum(1 for p in pos if p.status == "PendingApproval") + \
        sum(1 for s in subs if s.status == "PendingApproval")
    co_pending = db.query(ChangeOrder).filter(ChangeOrder.status == "Pending",
        ((ChangeOrder.commitment_type == "po") & ChangeOrder.commitment_id.in_([p.id for p in pos] or [0])) |
        ((ChangeOrder.commitment_type == "subcontract") & ChangeOrder.commitment_id.in_([s.id for s in subs] or [0]))).count()
    pa_pending = db.query(PayApplication).filter(PayApplication.status.in_(["Submitted", "UnderReview"]),
        ((PayApplication.commitment_type == "po") & PayApplication.commitment_id.in_([p.id for p in pos] or [0])) |
        ((PayApplication.commitment_type == "subcontract") & PayApplication.commitment_id.in_([s.id for s in subs] or [0]))).count()
    vendor_ids = {p.vendor_id for p in pos} | {s.vendor_id for s in subs}
    expiring = sum(1 for vid in vendor_ids
                   if (v := db.get(Vendor, vid)) and insurance_expiring_soon(v))
    return {"total_committed": round(total, 2),
            "budget_variance": round(f(project.budget) - total, 2),
            "open_pos": sum(1 for p in pos if p.status in ("Approved", "PartiallyReceived")),
            "pending_approvals": pending + co_pending + pa_pending,
            "expiring_insurance": expiring}


@router.get("/projects/{project_id}/procurement/commitments")
def list_commitments(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF),
                     type: str = None, status: str = None, vendor_id: int = None,
                     cost_code: str = None, pending_approval: bool = None,
                     over_budget: bool = None):
    get_project_or_404(db, project_id)
    rows = []
    if type in (None, "po"):
        rows += [po_out(db, p) for p in db.query(PurchaseOrder).filter_by(project_id=project_id).all()]
    if type in (None, "subcontract"):
        rows += [sub_out(db, s) for s in db.query(Subcontract).filter_by(project_id=project_id).all()]
    if status == "open":
        rows = [r for r in rows if r["status"] in ("Approved", "PartiallyReceived")]
    elif status:
        rows = [r for r in rows if r["status"] == status]
    if vendor_id is not None:
        rows = [r for r in rows if r["vendor_id"] == vendor_id]
    if cost_code:
        rows = [r for r in rows if r["cost_code"] == cost_code]
    if pending_approval is not None:
        rows = [r for r in rows if r["pending_approval"] == pending_approval]
    if over_budget is not None:
        rows = [r for r in rows if r["over_budget"] == over_budget]
    rows.sort(key=lambda r: r["created_at"] or "", reverse=True)
    return {"items": rows, "total": len(rows)}


@router.get("/projects/{project_id}/procurement/budget-breakdown")
def budget_breakdown(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    get_project_or_404(db, project_id)
    pos = db.query(PurchaseOrder).filter_by(project_id=project_id).all()
    subs = db.query(Subcontract).filter_by(project_id=project_id).all()
    codes = {}
    for ctype, items in (("po", pos), ("subcontract", subs)):
        for c in items:
            code = c.cost_code or "Unassigned"
            codes.setdefault(code, 0.0)
            codes[code] += committed_amount(db, ctype, c)
    budgets = {b.cost_code: f(b.allocated_amount)
               for b in db.query(CostCodeBudget).filter_by(project_id=project_id).all()}
    all_codes = sorted(set(codes) | set(budgets))
    return [{"cost_code": code, "allocated": budgets.get(code, 0.0),
             "committed": round(codes.get(code, 0.0), 2),
             "variance": round(budgets.get(code, 0.0) - codes.get(code, 0.0), 2)}
            for code in all_codes]
