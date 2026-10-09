"""SuperAdmin — Tenant management.

Endpoints under /api (SuperAdmin only):
  GET    /tenants                 — list all tenants + Admin summary
  POST   /tenants                 — create a tenant + initial Admin login
  GET    /tenants/{tid}           — tenant detail + user roster
  PATCH  /tenants/{tid}           — update name, allowed_modules, is_active
  DELETE /tenants/{tid}           — soft-delete a tenant (is_active=false)
  GET    /tenants/modules         — master list of module keys

  POST   /tenants/{tid}/users     — SuperAdmin creates any user in a tenant
"""
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.email_utils import send_html
from app.core.security import (get_current_user, hash_password,
                                  create_access_token, create_refresh_token,
                                  set_auth_cookies, user_out)
from app.database import get_db
from app.models import User
from app.models.tenant import MODULE_KEYS, Tenant

from fastapi import Response

router = APIRouter()


def _require_super(user: User = Depends(get_current_user)) -> User:
    if user.role != "SuperAdmin":
        raise HTTPException(403, "SuperAdmin only")
    return user


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "tenant"


def _serialize_tenant(t: Tenant, users: Optional[list[User]] = None) -> dict:
    admin_users = [u for u in (users or []) if u.role == "Admin"]
    return {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "allowed_modules": list(t.allowed_modules or []),
        "is_active": bool(t.is_active),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "user_count": len(users or []),
        "admin_email": admin_users[0].email if admin_users else None,
        "admin_name": admin_users[0].name if admin_users else None,
    }


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TenantCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    admin_email: EmailStr
    admin_name: str = Field(min_length=1, max_length=80)
    admin_password: str = Field(min_length=6, max_length=200)
    allowed_modules: list[str] = Field(default_factory=list)


class TenantPatch(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    allowed_modules: Optional[list[str]] = None
    is_active: Optional[bool] = None


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=6, max_length=200)
    role: str = Field(default="Admin")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/tenants/{tid}/impersonate")
def impersonate_tenant(tid: int, response: Response,
                          db: Session = Depends(get_db),
                          su: User = Depends(_require_super)):
    """SuperAdmin-only: issue an access token for the tenant's primary Admin
    so the SuperAdmin can enter the tenant's admin app in one click.

    We deliberately re-use the tenant Admin's own user id so all downstream
    tenant scoping continues to work correctly. Session cookies are rewritten
    just like a normal login.
    """
    tenant = db.get(Tenant, tid)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    if not tenant.is_active:
        raise HTTPException(400, "Tenant is on hold; resume it first")

    target = (db.query(User)
                .filter(User.tenant_id == tid, User.role == "Admin",
                        User.status != "Disabled")
                .order_by(User.id.asc()).first())
    if not target:
        raise HTTPException(400, "This tenant has no active Admin to impersonate")

    access = create_access_token(target.id, target.email)
    refresh = create_refresh_token(target.id)
    set_auth_cookies(response, access, refresh)
    return {
        "user": user_out(target),
        "access_token": access,
        "impersonated_by": su.email,
        "tenant_name": tenant.name,
    }


@router.get("/tenants/modules")
def list_module_keys(_: User = Depends(_require_super)):
    return {"modules": MODULE_KEYS}


@router.get("/tenants")
def list_tenants(db: Session = Depends(get_db),
                    _: User = Depends(_require_super)):
    tenants = db.query(Tenant).order_by(Tenant.id.asc()).all()
    users_by_tenant: dict[int, list[User]] = {}
    for u in db.query(User).filter(User.tenant_id.isnot(None)).all():
        users_by_tenant.setdefault(u.tenant_id, []).append(u)
    return [_serialize_tenant(t, users_by_tenant.get(t.id, [])) for t in tenants]


@router.post("/tenants", status_code=201)
def create_tenant(body: TenantCreate, db: Session = Depends(get_db),
                    _: User = Depends(_require_super)):
    if db.query(User).filter(User.email == body.admin_email).first():
        raise HTTPException(400, "Email already in use")

    bad = [m for m in body.allowed_modules if m not in MODULE_KEYS]
    if bad:
        raise HTTPException(400, f"Unknown modules: {', '.join(bad)}")

    slug = _slugify(body.name)
    # Ensure slug uniqueness
    if db.query(Tenant).filter(Tenant.slug == slug).first():
        # append suffix
        n = 2
        while db.query(Tenant).filter(Tenant.slug == f"{slug}-{n}").first():
            n += 1
        slug = f"{slug}-{n}"

    tenant = Tenant(name=body.name, slug=slug,
                      allowed_modules=body.allowed_modules,
                      is_active=True,
                      created_at=datetime.now(timezone.utc))
    db.add(tenant)
    db.flush()

    admin = User(email=body.admin_email, name=body.admin_name,
                    password_hash=hash_password(body.admin_password),
                    role="Admin", tenant_id=tenant.id, status="Active")
    db.add(admin)
    db.commit()
    db.refresh(tenant)

    # Fire welcome email (best-effort, must not break tenant provisioning)
    _send_welcome_email(admin=admin, tenant=tenant,
                          temp_password=body.admin_password)
    return _serialize_tenant(tenant, [admin])


