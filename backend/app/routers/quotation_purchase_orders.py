"""Purchase Order module — customer-facing PO documents generated from a Quotation.

Distinct from `procurement.PurchaseOrder` (construction commitment).

Flow:
  Quotation List → click "Purchase Order" → POST /api/quotations/{qid}/purchase-order
    Backend pre-fills a DRAFT PO from the quotation and returns it.
  Frontend edits prices → PUT /api/quotation-purchase-orders/{id}
  User issues → PUT with status="ISSUED" (or the backend switches automatically).
  User sends via email/whatsapp → POST /.../send-email or /.../send-whatsapp
  User cancels → POST /.../cancel
  PDF: GET /.../pdf → returns application/pdf built from saved PO data.
"""
import os
import urllib.parse
from datetime import date, datetime, timezone
from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.email_utils import send_html
from app.core.security import require_roles
from app.core.tenant_scope import assert_same_tenant, ensure_tenant_owned, tenant_scope
from app.database import get_db
from app.models import Project, User
from app.models.procurement import (Product, Quotation, QuotationLineItem,
                                    QuotationPurchaseOrder,
                                    QuotationPurchaseOrderItem, Vendor)

router = APIRouter(tags=["quotation-purchase-orders"])

WRITE = require_roles("Admin", "Accountant", "ProcurementOfficer")
READ = require_roles("Admin", "Accountant", "SiteEngineer", "ProcurementOfficer")

DARK = colors.HexColor("#0f172a")
ACCENT = colors.HexColor("#d97706")


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _f(x) -> float:
    return float(x) if x is not None else 0.0


def _money(x) -> str:
    return f"Rs. {_f(x):,.2f}"


def _get_po(db: Session, po_id: int, user: User) -> QuotationPurchaseOrder:
    po = db.get(QuotationPurchaseOrder, po_id)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    assert_same_tenant(po, user, "purchase order")
    return po


def _get_quotation(db: Session, qid: int, user: User) -> Quotation:
    q = db.get(Quotation, qid)
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    assert_same_tenant(q, user, "quotation")
    return q


def _round(x) -> float:
    return round(float(x or 0), 2)


PAY = require_roles("Admin", "Accountant")
PAY_METHODS = ("BankTransfer", "Cash", "Cheque", "UPI")


def po_paid(db: Session, po_id: int) -> float:
    from app.models.finance import Payment
    return _f(db.query(func.coalesce(func.sum(Payment.amount), 0))
              .filter(Payment.purchase_order_id == po_id,
                      Payment.payment_direction == "outgoing").scalar())


def _po_out(db: Session, po: QuotationPurchaseOrder) -> dict:
    vendor = db.get(Vendor, po.vendor_id)
    paid = po_paid(db, po.id)
    project = db.get(Project, po.project_id)
    quotation = db.get(Quotation, po.quotation_id)
    return {
        "id": po.id, "po_number": po.po_number, "status": po.status,
        "order_date": po.order_date.isoformat() if po.order_date else None,
        "quotation_id": po.quotation_id,
        "quotation_number": quotation.quotation_number if quotation else None,
        "project_id": po.project_id,
        "project_name": project.name if project else None,
        "vendor_id": po.vendor_id,
        "vendor": {
            "id": vendor.id if vendor else None,
            "name": vendor.name if vendor else None,
            "email": vendor.email if vendor else None,
            "phone": vendor.phone if vendor else None,
            "address": vendor.address if vendor else None,
        } if vendor else None,
        "subtotal": _f(po.subtotal), "discount": _f(po.discount),
        "tax": _f(po.tax), "grand_total": _f(po.grand_total),
        "amount_paid": paid,
        "balance_due": round(max(_f(po.grand_total) - paid, 0), 2),
        "payment_status": ("Paid" if paid > 0 and paid >= _f(po.grand_total) - 0.005
                           else "Partially Paid" if paid > 0 else "Unpaid"),
        "notes": po.notes,
        "items": [{
            "id": it.id, "quotation_item_id": it.quotation_item_id,
            "item_name": it.item_name, "description": it.description,
            "quantity": _f(it.quantity), "unit_price": _f(it.unit_price),
            "total_price": _f(it.total_price),
        } for it in po.items],
        "sent_at": po.sent_at.isoformat() if po.sent_at else None,
        "cancelled_at": po.cancelled_at.isoformat() if po.cancelled_at else None,
        "created_at": po.created_at.isoformat() if po.created_at else None,
        "updated_at": po.updated_at.isoformat() if po.updated_at else None,
    }


