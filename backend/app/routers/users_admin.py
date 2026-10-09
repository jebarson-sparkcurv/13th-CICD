from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Client, Project
from app.models.finance import ProjectAssignment
from app.models.procurement import Vendor
from app.models.tenant import Tenant
from app.core.security import hash_password, require_roles, get_current_user
from app.crud import d

router = APIRouter(tags=["users"])
ADMIN = require_roles("Admin")
ROLES = Literal["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer", "Client", "Vendor"]


def _tenant_module_set(db: Session, admin: User) -> set[str]:
    """The universe of modules an Admin can grant to their team = the
    intersection of everything the SuperAdmin gave to their tenant."""
    if not admin.tenant_id:
        return set()
    t = db.get(Tenant, admin.tenant_id)
    return set(t.allowed_modules or []) if t else set()


def _clamp_modules(requested: Optional[list[str]], allowed: set[str]) -> Optional[list[str]]:
    """Return the requested list intersected with what's allowed. ``None`` and
    empty list keep the user on the full tenant set (inherit)."""
    if requested is None:
        return None
    return [m for m in requested if m in allowed]


class UserCreate(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    phone: Optional[str] = None
    password: str = Field(min_length=6)
    role: ROLES = "SiteEngineer"
    base_salary: Optional[float] = None
    linked_client_id: Optional[int] = None
    linked_vendor_id: Optional[int] = None
    new_client_name: Optional[str] = None
    new_vendor_name: Optional[str] = None
    allowed_modules: Optional[list[str]] = None


class UserPatch(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[ROLES] = None
    status: Optional[Literal["Invited", "Active", "Disabled"]] = None
    base_salary: Optional[float] = None
    linked_client_id: Optional[int] = None
    linked_vendor_id: Optional[int] = None
    allowed_modules: Optional[list[str]] = None


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=6)


class AssignmentCreate(BaseModel):
    user_id: int
    assigned_role: str = "SiteEngineer"


def user_admin_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "phone": getattr(u, "phone", None),
            "role": u.role, "status": getattr(u, "status", "Active"),
            "client_id": u.client_id, "linked_vendor_id": getattr(u, "linked_vendor_id", None),
            "tenant_id": getattr(u, "tenant_id", None),
            "allowed_modules": list(getattr(u, "allowed_modules", None) or []),
            "base_salary": float(u.base_salary) if getattr(u, "base_salary", None) else None,
            "last_login_at": d(getattr(u, "last_login_at", None)), "created_at": d(u.created_at)}


@router.get("/users/allowed-modules")
def list_admin_module_allowance(db: Session = Depends(get_db),
                                    admin: User = Depends(ADMIN)):
    """Return the set of module keys this Admin is allowed to hand out."""
    return {"modules": sorted(_tenant_module_set(db, admin))}


