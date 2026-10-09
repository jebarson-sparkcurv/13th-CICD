import os
import logging
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, APIRouter
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware

from app.database import engine, Base, SessionLocal
from app.routers import auth, projects, clients, uploads, documents, vendors, procurement, finance, users_admin, quotation, notifications, employees, exports, vendor_products, change_orders, transactions, estimates, quotations_v2, concepts, models3d, tenants, quotation_purchase_orders, leads, hr
from app.routers.uploads import UPLOAD_DIR
from app.models import concepts as _concepts_models  # noqa: F401 — register tables
from app.models import models3d as _models3d_models  # noqa: F401 — register tables
from app.models import tenant as _tenant_model  # noqa: F401 — register tables
from app.models import leads as _leads_model  # noqa: F401 — register tables
from app.models import hr as _hr_model  # noqa: F401 — register tables
from app.seed import seed_admin, seed_demo_data
from app.seed_procurement import seed_procurement

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Construction Portal API")

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(clients.router)
api_router.include_router(uploads.router)
api_router.include_router(documents.router)
api_router.include_router(vendors.router)
api_router.include_router(procurement.router)
api_router.include_router(finance.router)
api_router.include_router(users_admin.router)
api_router.include_router(quotation.router)
api_router.include_router(notifications.router)
api_router.include_router(employees.router)
api_router.include_router(exports.router)
api_router.include_router(vendor_products.router)
api_router.include_router(change_orders.router)
api_router.include_router(transactions.router)
api_router.include_router(estimates.router)
api_router.include_router(quotations_v2.router)
api_router.include_router(concepts.router)
api_router.include_router(models3d.router)
api_router.include_router(tenants.router)
api_router.include_router(quotation_purchase_orders.router)
api_router.include_router(leads.router)
api_router.include_router(hr.router)


@api_router.get("/")
def root():
    return {"message": "Construction Portal API"}


@api_router.get("/user-manual")
def download_user_manual():
    """Serve the Sitera User Manual PDF."""
    from fastapi.responses import FileResponse
    from fastapi import HTTPException
    from pathlib import Path
    p = Path("/app/docs/Sitera_User_Manual.pdf")
    if not p.exists():
        raise HTTPException(status_code=404, detail="User manual not found")
    return FileResponse(str(p), media_type="application/pdf", filename="Sitera_User_Manual.pdf")


app.include_router(api_router)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


def _grant_module(key: str):
    """Switch a new module on once for every tenant that uses Sitera (has any
    module), and for users there who have an explicit per-user module list."""
    from app.models.tenant import Tenant
    from app.models import User
    db = SessionLocal()
    try:
        granted = set()
        for t in db.query(Tenant).all():
            mods = list(t.allowed_modules or [])
            if not mods:
                continue
            if key not in mods:
                t.allowed_modules = mods + [key]
            granted.add(t.id)
        for u in db.query(User).filter(User.tenant_id.in_(list(granted) or [0])).all():
            umods = list(u.allowed_modules or [])
            if umods and key not in umods:
                u.allowed_modules = umods + [key]
        db.commit()
    except Exception as _e:  # noqa: BLE001
        db.rollback()
        logging.warning("Could not grant %s module: %s", key, _e)
    finally:
        db.close()


def _grant_leads_module():
    from app.models.tenant import Tenant
    db = SessionLocal()
    try:
        for t in db.query(Tenant).all():
            mods = list(t.allowed_modules or [])
            if "clients" in mods and "leads" not in mods:
                mods.insert(mods.index("clients") + 1, "leads")
                t.allowed_modules = mods
        db.commit()
    except Exception as _e:  # noqa: BLE001 — tenants table may not exist on a blank DB
        db.rollback()
        logging.warning("Could not grant leads module: %s", _e)
    finally:
        db.close()