def _recompute(po: QuotationPurchaseOrder):
    """Backend is source of truth for totals. Recompute from items + stored
    discount/tax (which are absolute ₹ amounts)."""
    subtotal = 0.0
    for it in po.items:
        it.total_price = _round(_f(it.quantity) * _f(it.unit_price))
        subtotal += _f(it.total_price)
    po.subtotal = _round(subtotal)
    discount = max(0.0, _f(po.discount))
    tax = max(0.0, _f(po.tax))
    po.grand_total = _round(max(0.0, subtotal - discount + tax))


def _next_po_number(db: Session) -> str:
    year = date.today().year
    count = db.query(QuotationPurchaseOrder).count()
    return f"PO-{year}-{count + 1:04d}"


# ---------------------------------------------------------------------------
# Create / read / update / cancel
# ---------------------------------------------------------------------------

class POItemIn(BaseModel):
    id: Optional[int] = None
    quotation_item_id: Optional[int] = None
    item_name: str = Field(min_length=1)
    description: Optional[str] = None
    quantity: float = Field(gt=0)
    unit_price: float = Field(ge=0)


class POUpdateIn(BaseModel):
    status: Optional[str] = None  # DRAFT | ISSUED (SENT/CANCELLED are set via dedicated endpoints)
    order_date: Optional[str] = None
    discount: Optional[float] = Field(default=None, ge=0)
    tax: Optional[float] = Field(default=None, ge=0)
    notes: Optional[str] = None
    items: Optional[List[POItemIn]] = None


@router.post("/quotations/{quotation_id}/purchase-order", status_code=201)
def create_purchase_order(quotation_id: int, db: Session = Depends(get_db),
                          user: User = Depends(WRITE)):
    q = _get_quotation(db, quotation_id, user)
    if not db.get(Vendor, q.vendor_id):
        raise HTTPException(status_code=422, detail="Quotation has no valid vendor")

    # Business rule: only one non-cancelled PO per quotation
    existing = (db.query(QuotationPurchaseOrder)
                .filter(QuotationPurchaseOrder.quotation_id == q.id,
                        QuotationPurchaseOrder.status != "CANCELLED")
                .first())
    if existing:
        raise HTTPException(status_code=409,
                            detail=f"Purchase order {existing.po_number} already exists for this quotation")

    if not q.line_items:
        raise HTTPException(status_code=422, detail="Quotation has no line items")

    po = QuotationPurchaseOrder(
        quotation_id=q.id, project_id=q.project_id, vendor_id=q.vendor_id,
        po_number=_next_po_number(db),
        status="DRAFT", order_date=date.today(),
        discount=0, tax=0, subtotal=0, grand_total=0,
        created_by=user.id,
    )
    ensure_tenant_owned(po, user)

    products = {p.id: p for p in db.query(Product).all()}
    for li in q.line_items:
        product = products.get(li.product_id)
        po.items.append(QuotationPurchaseOrderItem(
            quotation_item_id=li.id,
            item_name=product.name if product else "Item",
            description=(product.description if product else None) or li.notes,
            quantity=li.quantity, unit_price=li.unit_price,
            total_price=_round(_f(li.quantity) * _f(li.unit_price)),
        ))
    _recompute(po)
    db.add(po)
    db.commit()
    db.refresh(po)
    return _po_out(db, po)


@router.get("/quotation-purchase-orders/{po_id}")
def get_purchase_order(po_id: int, db: Session = Depends(get_db), user: User = Depends(READ)):
    po = _get_po(db, po_id, user)
    return _po_out(db, po)


