from datetime import date, timedelta, datetime, timezone

from sqlalchemy.orm import Session

from app.models import User
from app.core.security import hash_password
from app.models.finance import Invoice, Payment, ExpenseEntry, BidLineItem, BidLineItemQuote
from app.models.procurement import Vendor, Bid


def seed_finance(db: Session):
    if db.query(Invoice).count() > 0:
        return
    today = date.today()
    admin = db.query(User).filter(User.role == "Admin").first()

    if not db.query(User).filter_by(email="asha@buildcore.com").first():
        db.add(User(email="asha@buildcore.com", password_hash=hash_password("accountant123"),
                    name="Asha Nair", role="Accountant", status="Active", base_salary=90000))
    apex = db.query(Vendor).filter_by(name="Apex Steel Works").first()
    if apex and not db.query(User).filter_by(email="vikram@apexsteel.com").first():
        db.add(User(email="vikram@apexsteel.com", password_hash=hash_password("vendor123"),
                    name="Vikram Rao", role="Vendor", status="Active", linked_vendor_id=apex.id))
    for email, sal in [("kesari4416@gmail.com", 150000), ("raj@buildcore.com", 80000),
                       ("neha@buildcore.com", 80000)]:
        u = db.query(User).filter_by(email=email).first()
        if u and not u.base_salary:
            u.base_salary = sal
    db.flush()

    inv1 = Invoice(project_id=1, client_id=1, invoice_number="INV-1-001", amount=50000000,
                   tax_amount=9000000, issue_date=today - timedelta(days=45),
                   due_date=today - timedelta(days=15), status="Sent",
                   description="Mobilization + foundation milestone", created_by=admin.id)
    inv2 = Invoice(project_id=1, client_id=1, invoice_number="INV-1-002", amount=30000000,
                   tax_amount=5400000, issue_date=today - timedelta(days=10),
                   due_date=today + timedelta(days=20), status="Sent",
                   description="Structure progress — floors 1-8", created_by=admin.id)
    db.add_all([inv1, inv2]); db.flush()
    db.add_all([
        Payment(invoice_id=inv1.id, project_id=1, client_id=1, amount=40000000,
                payment_date=today - timedelta(days=20), payment_method="BankTransfer",
                reference_no="NEFT-88421", received_by=admin.id),
        ExpenseEntry(project_id=1, category="Site Utilities", amount=450000,
                     expense_date=today - timedelta(days=8),
                     description="Generator diesel + temporary power", recorded_by=admin.id),
        ExpenseEntry(project_id=1, category="Fuel", amount=180000,
                     expense_date=today - timedelta(days=3),
                     description="Crane and hoist fuel", recorded_by=admin.id),
    ])

    bp_bid = db.query(Bid).filter_by(bid_package_id=1).first()
    if db.query(BidLineItem).count() == 0:
        li1 = BidLineItem(bid_package_id=1, item_description="Unitized curtain wall panels",
                          unit="m²", quantity_required=4200, cost_code="08-4000")
        li2 = BidLineItem(bid_package_id=1, item_description="Structural glazing sealant works",
                          unit="m", quantity_required=9000, cost_code="08-4000")
        db.add_all([li1, li2]); db.flush()
        if bp_bid:
            db.add_all([
                BidLineItemQuote(bid_id=bp_bid.id, bid_line_item_id=li1.id, quantity_offered=4200,
                                 unit_price=5500, line_total=23100000, lead_time_days=56),
                BidLineItemQuote(bid_id=bp_bid.id, bid_line_item_id=li2.id, quantity_offered=9000,
                                 unit_price=380, line_total=3420000, lead_time_days=56),
            ])
            bp_bid.amount = 26520000
    db.commit()


def seed_employees(db: Session):
    from app.models.finance import Employee, Attendance
    if db.query(Employee).count() > 0:
        return
    admin = db.query(User).filter(User.role == "Admin").first()
    today = date.today()
    workers = [
        (1, "Ramesh Kumar", "Mason", 900), (1, "Suresh Yadav", "Electrician", 1100),
        (1, "Deepak Singh", "Helper", 600), (1, "Manoj Pal", "Carpenter", 950),
        (2, "Ganesh Rao", "Mason", 850), (2, "Iqbal Khan", "Plumber", 1000),
    ]
    emps = []
    for pid, name, role, wage in workers:
        e = Employee(project_id=pid, name=name, role_title=role, daily_wage=wage,
                     wage_type="daily", joining_date=today - timedelta(days=90),
                     status="active", created_by=admin.id if admin else None)
        db.add(e)
        emps.append(e)
    db.flush()
    statuses = ["present", "present", "half_day", "present", "absent", "present"]
    for e in emps:
        if e.project_id != 1:
            continue
        for i in range(1, 4):
            db.add(Attendance(employee_id=e.id, project_id=e.project_id,
                              attendance_date=today - timedelta(days=i),
                              status=statuses[(e.id + i) % len(statuses)],
                              marked_by=admin.id if admin else None))
    db.commit()


