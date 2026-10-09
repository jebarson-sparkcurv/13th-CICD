"""Regression test for ADMIN/PROJECT_001:

When an Estimate is created with a `phase` name BEFORE the referenced Project
exists, the phase must be automatically carried over to the Project when the
Estimate is linked to a newly created Project (via POST /estimates/{id}/link-project).

Also verifies sibling estimates that share the same project_name (and are
approved but unlinked) are auto-linked and their phases copied over.
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
def refs(api):
    cats = api.get(f"{BASE_URL}/api/estimate-categories", timeout=15).json()
    stats = api.get(f"{BASE_URL}/api/estimate-statuses", timeout=15).json()
    clients = api.get(f"{BASE_URL}/api/estimate-clients", timeout=15).json()
    draft = next(s for s in stats if s["name"].lower() == "draft")
    return {"cat_id": cats[0]["id"], "status_id": draft["id"],
            "client_id": clients[0]["id"]}


def _mk_estimate(api, refs, project_name, phase):
    r = api.post(f"{BASE_URL}/api/estimates", json={
        "client_id": refs["client_id"],
        "project_name": project_name,
        "phase": phase,
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "total_amount": 100000,
    }, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


def _approve(api, eid):
    r = api.post(f"{BASE_URL}/api/estimates/{eid}/decision",
                 json={"action": "approve"}, timeout=15)
    assert r.status_code == 200, r.text


def test_phase_carryover_from_estimate_to_new_project(api, refs):
    """Full ADMIN/PROJECT_001 flow: estimates before project, then linking
    the first estimate must create phases for all sibling estimates."""
    ts = int(time.time())
    project_name = f"PhaseCarryoverProj_{ts}"

    # 1. Two estimates created BEFORE any project with this name exists
    e1 = _mk_estimate(api, refs, project_name, f"Foundation_{ts}")
    e2 = _mk_estimate(api, refs, project_name, f"Superstructure_{ts}")
    assert e1["synced_phase_id"] is None, \
        "Project does not exist yet — no phase should be synced at estimate-create time"
    assert e2["synced_phase_id"] is None

    # 2. Approve both
    _approve(api, e1["id"])
    _approve(api, e2["id"])

    # 3. Create the project
    proj = api.post(f"{BASE_URL}/api/projects", json={
        "name": project_name, "client_id": refs["client_id"], "status": "Planning"
    }, timeout=15).json()
    pid = proj["id"]

    # Immediately after project creation but before link, project has NO phases
    phases_before = api.get(f"{BASE_URL}/api/projects/{pid}/phases", timeout=15).json()
    assert phases_before == [], phases_before

    # 4. Link estimate e1 to the project — this should copy BOTH phases
    link = api.post(f"{BASE_URL}/api/estimates/{e1['id']}/link-project",
                    json={"project_id": pid}, timeout=15)
    assert link.status_code == 200, link.text
    synced_ids = link.json().get("synced_phase_ids", [])
    assert len(synced_ids) == 2, synced_ids

    # 5. Project now has both phases
    phases_after = api.get(f"{BASE_URL}/api/projects/{pid}/phases", timeout=15).json()
    names = sorted(p["name"] for p in phases_after)
    assert names == sorted([f"Foundation_{ts}", f"Superstructure_{ts}"]), phases_after

    # 6. Sibling estimate e2 is auto-linked to the same project
    estimates = api.get(f"{BASE_URL}/api/estimates", timeout=15).json()
    e2_after = next(e for e in estimates if e["id"] == e2["id"])
    assert e2_after["linked_project_id"] == pid


def test_phase_sync_when_project_already_exists(api, refs):
    """Legacy path — estimate created after project exists should still
    sync phase immediately via sync_phase_to_project."""
    ts = int(time.time())
    project_name = f"PhaseSyncExistingProj_{ts}"

    # 1. Create project first
    proj = api.post(f"{BASE_URL}/api/projects", json={
        "name": project_name, "client_id": refs["client_id"], "status": "Planning"
    }, timeout=15).json()
    pid = proj["id"]

    # 2. Create estimate with a phase — should be synced immediately
    e = _mk_estimate(api, refs, project_name, f"Roofing_{ts}")
    assert e["synced_phase_id"] is not None

    phases = api.get(f"{BASE_URL}/api/projects/{pid}/phases", timeout=15).json()
    assert any(p["name"] == f"Roofing_{ts}" for p in phases), phases
