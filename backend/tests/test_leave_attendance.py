"""Staff Leave & Attendance — end-to-end API tests.

Run:  cd backend && pytest tests/test_leave_attendance.py -n 0 -v
"""
import os
import sys
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import pytest
from fastapi.testclient import TestClient

from app.main import app

SUPER = {"email": os.environ.get("SUPERADMIN_EMAIL", "ponish.jino@sparkcurv.com"),
         "password": os.environ.get("SUPERADMIN_PASSWORD", "superadmin123")}
STAMP = str(int(time.time() * 1000))[-8:]
TODAY = datetime.now(ZoneInfo("Asia/Kolkata")).date()


def _next_weekday(d: date, n: int = 1) -> date:
    """n-th Mon–Sat day after d."""
    while n:
        d += timedelta(days=1)
        if d.weekday() != 6:
            n -= 1
    return d


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin(client):
    """Everything runs in a throw-away test company, so your real data,
    payroll and balance sheet are never touched. Deleted at the end."""
    su = _login(client, SUPER["email"], SUPER["password"])
    email = f"la_admin_{STAMP}@test.com"
    r = client.post("/api/tenants", headers=su, json={
        "name": f"LeaveTest_{STAMP}", "admin_email": email, "admin_name": "Test Admin",
        "admin_password": "admin123", "allowed_modules": ["projects", "finance", "leave_attendance"]})
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    yield _login(client, email, "admin123")
    assert client.delete(f"/api/tenants/{tid}/permanent", headers=su).status_code == 200


@pytest.fixture(scope="module")
def staff(client, admin):
    email = f"staff_{STAMP}@test.com"
    r = client.post("/api/users", headers=admin, json={
        "name": f"Staff {STAMP}", "email": email, "password": "staff123",
        "role": "SiteEngineer", "base_salary": 30000})
    assert r.status_code == 201, r.text
    uid = r.json()["id"]
    yield {"id": uid, "headers": _login(client, email, "staff123")}
    # (the whole test company is deleted by the admin fixture)


def test_admin_cannot_apply(client, admin):
    r = client.post("/api/me/leave", headers=admin, json={"leave_type": "Casual", "start_date": str(TODAY)})
    assert r.status_code == 403


def test_default_balances(client, staff):
    data = client.get("/api/me/leave", headers=staff["headers"]).json()
    b = {x["leave_type"]: x for x in data["balances"]}
    assert b["Casual"]["quota"] == 12 and b["Sick"]["quota"] == 12 and b["Earned"]["quota"] == 15
    assert b["Unpaid"]["quota"] is None and b["Unpaid"]["is_paid"] is False


