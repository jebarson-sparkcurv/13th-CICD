"""Regression tests for ADMIN/PROJECTS_002: Sub-Contractors on Projects.

Covers:
- Creating a project with inline `subcontractors`
- Listing / adding / patching / deleting sub-contractors on an existing project
- Validation (type required, allocated_amount must be non-negative)
- Sub-contractors are returned in the project detail payload
- Materials list round-trip (JSON column)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "kesari4416@gmail.com", "password": "admin123"},
                      timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def client_id(api):
    return api.get(f"{BASE_URL}/api/estimate-clients", timeout=15).json()[0]["id"]


def _mk_project(api, client_id, subs=None, name_suffix=""):
    r = api.post(f"{BASE_URL}/api/projects", json={
        "name": f"SubcontractorTest_{int(time.time()*1000)}{name_suffix}",
        "client_id": client_id, "status": "Planning",
        "budget": 1000000,
        "subcontractors": subs or [],
    }, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_project_with_inline_subcontractors(api, client_id):
    proj = _mk_project(api, client_id, subs=[
        {"type": "Electrical", "name": "Sparky Ltd",
         "allocated_amount": 500000,
         "materials": ["Wires", "Sockets"]},
        {"type": "Plumbing", "allocated_amount": 300000,
         "materials": ["PVC pipes"], "notes": "Includes fittings"},
    ])
    assert len(proj["subcontractors"]) == 2
    by_type = {s["type"]: s for s in proj["subcontractors"]}
    assert by_type["Electrical"]["name"] == "Sparky Ltd"
    assert by_type["Electrical"]["materials"] == ["Wires", "Sockets"]
    assert by_type["Electrical"]["allocated_amount"] == 500000.0
    assert by_type["Plumbing"]["notes"] == "Includes fittings"

    # Detail GET also includes them
    detail = api.get(f"{BASE_URL}/api/projects/{proj['id']}", timeout=15).json()
    assert len(detail["subcontractors"]) == 2


def test_list_add_patch_delete_subcontractors(api, client_id):
    proj = _mk_project(api, client_id)
    pid = proj["id"]

    # Add via dedicated endpoint
    r = api.post(f"{BASE_URL}/api/projects/{pid}/subcontractors", json={
        "type": "HVAC", "name": "Cool Air", "allocated_amount": 250000,
        "materials": ["Ducts", "AHU"],
    }, timeout=15)
    assert r.status_code == 201, r.text
    sc = r.json()
    assert sc["type"] == "HVAC" and sc["materials"] == ["Ducts", "AHU"]
    sc_id = sc["id"]

    # List
    lst = api.get(f"{BASE_URL}/api/projects/{pid}/subcontractors", timeout=15).json()
    assert any(s["id"] == sc_id for s in lst)

    # Patch: update amount + materials
    r = api.patch(f"{BASE_URL}/api/subcontractors/{sc_id}", json={
        "allocated_amount": 275000, "materials": ["Ducts", "AHU", "Thermostats"],
    }, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["allocated_amount"] == 275000.0
    assert "Thermostats" in r.json()["materials"]

    # Delete
    r = api.delete(f"{BASE_URL}/api/subcontractors/{sc_id}", timeout=15)
    assert r.status_code == 204

    # Confirm gone
    lst = api.get(f"{BASE_URL}/api/projects/{pid}/subcontractors", timeout=15).json()
    assert not any(s["id"] == sc_id for s in lst)


def test_validation_empty_type_rejected(api, client_id):
    proj = _mk_project(api, client_id)
    r = api.post(f"{BASE_URL}/api/projects/{proj['id']}/subcontractors", json={
        "type": "", "allocated_amount": 100,
    }, timeout=15)
    assert r.status_code == 422


def test_validation_negative_amount_rejected(api, client_id):
    proj = _mk_project(api, client_id)
    r = api.post(f"{BASE_URL}/api/projects/{proj['id']}/subcontractors", json={
        "type": "Painting", "allocated_amount": -50,
    }, timeout=15)
    assert r.status_code == 422


def test_custom_type_accepted(api, client_id):
    """User can add custom sub-contractor types (not from the common list)."""
    proj = _mk_project(api, client_id)
    r = api.post(f"{BASE_URL}/api/projects/{proj['id']}/subcontractors", json={
        "type": "Solar Rooftop Installation", "allocated_amount": 800000,
        "materials": ["Panels", "Inverter", "Mounting"],
    }, timeout=15)
    assert r.status_code == 201
    assert r.json()["type"] == "Solar Rooftop Installation"


def test_materials_are_trimmed_and_deduped_by_pydantic(api, client_id):
    proj = _mk_project(api, client_id, subs=[
        {"type": "Tiling", "allocated_amount": 150000,
         "materials": ["  Tiles ", "", "  Grout  "]},
    ])
    assert proj["subcontractors"][0]["materials"] == ["Tiles", "Grout"]