def _send_welcome_email(admin: User, tenant: Tenant, temp_password: str) -> None:
    import os
    # Sitera production sign-in URL — configurable via PUBLIC_APP_URL for
    # non-production tenants, but always defaults to sitera.in in prod.
    base = (os.environ.get("PUBLIC_APP_URL") or "https://sitera.in").rstrip("/")
    login_url = f"{base}/login"
    modules_line = ", ".join(tenant.allowed_modules or []) or "no modules yet"
    html = f"""<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;background:#0a0e17;color:#e2e8f0;padding:0;border-radius:14px;overflow:hidden">
      <div style="padding:28px 32px;background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);color:#fff">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;font-weight:700;opacity:.85">Welcome to Sitera</div>
        <div style="font-size:24px;font-weight:600;margin-top:4px">{tenant.name} is live</div>
      </div>
      <div style="padding:28px 32px">
        <p style="margin:0 0 16px;font-size:15px;line-height:1.55">Hi {admin.name},</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#cbd5e1">
          Your Sitera Construction Operations workspace is ready. You've been set up as the
          <b style="color:#fff">Admin</b> of <b style="color:#fff">{tenant.name}</b>. You can invite your
          site engineers, accountants and vendors once you sign in.
        </p>
        <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:18px 20px;margin:22px 0">
          <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#94a3b8;font-weight:700">Sign-in credentials</div>
          <div style="margin-top:10px;font-size:14px">
            <div style="margin:4px 0"><span style="color:#94a3b8">Email:</span>
              <b style="color:#fff;font-family:ui-monospace,monospace">{admin.email}</b></div>
            <div style="margin:4px 0"><span style="color:#94a3b8">Temp password:</span>
              <b style="color:#f59e0b;font-family:ui-monospace,monospace">{temp_password}</b></div>
          </div>
          <div style="font-size:11px;color:#94a3b8;margin-top:12px">Please change this password after your first sign-in.</div>
        </div>
        <div style="text-align:center;margin:26px 0">
          <a href="{login_url}" style="display:inline-block;background:#f59e0b;color:#0a0e17;padding:12px 28px;text-decoration:none;font-weight:700;font-size:12px;letter-spacing:.15em;text-transform:uppercase;border-radius:8px">Sign in to Sitera</a>
        </div>
        <div style="border-top:1px solid #1f2937;padding-top:16px;margin-top:8px">
          <div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#94a3b8;font-weight:700">Modules enabled for {tenant.name}</div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:6px;line-height:1.6">{modules_line}</div>
        </div>
      </div>
      <div style="padding:16px 32px;font-size:11px;color:#64748b;background:#111827">
        You're receiving this because your Sitera SuperAdmin provisioned this workspace for you.
      </div>
    </div>"""
    send_html(to=admin.email,
              subject=f"Welcome to Sitera — {tenant.name}",
              html=html)


