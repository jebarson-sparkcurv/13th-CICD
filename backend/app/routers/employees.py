from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Project, Phase
from app.models.finance import Employee, Attendance, EmployeeCategory, ProjectAssignment, PhaseEmployee, ExpenseEntry
from app.core.security import require_roles
from app.core.tenant_scope import assert_same_tenant, ensure_tenant_owned, tenant_scope

router = APIRouter(tags=["employees"])
INTERNAL = require_roles("Admin", "SiteEngineer", "Accountant", "ProcurementOfficer")
READ_FIELD = require_roles("Admin", "SiteEngineer", "Accountant", "ProcurementOfficer", "Client")
WAGE_ADMIN = require_roles("Admin", "Accountant")

ATT_STATUSES = ("present", "absent", "half_day", "leave")
DAY_VALUE = {"present": 1.0, "half_day": 0.5}
WAGE_TYPES = Literal["daily", "monthly", "piece_rate"]


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1)
    project_id: Optional[int] = None
    role_title: Optional[str] = None
    category_id: Optional[int] = None
    phone: Optional[str] = None
    id_proof_type: Optional[str] = None
    id_proof_number: Optional[str] = None
    daily_wage: Optional[Decimal] = None
    wage_type: Optional[WAGE_TYPES] = None
    joining_date: Optional[date] = None


class EmployeePatch(BaseModel):
    name: Optional[str] = None
    role_title: Optional[str] = None
    category_id: Optional[int] = None
    phone: Optional[str] = None
    id_proof_type: Optional[str] = None
    id_proof_number: Optional[str] = None
    daily_wage: Optional[Decimal] = None
    wage_type: Optional[WAGE_TYPES] = None
    joining_date: Optional[date] = None
    status: Optional[Literal["active", "inactive"]] = None


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1)
    default_wage_type: Optional[WAGE_TYPES] = None


class CategoryPatch(BaseModel):
    name: Optional[str] = None
    default_wage_type: Optional[WAGE_TYPES] = None
    is_active: Optional[bool] = None


class AttendanceMark(BaseModel):
    employee_id: int
    attendance_date: Optional[date] = None
    status: Literal["present", "absent", "half_day", "leave"]
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    notes: Optional[str] = None


class AttendancePatch(BaseModel):
    status: Optional[Literal["present", "absent", "half_day", "leave"]] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    notes: Optional[str] = None


def d(v):
    return v.isoformat() if v else None


def category_out(c: EmployeeCategory) -> dict:
    return {"id": c.id, "name": c.name, "default_wage_type": c.default_wage_type,
            "is_active": c.is_active, "created_at": d(c.created_at)}


def employee_out(e: Employee) -> dict:
    return {"id": e.id, "project_id": e.project_id, "name": e.name,
            "category_id": e.category_id,
            "role_title": e.category.name if e.category else e.role_title,
            "phone": e.phone, "id_proof_type": e.id_proof_type, "id_proof_number": e.id_proof_number,
            "daily_wage": float(e.daily_wage) if e.daily_wage is not None else None,
            "wage_type": e.wage_type, "joining_date": d(e.joining_date), "status": e.status,
            "created_at": d(e.created_at)}


def attendance_out(a: Attendance, employee_name: str = None) -> dict:
    return {"id": a.id, "employee_id": a.employee_id, "project_id": a.project_id,
            "employee_name": employee_name,
            "attendance_date": d(a.attendance_date), "status": a.status,
            "check_in_time": a.check_in_time, "check_out_time": a.check_out_time,
            "marked_by": a.marked_by, "marked_at": d(a.marked_at), "notes": a.notes}


def mask_for_client(out: dict, user: User) -> dict:
    if user.role == "Client":
        for k in ("daily_wage", "wage_type", "phone", "id_proof_type", "id_proof_number"):
            out[k] = None
    return out


def get_project_or_404(db: Session, project_id: int) -> Project:
    p = db.get(Project, project_id)
    if not p or p.is_archived:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