@router.get("/quotations/{quotation_id}/purchase-order")
def get_purchase_order_by_quotation(quotation_id: int, db: Session = Depends(get_db),
                                    user: User = Depends(READ)):
    q = _get_quotation(db, quotation_id, user)
    po = (tenant_scope(db.query(QuotationPurchaseOrder), QuotationPurchaseOrder, user)
          .filter(QuotationPurchaseOrder.quotation_id == q.id,
                  QuotationPurchaseOrder.status != "CANCELLED")
          .order_by(QuotationPurchaseOrder.id.desc()).first())
    if not po:
        return None
    return _po_out(db, po)


@router.put("/quotation-purchase-orders/{po_id}")
def update_purchase_order(po_id: int, body: POUpdateIn, db: Session = Depends(get_db),
                          user: User = Depends(WRITE)):
    po = _get_po(db, po_id, user)
    if po.status == "CANCELLED":
        raise HTTPException(status_code=422, detail="Cannot edit a cancelled purchase order")

    data = body.model_dump(exclude_unset=True)

    if "status" in data:
        new_status = (data["status"] or "").upper()
        if new_status not in ("DRAFT", "ISSUED"):
            raise HTTPException(status_code=422,
                                detail="status can only be set to DRAFT or ISSUED via PUT")
        po.status = new_status

    if "order_date" in data and data["order_date"]:
        try:
            po.order_date = date.fromisoformat(data["order_date"])
        except ValueError:
            raise HTTPException(status_code=422, detail="order_date must be YYYY-MM-DD")

    if "discount" in data:
        po.discount = _round(data["discount"] or 0)
    if "tax" in data:
        po.tax = _round(data["tax"] or 0)
    if "notes" in data:
        po.notes = data["notes"]

    if "items" in data and data["items"] is not None:
        # Reconcile items. Simple approach: replace all.
        po.items.clear()
        db.flush()
        for row in data["items"]:
            po.items.append(QuotationPurchaseOrderItem(
                quotation_item_id=row.get("quotation_item_id"),
                item_name=row["item_name"], description=row.get("description"),
                quantity=row["quantity"], unit_price=row["unit_price"],
                total_price=_round(_f(row["quantity"]) * _f(row["unit_price"])),
            ))
        if not po.items:
            raise HTTPException(status_code=422, detail="Purchase order must have at least one item")

    _recompute(po)
    paid = po_paid(db, po.id)
    if paid and _f(po.grand_total) < paid - 0.005:
        db.rollback()
        raise HTTPException(status_code=422, detail=f"Grand total can't be less than the {_money(paid)} already paid to the vendor")
    db.commit()
    db.refresh(po)
    return _po_out(db, po)


@router.post("/quotation-purchase-orders/{po_id}/cancel")
def cancel_purchase_order(po_id: int, db: Session = Depends(get_db),
                          user: User = Depends(WRITE)):
    po = _get_po(db, po_id, user)
    if po.status == "CANCELLED":
        return _po_out(db, po)
    paid = po_paid(db, po.id)
    if paid:
        raise HTTPException(status_code=409, detail=f"{_money(paid)} has already been paid against this PO — it can't be cancelled")
    po.status = "CANCELLED"
    po.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return _po_out(db, po)


# ---------------------------------------------------------------------------
# Vendor payments against a PO
# ---------------------------------------------------------------------------

class POPaymentIn(BaseModel):
    amount: float = Field(gt=0)
    payment_method: Optional[str] = "BankTransfer"
    payment_date: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


def _payment_out(p, users: dict) -> dict:
    return {"id": p.id, "amount": _f(p.amount),
            "payment_date": p.payment_date.isoformat() if p.payment_date else None,
            "payment_method": p.payment_method, "reference_no": p.reference_no,
            "notes": p.notes, "recorded_by": users.get(p.received_by),
            "created_at": p.created_at.isoformat() if p.created_at else None}


