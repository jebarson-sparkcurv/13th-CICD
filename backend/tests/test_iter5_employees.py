"""Iteration 5 - Employees, Attendance, Labour Cost tests."""
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

CREDS = {
    "admin": ("kesari4416@gmail.com", "admin123"),
    "engineer": ("raj@buildcore.com", "engineer123"),
    "accountant": ("asha@buildcore.com", "accountant123"),
    "client": ("priya@skyline.com", "client123"),
    "vendor": ("vikram@apexsteel.com", "vendor123"),
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(*v) for k, v in CREDS.items()}


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------- Employees ----------
def test_list_employees_admin_p1(tokens):
    r = requests.get(f"{BASE_URL}/api/projects/1/employees", headers=H(tokens["admin"]))
    assert r.status_code == 200
    names = [e["name"] for e in r.json()]
    for n in ("Ramesh Kumar", "Suresh Yadav", "Deepak Singh", "Manoj Pal"):
        assert n in names, f"missing seeded employee {n} in {names}"


def test_client_and_vendor_forbidden(tokens):
    for role in ("client", "vendor"):
        r = requests.get(f"{BASE_URL}/api/projects/1/employees", headers=H(tokens[role]))
        assert r.status_code == 403, f"{role} got {r.status_code}"
        r2 = requests.get(f"{BASE_URL}/api/projects/1/attendance", headers=H(tokens[role]))
        assert r2.status_code == 403
        r3 = requests.get(f"{BASE_URL}/api/projects/1/labour-cost", headers=H(tokens[role]))
        assert r3.status_code == 403


def test_accountant_can_create_employee(tokens):
    body = {"name": "TEST_iter5_Acct", "role_title": "Helper",
            "wage_type": "daily", "daily_wage": 650,
            "joining_date": date.today().isoformat()}
    r = requests.post(f"{BASE_URL}/api/projects/1/employees", json=body,
                      headers=H(tokens["accountant"]))
    assert r.status_code == 201, r.text
    emp = r.json()
    assert emp["name"] == "TEST_iter5_Acct"
    assert emp["daily_wage"] == 650.0
    # cleanup: deactivate
    requests.post(f"{BASE_URL}/api/employees/{emp['id']}/deactivate",
                  headers=H(tokens["admin"]))


def test_cross_project_isolation(tokens):
    body = {"name": "TEST_iter5_iso", "wage_type": "daily", "daily_wage": 500}
    r = requests.post(f"{BASE_URL}/api/projects/1/employees", json=body,
                      headers=H(tokens["admin"]))
    assert r.status_code == 201
    eid = r.json()["id"]
    r2 = requests.get(f"{BASE_URL}/api/projects/2/employees", headers=H(tokens["admin"]))
    assert r2.status_code == 200
    assert eid not in [e["id"] for e in r2.json()]
    # project 2 seeded
    p2names = [e["name"] for e in r2.json()]
    assert "Ganesh Rao" in p2names and "Iqbal Khan" in p2names


def test_edit_and_deactivate(tokens):
    body = {"name": "TEST_iter5_edit", "wage_type": "daily", "daily_wage": 700}
    r = requests.post(f"{BASE_URL}/api/projects/1/employees", json=body,
                      headers=H(tokens["admin"]))
    eid = r.json()["id"]
    r2 = requests.patch(f"{BASE_URL}/api/employees/{eid}",
                        json={"daily_wage": 800, "role_title": "Foreman"},
                        headers=H(tokens["admin"]))
    assert r2.status_code == 200
    assert r2.json()["daily_wage"] == 800.0
    assert r2.json()["role_title"] == "Foreman"
    # mark attendance today then deactivate; history should remain
    today = date.today().isoformat()
    ra = requests.post(f"{BASE_URL}/api/projects/1/attendance",
                       json={"employee_id": eid, "attendance_date": today,
                             "status": "present"}, headers=H(tokens["admin"]))
    assert ra.status_code == 201
    rd = requests.post(f"{BASE_URL}/api/employees/{eid}/deactivate",
                       headers=H(tokens["admin"]))
    assert rd.status_code == 200 and rd.json()["status"] == "inactive"
    rh = requests.get(f"{BASE_URL}/api/employees/{eid}/attendance",
                      headers=H(tokens["admin"]))
    assert rh.status_code == 200 and len(rh.json()) >= 1