def test_check_in_out(client, staff):
    h = staff["headers"]
    r = client.post("/api/me/attendance/check-in", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "present" and r.json()["check_in"]
    assert client.post("/api/me/attendance/check-in", headers=h).status_code == 409
    r = client.post("/api/me/attendance/check-out", headers=h)
    assert r.status_code == 200 and r.json()["check_out"]
    assert client.post("/api/me/attendance/check-out", headers=h).status_code == 409
    assert client.get("/api/me/attendance", headers=h).json()["today"]["check_out"]


def test_apply_approve_writes_leave_and_balance(client, admin, staff):
    h = staff["headers"]
    d1 = _next_weekday(TODAY, 10)
    d2 = _next_weekday(d1, 1)
    r = client.post("/api/me/leave", headers=h, json={"leave_type": "Casual", "start_date": str(d1),
                                                     "end_date": str(d2), "reason": "Family function"})
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["status"] == "Pending" and req["days"] == 2
    # Overlap rejected
    assert client.post("/api/me/leave", headers=h, json={"leave_type": "Sick", "start_date": str(d2)}).status_code == 409
    # Admin sees it
    lst = client.get("/api/leave/requests", headers=admin, params={"status": "Pending"}).json()
    assert req["id"] in [x["id"] for x in lst["requests"]]
    r = client.post(f"/api/leave/requests/{req['id']}/approve", headers=admin, json={"note": "OK"})
    assert r.status_code == 200 and r.json()["status"] == "Approved"
    b = {x["leave_type"]: x for x in client.get("/api/me/leave", headers=h).json()["balances"]}
    assert b["Casual"]["used"] == 2 and b["Casual"]["remaining"] == 10
    # Attendance rows written and locked
    month = f"{d1:%Y-%m}"
    grid = client.get("/api/staff-attendance", headers=admin, params={"month": month}).json()
    me = next(p for p in grid["staff"] if p["id"] == staff["id"])
    assert me["records"][str(d1)]["status"] == "leave"
    # Cancel approved → rows removed
    assert client.post(f"/api/leave/requests/{req['id']}/cancel", headers=admin).status_code == 200
    grid = client.get("/api/staff-attendance", headers=admin, params={"month": month}).json()
    me = next(p for p in grid["staff"] if p["id"] == staff["id"])
    assert str(d1) not in me["records"]


def test_quota_enforced(client, staff):
    d = _next_weekday(TODAY, 20)
    end = d + timedelta(days=20)
    r = client.post("/api/me/leave", headers=staff["headers"], json={
        "leave_type": "Casual", "start_date": str(d), "end_date": str(end)})
    assert r.status_code == 422 and "Not enough Casual" in r.json()["detail"]


def test_sunday_only_and_half_day_rules(client, staff):
    sunday = TODAY + timedelta(days=(6 - TODAY.weekday()) % 7 or 7)
    r = client.post("/api/me/leave", headers=staff["headers"], json={"leave_type": "Sick", "start_date": str(sunday)})
    assert r.status_code == 422
    d = _next_weekday(TODAY, 30)
    r = client.post("/api/me/leave", headers=staff["headers"], json={
        "leave_type": "Sick", "start_date": str(d), "end_date": str(d + timedelta(days=2)), "half_day": True})
    assert r.status_code == 422


def test_admin_marks_attendance(client, admin, staff):
    # stay inside the current month so the monthly payroll test isn't affected
    d = next((x for x in (TODAY - timedelta(days=i) for i in range(1, 8))
              if x.weekday() != 6 and x >= TODAY.replace(day=1)), None)
    if d is None:
        pytest.skip("first working day of the month — nothing earlier to mark")
    assert client.put("/api/staff-attendance", headers=admin, json={
        "user_id": staff["id"], "date": str(d), "status": "half_day",
        "check_in": "09:30", "check_out": "13:00"}).status_code == 200
    # leave can't be set manually; future dates rejected
    assert client.put("/api/staff-attendance", headers=admin, json={
        "user_id": staff["id"], "date": str(d), "status": "leave"}).status_code == 422
    assert client.put("/api/staff-attendance", headers=admin, json={
        "user_id": staff["id"], "date": str(TODAY + timedelta(days=3)), "status": "present"}).status_code == 422
    r = client.get("/api/staff-attendance/export", headers=admin, params={"month": f"{d:%Y-%m}"})
    assert r.status_code == 200 and r.content[:2] == b"PK"


def test_monthly_payroll_is_attendance_based(client, admin, staff):
    """Previous calendar month: 1 absent, 1 half day, 1 unpaid leave, 2 present,
    every other working day unmarked → deducted."""
    first_this = TODAY.replace(day=1)
    last_prev = first_this - timedelta(days=1)
    first_prev = last_prev.replace(day=1)

    work = [first_prev + timedelta(days=i) for i in range(last_prev.day)
            if (first_prev + timedelta(days=i)).weekday() != 6]
    marks = {work[0]: "absent", work[1]: "half_day", work[2]: "present", work[3]: "present"}
    for d, st in marks.items():
        assert client.put("/api/staff-attendance", headers=admin, json={
            "user_id": staff["id"], "date": str(d), "status": st}).status_code == 200
    # Unpaid leave can only be backdated 30 days — only add it if work[4] is recent enough
    unpaid = 0
    if (TODAY - work[4]).days <= 30:
        r = client.post("/api/me/leave", headers=staff["headers"], json={"leave_type": "Unpaid", "start_date": str(work[4])})
        assert r.status_code == 201, r.text
        assert client.post(f"/api/leave/requests/{r.json()['id']}/approve", headers=admin).status_code == 200
        unpaid = 1

    month = f"{first_prev:%Y-%m}"
    r = client.post("/api/payroll-runs", headers=admin, json={"month": month})
    assert r.status_code == 201, r.text
    run = r.json()
    assert run["period_start"] == str(first_prev) and run["period_end"] == str(last_prev)

    prev = client.get(f"/api/payroll-runs/{run['id']}/preview", headers=admin).json()
    line = next(x for x in prev["lines"] if x["user_id"] == staff["id"])
    b = line["breakdown"]
    unmarked = len(work) - 4 - unpaid
    assert b["absent"] == 1 and b["half_day"] == 1 and b["unmarked"] == unmarked and b["unpaid_leave"] == unpaid
    expect_days = 1 + 0.5 + unmarked + unpaid
    assert line["deduction_days"] == expect_days
    expected = round(30000 - min(30000 / last_prev.day * expect_days, 30000), 2)
    assert abs(line["net_pay"] - expected) < 0.02
    assert prev["can_process"] is True

    assert client.post(f"/api/payroll-runs/{run['id']}/process", headers=admin).status_code == 200
    e = next(x for x in client.get(f"/api/payroll-runs/{run['id']}/entries", headers=admin).json()
             if x["user_id"] == staff["id"])
    assert abs(e["net_pay"] - expected) < 0.02 and "unmarked" in (e["deduction_note"] or "")
    # One run per month
    assert client.post("/api/payroll-runs", headers=admin, json={"month": month}).status_code == 409
    # Staff with payroll history can't be deleted — only disabled
    assert client.delete(f"/api/users/{staff['id']}", headers=admin).status_code == 409


def test_current_month_cannot_be_processed_early(client, admin):
    from calendar import monthrange
    last = TODAY.replace(day=monthrange(TODAY.year, TODAY.month)[1])
    r = client.post("/api/payroll-runs", headers=admin, json={"month": f"{TODAY:%Y-%m}"})
    run = r.json() if r.status_code == 201 else next(
        x for x in client.get("/api/payroll-runs", headers=admin).json() if x["period_start"] == str(TODAY.replace(day=1)))
    p = client.post(f"/api/payroll-runs/{run['id']}/process", headers=admin)
    if TODAY < last:
        assert p.status_code == 409 and "month end" in p.json()["detail"]
    # Partial periods are refused
    assert client.post("/api/payroll-runs", headers=admin,
                       json={"period_start": "2026-01-05", "period_end": "2026-01-20"}).status_code == 422


def test_mark_all_present(client, admin, staff):
    d = next(x for x in (TODAY - timedelta(days=i) for i in range(20, 35)) if x.weekday() != 6)
    r = client.post("/api/staff-attendance/mark-all", headers=admin, json={"date": str(d)})
    assert r.status_code == 200 and r.json()["marked"] >= 1
    grid = client.get("/api/staff-attendance", headers=admin, params={"month": f"{d:%Y-%m}"}).json()
    me = next(p for p in grid["staff"] if p["id"] == staff["id"])
    assert me["records"][str(d)]["status"] == "present"


def test_policies_editable(client, admin):
    pols = client.get("/api/leave/policies", headers=admin).json()
    casual = next(p for p in pols if p["leave_type"] == "Casual")
    casual["annual_quota"] = 14
    out = client.put("/api/leave/policies", headers=admin, json=pols).json()
    assert next(p for p in out if p["leave_type"] == "Casual")["annual_quota"] == 14
    casual["annual_quota"] = 12
    client.put("/api/leave/policies", headers=admin, json=pols)


def test_cancel_restores_previous_mark_and_sunday_rules(client, admin, staff):
    d = next(x for x in (TODAY - timedelta(days=i) for i in range(16, 29)) if x.weekday() != 6)
    assert client.put("/api/staff-attendance", headers=admin, json={
        "user_id": staff["id"], "date": str(d), "status": "absent", "note": "No show"}).status_code == 200
    r = client.post("/api/me/leave", headers=staff["headers"], json={"leave_type": "Sick", "start_date": str(d)})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    client.post(f"/api/leave/requests/{rid}/approve", headers=admin)
    client.post(f"/api/leave/requests/{rid}/cancel", headers=admin)
    grid = client.get("/api/staff-attendance", headers=admin, params={"month": f"{d:%Y-%m}"}).json()
    me = next(p for p in grid["staff"] if p["id"] == staff["id"])
    assert me["records"][str(d)]["status"] == "absent"          # restored, not erased
    sunday = next(x for x in (TODAY - timedelta(days=i) for i in range(1, 8)) if x.weekday() == 6)
    assert client.put("/api/staff-attendance", headers=admin, json={
        "user_id": staff["id"], "date": str(sunday), "status": "absent"}).status_code == 422


def test_bad_policy_input_is_422(client, admin):
    pols = client.get("/api/leave/policies", headers=admin).json()
    assert client.put("/api/leave/policies", headers=admin,
                      json=pols + [{"leave_type": "Casual", "annual_quota": 3}]).status_code == 422
    bad = [dict(p) for p in pols]
    bad[0]["annual_quota"] = "NaN"
    assert client.put("/api/leave/policies", headers=admin, json=bad).status_code == 422


def test_cross_year_request_rejected(client, staff):
    dec = date(TODAY.year, 12, 30)
    r = client.post("/api/me/leave", headers=staff["headers"], json={
        "leave_type": "Casual", "start_date": str(dec), "end_date": str(date(TODAY.year + 1, 1, 3))})
    assert r.status_code == 422