@router.post("/users", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    if body.role == "Admin" and admin.role != "Admin":
        raise HTTPException(status_code=403, detail="Cannot create another Admin")
    client_id, vendor_id = body.linked_client_id, body.linked_vendor_id
    if body.role == "Client":
        if not client_id and body.new_client_name:
            c = Client(name=body.new_client_name, email=email, phone=body.phone,
                        tenant_id=admin.tenant_id)
            db.add(c); db.flush()
            client_id = c.id
        if not client_id:
            raise HTTPException(status_code=422, detail="Client users need linked_client_id or new_client_name")
    if body.role == "Vendor":
        if not vendor_id and body.new_vendor_name:
            v = Vendor(name=body.new_vendor_name, email=email, phone=body.phone,
                        tenant_id=admin.tenant_id)
            db.add(v); db.flush()
            vendor_id = v.id
        if not vendor_id:
            raise HTTPException(status_code=422, detail="Vendor users need linked_vendor_id or new_vendor_name")
    allowed = _clamp_modules(body.allowed_modules, _tenant_module_set(db, admin))
    u = User(email=email, password_hash=hash_password(body.password), name=body.name,
             role=body.role, client_id=client_id, tenant_id=admin.tenant_id,
             allowed_modules=allowed)
    u.phone = body.phone
    u.status = "Active"
    u.linked_vendor_id = vendor_id
    u.base_salary = body.base_salary
    db.add(u); db.commit(); db.refresh(u)
    return user_admin_out(u)


@router.get("/users/all")
def list_all_users(db: Session = Depends(get_db), admin: User = Depends(ADMIN),
                   role: str = None, status: str = None):
    q = db.query(User).filter(User.tenant_id == admin.tenant_id)
    if role:
        q = q.filter(User.role == role)
    if status:
        q = q.filter(User.status == status)
    return [user_admin_out(u) for u in q.order_by(User.name).all()]


@router.get("/users/{user_id}")
def get_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u or u.tenant_id != admin.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")
    out = user_admin_out(u)
    out["assignments"] = [{"id": a.id, "project_id": a.project_id, "assigned_role": a.assigned_role}
                          for a in db.query(ProjectAssignment).filter_by(user_id=user_id).all()]
    return out


@router.patch("/users/{user_id}")
def patch_user(user_id: int, body: UserPatch, db: Session = Depends(get_db),
               admin: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u or u.tenant_id != admin.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")
    data = body.model_dump(exclude_unset=True)
    if "allowed_modules" in data:
        u.allowed_modules = _clamp_modules(data.pop("allowed_modules"),
                                             _tenant_module_set(db, admin))
    for k, v in data.items():
        setattr(u, k if k != "linked_client_id" else "client_id", v)
    db.commit(); db.refresh(u)
    return user_admin_out(u)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u or u.tenant_id != admin.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    from sqlalchemy import text
    paid = db.execute(text("SELECT count(*) FROM payroll_entries WHERE user_id = :u"), {"u": u.id}).scalar()
    if paid:
        raise HTTPException(status_code=409, detail="This user has payroll history — disable the account instead of deleting it")
    db.execute(text("DELETE FROM notifications WHERE user_id = :u"), {"u": u.id})
    db.delete(u)
    db.commit()


@router.post("/users/{user_id}/disable")
def disable_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.status = "Disabled"
    db.commit()
    return user_admin_out(u)


@router.post("/users/{user_id}/invite")
def invite_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.status = "Invited"
    db.commit()
    return {"message": f"Invite marked for {u.email} (email sending not configured)", "user": user_admin_out(u)}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, body: ResetPasswordIn, db: Session = Depends(get_db),
                   admin: User = Depends(ADMIN)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    u.password_hash = hash_password(body.new_password)
    if u.status == "Invited":
        u.status = "Active"
    db.commit()
    return {"message": "Password reset"}


@router.post("/projects/{project_id}/assignments", status_code=201)
def assign_user(project_id: int, body: AssignmentCreate, db: Session = Depends(get_db),
                admin: User = Depends(ADMIN)):
    if not db.get(Project, project_id) or not db.get(User, body.user_id):
        raise HTTPException(status_code=404, detail="Project or user not found")
    existing = db.query(ProjectAssignment).filter_by(project_id=project_id, user_id=body.user_id).first()
    if existing:
        return {"id": existing.id, "project_id": project_id, "user_id": body.user_id,
                "assigned_role": existing.assigned_role}
    a = ProjectAssignment(project_id=project_id, **body.model_dump())
    db.add(a); db.commit(); db.refresh(a)
    return {"id": a.id, "project_id": project_id, "user_id": a.user_id, "assigned_role": a.assigned_role}


@router.get("/projects/{project_id}/assignments")
def list_assignments(project_id: int, db: Session = Depends(get_db),
                     user: User = Depends(require_roles("Admin", "SiteEngineer"))):
    rows = db.query(ProjectAssignment).filter_by(project_id=project_id).all()
    out = []
    for a in rows:
        u = db.get(User, a.user_id)
        out.append({"id": a.id, "user_id": a.user_id, "user_name": u.name if u else None,
                    "assigned_role": a.assigned_role})
    return out


@router.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db),
                      admin: User = Depends(ADMIN)):
    a = db.get(ProjectAssignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(a); db.commit()
