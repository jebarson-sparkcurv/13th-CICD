"""Iteration 11: Test new features FINANCE_004, VENDORS_001, FIELDOPS_001, PROJECT_002."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "kesari4416@gmail.com", "password": "admin123"}
SE_RAJ = {"email": "raj@buildcore.com", "password": "engineer123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"Login failed {r.status_code}: {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def se():
    return _login(SE_RAJ)


# ---------------- FINANCE_004 ----------------
class TestFinance004:
    def test_finance_summary_profit_last_year(self, admin):
        r = admin.get(f"{BASE_URL}/api/projects/1/finance/summary")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "profit_last_year" in data, f"missing profit_last_year in {list(data.keys())}"
        assert "revenue_last_year" in data
        assert "cost_last_year" in data
        # verify math
        assert abs(data["profit_last_year"] - (data["revenue_last_year"] - data["cost_last_year"])) < 0.01


# ---------------- PROJECT_002 ----------------
class TestProjectLedger:
    @pytest.mark.parametrize("pid", [1, 2, 3])
    def test_ledger(self, admin, pid):
        r = admin.get(f"{BASE_URL}/api/projects/{pid}/ledger")
        assert r.status_code == 200, f"pid={pid}: {r.status_code} {r.text}"
        data = r.json()
        assert "entries" in data
        assert "total_credit" in data
        assert "total_debit" in data
        assert "net" in data
        entries = data["entries"]
        assert isinstance(entries, list)
        assert len(entries) > 0, f"project {pid} has no ledger entries"
        # verify net = credit - debit
        assert abs(data["net"] - (data["total_credit"] - data["total_debit"])) < 0.01
        # verify has both credits and debits
        types = {e.get("type") for e in entries}
        assert "credit" in types, f"no credit entries in project {pid}"
        assert "debit" in types, f"no debit entries in project {pid}"


# ---------------- VENDORS_001 ----------------
class TestVendorCreate:
    def test_create_and_list_vendor(self, admin):
        payload = {
            "name": f"TEST_V_{int(time.time())}",
            "type": "material_supplier",
            "trade": "steel",
            "insurance_expiry": "2026-12-31",
        }
        r = admin.post(f"{BASE_URL}/api/vendors", json=payload)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
        vendor = r.json()
        assert vendor["name"] == payload["name"]
        vid = vendor.get("id")
        assert vid
        # verify list
        r2 = admin.get(f"{BASE_URL}/api/vendors")
        assert r2.status_code == 200
        names = [v["name"] for v in r2.json()]
        assert payload["name"] in names


# ---------------- FIELDOPS_001 ----------------
class TestFieldOps001:
    def test_org_wide_employee_and_phase_assignment(self, admin):
        # 1. Create org-wide employee (no project_id)
        emp_payload = {
            "name": f"TEST_EMP_{int(time.time())}",
            "role": "carpenter",
            "daily_wage": 800,
            "phone": "9999900000",
        }
        r = admin.post(f"{BASE_URL}/api/employees", json=emp_payload)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"
        emp = r.json()
        emp_id = emp["id"]

        # 2. Verify GET /api/employees returns assigned_projects
        r = admin.get(f"{BASE_URL}/api/employees")
        assert r.status_code == 200
        found = next((e for e in r.json() if e["id"] == emp_id), None)
        assert found is not None, "created employee not in list"
        assert "assigned_projects" in found or "phase_assignments" in found, \
            f"missing assigned_projects/phase_assignments; keys={list(found.keys())}"

        # 3. Get phases for project 1
        r = admin.get(f"{BASE_URL}/api/projects/1/phases")
        assert r.status_code == 200, r.text
        phases = r.json()
        assert len(phases) > 0
        phase_id = phases[0]["id"]

        # 4. Assign employee to phase
        r = admin.post(f"{BASE_URL}/api/phases/{phase_id}/employees", json={"employee_id": emp_id})
        assert r.status_code in (200, 201), f"phase assign failed: {r.status_code}: {r.text}"

        # 5. Duplicate assignment → 409
        r = admin.post(f"{BASE_URL}/api/phases/{phase_id}/employees", json={"employee_id": emp_id})
        assert r.status_code == 409, f"expected 409 duplicate, got {r.status_code}: {r.text}"

        # 6. GET phase employees list
        r = admin.get(f"{BASE_URL}/api/phases/{phase_id}/employees")
        assert r.status_code == 200
        assert any((e.get("employee_id") or e.get("id")) == emp_id for e in r.json())

        # 7. Employee should now appear in project 1's employees list (union)
        r = admin.get(f"{BASE_URL}/api/projects/1/employees")
        assert r.status_code == 200
        assert any(e["id"] == emp_id for e in r.json()), "phase-assigned emp not in project employees union"

        # 8. Attendance for phase-member → 201
        from datetime import date
        att_payload = {
            "employee_id": emp_id,
            "date": date.today().isoformat(),
            "status": "present",
        }
        r = admin.post(f"{BASE_URL}/api/projects/1/attendance", json=att_payload)
        assert r.status_code in (200, 201), f"attendance failed: {r.status_code}: {r.text}"

        # 9. Attendance for NON-member emp on project (project 4 where no phase) → 422
        # Try posting attendance for our emp to project 2 where they're not assigned
        r = admin.post(f"{BASE_URL}/api/projects/2/attendance", json=att_payload)
        assert r.status_code == 422, f"expected 422 for non-member, got {r.status_code}: {r.text}"

        # 10. Unassign → 204
        r = admin.delete(f"{BASE_URL}/api/phases/{phase_id}/employees/{emp_id}")
        assert r.status_code in (200, 204), f"unassign failed: {r.status_code}: {r.text}"

        # 11. Verify removal from project employees
        r = admin.get(f"{BASE_URL}/api/projects/1/employees")
        assert r.status_code == 200
        assert not any(e["id"] == emp_id for e in r.json()), "emp still in project after unassign"


# ---------------- Regression ----------------
class TestRegression:
    def test_project_scoped_employee_create(self, admin):
        payload = {
            "name": f"TEST_LEG_{int(time.time())}",
            "role": "labourer",
            "daily_wage": 600,
        }
        r = admin.post(f"{BASE_URL}/api/projects/1/employees", json=payload)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text}"

    def test_se_forbidden_project4(self, se):
        r = se.get(f"{BASE_URL}/api/projects/4/employees")
        assert r.status_code == 403, f"expected 403, got {r.status_code}"

    def test_se_wage_patch_forbidden(self, se):
        # get an employee id from raj's assigned project
        r = se.get(f"{BASE_URL}/api/projects/1/employees")
        assert r.status_code == 200
        emps = r.json()
        if not emps:
            pytest.skip("no employees to test patch")
        emp_id = emps[0]["id"]
        r = se.patch(f"{BASE_URL}/api/employees/{emp_id}", json={"daily_wage": 5000})
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
