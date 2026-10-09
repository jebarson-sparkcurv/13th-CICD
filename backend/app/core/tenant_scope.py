"""Tenant-scoping helpers for router endpoints.

Every list endpoint should ``.filter()`` through :func:`tenant_scope` so a
tenant admin can only see rows that belong to their own tenant. SuperAdmin
skips the filter (sees everything).

Every create endpoint should call :func:`ensure_tenant_owned` on the new
row so ``tenant_id`` matches the caller's tenant.

Every by-id read/write should call :func:`assert_same_tenant` after the
``db.get()`` so a URL swap can't leak cross-tenant data.
"""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm.query import Query

from app.models import User


def tenant_scope(query: Query, model, user: User) -> Query:
    """Apply ``WHERE model.tenant_id = user.tenant_id`` unless the caller is
    a SuperAdmin (who sees every tenant)."""
    if getattr(user, "role", None) == "SuperAdmin":
        return query
    return query.filter(model.tenant_id == user.tenant_id)


def ensure_tenant_owned(instance, user: User) -> None:
    """Set ``instance.tenant_id`` to the caller's tenant. SuperAdmin creates
    rows in the Default Company (tenant_id=1) if nothing else is set."""
    if getattr(instance, "tenant_id", None):
        return
    instance.tenant_id = user.tenant_id or 1


def assert_same_tenant(instance, user: User, entity: str = "record") -> None:
    """Raise 404 if ``instance`` does not belong to the caller's tenant.

    404 (not 403) is used on purpose: it doesn't leak the existence of the
    row to a probing attacker. SuperAdmin bypasses the check.
    """
    if instance is None:
        raise HTTPException(status_code=404, detail=f"{entity.capitalize()} not found")
    if getattr(user, "role", None) == "SuperAdmin":
        return
    inst_tenant: Optional[int] = getattr(instance, "tenant_id", None)
    if inst_tenant is not None and inst_tenant != user.tenant_id:
        raise HTTPException(status_code=404, detail=f"{entity.capitalize()} not found")
