import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import pytest
from fastapi.testclient import TestClient

from app.main import app

ADMIN = {"email": os.environ.get("ADMIN_EMAIL", "kesari4416@gmail.com"),
         "password": os.environ.get("ADMIN_PASSWORD", "admin123")}
CLIENT_USER = {"email": "priya@skyline.com", "password": "client123"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def admin_headers(client):
    r = client.post("/api/auth/login", json=ADMIN)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def client_headers(client):
    r = client.post("/api/auth/login", json=CLIENT_USER)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def project_id(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={
        "name": "Pytest Tower", "client_id": 1, "location": "Test City",
        "budget": 1000000, "start_date_planned": "2026-01-01", "end_date_planned": "2026-12-31"})
    assert r.status_code == 201
    assert r.json()["status"] == "Planning"
    return r.json()["id"]


def test_unauthenticated(client):
    assert client.get("/api/projects").status_code == 401


def test_create_missing_client_id(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={"name": "X"})
    assert r.status_code == 422


def test_create_invalid_date_range(client, admin_headers):
    r = client.post("/api/projects", headers=admin_headers, json={
        "name": "Bad Dates", "client_id": 1,
        "start_date_planned": "2026-12-31", "end_date_planned": "2026-01-01"})
    assert r.status_code == 422


def test_list_projects(client, admin_headers, project_id):
    r = client.get("/api/projects", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_list_filter_by_client(client, admin_headers):
    r = client.get("/api/projects", headers=admin_headers, params={"client_id": 1})
    assert r.status_code == 200
    assert all(p["client_id"] == 1 for p in r.json()["items"])


def test_list_filter_by_status(client, admin_headers):
    r = client.get("/api/projects", headers=admin_headers, params={"status": "Ongoing"})
    assert all(p["status"] == "Ongoing" for p in r.json()["items"])


def test_pagination(client, admin_headers):
    r = client.get("/api/projects", headers=admin_headers, params={"limit": 2, "offset": 0})
    assert r.status_code == 200
    assert len(r.json()["items"]) <= 2
    assert "total" in r.json()


def test_get_project_detail(client, admin_headers, project_id):
    r = client.get(f"/api/projects/{project_id}", headers=admin_headers)
    assert r.status_code == 200
    assert "phases" in r.json() and "percent_complete" in r.json()


def test_get_404(client, admin_headers):
    assert client.get("/api/projects/99999", headers=admin_headers).status_code == 404


def test_update_project(client, admin_headers, project_id):
    r = client.put(f"/api/projects/{project_id}", headers=admin_headers, json={"budget": 2000000})
    assert r.status_code == 200
    assert r.json()["budget"] == 2000000


def test_update_as_client_forbidden(client, client_headers):
    r = client.put("/api/projects/1", headers=client_headers, json={"budget": 1})
    assert r.status_code == 403


def test_phase_crud_and_percent(client, admin_headers, project_id):
    r1 = client.post(f"/api/projects/{project_id}/phases", headers=admin_headers,
                     json={"name": "Foundation", "sequence_order": 1, "percent_complete": 100, "status": "Completed"})
    assert r1.status_code == 201
    r_dup = client.post(f"/api/projects/{project_id}/phases", headers=admin_headers,
                        json={"name": "Dup", "sequence_order": 1})
    assert r_dup.status_code == 409
    r2 = client.post(f"/api/projects/{project_id}/phases", headers=admin_headers,
                     json={"name": "Structure", "sequence_order": 2, "percent_complete": 0})
    assert r2.status_code == 201
    phases = client.get(f"/api/projects/{project_id}/phases", headers=admin_headers).json()
    assert [p["sequence_order"] for p in phases] == sorted(p["sequence_order"] for p in phases)
    detail = client.get(f"/api/projects/{project_id}", headers=admin_headers).json()
    assert detail["percent_complete"] == 50
    ru = client.put(f"/api/phases/{r2.json()['id']}", headers=admin_headers,
                    json={"percent_complete": 100, "status": "Completed"})
    assert ru.status_code == 200
    detail = client.get(f"/api/projects/{project_id}", headers=admin_headers).json()
    assert detail["percent_complete"] == 100
    rd = client.delete(f"/api/phases/{r2.json()['id']}", headers=admin_headers)
    assert rd.status_code == 204


def test_updates_and_blocked_flag(client, admin_headers, project_id):
    r1 = client.post(f"/api/projects/{project_id}/updates", headers=admin_headers,
                     json={"description": "Project-level note"})
    assert r1.status_code == 201 and r1.json()["phase_id"] is None
    r2 = client.post(f"/api/projects/{project_id}/updates", headers=admin_headers,
                     json={"description": "Blocked on permits", "status_flag": "Blocked"})
    assert r2.status_code == 201
    detail = client.get(f"/api/projects/{project_id}", headers=admin_headers).json()
    assert detail["has_active_issues"] is True
    feed = client.get(f"/api/projects/{project_id}/updates", headers=admin_headers).json()
    dates = [u["update_date"] for u in feed["items"]]
    assert dates == sorted(dates, reverse=True)


def test_client_scoped_access(client, client_headers):
    r = client.get("/api/clients/1/projects", headers=client_headers)
    assert r.status_code == 200
    assert all(p["client_id"] == 1 for p in r.json())
    assert client.get("/api/clients/2/projects", headers=client_headers).status_code == 403


def test_client_feed_hides_internal(client, client_headers):
    r = client.get("/api/clients/1/projects/1/updates", headers=client_headers)
    assert r.status_code == 200
    assert all(u["visible_to_client"] for u in r.json()["items"])


def test_archive_project(client, admin_headers, project_id):
    r = client.delete(f"/api/projects/{project_id}", headers=admin_headers)
    assert r.status_code == 204
    listing = client.get("/api/projects", headers=admin_headers, params={"limit": 200}).json()
    assert project_id not in [p["id"] for p in listing["items"]]
