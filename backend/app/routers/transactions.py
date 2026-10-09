from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import require_roles
from app.core.tenant_scope import assert_same_tenant, ensure_tenant_owned, tenant_scope
from app.database import get_db
from app.models import Phase, Project, User
from app.models.finance import Employee, ExpenseEntry, IncomeEntry, Invoice
from app.models.procurement import Vendor, VendorProduct, VendorQuotation, VendorQuotationItem

router = APIRouter(tags=["transactions"])
FIN = require_roles("Admin", "Accountant")
STAFF = require_roles("Admin", "Accountant", "SiteEngineer", "ProcurementOfficer")

PAYMENT_TYPES = ["Advance Payment", "Partial Payment", "Full Payment"]
SOURCES = ["Vendor", "Employee", "Other"]
CLOSED_STATUSES = ("Completed", "Cancelled")


def f(x):
    return float(x) if x is not None else 0.0


def get_active_project(db, project_id, user=None):
    p = db.get(Project, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    if user is not None:
        assert_same_tenant(p, user, "project")
    if p.is_archived or p.status in CLOSED_STATUSES:
        raise HTTPException(status_code=422, detail=f"Project is {'archived' if p.is_archived else p.status.lower()} — transactions not allowed")
    return p


def ensure_invoice_for_income(db, project, income, user):
    """Auto-generate an invoice document for a recorded client payment.

    - **Linkage, not duplication**: the invoice references the IncomeEntry via
      ``income_entry_id``; it does NOT create a Payment row, so the ledger's
      Total Credit is not double-counted (IncomeEntry alone contributes the
      credit).
    - **Idempotent**: a partial unique index on ``invoices.income_entry_id``
      guarantees at most one invoice per IncomeEntry; re-invoking this helper
      is a no-op.
    """
    if income is None or getattr(income, "id", None) is None:
        return None
    existing = db.query(Invoice).filter(Invoice.income_entry_id == income.id).first()
    if existing:
        return existing
    year_suffix = (income.income_date or date.today()).strftime("%y")
    seq = db.query(Invoice).filter(Invoice.project_id == project.id).count() + 1
    inv_number = f"INV-{year_suffix}-{seq:03d}"
    desc_bits = [f"Client payment — {income.payment_type}"]
    if income.phase:
        desc_bits.append(income.phase)
    inv = Invoice(project_id=project.id, client_id=project.client_id,
                  invoice_number=inv_number, amount=income.amount, tax_amount=0,
                  issue_date=income.income_date, due_date=income.income_date,
                  status="Paid", description=" · ".join(desc_bits),
                  income_entry_id=income.id, tenant_id=project.tenant_id,
                  created_by=(user.id if user else None))
    db.add(inv)
    try:
        db.commit()
    except Exception:
        db.rollback()
        return db.query(Invoice).filter(Invoice.income_entry_id == income.id).first()
    db.refresh(inv)
    return inv


def budget_remaining(db, project):
    from app.routers.finance import balance_row
    row = balance_row(db, project)
    return round(row["budget"] - row["debit"], 2)


@router.get("/finance/transaction-context")
def transaction_context(db: Session = Depends(get_db), user: User = Depends(STAFF)):
    projects = (tenant_scope(db.query(Project), Project, user)
                .filter(Project.is_archived == False,  # noqa: E712
                        Project.status.notin_(CLOSED_STATUSES))
                .order_by(Project.name).all())
    out = []
    for p in projects:
        phases = db.query(Phase).filter(Phase.project_id == p.id).order_by(Phase.sequence_order).all()
        out.append({"id": p.id, "name": p.name, "status": p.status, "budget": f(p.budget or 0),
                    "budget_remaining": budget_remaining(db, p),
                    "phases": [{"id": ph.id, "name": ph.name} for ph in phases]})
    return {"projects": out, "payment_types": PAYMENT_TYPES, "sources": SOURCES}


class IncomeCreate(BaseModel):
    project_id: int
    phase: Optional[str] = None
    amount: float = Field(gt=0)
    payment_type: str
    balance: Optional[float] = None


def income_out(i, users=None):
    return {"id": i.id, "project_id": i.project_id, "phase": i.phase, "amount": f(i.amount),
            "payment_type": i.payment_type, "balance": f(i.balance),
            "balance_auto": f(i.balance_auto), "override": i.override_at is not None,
            "override_old": f(i.override_old) if i.override_old is not None else None,
            "override_by": (users or {}).get(i.override_by),
            "override_at": i.override_at.isoformat() if i.override_at else None,
            "income_date": i.income_date.isoformat() if i.income_date else None,
            "created_by": (users or {}).get(i.created_by)}


@router.post("/transactions/income", status_code=201)
def add_income(body: IncomeCreate, db: Session = Depends(get_db), user: User = Depends(FIN)):
    if body.payment_type not in PAYMENT_TYPES:
        raise HTTPException(status_code=422, detail=f"payment_type must be one of {PAYMENT_TYPES}")
    project = get_active_project(db, body.project_id, user=user)
    auto = round(f(project.budget or 0) - body.amount, 2)
    inc = IncomeEntry(project_id=project.id, phase=(body.phase or "").strip() or None,
                      amount=body.amount, payment_type=body.payment_type,
                      balance=auto, balance_auto=auto,
                      income_date=date.today(), created_by=user.id)
    ensure_tenant_owned(inc, user)
    if body.balance is not None and round(body.balance, 2) != auto:
        inc.balance = round(body.balance, 2)
        inc.override_old = auto
        inc.override_by = user.id
        inc.override_at = datetime.now(timezone.utc)
    db.add(inc)
    db.commit()
    db.refresh(inc)
    ensure_invoice_for_income(db, project, inc, user)
    users = {user.id: user.name}
    return {**income_out(inc, users), "project_budget_remaining": budget_remaining(db, project)}


@router.get("/projects/{project_id}/income")
def list_income(project_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    p = db.get(Project, project_id)
    assert_same_tenant(p, user, "project")
    users = {u.id: u.name for u in db.query(User).all()}
    rows = (db.query(IncomeEntry).filter(IncomeEntry.project_id == project_id)
            .order_by(IncomeEntry.created_at.desc()).all())
    return [income_out(i, users) for i in rows]


@router.get("/transactions/vendors")
def txn_vendors(db: Session = Depends(get_db), user: User = Depends(STAFF)):
    return [{"id": v.id, "name": v.name} for v in
            tenant_scope(db.query(Vendor), Vendor, user).filter(Vendor.status == "Active").order_by(Vendor.name).all()]


class NewVendorIn(BaseModel):
    name: str = Field(min_length=1)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    vendor_type: Optional[str] = "Supplier"
    trade: Optional[str] = None


class NewProductIn(BaseModel):
    name: str = Field(min_length=1)
    unit_price: float = Field(ge=0)
    unit: Optional[str] = "unit"


class NewEmployeeIn(BaseModel):
    name: str = Field(min_length=1)
    role_title: Optional[str] = None
    phone: Optional[str] = None
    daily_wage: Optional[float] = None
    wage_type: Optional[str] = "daily"


@router.post("/transactions/inline/vendor", status_code=201)
def inline_vendor(body: NewVendorIn, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    v = Vendor(name=body.name.strip(), contact_name=body.contact_name, phone=body.phone,
               vendor_type=body.vendor_type or "Supplier", trade=body.trade)
    ensure_tenant_owned(v, user)
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "name": v.name}


@router.post("/transactions/inline/vendor/{vendor_id}/product", status_code=201)
def inline_product(vendor_id: int, body: NewProductIn, db: Session = Depends(get_db),
                   user: User = Depends(STAFF)):
    v = db.get(Vendor, vendor_id)
    assert_same_tenant(v, user, "vendor")
    p = VendorProduct(vendor_id=vendor_id, name=body.name.strip(),
                      unit=body.unit or "unit", unit_price=body.unit_price)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name, "unit": p.unit, "unit_price": f(p.unit_price)}


@router.post("/transactions/inline/employee", status_code=201)
def inline_employee(body: NewEmployeeIn, project_id: Optional[int] = None, phase_id: Optional[int] = None,
                    db: Session = Depends(get_db), user: User = Depends(STAFF)):
    e = Employee(name=body.name.strip(), role_title=body.role_title, phone=body.phone,
                 daily_wage=body.daily_wage, wage_type=body.wage_type or "daily",
                 project_id=project_id, joining_date=date.today(),
                 created_by=user.id)
    ensure_tenant_owned(e, user)
    db.add(e)
    db.flush()
    if phase_id:
        from app.models.finance import PhaseEmployee
        ph = db.get(Phase, phase_id)
        if ph:
            db.add(PhaseEmployee(phase_id=phase_id, employee_id=e.id, assigned_by=user.id))
    db.commit()
    db.refresh(e)
    return {"id": e.id, "name": e.name, "role_title": e.role_title}


class ExpenseTxnCreate(BaseModel):
    project_id: int
    phase_id: int
    source_type: str
    vendor_id: Optional[int] = None
    product_id: Optional[int] = None
    quantity: float = Field(default=1, gt=0)
    employee_id: Optional[int] = None
    description: Optional[str] = None
    amount: float = Field(gt=0)
    payment_type: str


@router.post("/transactions/expense", status_code=201)
def add_expense_txn(body: ExpenseTxnCreate, db: Session = Depends(get_db),
                    user: User = Depends(STAFF)):
    if body.payment_type not in PAYMENT_TYPES:
        raise HTTPException(status_code=422, detail=f"payment_type must be one of {PAYMENT_TYPES}")
    if body.source_type not in SOURCES:
        raise HTTPException(status_code=422, detail=f"source_type must be one of {SOURCES}")
    project = get_active_project(db, body.project_id, user=user)
    phase = db.query(Phase).filter(Phase.id == body.phase_id, Phase.project_id == project.id).first()
    if not phase:
        raise HTTPException(status_code=422, detail="Phase is required and must belong to the selected project")

    vendor = product = employee = None
    if body.source_type == "Vendor":
        vendor = db.get(Vendor, body.vendor_id) if body.vendor_id else None
        if not vendor:
            raise HTTPException(status_code=422, detail="Vendor is required")
        assert_same_tenant(vendor, user, "vendor")
        product = db.get(VendorProduct, body.product_id) if body.product_id else None
        if not product or product.vendor_id != vendor.id:
            raise HTTPException(status_code=422, detail="Product is required and must belong to the selected vendor")
    elif body.source_type == "Employee":
        employee = db.get(Employee, body.employee_id) if body.employee_id else None
        if not employee:
            raise HTTPException(status_code=422, detail="Employee is required")
        assert_same_tenant(employee, user, "employee")
    else:
        if not (body.description or "").strip():
            raise HTTPException(status_code=422, detail="Description is required for 'Other' expenses")

    remaining_before = budget_remaining(db, project)
    balance_after = round(remaining_before - body.amount, 2)

    category = {"Vendor": "Vendor Payment", "Employee": "Employee Payment", "Other": "Other Expense"}[body.source_type]
    if body.source_type == "Vendor":
        desc = f"{vendor.name} — {product.name} x{body.quantity:g} ({body.payment_type})"
    elif body.source_type == "Employee":
        desc = f"{employee.name}{' — ' + employee.role_title if employee.role_title else ''} ({body.payment_type})"
    else:
        desc = body.description.strip()

    exp = ExpenseEntry(project_id=project.id, category=category, amount=body.amount,
                       expense_date=date.today(), description=desc, recorded_by=user.id,
                       phase_id=phase.id, source_type=body.source_type,
                       source_id=vendor.id if vendor else (employee.id if employee else None),
                       product_id=product.id if product else None,
                       payment_type=body.payment_type, balance_after=balance_after)
    ensure_tenant_owned(exp, user)
    db.add(exp)
    db.flush()

    quotation = None
    if body.source_type == "Vendor":
        seq = db.query(VendorQuotation).filter(VendorQuotation.project_id == project.id).count() + 1
        quotation = VendorQuotation(project_id=project.id, vendor_id=vendor.id,
                                    quote_number=f"VQ-{project.id}-{seq:03d}", status="Generated",
                                    notes=f"Auto-generated from Add Expense ({phase.name})",
                                    total_amount=body.amount, created_by=user.id,
                                    expense_entry_id=exp.id)
        ensure_tenant_owned(quotation, user)
        quotation.items.append(VendorQuotationItem(
            product_id=product.id, product_name=product.name, unit=product.unit,
            quantity=body.quantity, unit_price=product.unit_price, line_total=body.amount))
        db.add(quotation)
        db.flush()
        exp.quotation_id = quotation.id

    db.commit()
    db.refresh(exp)
    return {"id": exp.id, "project_id": exp.project_id, "phase_id": exp.phase_id,
            "phase_name": phase.name, "source_type": exp.source_type,
            "source_id": exp.source_id, "product_id": exp.product_id,
            "description": exp.description, "category": exp.category,
            "amount": f(exp.amount), "payment_type": exp.payment_type,
            "balance_after": f(exp.balance_after),
            "quotation": {"id": quotation.id, "quote_number": quotation.quote_number,
                          "status": quotation.status} if quotation else None,
            "project_budget_remaining": budget_remaining(db, project)}


@router.get("/employees/{employee_id}/payments")
def employee_payments(employee_id: int, db: Session = Depends(get_db), user: User = Depends(STAFF)):
    e = db.get(Employee, employee_id)
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    rows = (db.query(ExpenseEntry)
            .filter(ExpenseEntry.source_type == "Employee", ExpenseEntry.source_id == employee_id)
            .order_by(ExpenseEntry.created_at.desc()).all())
    projects = {p.id: p.name for p in db.query(Project).all()}
    return {"employee_id": e.id, "name": e.name,
            "total_paid": round(sum(f(r.amount) for r in rows), 2),
            "payments": [{"id": r.id, "project": projects.get(r.project_id),
                          "amount": f(r.amount), "payment_type": r.payment_type,
                          "date": r.expense_date.isoformat() if r.expense_date else None,
                          "description": r.description} for r in rows]}