def check_field_access(db: Session, user: User, project):
    if user.role == "Client":
        if project is None or project.client_id != user.client_id:
            raise HTTPException(status_code=403, detail="Not authorized for this project")
        return
    if user.role != "SiteEngineer" or project is None:
        return
    if project.site_engineer_id == user.id:
        return
    if db.query(ProjectAssignment).filter_by(user_id=user.id, project_id=project.id).first():
        return
    raise HTTPException(status_code=403, detail="Not assigned to this project")


def check_backdate_window(user: User, day: date):
    if user.role == "Admin":
        return
    today = date.today()
    if day > today:
        raise HTTPException(status_code=422, detail="Attendance cannot be marked for a future date")
    if day < today - timedelta(days=3):
        raise HTTPException(status_code=422,
                            detail="Attendance can only be marked for today or up to 3 days back")


def resolve_category(db: Session, category_id: Optional[int]) -> Optional[EmployeeCategory]:
    if category_id is None:
        return None
    c = db.get(EmployeeCategory, category_id)
    if not c:
        raise HTTPException(status_code=422, detail="Employee category not found")
    return c


# ---------- Employee Categories (org-wide) ----------
@router.post("/employee-categories", status_code=201)
def create_category(body: CategoryCreate, db: Session = Depends(get_db),
                    user: User = Depends(INTERNAL)):
    name = body.name.strip()
    existing = db.query(EmployeeCategory).filter(EmployeeCategory.name.ilike(name)).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Category '{existing.name}' already exists")
    c = EmployeeCategory(name=name, default_wage_type=body.default_wage_type, created_by=user.id)
    db.add(c); db.commit(); db.refresh(c)
    return category_out(c)


@router.get("/employee-categories")
def list_categories(db: Session = Depends(get_db), user: User = Depends(INTERNAL),
                    include_inactive: bool = False):
    q = db.query(EmployeeCategory)
    if not include_inactive:
        q = q.filter(EmployeeCategory.is_active == True)  # noqa: E712
    return [category_out(c) for c in q.order_by(EmployeeCategory.name).all()]


@router.patch("/employee-categories/{category_id}")
def patch_category(category_id: int, body: CategoryPatch, db: Session = Depends(get_db),
                   user: User = Depends(WAGE_ADMIN)):
    c = db.get(EmployeeCategory, category_id)
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return category_out(c)


@router.post("/employee-categories/{category_id}/deactivate")
def deactivate_category(category_id: int, db: Session = Depends(get_db),
                        user: User = Depends(WAGE_ADMIN)):
    c = db.get(EmployeeCategory, category_id)
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")
    c.is_active = False
    db.commit(); db.refresh(c)
    return category_out(c)


def project_employee_filter(db: Session, project_id: int):
    phase_ids = [pid for (pid,) in db.query(Phase.id).filter(Phase.project_id == project_id).all()]
    assigned = db.query(PhaseEmployee.employee_id).filter(PhaseEmployee.phase_id.in_(phase_ids))
    return or_(Employee.project_id == project_id, Employee.id.in_(assigned))


def employee_in_project(db: Session, employee: Employee, project_id: int) -> bool:
    if employee.project_id == project_id:
        return True
    return db.query(PhaseEmployee).join(Phase, PhaseEmployee.phase_id == Phase.id).filter(
        PhaseEmployee.employee_id == employee.id, Phase.project_id == project_id).first() is not None


