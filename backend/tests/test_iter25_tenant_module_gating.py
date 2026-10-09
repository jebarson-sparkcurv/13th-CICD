"""Backend tests for iter25 — SuperAdmin tenant module gating + Layout side effects.

Verifies:
1. SuperAdmin /auth/me returns effective_modules=null
2. Creating a new tenant "IsoTest" (idempotent) with modules ['projects','finance']
3. IsoTest admin /auth/me returns effective_modules == ['projects','finance']
4. PATCH tenants/{id} adds a module -> admin sees new module after next login
5. Tenant isolation: IsoTest admin cannot see BuildCo/default data
"""
import os
import time
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

SUPER = {"email": "ponish.jino@sparkcurv.com", "password": "superadmin123"}
ISO = {"email": f"iso_{int(time.time())}@test.com", "password": "isotest123", "name": "IsoTest Admin"}
ISO_TENANT_NAME = f"IsoTest_{int(time.time())}"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def su_session():
    s, data = _login(SUPER["email"], SUPER["password"])
    return s, data


@pytest.fixture(scope="module")
def new_tenant(su_session):
    s, _ = su_session
    r = s.post(f"{BASE}/tenants", json={
        "name": ISO_TENANT_NAME,
        "admin_email": ISO["email"],
        "admin_name": ISO["name"],
        "admin_password": ISO["password"],
        "allowed_modules": ["projects", "finance"],
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_superadmin_me_unrestricted(su_session):
    s, login = su_session
    assert login["user"]["role"] == "SuperAdmin"
    assert login["user"]["effective_modules"] is None
    r = s.get(f"{BASE}/auth/me")
    assert r.status_code == 200
    assert r.json()["effective_modules"] is None


def test_tenants_modules_endpoint(su_session):
    s, _ = su_session
    r = s.get(f"{BASE}/tenants/modules")
    assert r.status_code == 200
    assert isinstance(r.json().get("modules"), list)


def test_create_tenant_iso(new_tenant):
    assert new_tenant["name"] == ISO_TENANT_NAME
    assert set(new_tenant["allowed_modules"]) == {"projects", "finance"}
    assert new_tenant["admin_email"] == ISO["email"]


def test_iso_admin_effective_modules(new_tenant):
    s, login = _login(ISO["email"], ISO["password"])
    assert login["user"]["role"] == "Admin"
    assert sorted(login["user"]["effective_modules"]) == ["finance", "projects"]


def test_patch_tenant_add_clients_reflects_next_login(su_session, new_tenant):
    s, _ = su_session
    r = s.patch(f"{BASE}/tenants/{new_tenant['id']}",
                json={"allowed_modules": ["projects", "finance", "clients"]})
    assert r.status_code == 200
    assert sorted(r.json()["allowed_modules"]) == ["clients", "finance", "projects"]

    # Fresh login as tenant admin should reflect added module
    _, login = _login(ISO["email"], ISO["password"])
    assert sorted(login["user"]["effective_modules"]) == ["clients", "finance", "projects"]


def test_iso_admin_isolation_clients(new_tenant):
    s, _ = _login(ISO["email"], ISO["password"])
    r = s.get(f"{BASE}/clients")
    assert r.status_code == 200
    assert r.json() == []


def test_iso_admin_projects_isolation(new_tenant):
    s, _ = _login(ISO["email"], ISO["password"])
    r = s.get(f"{BASE}/projects")
    assert r.status_code == 200
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    assert isinstance(items, list) and len(items) == 0


def test_iso_admin_cross_tenant_probe(new_tenant):
    s, _ = _login(ISO["email"], ISO["password"])
    r = s.get(f"{BASE}/projects/1")
    assert r.status_code == 404


def test_cleanup_delete_iso_tenant(su_session, new_tenant):
    s, _ = su_session
    r = s.delete(f"{BASE}/tenants/{new_tenant['id']}/permanent")
    assert r.status_code == 200