# ---------- Attendance upsert ----------
def test_attendance_upsert_no_duplicate(tokens):
    body = {"name": "TEST_iter5_ups", "wage_type": "daily", "daily_wage": 600}
    r = requests.post(f"{BASE_URL}/api/projects/1/employees", json=body,
                      headers=H(tokens["admin"]))
    eid = r.json()["id"]
    today = date.today().isoformat()
    r1 = requests.post(f"{BASE_URL}/api/projects/1/attendance",
                       json={"employee_id": eid, "attendance_date": today, "status": "present"},
                       headers=H(tokens["admin"]))
    assert r1.status_code == 201
    aid1 = r1.json()["id"]
    r2 = requests.post(f"{BASE_URL}/api/projects/1/attendance",
                       json={"employee_id": eid, "attendance_date": today, "status": "half_day"},
                       headers=H(tokens["admin"]))
    assert r2.status_code == 201
    assert r2.json()["id"] == aid1, "upsert should reuse same row id"
    assert r2.json()["status"] == "half_day"
    # verify only 1 row for employee today
    rl = requests.get(f"{BASE_URL}/api/projects/1/attendance",
                      params={"date_from": today, "date_to": today, "employee_id": eid},
                      headers=H(tokens["admin"]))
    assert rl.status_code == 200 and len(rl.json()) == 1


# ---------- Backdate window ----------
def test_engineer_backdate_beyond_3_days_rejected(tokens):
    # find any active seeded employee on p1
    r = requests.get(f"{BASE_URL}/api/projects/1/employees", headers=H(tokens["engineer"]))
    assert r.status_code == 200
    eid = next(e["id"] for e in r.json() if e["status"] == "active")
    old = (date.today() - timedelta(days=5)).isoformat()
    r2 = requests.post(f"{BASE_URL}/api/projects/1/attendance",
                       json={"employee_id": eid, "attendance_date": old, "status": "present"},
                       headers=H(tokens["engineer"]))
    assert r2.status_code == 422
    assert "3 days" in r2.text.lower() or "3" in r2.text


def test_admin_can_backdate_beyond_3_days(tokens):
    r = requests.get(f"{BASE_URL}/api/projects/1/employees", headers=H(tokens["admin"]))
    eid = next(e["id"] for e in r.json() if e["status"] == "active")
    old = (date.today() - timedelta(days=10)).isoformat()
    r2 = requests.post(f"{BASE_URL}/api/projects/1/attendance",
                       json={"employee_id": eid, "attendance_date": old, "status": "present"},
                       headers=H(tokens["admin"]))
    assert r2.status_code == 201, r2.text


def test_engineer_today_and_3days_back_allowed(tokens):
    r = requests.get(f"{BASE_URL}/api/projects/1/employees", headers=H(tokens["engineer"]))
    eid = next(e["id"] for e in r.json() if e["status"] == "active")
    for offset in (0, 3):
        d0 = (date.today() - timedelta(days=offset)).isoformat()
        r2 = requests.post(f"{BASE_URL}/api/projects/1/attendance",
                           json={"employee_id": eid, "attendance_date": d0, "status": "present"},
                           headers=H(tokens["engineer"]))
        assert r2.status_code == 201, f"offset {offset}: {r2.status_code} {r2.text}"


# ---------- Labour cost math ----------
def test_labour_cost_math(tokens):
    body = {"name": "TEST_iter5_lc", "wage_type": "daily", "daily_wage": 1000}
    r = requests.post(f"{BASE_URL}/api/projects/1/employees", json=body,
                      headers=H(tokens["admin"]))
    eid = r.json()["id"]
    today = date.today()
    # present, half_day, absent, leave over 4 days
    plan = [(0, "present"), (1, "half_day"), (2, "absent"), (3, "leave")]
    for off, st in plan:
        d0 = (today - timedelta(days=off)).isoformat()
        rr = requests.post(f"{BASE_URL}/api/projects/1/attendance",
                           json={"employee_id": eid, "attendance_date": d0, "status": st},
                           headers=H(tokens["admin"]))
        assert rr.status_code == 201, rr.text
    df = (today - timedelta(days=3)).isoformat()
    dt = today.isoformat()
    rl = requests.get(f"{BASE_URL}/api/projects/1/labour-cost",
                      params={"date_from": df, "date_to": dt},
                      headers=H(tokens["admin"]))
    assert rl.status_code == 200
    row = next(x for x in rl.json()["rows"] if x["employee_id"] == eid)
    assert row["days_present"] == 1.5, row
    assert row["amount"] == 1500.0, row


def test_labour_cost_accountant_ok(tokens):
    r = requests.get(f"{BASE_URL}/api/projects/1/labour-cost", headers=H(tokens["accountant"]))
    assert r.status_code == 200
    assert "total_amount" in r.json()