# ---------- Org-wide employees ----------
@router.get("/employees")
def list_all_employees(db: Session = Depends(get_db), user: User = Depends(INTERNAL),
                       status: Optional[str] = None, search: Optional[str] = None):
    q = tenant_scope(db.query(Employee), Employee, user)
    if user.role == "SiteEngineer":
        from app.routers.projects import scope_by_role
        pids = [p.id for p in scope_by_role(
            db.query(Project).filter(Project.is_archived == False), db, user).all()]  # noqa: E712
        conds = [project_employee_filter(db, pid) for pid in pids]
        q = q.filter(or_(*conds)) if conds else q.filter(Employee.id == -1)
    if status:
        q = q.filter(Employee.status == status)
    if search:
        q = q.filter(Employee.name.ilike(f"%{search}%"))
    rows = q.order_by(Employee.name).all()
    proj_names = {p.id: p.name for p in db.query(Project).all()}
    assigns = {}
    for pe, ph in db.query(PhaseEmployee, Phase).join(Phase, PhaseEmployee.phase_id == Phase.id).all():
        assigns.setdefault(pe.employee_id, []).append(
            {"phase_id": ph.id, "phase_name": ph.name,
             "project_id": ph.project_id, "project_name": proj_names.get(ph.project_id)})
    out = []
    for e in rows:
        o = employee_out(e)
        phase_assigns = assigns.get(e.id, [])
        names = {a["project_name"] for a in phase_assigns if a["project_name"]}
        if e.project_id and proj_names.get(e.project_id):
            names.add(proj_names[e.project_id])
        o["assigned_projects"] = sorted(names)
        o["phase_assignments"] = phase_assigns
        out.append(o)
    return out


@router.post("/employees", status_code=201)
def create_org_employee(body: EmployeeCreate, db: Session = Depends(get_db),
                        user: User = Depends(INTERNAL)):
    cat = resolve_category(db, body.category_id)
    data = body.model_dump()
    if data.get("project_id"):
        p = db.get(Project, data["project_id"])
        if not p:
            raise HTTPException(status_code=422, detail="Project not found")
    data["wage_type"] = body.wage_type or (cat.default_wage_type if cat else None) or "daily"
    e = Employee(created_by=user.id, **data)
    ensure_tenant_owned(e, user)
    db.add(e); db.commit(); db.refresh(e)
    return employee_out(e)


# ---------- Phase crew ----------
@router.get("/phases/{phase_id}/available-employees")
def available_phase_employees(phase_id: int, db: Session = Depends(get_db),
                              user: User = Depends(INTERNAL)):
    ph = db.get(Phase, phase_id)
    if not ph:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_field_access(db, user, db.get(Project, ph.project_id))
    assigned_anywhere = db.query(PhaseEmployee.employee_id)
    rows = (db.query(Employee)
            .filter(Employee.status == "active", ~Employee.id.in_(assigned_anywhere))
            .order_by(Employee.name).all())
    return [{"id": e.id, "name": e.name,
             "role_title": e.category.name if e.category else e.role_title} for e in rows]


@router.get("/phases/{phase_id}/employees")
def list_phase_employees(phase_id: int, db: Session = Depends(get_db),
                         user: User = Depends(INTERNAL)):
    ph = db.get(Phase, phase_id)
    if not ph:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_field_access(db, user, db.get(Project, ph.project_id))
    rows = (db.query(PhaseEmployee, Employee).join(Employee, PhaseEmployee.employee_id == Employee.id)
            .filter(PhaseEmployee.phase_id == phase_id).order_by(Employee.name).all())
    return [{"assignment_id": pe.id, "employee_id": e.id, "name": e.name,
             "role_title": e.category.name if e.category else e.role_title,
             "status": e.status} for pe, e in rows]


@router.post("/phases/{phase_id}/employees", status_code=201)
def assign_phase_employee(phase_id: int, body: dict, db: Session = Depends(get_db),
                          user: User = Depends(INTERNAL)):
    ph = db.get(Phase, phase_id)
    if not ph:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_field_access(db, user, db.get(Project, ph.project_id))
    e = db.get(Employee, body.get("employee_id") or 0)
    if not e:
        raise HTTPException(status_code=422, detail="Employee not found")
    existing = (db.query(PhaseEmployee, Phase).join(Phase, PhaseEmployee.phase_id == Phase.id)
                .filter(PhaseEmployee.employee_id == e.id).first())
    if existing:
        pe0, ph0 = existing
        if ph0.id == phase_id:
            raise HTTPException(status_code=409, detail=f"{e.name} is already assigned to this phase")
        proj0 = db.get(Project, ph0.project_id)
        raise HTTPException(status_code=409,
                            detail=f"{e.name} is already assigned to phase '{ph0.name}' in project "
                                   f"'{proj0.name if proj0 else ph0.project_id}' — unassign them there first")
    pe = PhaseEmployee(phase_id=phase_id, employee_id=e.id, assigned_by=user.id)
    db.add(pe); db.commit(); db.refresh(pe)
    return {"assignment_id": pe.id, "employee_id": e.id, "name": e.name,
            "role_title": e.category.name if e.category else e.role_title, "status": e.status}


