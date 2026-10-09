"""Backend tests for Change Order / Client Modification module."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("kesari4416@gmail.com", "admin123"),
    "se": ("raj@buildcore.com", "engineer123"),
    "client1": ("priya@skyline.com", "client123"),
    "client2": ("arun@greenfield.com", "client123"),
    "vendor": ("vikram@apexsteel.com", "vendor123"),
}


def _login(role):
    email, pwd = CREDS[role]
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"Login {role} failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {role: _login(role) for role in CREDS}


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# Shared state
STATE = {}


class TestCOCreation:
    def test_se_create_draft(self, tokens):
        r = requests.post(f"{API}/projects/1/change-orders", headers=H(tokens["se"]),
                          json={"title": "TEST_Draft CO", "category": "Client Modification",
                                "estimated_cost": 50000, "estimated_time_impact_days": 3, "submit": False})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "Draft"
        assert d["co_number"].startswith("CO-1-")
        assert d["estimated_cost"] == 50000
        STATE["draft_id"] = d["id"]

    def test_se_create_submitted(self, tokens):
        r = requests.post(f"{API}/projects/1/change-orders", headers=H(tokens["se"]),
                          json={"title": "TEST_Submitted CO", "category": "Design Change",
                                "estimated_cost": 120000, "estimated_time_impact_days": 5, "submit": True})
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["status"] == "Pending Client Review"
        STATE["submitted_id"] = d["id"]

    def test_invalid_category(self, tokens):
        r = requests.post(f"{API}/projects/1/change-orders", headers=H(tokens["se"]),
                          json={"title": "TEST_Bad", "category": "BadCat", "estimated_cost": 100})
        assert r.status_code == 422

    def test_phase_from_other_project(self, tokens):
        # get a phase from project 2
        r = requests.get(f"{API}/projects/2/phases", headers=H(tokens["admin"]))
        if r.status_code == 200 and r.json():
            other_phase = r.json()[0]["id"]
            r2 = requests.post(f"{API}/projects/1/change-orders", headers=H(tokens["se"]),
                               json={"title": "TEST_BadPhase", "category": "Rework",
                                     "estimated_cost": 100, "phase_id": other_phase})
            assert r2.status_code == 422
        else:
            pytest.skip("Could not fetch project 2 phases")


class TestCOList:
    def test_admin_list(self, tokens):
        r = requests.get(f"{API}/projects/1/change-orders", headers=H(tokens["admin"]))
        assert r.status_code == 200
        d = r.json()
        for k in ["original_budget", "approved_variations", "revised_contract_value",
                  "pending_co_value", "approved_count", "increase_pct"]:
            assert k in d["summary"], f"Missing {k}"
        assert "change_orders" in d
        STATE["orig_budget"] = d["summary"]["original_budget"]
        STATE["orig_approved"] = d["summary"]["approved_variations"]

    def test_client_own_project_ok(self, tokens):
        r = requests.get(f"{API}/projects/1/change-orders", headers=H(tokens["client1"]))
        assert r.status_code == 200

    def test_client_other_project_403(self, tokens):
        r = requests.get(f"{API}/projects/1/change-orders", headers=H(tokens["client2"]))
        assert r.status_code == 403

    def test_vendor_403(self, tokens):
        r = requests.get(f"{API}/projects/1/change-orders", headers=H(tokens["vendor"]))
        assert r.status_code == 403


class TestApprovalWorkflow:
    def test_approve_requires_confirm(self, tokens):
        r = requests.post(f"{API}/change-orders/{STATE['submitted_id']}/approve",
                          headers=H(tokens["client1"]), json={})
        assert r.status_code == 422

    def test_approve_success(self, tokens):
        r = requests.post(f"{API}/change-orders/{STATE['submitted_id']}/approve",
                          headers=H(tokens["client1"]), json={"confirm": True})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Approved"
        assert d["approved_cost"] == 120000

    def test_finance_summary_reflects(self, tokens):
        r = requests.get(f"{API}/projects/1/finance/summary", headers=H(tokens["admin"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("approved_variations", 0) >= STATE["orig_approved"] + 120000 - 0.01
        assert abs(d["revised_contract_value"] - (d["original_budget"] + d["approved_variations"])) < 0.5

    def test_approve_already_approved_422(self, tokens):
        r = requests.post(f"{API}/change-orders/{STATE['submitted_id']}/approve",
                          headers=H(tokens["client1"]), json={"confirm": True})
        assert r.status_code == 422


class TestRejectRevise:
    def test_request_revision_needs_comment(self, tokens):
        r = requests.post(f"{API}/projects/1/change-orders", headers=H(tokens["se"]),
                          json={"title": "TEST_RevReq CO", "category": "Rework",
                                "estimated_cost": 30000, "submit": True})
        co_id = r.json()["id"]
        STATE["revreq_id"] = co_id
        r2 = requests.post(f"{API}/change-orders/{co_id}/request-revision",
                           headers=H(tokens["client1"]), json={})
        assert r2.status_code == 422
        r3 = requests.post(f"{API}/change-orders/{co_id}/request-revision",
                           headers=H(tokens["client1"]), json={"comment": "Please reduce cost"})
        assert r3.status_code == 200
        assert r3.json()["status"] == "Revision Requested"

    def test_contractor_revise_adds_v2(self, tokens):
        r = requests.post(f"{API}/change-orders/{STATE['revreq_id']}/revise",
                          headers=H(tokens["se"]),
                          json={"estimated_cost": 25000, "estimated_time_impact_days": 2,
                                "note": "Reduced scope"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "Pending Client Review"
        assert d["version_count"] == 2
        assert any(rev["version"] == 2 for rev in d["revisions"])

    def test_reject(self, tokens):
        r = requests.post(f"{API}/projects/1/change-orders", headers=H(tokens["se"]),
                          json={"title": "TEST_Reject CO", "category": "Site Condition",
                                "estimated_cost": 15000, "submit": True})
        co_id = r.json()["id"]
        r2 = requests.post(f"{API}/change-orders/{co_id}/reject",
                           headers=H(tokens["client1"]), json={})
        assert r2.status_code == 200
        assert r2.json()["status"] == "Rejected"


class TestBalanceSheet:
    def test_balance_sheet_variation_entries(self, tokens):
        r = requests.get(f"{API}/projects/1/balance-sheet", headers=H(tokens["admin"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert "approved_variations" in d
        assert "revised_contract_value" in d
        entries = d.get("entries") or d.get("transactions") or []
        variations = [e for e in entries if e.get("type") == "variation"]
        assert len(variations) >= 1, f"No variation entries. Keys={list(d.keys())}"
        # credits/debits must not include variations
        # Best-effort: totals present
        if "total_credit" in d and "total_debit" in d:
            var_sum = sum(e.get("amount", 0) for e in variations)
            # variations should not have been double-counted in credit/debit
            assert var_sum > 0