@router.get("/tenants/{tid}")
def get_tenant(tid: int, db: Session = Depends(get_db),
                  _: User = Depends(_require_super)):
    t = db.get(Tenant, tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    users = db.query(User).filter(User.tenant_id == tid).all()
    payload = _serialize_tenant(t, users)
    payload["users"] = [
        {"id": u.id, "email": u.email, "name": u.name, "role": u.role,
          "status": u.status, "last_login_at": u.last_login_at.isoformat()
          if u.last_login_at else None}
        for u in users
    ]
    return payload


@router.patch("/tenants/{tid}")
def update_tenant(tid: int, body: TenantPatch, db: Session = Depends(get_db),
                     _: User = Depends(_require_super)):
    t = db.get(Tenant, tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    if body.allowed_modules is not None:
        bad = [m for m in body.allowed_modules if m not in MODULE_KEYS]
        if bad:
            raise HTTPException(400, f"Unknown modules: {', '.join(bad)}")
        t.allowed_modules = body.allowed_modules
    if body.name is not None:
        t.name = body.name
    if body.is_active is not None:
        t.is_active = body.is_active
    db.commit()
    db.refresh(t)
    return _serialize_tenant(t)


@router.get("/tenants/{tid}/export")
def export_tenant(tid: int, db: Session = Depends(get_db),
                     _: User = Depends(_require_super)):
    """Dump every row belonging to a tenant as a single JSON payload.

    The response streams as a JSON attachment so the SuperAdmin can Ctrl-S
    the file straight from their browser before deleting the tenant.
    """
    from datetime import datetime, timezone, date
    from decimal import Decimal
    import json
    from fastapi.responses import Response
    from sqlalchemy import text
    tenant = db.get(Tenant, tid)
    if not tenant:
        raise HTTPException(404, "Tenant not found")

    tables = [
        "users", "projects", "clients", "vendors", "employees",
        "estimates", "invoices", "payments", "expense_entries",
        "income_entries", "purchase_orders", "subcontracts",
        "change_orders", "quotations", "bid_packages", "vendor_quotations",
        "concept_generations", "model3d_files", "leads", "leave_requests", "staff_attendance",
    ]

    payload: dict = {
        "tenant": {
            "id": tenant.id, "name": tenant.name, "slug": tenant.slug,
            "is_active": tenant.is_active,
            "allowed_modules": list(tenant.allowed_modules or []),
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        },
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "data": {},
    }

    for tbl in tables:
        try:
            # Never leak password hashes even in a backup — replace with a
            # placeholder that keeps import feasible without exposing secrets.
            select_cols = ("id, email, name, role, status, tenant_id, "
                             "client_id, phone, created_at, allowed_modules") if tbl == "users" else "*"
            rows = db.execute(text(f"SELECT {select_cols} FROM {tbl} WHERE tenant_id = :tid"),
                                {"tid": tid}).mappings().all()
            payload["data"][tbl] = [dict(r) for r in rows]
        except Exception:  # noqa: BLE001
            payload["data"][tbl] = []

    filename = f"sitera-tenant-{tenant.slug}-{tid}.json"

    def _default(o):
        if isinstance(o, (datetime, date)):
            return o.isoformat()
        if isinstance(o, Decimal):
            return float(o)
        return str(o)

    body = json.dumps(payload, default=_default, indent=2)
    return Response(
        content=body, media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/tenants/{tid}")
def deactivate_tenant(tid: int, db: Session = Depends(get_db),
                        _: User = Depends(_require_super)):
    """Soft-delete: pause the tenant. Data is preserved. Use ``/permanent``
    for a full cascading wipe."""
    t = db.get(Tenant, tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    t.is_active = False
    db.commit()
    return {"status": "deactivated"}


@router.delete("/tenants/{tid}/permanent")
def permanent_delete_tenant(tid: int, db: Session = Depends(get_db),
                                _: User = Depends(_require_super)):
    """HARD delete a tenant and every row belonging to it. Cannot be undone.
    The Default Company (id=1) is protected."""
    if tid == 1:
        raise HTTPException(400, "The Default Company cannot be deleted")
    t = db.get(Tenant, tid)
    if not t:
        raise HTTPException(404, "Tenant not found")

    from sqlalchemy import text
    # Delete tenant-owned rows first (children cascade via FKs where set).
    for tbl in ("lead_capture_forms", "leads", "model3d_files", "concept_generations", "estimates",
                  "employees", "vendors", "projects", "clients"):
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE tenant_id = :tid"),
                        {"tid": tid})
        except Exception:  # noqa: BLE001
            db.rollback()
    # Payroll belongs to the tenant (runs) and references its users (entries).
    db.execute(text("DELETE FROM payroll_entries WHERE payroll_run_id IN "
                    "(SELECT id FROM payroll_runs WHERE tenant_id = :tid) "
                    "OR user_id IN (SELECT id FROM users WHERE tenant_id = :tid)"), {"tid": tid})
    db.execute(text("DELETE FROM payroll_runs WHERE tenant_id = :tid"), {"tid": tid})
    # Notifications reference users without ON DELETE — clear them first.
    db.execute(text("DELETE FROM notifications WHERE user_id IN "
                    "(SELECT id FROM users WHERE tenant_id = :tid)"), {"tid": tid})
    # Users last so admins keep FK integrity while other rows are removed.
    db.execute(text("DELETE FROM users WHERE tenant_id = :tid"), {"tid": tid})
    db.delete(t)
    db.commit()
    return {"status": "deleted"}


@router.get("/tenants/{tid}/data-summary")
def tenant_data_summary(tid: int, db: Session = Depends(get_db),
                            _: User = Depends(_require_super)):
    """Row counts across the tenant's top-level tables — the SuperAdmin uses
    this to decide whether it's safe to delete or hold a tenant."""
    from sqlalchemy import text
    counts: dict[str, int] = {}
    for tbl in ("users", "projects", "clients", "vendors", "employees",
                  "estimates", "concept_generations", "model3d_files", "leads"):
        try:
            row = db.execute(text(f"SELECT count(*) FROM {tbl} WHERE tenant_id = :tid"),
                              {"tid": tid}).scalar()
            counts[tbl] = int(row or 0)
        except Exception:  # noqa: BLE001
            counts[tbl] = 0
    return counts


@router.post("/tenants/{tid}/users", status_code=201)
def create_user_in_tenant(tid: int, body: UserCreate,
                             db: Session = Depends(get_db),
                             _: User = Depends(_require_super)):
    t = db.get(Tenant, tid)
    if not t:
        raise HTTPException(404, "Tenant not found")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already in use")
    if body.role == "SuperAdmin":
        raise HTTPException(400, "Cannot create SuperAdmin inside a tenant")
    u = User(email=body.email, name=body.name,
                password_hash=hash_password(body.password),
                role=body.role, tenant_id=tid, status="Active")
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role}
