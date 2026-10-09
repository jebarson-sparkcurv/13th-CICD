"""Tests for balance-sheet endpoints (iteration 12)."""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://portal-construction.preview.emergentagent.com"

CREDS = {
    "admin":      ("kesari4416@gmail.com", "admin123"),
    "accountant": ("asha@buildcore.com",   "accountant123"),
    "engineer":   ("raj@buildcore.com",    "engineer123"),
    "client":     ("priya@skyline.com",    "client123"),
}


def login(role):
    email, pw = CREDS[role]
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {role}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {login('admin')}"}


@pytest.fixture(scope="module")
def acc_h():
    return {"Authorization": f"Bearer {login('accountant')}"}


@pytest.fixture(scope="module")
def eng_h():
    return {"Authorization": f"Bearer {login('engineer')}"}


@pytest.fixture(scope="module")
def cli_h():
    return {"Authorization": f"Bearer {login('client')}"}


# ---------- Org balance sheet ----------
class TestOrgBalanceSheet:
    def test_admin_ok(self, admin_h):
        r = requests.get(f"{BASE}/api/finance/balance-sheet", headers=admin_h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("projects", "total_credit", "total_debit", "net",
                  "overall_profit", "overall_loss", "loss_projects", "employee_dues"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["projects"], list) and len(d["projects"]) > 0
        p0 = d["projects"][0]
        for k in ("project_id", "name", "budget", "credit", "debit", "breakdown", "profit_loss", "is_loss"):
            assert k in p0
        for k in ("staff_payroll", "labour_wages", "expenses", "procurement"):
            assert k in p0["breakdown"]
        # sorted losses first (ascending profit_loss)
        pls = [p["profit_loss"] for p in d["projects"]]
        assert pls == sorted(pls), "projects should be sorted losses-first"
        # employee_dues
        ed = d["employee_dues"]
        for k in ("staff_payroll_pending", "labour_by_category", "labour_total", "total_required"):
            assert k in ed
        assert isinstance(ed["labour_by_category"], list)
        # total_required = pending + labour_total
        assert abs(ed["total_required"] - (ed["staff_payroll_pending"] + ed["labour_total"])) < 0.5

    def test_accountant_ok(self, acc_h):
        r = requests.get(f"{BASE}/api/finance/balance-sheet", headers=acc_h, timeout=20)
        assert r.status_code == 200

    def test_engineer_forbidden(self, eng_h):
        r = requests.get(f"{BASE}/api/finance/balance-sheet", headers=eng_h, timeout=15)
        assert r.status_code == 403

    def test_client_forbidden(self, cli_h):
        r = requests.get(f"{BASE}/api/finance/balance-sheet", headers=cli_h, timeout=15)
        assert r.status_code == 403


# ---------- Project balance sheet ----------
class TestProjectBalanceSheet:
    def test_admin_ok(self, admin_h):
        r = requests.get(f"{BASE}/api/projects/1/balance-sheet", headers=admin_h, timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("project_id", "name", "budget", "client_paid", "client_outstanding",
                  "released", "total_released", "balance", "budget_remaining",
                  "entries", "total_credit", "total_debit"):
            assert k in d
        # balance = client_paid - total_released
        assert abs(d["balance"] - (d["client_paid"] - d["total_released"])) < 0.5
        # released breakdown categories
        for k in ("staff_payroll", "labour_wages", "expenses", "procurement"):
            assert k in d["released"]
        # entries sorted latest-first
        entries = d["entries"]
        assert isinstance(entries, list) and len(entries) > 0
        dates = [e["date"] for e in entries if e.get("date")]
        assert dates == sorted(dates, reverse=True), "entries not sorted latest-first"
        # includes at least one Labour wages entry (Project 1 has attendance)
        assert any("Labour wages" in e["description"] for e in entries), "no Labour wages entry present"
        # total_credit / total_debit consistency
        tc = round(sum(e["amount"] for e in entries if e["type"] == "credit"), 2)
        td = round(sum(e["amount"] for e in entries if e["type"] == "debit"), 2)
        assert abs(tc - d["total_credit"]) < 0.5
        assert abs(td - d["total_debit"]) < 0.5

    def test_engineer_ok(self, eng_h):
        r = requests.get(f"{BASE}/api/projects/1/balance-sheet", headers=eng_h, timeout=20)
        assert r.status_code == 200

    def test_client_forbidden(self, cli_h):
        r = requests.get(f"{BASE}/api/projects/1/balance-sheet", headers=cli_h, timeout=15)
        assert r.status_code == 403

    def test_project_not_found(self, admin_h):
        r = requests.get(f"{BASE}/api/projects/99999/balance-sheet", headers=admin_h, timeout=15)
        assert r.status_code == 404