@router.get("/quotation-purchase-orders/{po_id}/payments")
def list_po_payments(po_id: int, db: Session = Depends(get_db), user: User = Depends(READ)):
    from app.models.finance import Payment
    po = _get_po(db, po_id, user)
    rows = (db.query(Payment).filter(Payment.purchase_order_id == po.id,
                                     Payment.payment_direction == "outgoing")
            .order_by(Payment.payment_date.desc(), Payment.id.desc()).all())
    users = {u.id: u.name for u in db.query(User).filter(User.id.in_([p.received_by for p in rows] or [0])).all()}
    return {"payments": [_payment_out(p, users) for p in rows], "amount_paid": po_paid(db, po.id),
            "grand_total": _f(po.grand_total),
            "balance_due": round(max(_f(po.grand_total) - po_paid(db, po.id), 0), 2)}


@router.post("/quotation-purchase-orders/{po_id}/payments", status_code=201)
def record_po_payment(po_id: int, body: POPaymentIn, db: Session = Depends(get_db),
                      user: User = Depends(PAY)):
    """Record money paid to the vendor against this PO. It is an outgoing
    project payment, so it shows on the project & company balance sheets."""
    from app.models.finance import Payment
    po = _get_po(db, po_id, user)
    if po.status == "CANCELLED":
        raise HTTPException(status_code=409, detail="This purchase order is cancelled")
    if po.status == "DRAFT":
        raise HTTPException(status_code=409, detail="Issue the purchase order before recording payments")
    method = body.payment_method or "BankTransfer"
    if method not in PAY_METHODS:
        raise HTTPException(status_code=422, detail=f"Payment method must be one of {', '.join(PAY_METHODS)}")
    pay_date = date.today()
    if body.payment_date:
        try:
            pay_date = date.fromisoformat(body.payment_date[:10])
        except ValueError:
            raise HTTPException(status_code=422, detail="payment_date must be YYYY-MM-DD")
        if pay_date > date.today():
            raise HTTPException(status_code=422, detail="Payment date can't be in the future")
    balance = round(_f(po.grand_total) - po_paid(db, po.id), 2)
    amount = _round(body.amount)
    if amount > balance + 0.005:
        raise HTTPException(status_code=422, detail=f"Amount is more than the balance due ({_money(max(balance, 0))})")
    vendor = db.get(Vendor, po.vendor_id)
    project = db.get(Project, po.project_id)
    note = f"Against {po.po_number}" + (f". {body.notes.strip()}" if (body.notes or "").strip() else "")
    p = Payment(project_id=po.project_id, vendor_id=po.vendor_id, purchase_order_id=po.id,
                tenant_id=(project.tenant_id if project else None) or po.tenant_id,
                payment_direction="outgoing", amount=amount, payment_date=pay_date,
                payment_method=method, reference_no=(body.reference_no or "").strip() or None,
                received_by=user.id, notes=note or f"Vendor payment — {vendor.name if vendor else ''}")
    db.add(p)
    db.commit()
    db.refresh(po)
    return _po_out(db, po)


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------