@router.delete("/phases/{phase_id}/employees/{employee_id}", status_code=204)
def unassign_phase_employee(phase_id: int, employee_id: int, db: Session = Depends(get_db),
                            user: User = Depends(INTERNAL)):
    ph = db.get(Phase, phase_id)
    if not ph:
        raise HTTPException(status_code=404, detail="Phase not found")
    check_field_access(db, user, db.get(Project, ph.project_id))
    pe = db.query(PhaseEmployee).filter_by(phase_id=phase_id, employee_id=employee_id).first()
    if not pe:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(pe); db.commit()


# ---------- Employees ----------
@router.post("/projects/{project_id}/employees", status_code=201)
def create_employee(project_id: int, body: EmployeeCreate, db: Session = Depends(get_db),
                    user: User = Depends(INTERNAL)):
    project = get_project_or_404(db, project_id)
    check_field_access(db, user, project)
    cat = resolve_category(db, body.category_id)
    data = body.model_dump()
    data.pop("project_id", None)
    data["wage_type"] = body.wage_type or (cat.default_wage_type if cat else None) or "daily"
    e = Employee(project_id=project_id, created_by=user.id, **data)
    db.add(e); db.commit(); db.refresh(e)
    return employee_out(e)


@router.get("/projects/{project_id}/employees")
def list_employees(project_id: int, db: Session = Depends(get_db), user: User = Depends(READ_FIELD),
                   status: Optional[str] = None, search: Optional[str] = None):
    project = get_project_or_404(db, project_id)
    check_field_access(db, user, project)
    q = db.query(Employee).filter(project_employee_filter(db, project_id))
    if status:
        q = q.filter(Employee.status == status)
    if search:
        q = q.filter(Employee.name.ilike(f"%{search}%"))
    return [mask_for_client(employee_out(e), user) for e in q.order_by(Employee.name).all()]


@router.get("/employees/{employee_id}")
def get_employee(employee_id: int, db: Session = Depends(get_db), user: User = Depends(READ_FIELD)):
    e = db.get(Employee, employee_id)
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    check_field_access(db, user, db.get(Project, e.project_id) if e.project_id else None)
    return mask_for_client(employee_out(e), user)


@router.patch("/employees/{employee_id}")
def patch_employee(employee_id: int, body: EmployeePatch, db: Session = Depends(get_db),
                   user: User = Depends(INTERNAL)):
    e = db.get(Employee, employee_id)
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    check_field_access(db, user, db.get(Project, e.project_id) if e.project_id else None)
    data = body.model_dump(exclude_unset=True)
    if user.role not in ("Admin", "Accountant"):
        blocked = {"daily_wage", "wage_type", "status"} & set(data.keys())
        if blocked:
            raise HTTPException(status_code=403,
                                detail=f"Only Admin/Accountant can edit: {', '.join(sorted(blocked))}")
    if "category_id" in data:
        resolve_category(db, data["category_id"])
    for k, v in data.items():
        setattr(e, k, v)
    db.commit(); db.refresh(e)
    return employee_out(e)


@router.post("/employees/{employee_id}/deactivate")
def deactivate_employee(employee_id: int, db: Session = Depends(get_db),
                        user: User = Depends(WAGE_ADMIN)):
    e = db.get(Employee, employee_id)
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    e.status = "inactive"
    db.commit(); db.refresh(e)
    return employee_out(e)


