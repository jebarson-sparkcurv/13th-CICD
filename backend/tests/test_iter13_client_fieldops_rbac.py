"""Iteration 13 — Client Field Ops (read-only) RBAC + budget preview regression.

Tests:
- Client can GET /projects/1/employees & attendance (own project), fields masked
- Client GET /projects/3/employees → 403 (not own project)
- Client POST attendance/employees → 403
- Client GET /employees (org register) → 403
- SiteEngineer regression: 200 with wage fields VISIBLE
- Admin regression: unaffected
"""
import os
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

MASKED_FIELDS = ["daily_wage", "wage_type", "phone", "id_proof_type", "id_proof_number"]


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"No token in login response: {r.json()}"
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def client_hdr():
    return login("priya@skyline.com", "client123")


@pytest.fixture(scope="module")
def se_hdr():
    return login("raj@buildcore.com", "engineer123")


@pytest.fixture(scope="module")
def admin_hdr():
    return login("kesari4416@gmail.com", "admin123")


# ---------------- CLIENT RBAC ----------------
class TestClientFieldOpsRBAC:
    def test_client_get_own_project_employees_masked(self, client_hdr):
        r = requests.get(f"{API}/projects/1/employees", headers=client_hdr)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list) and len(data) > 0, "Expected employees on project 1"
        for emp in data:
            for f in MASKED_FIELDS:
                assert emp.get(f) is None, f"Field {f} should be masked for client, got {emp.get(f)}"

    def test_client_get_own_project_attendance(self, client_hdr):
        r = requests.get(f"{API}/projects/1/attendance", headers=client_hdr)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_client_get_other_project_employees_forbidden(self, client_hdr):
        r = requests.get(f"{API}/projects/3/employees", headers=client_hdr)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_client_post_attendance_forbidden(self, client_hdr):
        r = requests.post(
            f"{API}/projects/1/attendance",
            headers=client_hdr,
            json={"employee_id": 1, "date": "2026-01-15", "status": "P"},
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_client_post_employee_forbidden(self, client_hdr):
        r = requests.post(
            f"{API}/projects/1/employees",
            headers=client_hdr,
            json={"name": "TEST_client_emp", "role": "Mason", "daily_wage": 500, "wage_type": "daily"},
        )
        assert r.status_code == 403

    def test_client_get_org_register_forbidden(self, client_hdr):
        r = requests.get(f"{API}/employees", headers=client_hdr)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"


# ---------------- SE REGRESSION ----------------
class TestSiteEngineerRegression:
    def test_se_get_project_employees_visible(self, se_hdr):
        r = requests.get(f"{API}/projects/1/employees", headers=se_hdr)
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data) > 0
        # At least one employee should have wage fields populated (not masked)
        any_wage = any(e.get("daily_wage") is not None for e in data)
        assert any_wage, "SE should see wage fields — all are None (masked?)"

    def test_se_get_attendance(self, se_hdr):
        r = requests.get(f"{API}/projects/1/attendance", headers=se_hdr)
        assert r.status_code == 200


# ---------------- ADMIN REGRESSION ----------------
class TestAdminRegression:
    def test_admin_get_all(self, admin_hdr):
        r = requests.get(f"{API}/projects/1/employees", headers=admin_hdr)
        assert r.status_code == 200
        data = r.json()
        assert any(e.get("daily_wage") is not None for e in data)

    def test_admin_org_register(self, admin_hdr):
        r = requests.get(f"{API}/employees", headers=admin_hdr)
        assert r.status_code == 200


# ---------------- BUDGET / PROJECT CREATE ----------------
class TestBudgetCreate:
    def test_admin_create_and_delete_project(self, admin_hdr):
        payload = {
            "name": "TEST_iter13_budget",
            "client_id": 1,
            "location": "Test City",
            "budget": 250000000,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "status": "Ongoing",
        }
        r = requests.post(f"{API}/projects", headers=admin_hdr, json=payload)
        assert r.status_code in (200, 201), r.text
        pid = r.json().get("id")
        assert pid
        # Verify GET
        g = requests.get(f"{API}/projects/{pid}", headers=admin_hdr)
        assert g.status_code == 200
        assert float(g.json()["budget"]) == 250000000
        # Cleanup
        d = requests.delete(f"{API}/projects/{pid}", headers=admin_hdr)
        assert d.status_code in (200, 204)