def _build_pdf_bytes(db: Session, po: QuotationPurchaseOrder) -> bytes:
    vendor = db.get(Vendor, po.vendor_id)
    project = db.get(Project, po.project_id)
    quotation = db.get(Quotation, po.quotation_id)

    ss = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle("t", parent=ss["Title"], fontName="Helvetica-Bold",
                                fontSize=22, textColor=DARK, alignment=0, spaceAfter=2),
        "subtitle": ParagraphStyle("s", parent=ss["Normal"], fontSize=10,
                                   textColor=ACCENT, spaceAfter=10,
                                   fontName="Helvetica-Bold"),
        "meta": ParagraphStyle("m", parent=ss["Normal"], fontSize=9,
                               textColor=colors.HexColor("#475569"), spaceAfter=2),
        "h2": ParagraphStyle("h", parent=ss["Heading2"], fontName="Helvetica-Bold",
                             fontSize=10, textColor=DARK, spaceBefore=10, spaceAfter=4),
        "body": ParagraphStyle("b", parent=ss["Normal"], fontSize=9,
                               textColor=DARK, spaceAfter=2),
    }

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)

    story = []
    company_name = os.environ.get("COMPANY_NAME", "Sitera")
    story.append(Paragraph(f"{company_name}", styles["title"]))
    story.append(Paragraph("PURCHASE ORDER", styles["subtitle"]))

    meta_rows = [
        [Paragraph(f"<b>PO Number:</b> {po.po_number}", styles["meta"]),
         Paragraph(f"<b>Status:</b> {po.status}", styles["meta"])],
        [Paragraph(f"<b>Order Date:</b> {po.order_date.isoformat() if po.order_date else '—'}", styles["meta"]),
         Paragraph(f"<b>Quotation Ref:</b> {quotation.quotation_number if quotation else '—'}", styles["meta"])],
    ]
    meta_tbl = Table(meta_rows, colWidths=[95 * mm, 85 * mm])
    meta_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(meta_tbl)
    story.append(Spacer(1, 8 * mm))

    # Vendor and project blocks
    vendor_text = "<b>Vendor</b><br/>"
    if vendor:
        vendor_text += f"{vendor.name or ''}<br/>"
        if vendor.contact_name:
            vendor_text += f"Contact: {vendor.contact_name}<br/>"
        if vendor.email:
            vendor_text += f"Email: {vendor.email}<br/>"
        if vendor.phone:
            vendor_text += f"Phone: {vendor.phone}<br/>"
        if vendor.address:
            vendor_text += f"{vendor.address}<br/>"
    project_text = "<b>Project</b><br/>"
    if project:
        project_text += f"{project.name}<br/>"
        if project.location:
            project_text += f"{project.location}<br/>"

    party_tbl = Table([[Paragraph(vendor_text, styles["body"]),
                        Paragraph(project_text, styles["body"])]],
                      colWidths=[95 * mm, 85 * mm])
    party_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(party_tbl)
    story.append(Spacer(1, 6 * mm))

    story.append(Paragraph("ITEMS", styles["h2"]))
    header = ["#", "Item", "Description", "Qty", "Unit Price", "Total"]
    rows = [header]
    for idx, it in enumerate(po.items, start=1):
        rows.append([
            str(idx),
            Paragraph(it.item_name or "", styles["body"]),
            Paragraph(it.description or "", styles["body"]),
            f"{_f(it.quantity):g}",
            _money(it.unit_price),
            _money(it.total_price),
        ])
    items_tbl = Table(rows, colWidths=[8 * mm, 45 * mm, 55 * mm, 15 * mm, 27 * mm, 30 * mm],
                      repeatRows=1)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("ALIGN", (3, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(items_tbl)

    # Totals block
    story.append(Spacer(1, 5 * mm))
    totals = [
        ["Subtotal", _money(po.subtotal)],
        ["Discount", "- " + _money(po.discount)],
        ["Tax", "+ " + _money(po.tax)],
        ["Grand Total", _money(po.grand_total)],
    ]
    totals_tbl = Table(totals, colWidths=[40 * mm, 40 * mm], hAlign="RIGHT")
    totals_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEABOVE", (0, 3), (-1, 3), 0.8, DARK),
        ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 3), (-1, 3), ACCENT),
        ("FONTSIZE", (0, 3), (-1, 3), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(totals_tbl)

    if po.notes:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph("NOTES & TERMS", styles["h2"]))
        story.append(Paragraph(po.notes.replace("\n", "<br/>"), styles["body"]))

    story.append(Spacer(1, 10 * mm))
    story.append(Paragraph(
        "This purchase order is issued electronically by the buyer and does not require a physical signature. "
        "Please acknowledge receipt.",
        ParagraphStyle("f", parent=ss["Normal"], fontSize=8,
                       textColor=colors.HexColor("#94a3b8"), alignment=1),
    ))

    doc.build(story)
    buf.seek(0)
    return buf.read()


@router.get("/quotation-purchase-orders/{po_id}/pdf")
def get_purchase_order_pdf(po_id: int, download: bool = Query(False),
                           db: Session = Depends(get_db),
                           user: User = Depends(READ)):
    po = _get_po(db, po_id, user)
    pdf_bytes = _build_pdf_bytes(db, po)
    disposition = "attachment" if download else "inline"
    filename = f"{po.po_number}.pdf"
    return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf",
                             headers={"Content-Disposition": f'{disposition}; filename="{filename}"'})


