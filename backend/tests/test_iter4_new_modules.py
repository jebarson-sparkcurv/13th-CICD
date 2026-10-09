"""Iteration 4 backend tests — Finance, Users Admin, Clients total_billed, Bid Packages org-wide, Vendor Portal."""
import os
import sys
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin(): return _login("kesari4416@gmail.com", "admin123")


@pytest.fixture(scope="module")
def accountant(): return _login("asha@buildcore.com", "accountant123")


@pytest.fixture(scope="module")
def client_user(): return _login("priya@skyline.com", "client123")


@pytest.fixture(scope="module")
def vendor(): return _login("vikram@apexsteel.com", "vendor123")


# ------------ Clients: total_billed field ------------
def test_clients_include_total_billed(admin):
    r = requests.get(f"{API}/clients", headers=admin, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 1
    for c in data:
        assert "total_billed" in c, f"missing total_billed: {c}"
        assert isinstance(c["total_billed"], (int, float))
        assert "active_projects_count" in c or "project_count" in c


def test_clients_forbidden_for_client_role(client_user):
    r = requests.get(f"{API}/clients", headers=client_user, timeout=15)
    assert r.status_code == 403


# ------------ Bid Packages org-wide ------------
def test_bid_packages_orgwide_list(admin):
    r = requests.get(f"{API}/bid-packages", headers=admin, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        bp = data[0]
        for k in ("id", "title", "status", "project_id", "project_name", "bid_count", "line_item_count"):
            assert k in bp, f"missing {k}: {bp}"


def test_bid_packages_orgwide_forbidden_for_client(client_user):
    r = requests.get(f"{API}/bid-packages", headers=client_user, timeout=15)
    assert r.status_code == 403


# ------------ Finance: dashboard summary ------------
def test_finance_dashboard_summary(admin):
    r = requests.get(f"{API}/finance/dashboard-summary", headers=admin, timeout=15)
    assert r.status_code == 200
    data = r.json()
    # accept any of these key shapes
    keys = set(data.keys())
    assert keys, "empty summary"


def test_finance_dashboard_forbidden_engineer():
    hdr = _login("raj@buildcore.com", "engineer123")
    r = requests.get(f"{API}/finance/dashboard-summary", headers=hdr, timeout=15)
    assert r.status_code == 403


# ------------ Payroll flow ------------
def test_payroll_create_process_mark_paid(admin):
    # Create
    r = requests.post(f"{API}/payroll-runs", headers=admin,
                      json={"period_start": "2026-01-01", "period_end": "2026-01-15"}, timeout=15)
    assert r.status_code == 201, r.text
    run = r.json()
    run_id = run["id"]
    assert run["status"] == "Draft"

    # Process
    r2 = requests.post(f"{API}/payroll-runs/{run_id}/process", headers=admin, timeout=15)
    assert r2.status_code == 200, r2.text

    # Entries
    r3 = requests.get(f"{API}/payroll-runs/{run_id}/entries", headers=admin, timeout=15)
    assert r3.status_code == 200
    entries = r3.json()
    # entries may be empty if no employees seeded — accept both
    if entries:
        entry_id = entries[0]["id"]
        r4 = requests.post(f"{API}/payroll-entries/{entry_id}/mark-paid", headers=admin, timeout=15)
        assert r4.status_code == 200, r4.text


# ------------ Project Finance: invoice + payment + expense ------------
def test_project_finance_flow(admin):
    proj_id = 1
    # invoice
    r = requests.post(f"{API}/projects/{proj_id}/invoices", headers=admin,
                      json={"amount": 50000, "description": "TEST_iter4_invoice",
                            "due_date": "2026-06-01"}, timeout=15)
    assert r.status_code == 201, r.text
    inv = r.json()
    inv_id = inv["id"]

    # payment on invoice
    rp = requests.post(f"{API}/invoices/{inv_id}/payments", headers=admin,
                       json={"amount": 20000, "payment_date": "2026-05-01",
                             "method": "Bank Transfer"}, timeout=15)
    assert rp.status_code == 201, rp.text

    # GET invoice → verify payment
    rg = requests.get(f"{API}/invoices/{inv_id}", headers=admin, timeout=15)
    assert rg.status_code == 200
    inv2 = rg.json()
    assert float(inv2.get("paid_amount", 0)) >= 20000

    # expense
    re = requests.post(f"{API}/projects/{proj_id}/expenses", headers=admin,
                      json={"amount": 5000, "description": "TEST_iter4_expense",
                            "category": "Materials", "expense_date": "2026-05-01"}, timeout=15)
    assert re.status_code == 201, re.text

    # summary
    rs = requests.get(f"{API}/projects/{proj_id}/finance/summary", headers=admin, timeout=15)
    assert rs.status_code == 200


# ------------ Users Admin: full lifecycle ------------
def test_users_admin_lifecycle(admin):
    # list
    r = requests.get(f"{API}/users/all", headers=admin, timeout=15)
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list) and len(users) >= 5

    # role filter
    rf = requests.get(f"{API}/users/all", headers=admin, params={"role": "Client"}, timeout=15)
    assert rf.status_code == 200
    assert all(u["role"] == "Client" for u in rf.json())

    # create SiteEngineer
    import time
    email = f"test_iter4_{int(time.time())}@buildcore.com"
    rc = requests.post(f"{API}/users", headers=admin, json={
        "email": email, "name": "TEST Iter4 Eng", "password": "testpass1",
        "role": "SiteEngineer"}, timeout=15)
    assert rc.status_code == 201, rc.text
    uid = rc.json()["id"]

    # short password rejected
    rbad = requests.post(f"{API}/users", headers=admin, json={
        "email": f"bad_{email}", "name": "X", "password": "12345", "role": "SiteEngineer"}, timeout=15)
    assert rbad.status_code in (400, 422)

    # patch
    rp = requests.patch(f"{API}/users/{uid}", headers=admin, json={"name": "TEST Renamed"}, timeout=15)
    assert rp.status_code == 200
    assert rp.json()["name"] == "TEST Renamed"

    # disable
    rd = requests.post(f"{API}/users/{uid}/disable", headers=admin, timeout=15)
    assert rd.status_code == 200

    # login should fail after disable
    rl = requests.post(f"{API}/auth/login", json={"email": email, "password": "testpass1"}, timeout=15)
    assert rl.status_code in (401, 403)

    # re-enable
    re = requests.patch(f"{API}/users/{uid}", headers=admin, json={"status": "Active"}, timeout=15)
    assert re.status_code == 200

    # reset password
    new_pw = "newpass9"
    rr = requests.post(f"{API}/users/{uid}/reset-password", headers=admin,
                       json={"new_password": new_pw}, timeout=15)
    assert rr.status_code == 200, rr.text

    # login with new password
    rl2 = requests.post(f"{API}/auth/login", json={"email": email, "password": new_pw}, timeout=15)
    assert rl2.status_code == 200

    # assign to project 1
    ra = requests.post(f"{API}/projects/1/assignments", headers=admin,
                      json={"user_id": uid, "role_on_project": "SiteEngineer"}, timeout=15)
    assert ra.status_code == 201, ra.text

    # list assignments
    rla = requests.get(f"{API}/projects/1/assignments", headers=admin, timeout=15)
    assert rla.status_code == 200
    assert any(a["user_id"] == uid for a in rla.json())

    # delete user (cleanup)
    rdel = requests.delete(f"{API}/users/{uid}", headers=admin, timeout=15)
    assert rdel.status_code in (200, 204)


def test_users_admin_forbidden_for_non_admin(accountant):
    r = requests.get(f"{API}/users/all", headers=accountant, timeout=15)
    assert r.status_code == 403


# ------------ Vendor portal ------------
def test_vendor_portal_packages(vendor):
    r = requests.get(f"{API}/vendor/bid-packages", headers=vendor, timeout=15)
    assert r.status_code == 200
    pkgs = r.json()
    assert isinstance(pkgs, list)
    assert len(pkgs) >= 1, "vendor vikram should be invited to at least 1 package"
    bp_id = pkgs[0]["id"]

    # detail
    rd = requests.get(f"{API}/vendor/bid-packages/{bp_id}", headers=vendor, timeout=15)
    assert rd.status_code == 200
    detail = rd.json()
    assert "line_items" in detail
    line_items = detail["line_items"]

    # submit quote (skip if package closed / no line items)
    if detail.get("status") in ("Open", "Draft") and line_items:
        quotes = [{"bid_line_item_id": li["id"], "unit_price": 100.0,
                   "quantity_offered": li.get("quantity", 1), "lead_time_days": 7}
                  for li in line_items]
        rq = requests.post(f"{API}/vendor/bid-packages/{bp_id}/quote", headers=vendor,
                           json={"notes": "TEST_iter4 quote", "quotes": quotes}, timeout=15)
        assert rq.status_code == 201, rq.text
        assert float(rq.json().get("amount", 0)) > 0

        # re-submit (upsert)
        rq2 = requests.post(f"{API}/vendor/bid-packages/{bp_id}/quote", headers=vendor,
                            json={"notes": "TEST_iter4 quote v2", "quotes": quotes}, timeout=15)
        assert rq2.status_code == 201


def test_vendor_cannot_access_admin_endpoints(vendor):
    r = requests.get(f"{API}/bid-packages", headers=vendor, timeout=15)
    assert r.status_code == 403


# ------------ Role gating for /auth/me ------------
def test_accountant_can_access_finance(accountant):
    r = requests.get(f"{API}/finance/dashboard-summary", headers=accountant, timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/clients", headers=accountant, timeout=15)
    assert r2.status_code == 200


def test_client_cannot_access_finance(client_user):
    r = requests.get(f"{API}/finance/dashboard-summary", headers=client_user, timeout=15)
    assert r.status_code == 403
