"""Payroll → balance sheet, and payroll tenant isolation.

Bug fixed: processed/paid payroll never reached the org balance sheet,
because entries are created without a project and the balance sheet only
summed project-linked payroll. Salaried staff payroll is now reported as
"Company overheads — staff payroll". Payroll runs are also tenant-scoped.

Run:  cd backend && pytest tests/test_payroll_overheads.py -n 0 -v
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import pytest
from fastapi.testclient import TestClient

from app.main import app

SUPER = {"email": os.environ.get("SUPERADMIN_EMAIL", "ponish.jino@sparkcurv.com"),
         "password": os.environ.get("SUPERADMIN_PASSWORD", "superadmin123")}
STAMP = str(int(time.time() * 1000))[-8:]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_month_run(client, headers):
    """Create a payroll run for an unused past month (runs are one per month)."""
    for i in range(600):
        y, m = 2000 + i // 12, i % 12 + 1
        r = client.post("/api/payroll-runs", headers=headers, json={"month": f"{y}-{m:02d}"})
        if r.status_code == 201:
            return r.json()
        assert r.status_code == 409, r.text
    raise AssertionError("no free month")


def _login(client, creds):
    r = client.post("/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin(client):
    """Throw-away test company — your real payroll/balance sheet is untouched."""
    su = _login(client, SUPER)
    email = f"po_admin_{STAMP}@test.com"
    r = client.post("/api/tenants", headers=su, json={
        "name": f"PayrollTest_{STAMP}", "admin_email": email, "admin_name": "Payroll Admin",
        "admin_password": "admin123", "allowed_modules": ["projects", "finance"]})
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    h = _login(client, {"email": email, "password": "admin123"})
    r = client.post("/api/users", headers=h, json={"name": "Office Staff", "email": f"po_staff_{STAMP}@test.com",
                                                   "password": "staff123", "role": "Accountant", "base_salary": 20000})
    assert r.status_code == 201, r.text
    # Admins are always paid in full → guarantees a real (non-zero) payroll total
    r = client.post("/api/users", headers=h, json={"name": "Office Manager", "email": f"po_mgr_{STAMP}@test.com",
                                                   "password": "manager123", "role": "Admin", "base_salary": 25000})
    assert r.status_code == 201, r.text
    yield h
    assert client.delete(f"/api/tenants/{tid}/permanent", headers=su).status_code == 200


def test_paid_payroll_reaches_balance_sheet(client, admin):
    before = client.get("/api/finance/balance-sheet", headers=admin).json()
    assert "overheads" in before

    run = _new_month_run(client, admin)
    client.post(f"/api/payroll-runs/{run['id']}/process", headers=admin)
    entries = client.get(f"/api/payroll-runs/{run['id']}/entries", headers=admin).json()
    total = round(sum(float(e["net_pay"]) for e in entries), 2)
    assert total >= 25000          # the salaried Admin

    mid = client.get("/api/finance/balance-sheet", headers=admin).json()
    # Processed but unpaid → shows as pending dues, not yet money out
    assert round(mid["overheads"]["staff_payroll_pending"] - before["overheads"]["staff_payroll_pending"], 2) == total
    assert mid["total_debit"] == before["total_debit"]

    for e in entries:
        assert client.post(f"/api/payroll-entries/{e['id']}/mark-paid", headers=admin).status_code == 200

    after = client.get("/api/finance/balance-sheet", headers=admin).json()
    assert round(after["overheads"]["staff_payroll_paid"] - before["overheads"]["staff_payroll_paid"], 2) == total
    assert round(after["total_debit"] - before["total_debit"], 2) == total
    assert round(before["net"] - after["net"], 2) == total
    assert after["overheads"]["staff_payroll_pending"] == before["overheads"]["staff_payroll_pending"]

    summary = client.get("/api/finance/dashboard-summary", headers=admin).json()
    assert summary["payroll_total_all"] >= total
    assert summary["staff_overheads_paid"] >= total      # Overview cost/profit include salaries


def test_payroll_runs_are_tenant_scoped(client, admin):
    su = _login(client, SUPER)
    email = f"payroll_iso_{STAMP}@test.com"
    r = client.post("/api/tenants", headers=su, json={
        "name": f"PayrollIso_{STAMP}", "admin_email": email, "admin_name": "Iso Admin",
        "admin_password": "isotest123", "allowed_modules": ["projects", "finance"]})
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    try:
        iso = _login(client, {"email": email, "password": "isotest123"})
        default_run = _new_month_run(client, admin)
        # The other company cannot see or touch it
        assert default_run["id"] not in [x["id"] for x in client.get("/api/payroll-runs", headers=iso).json()]
        assert client.get(f"/api/payroll-runs/{default_run['id']}/entries", headers=iso).status_code == 404
        assert client.post(f"/api/payroll-runs/{default_run['id']}/process", headers=iso).status_code == 404

        # Processing the other company's own run only includes its own staff
        iso_run = _new_month_run(client, iso)
        client.post(f"/api/payroll-runs/{iso_run['id']}/process", headers=iso)
        names = [e.get("staff_name") or e.get("name") for e in
                 client.get(f"/api/payroll-runs/{iso_run['id']}/entries", headers=iso).json()]
        assert names == ["Iso Admin"], names
    finally:
        assert client.delete(f"/api/tenants/{tid}/permanent", headers=su).status_code == 200