# ---------------------------------------------------------------------------
# Send via email / whatsapp
# ---------------------------------------------------------------------------

@router.post("/quotation-purchase-orders/{po_id}/send-email")
def send_purchase_order_email(po_id: int, db: Session = Depends(get_db),
                              user: User = Depends(WRITE)):
    po = _get_po(db, po_id, user)
    if po.status == "CANCELLED":
        raise HTTPException(status_code=422, detail="Cannot send a cancelled purchase order")

    vendor = db.get(Vendor, po.vendor_id)
    project = db.get(Project, po.project_id)
    if not vendor or not (vendor.email or "").strip():
        raise HTTPException(status_code=422,
                            detail="Vendor has no email on file — add one in the Vendor record first")

    pdf_bytes = _build_pdf_bytes(db, po)
    subject = f"Purchase Order {po.po_number} — {project.name if project else 'Project'}"
    html = f"""
    <p>Hello {vendor.name or 'Partner'},</p>
    <p>Please find attached Purchase Order <b>{po.po_number}</b> issued against Quotation
       <b>{db.get(Quotation, po.quotation_id).quotation_number if po.quotation_id else ''}</b>.</p>
    <p>Grand Total: <b>{_money(po.grand_total)}</b></p>
    <p>Kindly acknowledge receipt.</p>
    <p>Regards,<br/>{os.environ.get('COMPANY_NAME', 'Sitera')}</p>
    """
    result = send_html(vendor.email.strip(), subject, html, attachments=[{
        "filename": f"{po.po_number}.pdf",
        "content": pdf_bytes,
        "mime": "application/pdf",
    }])
    if not result.get("ok"):
        raise HTTPException(status_code=502,
                            detail=f"Email delivery failed: {result.get('reason', 'unknown')}")

    if po.status == "DRAFT" or po.status == "ISSUED":
        po.status = "SENT"
    po.sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return {"ok": True, "sent_to": vendor.email.strip(), "po": _po_out(db, po)}


class WhatsappOut(BaseModel):
    wa_link: str
    sent_to: str


@router.post("/quotation-purchase-orders/{po_id}/send-whatsapp")
def send_purchase_order_whatsapp(po_id: int, db: Session = Depends(get_db),
                                 user: User = Depends(WRITE)):
    po = _get_po(db, po_id, user)
    if po.status == "CANCELLED":
        raise HTTPException(status_code=422, detail="Cannot send a cancelled purchase order")
    vendor = db.get(Vendor, po.vendor_id)
    if not vendor or not (vendor.phone or "").strip():
        raise HTTPException(status_code=422,
                            detail="Vendor has no phone number on file — add one in the Vendor record first")

    quotation = db.get(Quotation, po.quotation_id)
    project = db.get(Project, po.project_id)
    # Include a hosted PDF link so the vendor can download it.
    base_url = (os.environ.get("PUBLIC_BASE_URL") or "").rstrip("/")
    pdf_link = f"{base_url}/api/quotation-purchase-orders/{po.id}/pdf?download=1" if base_url else ""
    body_text = (
        f"Hello {vendor.name or 'Partner'}, "
        f"Purchase Order {po.po_number} for project '{project.name if project else ''}' "
        f"(against Quotation {quotation.quotation_number if quotation else ''}) — "
        f"Grand Total {_money(po.grand_total)}. "
        + (f"PDF: {pdf_link}" if pdf_link else "PDF will be sent separately.")
    )
    digits = "".join(ch for ch in (vendor.phone or "") if ch.isdigit())
    wa_link = f"https://wa.me/{digits}?text={urllib.parse.quote(body_text)}"

    if po.status == "DRAFT" or po.status == "ISSUED":
        po.status = "SENT"
    po.sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(po)
    return {"ok": True, "wa_link": wa_link, "sent_to": vendor.phone.strip(),
            "po": _po_out(db, po)}
