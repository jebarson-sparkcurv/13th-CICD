from datetime import date, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.procurement import (Vendor, VendorDocument, PurchaseOrder, Subcontract,
                                    ChangeOrder, PayApplication, CostCodeBudget)


def d(v):
    return v.isoformat() if v else None


def f(v):
    return float(v) if v is not None else 0.0


def co_total(db: Session, ctype: str, cid: int, status="Approved") -> float:
    total = (db.query(func.coalesce(func.sum(ChangeOrder.amount), 0))
             .filter(ChangeOrder.commitment_type == ctype,
                     ChangeOrder.commitment_id == cid,
                     ChangeOrder.status == status).scalar())
    return float(total or 0)


def committed_amount(db: Session, ctype: str, c) -> float:
    return f(c.original_amount) + co_total(db, ctype, c.id)


def is_pending_approval(db: Session, ctype: str, c) -> bool:
    if c.status == "PendingApproval":
        return True
    if db.query(ChangeOrder).filter(ChangeOrder.commitment_type == ctype,
                                    ChangeOrder.commitment_id == c.id,
                                    ChangeOrder.status == "Pending").first():
        return True
    return bool(db.query(PayApplication).filter(
        PayApplication.commitment_type == ctype,
        PayApplication.commitment_id == c.id,
        PayApplication.status.in_(["Submitted", "UnderReview"])).first())


def cost_code_allocated(db: Session, project_id: int, cost_code: str) -> float:
    row = (db.query(CostCodeBudget)
           .filter(CostCodeBudget.project_id == project_id,
                   CostCodeBudget.cost_code == cost_code).first())
    return f(row.allocated_amount) if row else 0.0


def is_over_budget(db: Session, ctype: str, c) -> bool:
    if not c.cost_code:
        return False
    allocated = cost_code_allocated(db, c.project_id, c.cost_code)
    return allocated > 0 and committed_amount(db, ctype, c) > allocated


def insurance_current(db: Session, vendor: Vendor) -> bool:
    today = date.today()
    if vendor.insurance_expiry and vendor.insurance_expiry >= today:
        return True
    doc = (db.query(VendorDocument)
           .filter(VendorDocument.vendor_id == vendor.id,
                   VendorDocument.category == "COI",
                   VendorDocument.expiry_date >= today).first())
    return bool(doc)


def insurance_expiring_soon(vendor: Vendor, days=30) -> bool:
    if not vendor.insurance_expiry:
        return False
    return vendor.insurance_expiry <= date.today() + timedelta(days=days)


def vendor_out(v: Vendor, db: Session = None) -> dict:
    out = {"id": v.id, "name": v.name, "vendor_type": v.vendor_type, "trade": v.trade,
           "contact_name": v.contact_name, "email": v.email, "phone": v.phone,
           "address": v.address, "tax_id": v.tax_id, "license_number": v.license_number,
           "insurance_expiry": d(v.insurance_expiry), "status": v.status,
           "prequalified": v.prequalified,
           "rating": float(v.rating) if v.rating is not None else None,
           "insurance_expiring": insurance_expiring_soon(v),
           "created_at": d(v.created_at)}
    if db is not None:
        out["insurance_current"] = insurance_current(db, v)
    return out


def vdoc_out(doc) -> dict:
    return {"id": doc.id, "vendor_id": doc.vendor_id, "document_name": doc.document_name,
            "file_url": doc.file_url, "file_type": doc.file_type, "category": doc.category,
            "expiry_date": d(doc.expiry_date), "uploaded_at": d(doc.uploaded_at)}


def po_line_out(li) -> dict:
    return {"id": li.id, "purchase_order_id": li.purchase_order_id,
            "item_description": li.item_description, "unit": li.unit,
            "quantity": f(li.quantity), "unit_price": f(li.unit_price),
            "line_total": f(li.line_total), "received_quantity": f(li.received_quantity)}


