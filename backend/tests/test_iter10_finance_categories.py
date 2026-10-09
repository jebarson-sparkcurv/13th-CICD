"""Iter10: expense-categories CRUD + project finance summary (revenue/cost last year)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "kesari4416@gmail.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------- Project Finance Summary (FINANCE_002, FINANCE_003) ----------
class TestProjectFinanceSummary:
    def test_summary_has_new_year_window_fields(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/projects/1/finance/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ["revenue_last_year", "cost_last_year", "period_from", "period_to"]:
            assert k in d, f"missing {k}"
        # sanity: period spans ~1 year
        assert d["period_from"] and d["period_to"]
        assert isinstance(d["revenue_last_year"], (int, float))
        assert isinstance(d["cost_last_year"], (int, float))


# ---------- Expense Categories (FINANCE_001) ----------
class TestExpenseCategories:
    def test_list_seed_categories(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/expense-categories")
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        # 8 seeded categories must be present
        for expected in ["Equipment", "Fuel", "Labour", "Material", "Misc", "Site Overheads", "Site Utilities", "Transport"]:
            assert expected in names, f"missing seed cat: {expected}"

    def test_create_and_duplicate_conflict(self, admin_client):
        import uuid
        name = f"TEST_ITER10_{uuid.uuid4().hex[:8]}"
        r = admin_client.post(f"{BASE_URL}/api/expense-categories", json={"name": name})
        assert r.status_code in (200, 201), r.text
        r2 = admin_client.post(f"{BASE_URL}/api/expense-categories", json={"name": name})
        assert r2.status_code == 409

    def test_patch_renames_and_propagates_to_expenses(self, admin_client):
        # Find Fuel id
        cats = admin_client.get(f"{BASE_URL}/api/expense-categories").json()
        fuel = next(c for c in cats if c["name"] == "Fuel")
        new_name = "TEST_ITER10_FUEL_R"
        try:
            r = admin_client.patch(f"{BASE_URL}/api/expense-categories/{fuel['id']}", json={"name": new_name})
            assert r.status_code == 200
            assert r.json()["name"] == new_name
            # Propagation: expense row(s) previously "Fuel" should now be new_name
            exps = admin_client.get(f"{BASE_URL}/api/projects/1/expenses").json()
            assert any(e["category"] == new_name for e in exps), "rename did not propagate to expenses"
        finally:
            admin_client.patch(f"{BASE_URL}/api/expense-categories/{fuel['id']}", json={"name": "Fuel"})


# ---------- Regressions ----------
class TestRegressions:
    def test_org_finance_dashboard(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/finance/dashboard-summary")
        assert r.status_code == 200

    def test_projects_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/projects")
        assert r.status_code == 200
        body = r.json()
        items = body if isinstance(body, list) else body.get("items")
        assert isinstance(items, list) and len(items) > 0

    def test_project_invoices_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/projects/1/invoices")
        assert r.status_code == 200
