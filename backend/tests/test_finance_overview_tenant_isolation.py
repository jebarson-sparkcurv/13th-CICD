"""Regression test for the Finance-Overview tenant-isolation bug.

Bug: GET /api/finance/dashboard-summary was returning globally-aggregated
projects / invoices / payroll totals so every tenant saw the same numbers.
Fix: scope Projects and Invoices via `tenant_scope`, and restrict the
payroll sum to the scoped project ids.
"""
import os
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def two_tenants():
    sa = _login("ponish.jino@sparkcurv.com", "superadmin123")
    ts = int(time.time())
    email = f"admin+{ts}@finiso.com"
    r = requests.post(f"{BASE}/api/tenants", headers={"Authorization": f"Bearer {sa}"},
                      json={"name": f"IsoTenant-{ts}", "slug": f"iso-{ts}",
                            "admin_email": email, "admin_password": "isoPass1",
                            "admin_name": "Iso Admin"}, timeout=15)
    assert r.status_code == 201, r.text
    tok_b = _login(email, "isoPass1")
    tok_a = _login("kesari4416@gmail.com", "admin123")
    return {"a": tok_a, "b": tok_b}


def _seed(tok, tag):
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    c = requests.post(f"{BASE}/api/clients", headers=h, json={
        "name": f"C-{tag}", "email": f"c-{tag}@x.com", "phone": "+911234567890"}, timeout=15).json()
    p = requests.post(f"{BASE}/api/projects", headers=h, json={
        "name": f"P-{tag}", "client_id": c["id"], "budget": 1000000, "status": "Planning"}, timeout=15).json()
    amt = 100_000 if tag.endswith("A") else 200_000
    requests.post(f"{BASE}/api/projects/{p['id']}/expenses", headers=h,
                  json={"amount": amt, "description": f"seed-{tag}", "category": "Materials"}, timeout=15)
    return {"project_id": p["id"], "seeded_expense": amt}


def test_finance_dashboard_summary_is_tenant_scoped(two_tenants):
    """Two tenants with different expense totals must see different numbers
    in the Finance-Overview endpoint."""
    seed_a = _seed(two_tenants["a"], f"iso-A-{int(time.time())}")
    seed_b = _seed(two_tenants["b"], f"iso-B-{int(time.time())}")

    def _summary(tok):
        r = requests.get(f"{BASE}/api/finance/dashboard-summary",
                         headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    a = _summary(two_tenants["a"])
    b = _summary(two_tenants["b"])

    # Each tenant's cost_to_date must include *its own* seed.
    assert a["cost_to_date"] >= seed_a["seeded_expense"]
    assert b["cost_to_date"] >= seed_b["seeded_expense"]

    # And must NOT include the other tenant's seed. Since seed amounts differ,
    # the summaries must differ too — the pre-fix bug had them identical.
    assert a["cost_to_date"] != b["cost_to_date"], (
        "Finance dashboard-summary is leaking cross-tenant data — "
        f"tenant-A cost {a['cost_to_date']} == tenant-B cost {b['cost_to_date']}")
