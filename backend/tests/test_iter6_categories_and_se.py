"""Iteration 6 — Employee Categories + Site Engineer restrictions + full flow.
Runs sequentially (no xdist) to preserve intra-class ordering.
"""
import os
import time
from datetime import date
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE}/api"

CREDS = {
    "admin": ("kesari4416@gmail.com", "admin123"),
    "raj": ("raj@buildcore.com", "engineer123"),
    "neha": ("neha@buildcore.com", "engineer123"),
    "acct": ("asha@buildcore.com", "accountant123"),
    "client": ("priya@skyline.com", "client123"),
    "vendor": ("vikram@apexsteel.com", "vendor123"),
}


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=10)
    assert r.status_code == 200, f"{email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(e, p) for k, (e, p) in CREDS.items()}


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def uniq(prefix):
    return f"TEST_iter6_{prefix}_{int(time.time() * 1000)}"


# ---------- Section 4 Categories ----------

class TestCategories:
    def test_admin_list_seeded(self, tokens):
        r = requests.get(f"{API}/employee-categories", headers=H(tokens["admin"]))
        assert r.status_code == 200
        names = [c["name"].lower() for c in r.json()]
        assert "mason" in names, f"Seeded categories missing: {names}"

    def test_client_403(self, tokens):
        assert requests.get(f"{API}/employee-categories", headers=H(tokens["client"])).status_code == 403

    def test_vendor_403(self, tokens):
        assert requests.get(f"{API}/employee-categories", headers=H(tokens["vendor"])).status_code == 403

    def test_se_create_and_dedup_and_deactivate(self, tokens):
        name = uniq("cat_se")
        # SE can create
        r = requests.post(f"{API}/employee-categories", headers=H(tokens["raj"]),
                          json={"name": name, "default_wage_type": "daily"})
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        assert r.json()["default_wage_type"] == "daily"
        assert r.json()["is_active"] is True

        # duplicate case-insensitive
        r2 = requests.post(f"{API}/employee-categories", headers=H(tokens["admin"]),
                           json={"name": name.upper()})
        assert r2.status_code == 409, r2.text

        # SE cannot deactivate
        assert requests.post(f"{API}/employee-categories/{cid}/deactivate",
                             headers=H(tokens["raj"])).status_code == 403

        # Accountant can deactivate
        r3 = requests.post(f"{API}/employee-categories/{cid}/deactivate",
                          headers=H(tokens["acct"]))
        assert r3.status_code == 200
        assert r3.json()["is_active"] is False

        # hidden from default list
        r4 = requests.get(f"{API}/employee-categories", headers=H(tokens["admin"]))
        assert cid not in [c["id"] for c in r4.json()]
        # visible with include_inactive
        r5 = requests.get(f"{API}/employee-categories?include_inactive=true",
                          headers=H(tokens["admin"]))
        assert cid in [c["id"] for c in r5.json()]


# ---------- Section 4 employee ↔ category link ----------

class TestEmployeeCategoryLink:
    def test_create_and_patch(self, tokens):
        cats = requests.get(f"{API}/employee-categories", headers=H(tokens["admin"])).json()
        mason = next(c for c in cats if c["name"].lower() == "mason")
        alt = next(c for c in cats if c["id"] != mason["id"])

        # create with category
        r = requests.post(f"{API}/projects/1/employees", headers=H(tokens["admin"]),
                          json={"name": uniq("link"), "category_id": mason["id"],
                                "daily_wage": 950})
        assert r.status_code == 201, r.text
        emp = r.json()
        assert emp["category_id"] == mason["id"]
        assert emp["role_title"] == mason["name"]
        if mason["default_wage_type"]:
            assert emp["wage_type"] == mason["default_wage_type"]

        # invalid category
        r2 = requests.post(f"{API}/projects/1/employees", headers=H(tokens["admin"]),
                           json={"name": uniq("bad"), "category_id": 999999})
        assert r2.status_code == 422

        # patch category
        r3 = requests.patch(f"{API}/employees/{emp['id']}", headers=H(tokens["admin"]),
                            json={"category_id": alt["id"]})
        assert r3.status_code == 200
        assert r3.json()["category_id"] == alt["id"]
        assert r3.json()["role_title"] == alt["name"]

        # cleanup
        requests.post(f"{API}/employees/{emp['id']}/deactivate", headers=H(tokens["admin"]))


# ---------- Section 5 Access Rules ----------