# ---------- Attendance ----------
@router.post("/projects/{project_id}/attendance", status_code=201)
def mark_attendance(project_id: int, body: AttendanceMark, db: Session = Depends(get_db),
                    user: User = Depends(INTERNAL)):
    project = get_project_or_404(db, project_id)
    check_field_access(db, user, project)
    e = db.get(Employee, body.employee_id)
    if not e or not employee_in_project(db, e, project_id):
        raise HTTPException(status_code=422, detail="Employee does not belong to this project")
    day = body.attendance_date or date.today()
    check_backdate_window(user, day)
    existing = db.query(Attendance).filter_by(employee_id=e.id, attendance_date=day).first()
    if existing:
        existing.status = body.status
        existing.check_in_time = body.check_in_time
        existing.check_out_time = body.check_out_time
        existing.notes = body.notes
        existing.marked_by = user.id
        db.commit(); db.refresh(existing)
        return attendance_out(existing, e.name)
    a = Attendance(employee_id=e.id, project_id=project_id, attendance_date=day,
                   status=body.status, check_in_time=body.check_in_time,
                   check_out_time=body.check_out_time, notes=body.notes, marked_by=user.id)
    db.add(a); db.commit(); db.refresh(a)
    return attendance_out(a, e.name)


@router.get("/projects/{project_id}/attendance")
def list_attendance(project_id: int, db: Session = Depends(get_db), user: User = Depends(READ_FIELD),
                    date_from: Optional[date] = None, date_to: Optional[date] = None,
                    employee_id: Optional[int] = None, status: Optional[str] = None):
    project = get_project_or_404(db, project_id)
    check_field_access(db, user, project)
    q = (db.query(Attendance, Employee.name).join(Employee, Attendance.employee_id == Employee.id)
         .filter(Attendance.project_id == project_id))
    if date_from:
        q = q.filter(Attendance.attendance_date >= date_from)
    if date_to:
        q = q.filter(Attendance.attendance_date <= date_to)
    if employee_id:
        q = q.filter(Attendance.employee_id == employee_id)
    if status:
        q = q.filter(Attendance.status == status)
    return [attendance_out(a, name) for a, name in
            q.order_by(Attendance.attendance_date.desc()).all()]


@router.patch("/attendance/{attendance_id}")
def patch_attendance(attendance_id: int, body: AttendancePatch, db: Session = Depends(get_db),
                     user: User = Depends(INTERNAL)):
    a = db.get(Attendance, attendance_id)
    if not a:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    check_field_access(db, user, db.get(Project, a.project_id))
    check_backdate_window(user, a.attendance_date)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    a.marked_by = user.id
    db.commit(); db.refresh(a)
    e = db.get(Employee, a.employee_id)
    return attendance_out(a, e.name if e else None)


@router.get("/employees/{employee_id}/attendance")
def employee_attendance(employee_id: int, db: Session = Depends(get_db),
                        user: User = Depends(INTERNAL),
                        limit: int = Query(60, ge=1, le=366)):
    e = db.get(Employee, employee_id)
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    check_field_access(db, user, db.get(Project, e.project_id) if e.project_id else None)
    rows = (db.query(Attendance).filter_by(employee_id=employee_id)
            .order_by(Attendance.attendance_date.desc()).limit(limit).all())
    return [attendance_out(a, e.name) for a in rows]


