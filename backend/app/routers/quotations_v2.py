import os
import smtplib
import urllib.parse
from datetime import date
from email.mime.text import MIMEText
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.database import get_db
from app.models import Project, User
from app.models.finance import Payment
from app.models.procurement import Product, Quotation, QuotationLineItem, QuotationPurchaseOrder, QuotationShareLog, Vendor

router = APIRouter(tags=["quotations"])
STAFF = require_roles("Admin", "Accountant", "SiteEngineer", "ProcurementOfficer")
FIN = require_roles("Admin", "Accountant")


def f(x):
    return float(x) if x is not None else None


# ---------- Products ----------

class ProductIn(BaseModel):
    name: str = Field(min_length=1)
    unit: Optional[str] = "nos"
    category: Optional[str] = None
    description: Optional[str] = None
    default_price: Optional[float] = Field(default=None, ge=0)


def product_out(p):
    return {"id": p.id, "name": p.name, "unit": p.unit, "category": p.category,
            "description": p.description, "default_price": f(p.default_price)}


@router.get("/products")
def list_products(search: str = None, category: str = None,
                  db: Session = Depends(get_db), user: User = Depends(STAFF)):
    q = db.query(Product)
    if search:
        q = q.filter(Product.name.ilike(f"%{search}%"))
    if category:
        q = q.filter(Product.category == category)
    return [product_out(p) for p in q.order_by(Product.name).all()]


@router.post("/products", status_code=201)
def create_product(body: ProductIn, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    p = Product(**body.model_dump(), created_by=user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_out(p)


@router.patch("/products/{product_id}")
def update_product(product_id: int, body: ProductIn, db: Session = Depends(get_db),
                   user: User = Depends(STAFF)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("Admin", "ProcurementOfficer"))):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if db.query(QuotationLineItem).filter(QuotationLineItem.product_id == product_id).first():
        raise HTTPException(status_code=422, detail="Product is used in quotations and cannot be deleted")
    db.delete(p)
    db.commit()


# ---------- Quotations ----------

class LineItemIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)
    notes: Optional[str] = None


class QuotationCreate(BaseModel):
    vendor_id: int
    quotation_date: Optional[str] = None
    valid_until: Optional[str] = None
    line_items: List[LineItemIn] = Field(min_length=1)


def quotation_out(q, db, with_items=True):
    vendor = db.get(Vendor, q.vendor_id)
    products = {p.id: p for p in db.query(Product).all()}
    # Attach latest non-cancelled PO summary + cancelled flag so the UI can
    # render Pending / PO Created / Sent / Cancelled chips without extra calls.
    po_summary = None
    active_po = (db.query(QuotationPurchaseOrder)
                 .filter(QuotationPurchaseOrder.quotation_id == q.id,
                         QuotationPurchaseOrder.status != "CANCELLED")
                 .order_by(QuotationPurchaseOrder.id.desc()).first())
    cancelled_po = None
    if not active_po:
        cancelled_po = (db.query(QuotationPurchaseOrder)
                        .filter(QuotationPurchaseOrder.quotation_id == q.id,
                                QuotationPurchaseOrder.status == "CANCELLED")
                        .order_by(QuotationPurchaseOrder.id.desc()).first())
    ref = active_po or cancelled_po
    if ref:
        from app.routers.quotation_purchase_orders import po_paid
        paid = po_paid(db, ref.id)
        po_summary = {"id": ref.id, "po_number": ref.po_number, "status": ref.status,
                      "grand_total": float(ref.grand_total or 0), "amount_paid": paid,
                      "balance_due": round(max(float(ref.grand_total or 0) - paid, 0), 2)}

    out = {"id": q.id, "project_id": q.project_id, "vendor_id": q.vendor_id,
           "vendor_name": vendor.name if vendor else None,
           "status": q.status, "quotation_number": q.quotation_number,
           "quotation_date": q.quotation_date.isoformat() if q.quotation_date else None,
           "valid_until": q.valid_until.isoformat() if q.valid_until else None,
           "quotation_total": f(q.quotation_total) or 0,
           "purchase_order": po_summary,
           "created_at": q.created_at.isoformat() if q.created_at else None}
    if with_items:
        out["line_items"] = [{
            "id": li.id, "product_id": li.product_id,
            "product_name": products[li.product_id].name if li.product_id in products else "?",
            "unit": products[li.product_id].unit if li.product_id in products else "",
            "quantity": f(li.quantity), "unit_price": f(li.unit_price),
            "line_total": f(li.line_total), "notes": li.notes} for li in q.line_items]
    return out


def recompute_total(q):
    q.quotation_total = round(sum(float(li.line_total) for li in q.line_items), 2)


