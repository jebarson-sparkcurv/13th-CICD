"""Multi-tenant scaffolding — Phase 1.

A ``Tenant`` is one construction company using Sitera. Every tenant has:
  * A canonical name and slug.
  * An ``allowed_modules`` JSON array of module keys the tenant can access.
  * An optional ``is_active`` flag so a SuperAdmin can pause a tenant without
    deleting data.

Data isolation model: shared DB, ``tenant_id`` column on every top-level
owning table. Child rows inherit tenancy through their parent.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime
from app.database import Base


# Master list of module keys a SuperAdmin can toggle for each tenant.
# Keep in sync with the frontend module gate.
MODULE_KEYS = [
    "projects",
    "phases_tracking",
    "field_ops",
    "clients",
    "leads",
    "leave_attendance",
    "finance",
    "estimates",
    "procurement",
    "change_orders",
    "model3d_viewer",
    "concept_studio",
    "client_portal",
    "vendor_portal",
    "site_engineer_portal",
]


def utcnow():
    return datetime.now(timezone.utc)


class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    # JSON array of module keys, e.g. ["projects", "finance", "clients"].
    # NULL / empty means the SuperAdmin hasn't granted anything yet.
    allowed_modules = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