# ---------- Labour cost report ----------
@router.get("/projects/{project_id}/labour-cost")
def labour_cost(project_id: int, db: Session = Depends(get_db), user: User = Depends(INTERNAL),
                date_from: Optional[date] = None, date_to: Optional[date] = None):
    project = get_project_or_404(db, project_id)
    check_field_access(db, user, project)
    today = date.today()
    date_from = date_from or today.replace(day=1)
    date_to = date_to or today
    employees = db.query(Employee).filter(project_employee_filter(db, project_id)).all()
    atts = (db.query(Attendance).filter(Attendance.project_id == project_id,
                                        Attendance.attendance_date >= date_from,
                                        Attendance.attendance_date <= date_to).all())
    days_by_emp = {}
    for a in atts:
        days_by_emp[a.employee_id] = days_by_emp.get(a.employee_id, 0.0) + DAY_VALUE.get(a.status, 0.0)
    all_atts = db.query(Attendance).filter(Attendance.project_id == project_id).all()
    all_days = {}
    for a in all_atts:
        all_days[a.employee_id] = all_days.get(a.employee_id, 0.0) + DAY_VALUE.get(a.status, 0.0)
    paid_map = {sid: float(total) for sid, total in
                (db.query(ExpenseEntry.source_id, func.coalesce(func.sum(ExpenseEntry.amount), 0))
                 .filter(ExpenseEntry.project_id == project_id, ExpenseEntry.source_type == "Employee")
                 .group_by(ExpenseEntry.source_id).all()) if sid is not None}
    rows = []
    total = 0.0
    total_paid = 0.0
    total_due = 0.0
    for e in employees:
        days = round(days_by_emp.get(e.id, 0.0), 1)
        amount = None
        earned_total = None
        paid = round(paid_map.get(e.id, 0.0), 2)
        due = None
        if e.wage_type == "daily" and e.daily_wage is not None:
            amount = round(days * float(e.daily_wage), 2)
            earned_total = round(all_days.get(e.id, 0.0) * float(e.daily_wage), 2)
            due = round(earned_total - paid, 2)
            total += amount
            total_due += max(due, 0.0)
        total_paid += paid
        rows.append({"employee_id": e.id, "name": e.name,
                     "role_title": e.category.name if e.category else e.role_title,
                     "status": e.status, "wage_type": e.wage_type,
                     "daily_wage": float(e.daily_wage) if e.daily_wage is not None else None,
                     "days_present": days, "amount": amount,
                     "earned_total": earned_total, "paid": paid, "due": due})
    return {"project_id": project_id, "date_from": d(date_from), "date_to": d(date_to),
            "rows": rows, "total_amount": round(total, 2),
            "total_paid": round(total_paid, 2), "total_due": round(total_due, 2)}


class LabourPaymentIn(BaseModel):
    employee_id: int
    amount: float = Field(gt=0)
    payment_type: str = "Partial Payment"
    note: Optional[str] = None


@router.post("/projects/{project_id}/labour-payments", status_code=201)
def make_labour_payment(project_id: int, body: LabourPaymentIn, db: Session = Depends(get_db),
                        user: User = Depends(require_roles("Admin", "Accountant"))):
    if body.payment_type not in ("Advance Payment", "Partial Payment", "Full Payment"):
        raise HTTPException(status_code=422, detail="Invalid payment_type")
    project = get_project_or_404(db, project_id)
    emp = db.get(Employee, body.employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    from app.routers.transactions import budget_remaining
    desc = f"Wage payment — {emp.name} ({body.payment_type})"
    if body.note and body.note.strip():
        desc += f": {body.note.strip()}"
    exp = ExpenseEntry(project_id=project.id, category="Employee Payment", amount=body.amount,
                       expense_date=date.today(), description=desc, recorded_by=user.id,
                       source_type="Employee", source_id=emp.id, payment_type=body.payment_type,
                       balance_after=round(budget_remaining(db, project) - body.amount, 2))
    db.add(exp)
    db.commit()
    db.refresh(exp)
    paid = float(db.query(func.coalesce(func.sum(ExpenseEntry.amount), 0))
                 .filter(ExpenseEntry.project_id == project_id,
                         ExpenseEntry.source_type == "Employee",
                         ExpenseEntry.source_id == emp.id).scalar())
    return {"id": exp.id, "employee_id": emp.id, "employee_name": emp.name,
            "amount": body.amount, "payment_type": body.payment_type,
            "description": desc, "date": exp.expense_date.isoformat(),
            "total_paid_to_employee": round(paid, 2),
            "project_budget_remaining": budget_remaining(db, project)}