def po_out(db: Session, po: PurchaseOrder, detail=False) -> dict:
    ca = committed_amount(db, "po", po)
    out = {"id": po.id, "type": "po", "project_id": po.project_id,
           "vendor_id": po.vendor_id, "vendor_name": po.vendor.name if po.vendor else None,
           "po_number": po.po_number, "number": po.po_number, "cost_code": po.cost_code,
           "description": po.description, "status": po.status,
           "issue_date": d(po.issue_date), "expected_delivery_date": d(po.expected_delivery_date),
           "original_amount": f(po.original_amount), "revised_amount": ca,
           "change_orders_total": co_total(db, "po", po.id), "committed_amount": ca,
           "pending_approval": is_pending_approval(db, "po", po),
           "over_budget": is_over_budget(db, "po", po),
           "retainage_pct": 0, "created_at": d(po.created_at)}
    if detail:
        out["line_items"] = [po_line_out(li) for li in po.line_items]
        out["vendor"] = vendor_out(po.vendor, db) if po.vendor else None
    return out


def sub_out(db: Session, s: Subcontract, detail=False) -> dict:
    ca = committed_amount(db, "subcontract", s)
    out = {"id": s.id, "type": "subcontract", "project_id": s.project_id,
           "vendor_id": s.vendor_id, "vendor_name": s.vendor.name if s.vendor else None,
           "contract_number": s.contract_number, "number": s.contract_number,
           "cost_code": s.cost_code, "scope_of_work": s.scope_of_work, "status": s.status,
           "original_amount": f(s.original_amount), "revised_amount": ca,
           "change_orders_total": co_total(db, "subcontract", s.id), "committed_amount": ca,
           "retainage_pct": f(s.retainage_pct),
           "start_date": d(s.start_date), "end_date": d(s.end_date),
           "executed_at": d(s.executed_at), "approved_by": s.approved_by,
           "pending_approval": is_pending_approval(db, "subcontract", s),
           "over_budget": is_over_budget(db, "subcontract", s),
           "created_at": d(s.created_at)}
    if detail:
        out["vendor"] = vendor_out(s.vendor, db) if s.vendor else None
        out["line_items"] = []
    return out


def co_out(co) -> dict:
    return {"id": co.id, "commitment_type": co.commitment_type, "commitment_id": co.commitment_id,
            "co_number": co.co_number, "reason": co.reason, "amount": f(co.amount),
            "status": co.status, "requested_at": d(co.requested_at), "approved_at": d(co.approved_at)}


def payapp_line_out(li) -> dict:
    return {"id": li.id, "description": li.description, "scheduled_value": f(li.scheduled_value),
            "previous_completed": f(li.previous_completed), "this_period": f(li.this_period),
            "materials_stored": f(li.materials_stored), "pct_complete": f(li.pct_complete)}


def waiver_out(w) -> dict:
    return {"id": w.id, "pay_application_id": w.pay_application_id, "vendor_id": w.vendor_id,
            "waiver_type": w.waiver_type, "file_url": w.file_url, "amount": f(w.amount),
            "signed_date": d(w.signed_date), "status": w.status}


def payapp_out(pa, detail=False) -> dict:
    out = {"id": pa.id, "commitment_type": pa.commitment_type, "commitment_id": pa.commitment_id,
           "application_number": pa.application_number,
           "period_start": d(pa.period_start), "period_end": d(pa.period_end),
           "amount_this_period": f(pa.amount_this_period), "retainage_held": f(pa.retainage_held),
           "amount_due": f(pa.amount_due), "status": pa.status,
           "submitted_at": d(pa.submitted_at), "approved_at": d(pa.approved_at), "paid_at": d(pa.paid_at)}
    if detail:
        out["line_items"] = [payapp_line_out(li) for li in pa.line_items]
        out["lien_waivers"] = [waiver_out(w) for w in pa.lien_waivers]
    return out


def delivery_out(dv) -> dict:
    return {"id": dv.id, "purchase_order_id": dv.purchase_order_id, "project_id": dv.project_id,
            "item_description": dv.item_description, "quantity_delivered": f(dv.quantity_delivered),
            "delivery_date": d(dv.delivery_date), "condition_notes": dv.condition_notes,
            "status": dv.status}


def pdoc_out(doc) -> dict:
    return {"id": doc.id, "related_type": doc.related_type, "related_id": doc.related_id,
            "document_name": doc.document_name, "file_url": doc.file_url,
            "file_type": doc.file_type, "category": doc.category,
            "uploader_name": doc.uploader.name if doc.uploader else None,
            "is_client_visible": doc.is_client_visible, "uploaded_at": d(doc.uploaded_at)}
