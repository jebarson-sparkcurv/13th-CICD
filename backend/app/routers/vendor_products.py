from datetime import date, datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.database import get_db
from app.models import Project, User
from app.models.finance import ExpenseEntry
from app.models.procurement import Vendor, VendorProduct, VendorQuotation, VendorQuotationItem

router = APIRouter(tags=["vendor-products"])
PROC = require_roles("Admin", "ProcurementOfficer")
STAFF = require_roles("Admin", "SiteEngineer", "Accountant", "ProcurementOfficer")
CREATE_Q = require_roles("Admin", "ProcurementOfficer", "SiteEngineer")
ADMIN = require_roles("Admin")
PAY = require_roles("Admin", "Accountant")


def f(x):
    return float(x) if x is not None else 0.0


def d(x):
    return x.isoformat() if x else None


def product_out(p: VendorProduct) -> dict:
    return {"id": p.id, "vendor_id": p.vendor_id, "name": p.name, "description": p.description,
            "unit": p.unit, "unit_price": f(p.unit_price), "is_active": p.is_active,
            "created_at": d(p.created_at)}


def quotation_out(q: VendorQuotation, vendor_name: str = None) -> dict:
    return {"id": q.id, "project_id": q.project_id, "vendor_id": q.vendor_id,
            "vendor_name": vendor_name, "quote_number": q.quote_number, "status": q.status,
            "notes": q.notes, "total_amount": f(q.total_amount),
            "created_at": d(q.created_at), "approved_at": d(q.approved_at), "paid_at": d(q.paid_at),
            "items": [{"id": i.id, "product_id": i.product_id, "product_name": i.product_name,
                       "unit": i.unit, "quantity": f(i.quantity), "unit_price": f(i.unit_price),
                       "line_total": f(i.line_total)} for i in q.items]}


class ProductCreate(BaseModel):
    name: str = Field(min_length=1)
    description: Optional[str] = None
    unit: str = "unit"
    unit_price: float = Field(ge=0)


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    unit_price: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class QuotationItemIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)


class QuotationCreate(BaseModel):
    vendor_id: int
    notes: Optional[str] = None
    items: List[QuotationItemIn]


@router.post("/vendors/{vendor_id}/products", status_code=201)
def add_product(vendor_id: int, body: ProductCreate, db: Session = Depends(get_db),
                user: User = Depends(PROC)):
    if not db.get(Vendor, vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")
    p = VendorProduct(vendor_id=vendor_id, name=body.name.strip(), description=body.description,
                      unit=body.unit or "unit", unit_price=body.unit_price)
    db.add(p)
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.get("/vendors/{vendor_id}/products")
def list_products(vendor_id: int, include_inactive: bool = False,
                  db: Session = Depends(get_db), user: User = Depends(STAFF)):
    if not db.get(Vendor, vendor_id):
        raise HTTPException(status_code=404, detail="Vendor not found")
    q = db.query(VendorProduct).filter(VendorProduct.vendor_id == vendor_id)
    if not include_inactive:
        q = q.filter(VendorProduct.is_active == True)  # noqa: E712
    return [product_out(p) for p in q.order_by(VendorProduct.name).all()]


@router.patch("/vendor-products/{product_id}")
def update_product(product_id: int, body: ProductUpdate, db: Session = Depends(get_db),
                   user: User = Depends(PROC)):
    p = db.get(VendorProduct, product_id)
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    if body.name is not None:
        p.name = body.name.strip()
    if body.description is not None:
        p.description = body.description
    if body.unit is not None:
        p.unit = body.unit
    if body.unit_price is not None:
        p.unit_price = body.unit_price
    if body.is_active is not None:
        p.is_active = body.is_active
    db.commit()
    db.refresh(p)
    return product_out(p)


@router.get("/projects/{project_id}/vendor-quotations")
def list_quotations(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    if not db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    vendors = {v.id: v.name for v in db.query(Vendor).all()}
    qs = (db.query(VendorQuotation).filter(VendorQuotation.project_id == project_id)
          .order_by(VendorQuotation.created_at.desc()).all())
    return [quotation_out(q, vendors.get(q.vendor_id)) for q in qs]


@router.post("/projects/{project_id}/vendor-quotations", status_code=201)
def create_quotation(project_id: int, body: QuotationCreate, db: Session = Depends(get_db),
                     user: User = Depends(CREATE_Q)):
    if not db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    vendor = db.get(Vendor, body.vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if not body.items:
        raise HTTPException(status_code=422, detail="Select at least one product for the quotation")
    products = {p.id: p for p in db.query(VendorProduct)
                .filter(VendorProduct.vendor_id == vendor.id,
                        VendorProduct.is_active == True).all()}  # noqa: E712
    seq = db.query(VendorQuotation).filter(VendorQuotation.project_id == project_id).count() + 1
    quotation = VendorQuotation(project_id=project_id, vendor_id=vendor.id,
                                quote_number=f"VQ-{project_id}-{seq:03d}",
                                notes=body.notes, created_by=user.id)
    total = 0.0
    for it in body.items:
        p = products.get(it.product_id)
        if not p:
            raise HTTPException(status_code=422,
                                detail=f"Product {it.product_id} is not an active product of {vendor.name}")
        line = round(it.quantity * f(p.unit_price), 2)
        total += line
        quotation.items.append(VendorQuotationItem(
            product_id=p.id, product_name=p.name, unit=p.unit,
            quantity=it.quantity, unit_price=p.unit_price, line_total=line))
    quotation.total_amount = round(total, 2)
    db.add(quotation)
    db.commit()
    db.refresh(quotation)
    return quotation_out(quotation, vendor.name)


@router.post("/vendor-quotations/{quotation_id}/approve")
def approve_quotation(quotation_id: int, db: Session = Depends(get_db), user: User = Depends(ADMIN)):
    q = db.get(VendorQuotation, quotation_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status != "Draft":
        raise HTTPException(status_code=422, detail=f"Only Draft quotations can be approved (current: {q.status})")
    q.status = "Approved"
    q.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(q)
    return quotation_out(q, db.get(Vendor, q.vendor_id).name)


@router.post("/vendor-quotations/{quotation_id}/pay")
def pay_quotation(quotation_id: int, db: Session = Depends(get_db), user: User = Depends(PAY)):
    q = db.get(VendorQuotation, quotation_id)
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status != "Approved":
        raise HTTPException(status_code=422, detail=f"Only Approved quotations can be paid (current: {q.status})")
    vendor = db.get(Vendor, q.vendor_id)
    exp = ExpenseEntry(project_id=q.project_id, category="Vendor Payment",
                       amount=q.total_amount, expense_date=date.today(),
                       description=f"{q.quote_number} — {vendor.name}", recorded_by=user.id)
    db.add(exp)
    db.flush()
    q.status = "Paid"
    q.paid_at = datetime.now(timezone.utc)
    q.expense_entry_id = exp.id
    db.commit()
    db.refresh(q)
    return quotation_out(q, vendor.name)