class TestSEAccess:
    def test_se_403_on_unassigned_project(self, tokens):
        assert requests.get(f"{API}/projects/4/employees",
                            headers=H(tokens["raj"])).status_code == 403
        assert requests.post(f"{API}/projects/4/employees", headers=H(tokens["raj"]),
                             json={"name": "TEST_denied"}).status_code == 403
        assert requests.get(f"{API}/projects/4/attendance",
                            headers=H(tokens["raj"])).status_code == 403

    def test_se_200_on_assigned(self, tokens):
        for pid in (1, 3, 5):
            r = requests.get(f"{API}/projects/{pid}/employees", headers=H(tokens["raj"]))
            assert r.status_code == 200, f"p{pid} => {r.status_code}"

    def test_se_wage_and_deactivate_gating(self, tokens):
        # create test employee via admin
        r = requests.post(f"{API}/projects/1/employees", headers=H(tokens["admin"]),
                          json={"name": uniq("segate"), "daily_wage": 900, "wage_type": "daily"})
        assert r.status_code == 201
        emp_id = r.json()["id"]

        # SE cannot patch wage fields
        for field in ({"daily_wage": 1200}, {"wage_type": "monthly"}, {"status": "inactive"}):
            r = requests.patch(f"{API}/employees/{emp_id}", headers=H(tokens["raj"]), json=field)
            assert r.status_code == 403, f"{field} => {r.status_code}"

        # SE can patch non-wage
        r = requests.patch(f"{API}/employees/{emp_id}", headers=H(tokens["raj"]),
                           json={"phone": "9998887777"})
        assert r.status_code == 200
        assert r.json()["phone"] == "9998887777"

        # SE cannot deactivate
        assert requests.post(f"{API}/employees/{emp_id}/deactivate",
                             headers=H(tokens["raj"])).status_code == 403

        # Accountant can deactivate
        r = requests.post(f"{API}/employees/{emp_id}/deactivate", headers=H(tokens["acct"]))
        assert r.status_code == 200
        assert r.json()["status"] == "inactive"

        # Admin reactivate
        r = requests.patch(f"{API}/employees/{emp_id}", headers=H(tokens["admin"]),
                           json={"status": "active"})
        assert r.status_code == 200
        assert r.json()["status"] == "active"

        # final cleanup
        requests.post(f"{API}/employees/{emp_id}/deactivate", headers=H(tokens["admin"]))


# ---------- FULL FLOW ----------

class TestFullFlow:
    def test_full_chain(self, tokens):
        cat_name = uniq("flow")
        # 1. admin creates category
        r = requests.post(f"{API}/employee-categories", headers=H(tokens["admin"]),
                          json={"name": cat_name, "default_wage_type": "daily"})
        assert r.status_code == 201, r.text
        cat_id = r.json()["id"]

        # 2. SE sees the category
        cats = requests.get(f"{API}/employee-categories", headers=H(tokens["raj"])).json()
        assert any(c["id"] == cat_id for c in cats), "SE cannot see admin category"

        # 3. SE creates employee on assigned project 1 with this category
        r = requests.post(f"{API}/projects/1/employees", headers=H(tokens["raj"]),
                          json={"name": uniq("flowemp"), "category_id": cat_id,
                                "daily_wage": 800})
        assert r.status_code == 201, r.text
        emp = r.json()
        assert emp["role_title"] == cat_name
        assert emp["wage_type"] == "daily"
        emp_id = emp["id"]

        # 4. SE marks attendance today
        today = date.today().isoformat()
        r = requests.post(f"{API}/projects/1/attendance", headers=H(tokens["raj"]),
                          json={"employee_id": emp_id, "status": "present",
                                "attendance_date": today})
        assert r.status_code == 201, r.text

        # 5. Admin sees attendance
        r = requests.get(f"{API}/projects/1/attendance?date_from={today}"
                         f"&date_to={today}&employee_id={emp_id}",
                         headers=H(tokens["admin"]))
        assert r.status_code == 200
        rows = r.json()
        assert any(a["employee_id"] == emp_id and a["status"] == "present" for a in rows), \
            f"Admin can't see SE-marked attendance: {rows}"

        # 6. Labour cost includes new employee
        r = requests.get(f"{API}/projects/1/labour-cost?date_from={today}&date_to={today}",
                         headers=H(tokens["admin"]))
        assert r.status_code == 200
        data = r.json()
        row = next((r for r in data["rows"] if r["employee_id"] == emp_id), None)
        assert row is not None, "New employee missing from labour cost"
        assert row["days_present"] == 1.0
        assert row["amount"] == 800.0
        assert row["role_title"] == cat_name

        # cleanup
        requests.post(f"{API}/employees/{emp_id}/deactivate", headers=H(tokens["admin"]))
        requests.post(f"{API}/employee-categories/{cat_id}/deactivate",
                      headers=H(tokens["admin"]))


# ---------- Regression smoke ----------

class TestRegression:
    def test_admin_lists_p1_employees(self, tokens):
        r = requests.get(f"{API}/projects/1/employees", headers=H(tokens["admin"]))
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_labour_cost_still_works(self, tokens):
        r = requests.get(f"{API}/projects/1/labour-cost", headers=H(tokens["admin"]))
        assert r.status_code == 200
        assert "rows" in r.json() and "total_amount" in r.json()

    def test_client_still_403_on_employees(self, tokens):
        assert requests.get(f"{API}/projects/1/employees",
                            headers=H(tokens["client"])).status_code == 403