@router.get("/projects/{project_id}/quotations")
def list_quotations(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return [quotation_out(q, db, with_items=False) for q in
            db.query(Quotation).filter(Quotation.project_id == project_id)
            .order_by(Quotation.created_at.desc()).all()]


@router.post("/projects/{project_id}/quotations", status_code=201)
def create_quotation(project_id: int, body: QuotationCreate, db: Session = Depends(get_db),
                     user: User = Depends(STAFF)):
    if not db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    if not db.get(Vendor, body.vendor_id):
        raise HTTPException(status_code=422, detail="Invalid vendor")
    seq = db.query(Quotation).count() + 1
    q = Quotation(project_id=project_id, vendor_id=body.vendor_id, status="draft",
                  quotation_number=f"QTN-{date.today().year}-{seq:04d}",
                  quotation_date=date.fromisoformat(body.quotation_date) if body.quotation_date else date.today(),
                  valid_until=date.fromisoformat(body.valid_until) if body.valid_until else None,
                  created_by=user.id)
    for li in body.line_items:
        if not db.get(Product, li.product_id):
            raise HTTPException(status_code=422, detail=f"Invalid product {li.product_id}")
        q.line_items.append(QuotationLineItem(product_id=li.product_id, quantity=li.quantity,
                                              unit_price=li.unit_price,
                                              line_total=round(li.quantity * li.unit_price, 2),
                                              notes=li.notes))
    recompute_total(q)
    db.add(q)
    db.commit()
    db.refresh(q)
    return quotation_out(q, db)


def get_q(db, quotation_id):
    q = db.get(Quotation, quotation_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return q


@router.get("/quotations/{quotation_id}")
def get_quotation(quotation_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return quotation_out(get_q(db, quotation_id), db)


class QuotationPatch(BaseModel):
    status: Optional[str] = None
    valid_until: Optional[str] = None


@router.patch("/quotations/{quotation_id}")
def patch_quotation(quotation_id: int, body: QuotationPatch, db: Session = Depends(get_db),
                    user: User = Depends(STAFF)):
    q = get_q(db, quotation_id)
    if body.status:
        if body.status not in ("draft", "sent", "accepted", "rejected", "expired"):
            raise HTTPException(status_code=422, detail="Invalid status")
        q.status = body.status
    if body.valid_until:
        q.valid_until = date.fromisoformat(body.valid_until)
    db.commit()
    db.refresh(q)
    return quotation_out(q, db)


@router.post("/quotations/{quotation_id}/line-items", status_code=201)
def add_line_item(quotation_id: int, body: LineItemIn, db: Session = Depends(get_db),
                  user: User = Depends(STAFF)):
    q = get_q(db, quotation_id)
    if not db.get(Product, body.product_id):
        raise HTTPException(status_code=422, detail="Invalid product")
    q.line_items.append(QuotationLineItem(product_id=body.product_id, quantity=body.quantity,
                                          unit_price=body.unit_price,
                                          line_total=round(body.quantity * body.unit_price, 2),
                                          notes=body.notes))
    recompute_total(q)
    db.commit()
    db.refresh(q)
    return quotation_out(q, db)


@router.delete("/quotation-line-items/{item_id}", status_code=204)
def delete_line_item(item_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    li = db.get(QuotationLineItem, item_id)
    if not li:
        raise HTTPException(status_code=404, detail="Line item not found")
    q = li.quotation
    if len(q.line_items) <= 1:
        raise HTTPException(status_code=422, detail="A quotation must keep at least one line item")
    q.line_items.remove(li)
    recompute_total(q)
    db.commit()


@router.get("/quotations/{quotation_id}/print", response_class=HTMLResponse)
def print_quotation(quotation_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    q = get_q(db, quotation_id)
    data = quotation_out(q, db)
    project = db.get(Project, q.project_id)
    rows = "".join(
        f"<tr><td>{li['product_name']}</td><td>{li['quantity']:g} {li['unit']}</td>"
        f"<td style='text-align:right'>Rs. {li['unit_price']:,.2f}</td>"
        f"<td style='text-align:right'>Rs. {li['line_total']:,.2f}</td></tr>"
        for li in data["line_items"])
    return f"""<!DOCTYPE html><html><head><title>{data['quotation_number']}</title>
<style>body{{font-family:Arial;max-width:720px;margin:32px auto;color:#0f172a}}
table{{width:100%;border-collapse:collapse;margin-top:16px}}
th,td{{border:1px solid #cbd5e1;padding:8px 10px;font-size:14px;text-align:left}}
th{{background:#0f172a;color:#fff;text-transform:uppercase;font-size:11px;letter-spacing:1px}}
@media print{{.noprint{{display:none}}}}</style></head><body>
<h1 style="margin-bottom:0">SITERA <span style="color:#d97706">Quotation</span></h1>
<p style="color:#64748b;margin-top:4px">{data['quotation_number']} · {data['quotation_date']}{' · Valid until ' + data['valid_until'] if data['valid_until'] else ''}</p>
<p><b>Project:</b> {project.name if project else ''}<br/><b>Vendor:</b> {data['vendor_name']}<br/><b>Status:</b> {data['status']}</p>
<table><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>{rows}
<tr><td colspan="3" style="text-align:right"><b>Quotation Total</b></td><td style="text-align:right"><b>Rs. {data['quotation_total']:,.2f}</b></td></tr></table>
<button class="noprint" onclick="window.print()" style="margin-top:20px;padding:10px 24px;background:#2563eb;color:#fff;border:0;font-weight:bold;cursor:pointer">PRINT</button>
</body></html>"""


class SendIn(BaseModel):
    channel: str


@router.post("/quotations/{quotation_id}/send")
def send_quotation(quotation_id: int, body: SendIn, db: Session = Depends(get_db),
                   user: User = Depends(STAFF)):
    if body.channel not in ("whatsapp", "email"):
        raise HTTPException(status_code=422, detail="channel must be whatsapp or email")
    q = get_q(db, quotation_id)
    vendor = db.get(Vendor, q.vendor_id)
    data = quotation_out(q, db)
    summary = f"Quotation {data['quotation_number']} — Total Rs. {data['quotation_total']:,.2f}. " \
              + "; ".join(f"{li['product_name']} x{li['quantity']:g} @ Rs. {li['unit_price']:,.2f}" for li in data["line_items"])
    wa_link = None
    status, sent_to = "sent", None
    if body.channel == "whatsapp":
        phone = (vendor.phone or "").strip()
        if not phone:
            raise HTTPException(status_code=422, detail="Vendor has no phone number on file — add one in the Vendor record first")
        sent_to = phone
        digits = "".join(ch for ch in phone if ch.isdigit())
        wa_link = f"https://wa.me/{digits}?text={urllib.parse.quote(summary)}"
    else:
        email = (vendor.email or "").strip()
        if not email:
            raise HTTPException(status_code=422, detail="Vendor has no email on file — add one in the Vendor record first")
        sent_to = email
        try:
            msg = MIMEText(f"<p>{summary}</p><p>— Sitera Construction Portal</p>", "html")
            msg["Subject"] = f"Quotation {data['quotation_number']} — {data['vendor_name']}"
            msg["From"] = f"Sitera <{os.environ.get('SMTP_EMAIL')}>"
            msg["To"] = email
            with smtplib.SMTP_SSL(os.environ.get("SMTP_HOST"), int(os.environ.get("SMTP_PORT", "465")), timeout=20) as s:
                s.login(os.environ.get("SMTP_EMAIL"), os.environ.get("SMTP_PASSWORD"))
                s.sendmail(os.environ.get("SMTP_EMAIL"), [email], msg.as_string())
        except Exception:
            status = "failed"
    db.add(QuotationShareLog(quotation_id=q.id, channel=body.channel, sent_to=sent_to,
                             sent_by=user.id, status=status))
    if q.status == "draft" and status == "sent":
        q.status = "sent"
    db.commit()
    return {"channel": body.channel, "sent_to": sent_to, "status": status, "wa_link": wa_link}


@router.get("/quotations/{quotation_id}/share-log")
def share_log(quotation_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    get_q(db, quotation_id)
    users = {u.id: u.name for u in db.query(User).all()}
    return [{"channel": s.channel, "sent_to": s.sent_to, "status": s.status,
             "sent_by": users.get(s.sent_by),
             "sent_at": s.sent_at.isoformat() if s.sent_at else None}
            for s in db.query(QuotationShareLog).filter(QuotationShareLog.quotation_id == quotation_id)
            .order_by(QuotationShareLog.sent_at.desc()).all()]


# ---------- Vendor payments ----------

class VendorPaymentIn(BaseModel):
    vendor_id: int
    amount: float = Field(gt=0)
    payment_method: Optional[str] = "BankTransfer"
    reference_no: Optional[str] = None
    notes: Optional[str] = None
    quotation_id: Optional[int] = None


@router.post("/projects/{project_id}/vendor-payments", status_code=201)
def create_vendor_payment(project_id: int, body: VendorPaymentIn, db: Session = Depends(get_db),
                          user: User = Depends(FIN)):
    if not db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    vendor = db.get(Vendor, body.vendor_id)
    if not vendor:
        raise HTTPException(status_code=422, detail="Invalid vendor")
    note = body.notes or ""
    if body.quotation_id:
        qq = db.get(Quotation, body.quotation_id)
        if qq:
            note = f"Against {qq.quotation_number}. {note}".strip()
    p = Payment(project_id=project_id, vendor_id=vendor.id, payment_direction="outgoing",
                tenant_id=db.get(Project, project_id).tenant_id,
                amount=body.amount, payment_date=date.today(),
                payment_method=body.payment_method, reference_no=body.reference_no,
                received_by=user.id, notes=note or f"Vendor payment — {vendor.name}")
    db.add(p)
    db.commit()
    return {"id": p.id, "vendor_id": vendor.id, "vendor_name": vendor.name,
            "amount": body.amount, "date": p.payment_date.isoformat()}


@router.get("/projects/{project_id}/vendor-payments")
def list_vendor_payments(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    vendors = {v.id: v.name for v in db.query(Vendor).all()}
    return [{"id": p.id, "vendor_id": p.vendor_id, "vendor_name": vendors.get(p.vendor_id),
             "amount": float(p.amount), "date": p.payment_date.isoformat() if p.payment_date else None,
             "method": p.payment_method, "notes": p.notes}
            for p in db.query(Payment).filter(Payment.project_id == project_id,
                                              Payment.payment_direction == "outgoing")
            .order_by(Payment.created_at.desc()).all()]
