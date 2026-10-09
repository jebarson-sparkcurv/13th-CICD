"""Tests for GET /api/projects/dashboard-charts endpoint."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "kesari4416@gmail.com", "password": "admin123"}
CLIENT = {"email": "priya@skyline.com", "password": "client123"}


def login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {login(ADMIN)}"}


@pytest.fixture(scope="module")
def client_headers():
    return {"Authorization": f"Bearer {login(CLIENT)}"}


def test_dashboard_charts_admin_shape(admin_headers):
    r = requests.get(f"{BASE_URL}/api/projects/dashboard-charts", headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    # portfolio_progress
    pp = data["portfolio_progress"]
    assert "avg_pct" in pp and "total" in pp and "completed" in pp
    assert isinstance(pp["avg_pct"], (int, float))
    assert pp["total"] >= 1
    # timeline
    tl = data["timeline"]
    assert isinstance(tl, list) and len(tl) >= 1
    for row in tl:
        assert "planned_start" in row and "planned_end" in row and "percent_complete" in row
    # schedule_variance
    sv = data["schedule_variance"]
    assert isinstance(sv, list) and len(sv) >= 1
    for row in sv:
        assert "expected_pct" in row and "actual_pct" in row and "variance" in row
        assert abs(row["variance"] - (row["actual_pct"] - row["expected_pct"])) < 0.01
    # stages
    st = data["stages"]
    assert isinstance(st, list) and len(st) >= 1
    total_from_stages = sum(s["count"] for s in st)
    assert total_from_stages == pp["total"]
    # milestones
    ms = data["milestones"]
    for k in ["total", "completed", "pending", "overdue", "upcoming"]:
        assert k in ms
    assert isinstance(ms["upcoming"], list) and len(ms["upcoming"]) <= 5
    assert ms["total"] >= 1


def test_dashboard_charts_milestone_seed(admin_headers):
    r = requests.get(f"{BASE_URL}/api/projects/dashboard-charts", headers=admin_headers, timeout=30)
    ms = r.json()["milestones"]
    # seed says 25 milestones with 13 completed / 9 pending / 3 overdue
    assert ms["total"] == 25, ms
    assert ms["completed"] == 13
    assert ms["pending"] == 9
    assert ms["overdue"] == 3


def test_client_scoping(client_headers, admin_headers):
    r = requests.get(f"{BASE_URL}/api/projects/dashboard-charts", headers=client_headers, timeout=30)
    assert r.status_code == 200, r.text
    client_data = r.json()
    r_admin = requests.get(f"{BASE_URL}/api/projects/dashboard-charts", headers=admin_headers, timeout=30)
    admin_data = r_admin.json()
    assert client_data["portfolio_progress"]["total"] <= admin_data["portfolio_progress"]["total"]
    assert client_data["portfolio_progress"]["total"] >= 1


def test_regression_projects_list(admin_headers):
    r = requests.get(f"{BASE_URL}/api/projects", headers=admin_headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) or "items" in data or "results" in data