@app.on_event("startup")
def startup():
    from sqlalchemy import inspect as _inspect
    _leads_is_new = not _inspect(engine).has_table("leads")
    _hr_is_new = not _inspect(engine).has_table("leave_requests")
    Base.metadata.create_all(bind=engine)
    if _hr_is_new:
        # First boot with Leave & Attendance: switch it on for every tenant once.
        _grant_module("leave_attendance")
    if _leads_is_new:
        # First boot with the Leads module: switch it on for every existing
        # tenant that already uses Clients. Runs once (table now exists), so a
        # SuperAdmin turning it off later is respected.
        _grant_leads_module()
    # Initialise object storage — non-fatal if it fails (offline dev)
    try:
        from app.core.object_storage import init_storage
        init_storage()
    except Exception as _e:
        logging.warning("Object storage init failed: %s", _e)
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE employees ADD COLUMN IF NOT EXISTS category_id "
                          "INTEGER REFERENCES employee_categories(id)"))
        conn.execute(text("ALTER TABLE employees ALTER COLUMN project_id DROP NOT NULL"))
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR"))
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency VARCHAR DEFAULT 'INR'"))
        for stmt in ["ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR",
                     "ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Active'",
                     "ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_vendor_id INTEGER",
                     "ALTER TABLE users ADD COLUMN IF NOT EXISTS base_salary NUMERIC(14,2)",
                     "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
                     "ALTER TABLE clients ADD COLUMN IF NOT EXISTS address VARCHAR",
                     "ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_id VARCHAR",
                     "ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT",
                     "ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
                     "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR",
                     "ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS deduction_days NUMERIC(5,1) DEFAULT 0",
                     "ALTER TABLE payroll_entries ADD COLUMN IF NOT EXISTS deduction_note VARCHAR",
                     "CREATE INDEX IF NOT EXISTS ix_payroll_runs_tenant_id ON payroll_runs(tenant_id)",
                     "ALTER TABLE payments ADD COLUMN IF NOT EXISTS vendor_id INTEGER",
                     "ALTER TABLE payments ADD COLUMN IF NOT EXISTS purchase_order_id INTEGER",
                     "CREATE INDEX IF NOT EXISTS ix_payments_purchase_order_id ON payments(purchase_order_id)",
                     "ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_direction VARCHAR DEFAULT 'incoming'",
                     "UPDATE payments SET payment_direction = 'incoming' WHERE payment_direction IS NULL",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS phase_id INTEGER REFERENCES phases(id)",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS source_type VARCHAR",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS source_id INTEGER",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS product_id INTEGER",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS payment_type VARCHAR",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS balance_after NUMERIC(14,2)",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS quotation_id INTEGER",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id)",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approval_state VARCHAR DEFAULT 'pending'",
                     "UPDATE estimates SET approval_state = 'pending' WHERE approval_state IS NULL",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS client_email VARCHAR",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS rejection_reason TEXT",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS linked_project_id INTEGER REFERENCES projects(id)",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approval_token VARCHAR",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS token_used BOOLEAN DEFAULT FALSE",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_date DATE",
                     "ALTER TABLE project_change_orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ",
                     "ALTER TABLE estimates ALTER COLUMN project_name DROP NOT NULL",
                     "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS income_entry_id INTEGER REFERENCES income_entries(id)",
                     "CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_income_entry_id ON invoices(income_entry_id) WHERE income_entry_id IS NOT NULL",
                     # -- Phase 1 multi-tenant scaffolding -------------------
                     "ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_modules JSONB",
                     "ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE clients ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE estimates ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE payments ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE expense_entries ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE income_entries ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE subcontracts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE quotations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE bid_packages ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE vendor_quotations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE concept_generations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "ALTER TABLE model3d_files ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)",
                     "CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users(tenant_id)",
                     "CREATE INDEX IF NOT EXISTS ix_projects_tenant_id ON projects(tenant_id)",
                     "CREATE INDEX IF NOT EXISTS ix_clients_tenant_id ON clients(tenant_id)",
                     "CREATE INDEX IF NOT EXISTS ix_vendors_tenant_id ON vendors(tenant_id)",
                     "CREATE INDEX IF NOT EXISTS ix_employees_tenant_id ON employees(tenant_id)",
                     "CREATE INDEX IF NOT EXISTS ix_estimates_tenant_id ON estimates(tenant_id)"]:
            conn.execute(text(stmt))
    db = SessionLocal()
    try:
        # Multi-tenant Phase 1: default tenant + SuperAdmin BEFORE anything else
        from app.seed import seed_default_tenant, seed_superadmin
        seed_default_tenant(db)
        seed_superadmin(db)
        seed_admin(db)
        if os.environ.get("SEED_DEMO_DATA", "false").lower() == "true":
            seed_demo_data(db)
            seed_procurement(db)
            from app.seed_finance import seed_finance
            seed_finance(db)
            from app.seed_finance import seed_employees, seed_categories, seed_milestones, seed_expense_categories, seed_project_ledgers
            seed_employees(db)
            seed_categories(db)
            seed_milestones(db)
            seed_expense_categories(db)
            seed_project_ledgers(db)
        # Backfill: auto-generate invoices for pre-existing IncomeEntry rows
        # that don't yet have a linked invoice. Safe to re-run on every boot.
        from app.routers.transactions import ensure_invoice_for_income
        from app.models.finance import IncomeEntry
        from app.models import Project as _Project
        for inc in db.query(IncomeEntry).filter(IncomeEntry.project_id.isnot(None)).all():
            proj = db.get(_Project, inc.project_id)
            if proj:
                ensure_invoice_for_income(db, proj, inc, None)
    finally:
        db.close()