def seed_categories(db: Session):
    from app.models.finance import Employee, EmployeeCategory
    defaults = ["Mason", "Electrician", "Helper", "Plumber", "Carpenter", "Supervisor"]
    admin = db.query(User).filter(User.role == "Admin").first()
    for name in defaults:
        if not db.query(EmployeeCategory).filter(EmployeeCategory.name.ilike(name)).first():
            db.add(EmployeeCategory(name=name, default_wage_type="daily",
                                    created_by=admin.id if admin else None))
    db.commit()
    cats = {c.name.lower(): c.id for c in db.query(EmployeeCategory).all()}
    for e in db.query(Employee).filter(Employee.category_id.is_(None)).all():
        if e.role_title and e.role_title.lower() in cats:
            e.category_id = cats[e.role_title.lower()]
    db.commit()


def seed_milestones(db: Session):
    from app.models import Milestone, Phase
    if db.query(Milestone).count() > 0:
        return
    today = date.today()
    phases = db.query(Phase).order_by(Phase.project_id, Phase.sequence_order).all()
    for ph in phases:
        specs = []
        if ph.status == "Completed":
            specs = [(f"{ph.name} sign-off", "Completed", -20), (f"{ph.name} QA inspection", "Completed", -10)]
        elif ph.status in ("InProgress", "Blocked", "Delayed"):
            specs = [(f"{ph.name} 50% checkpoint", "Completed", -7),
                     (f"{ph.name} material clearance", "Pending", -3),
                     (f"{ph.name} completion review", "Pending", 21)]
        else:
            specs = [(f"{ph.name} kickoff", "Pending", 35)]
        for i, (title, status, offset) in enumerate(specs, 1):
            db.add(Milestone(phase_id=ph.id, title=title, status=status,
                             due_date=today + timedelta(days=offset),
                             completed_at=datetime.now(timezone.utc) if status == "Completed" else None,
                             sequence_order=i))
    db.commit()


def seed_expense_categories(db: Session):
    from app.models.finance import ExpenseCategory, ExpenseEntry
    admin = db.query(User).filter(User.role == "Admin").first()
    defaults = ["Material", "Labour", "Equipment", "Transport", "Site Overheads", "Misc"]
    existing_expense_cats = {c for (c,) in db.query(ExpenseEntry.category).distinct().all() if c}
    for name in sorted(defaults + [c for c in existing_expense_cats if c.lower() not in
                                   {d.lower() for d in defaults}]):
        if not db.query(ExpenseCategory).filter(ExpenseCategory.name.ilike(name)).first():
            db.add(ExpenseCategory(name=name, created_by=admin.id if admin else None))
    db.commit()


def seed_project_ledgers(db: Session):
    from app.models import Project
    from app.models.finance import Payment, ExpenseEntry
    today = date.today()
    for p in db.query(Project).filter(Project.is_archived == False).all():  # noqa: E712
        if not p.client_id:
            continue
        if db.query(Payment).filter(Payment.project_id == p.id).count() > 0:
            continue
        budget = float(p.budget or 10000000)
        db.add(Payment(project_id=p.id, client_id=p.client_id, amount=round(budget * 0.15, 2),
                       payment_date=today - timedelta(days=120), payment_method="BankTransfer",
                       reference_no="Mobilisation advance"))
        db.add(Payment(project_id=p.id, client_id=p.client_id, amount=round(budget * 0.10, 2),
                       payment_date=today - timedelta(days=45), payment_method="Cheque",
                       reference_no="RA Bill 1"))
        db.add(ExpenseEntry(project_id=p.id, category="Material", amount=round(budget * 0.08, 2),
                            expense_date=today - timedelta(days=90), description="Cement & steel procurement"))
        db.add(ExpenseEntry(project_id=p.id, category="Equipment", amount=round(budget * 0.03, 2),
                            expense_date=today - timedelta(days=30), description="Crane rental"))
    db.commit()
