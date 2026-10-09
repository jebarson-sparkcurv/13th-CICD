"""Iter25 tests: Estimate requirement rows, phase two-way sync, send-for-approval status."""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "kesari4416@gmail.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def api(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def refs(api):
    # Ensure categories/statuses are seeded
    cats = api.get(f"{BASE_URL}/api/estimate-categories", timeout=15).json()
    stats = api.get(f"{BASE_URL}/api/estimate-statuses", timeout=15).json()
    clients = api.get(f"{BASE_URL}/api/estimate-clients", timeout=15).json()
    assert cats and stats and clients
    draft = next(s for s in stats if s["name"].lower() == "draft")
    return {"cat_id": cats[0]["id"], "status_id": draft["id"],
            "client_id": clients[0]["id"], "cats": cats, "stats": stats}


# ---------- requirements + total sum ----------
def test_create_estimate_with_requirements_computes_total(api, refs):
    ts = int(time.time())
    payload = {
        "client_id": refs["client_id"],
        "project_name": f"TEST_Iter25_{ts}",
        "phase": "TEST_Phase_Alpha",
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "total_amount": 1,  # should be ignored when requirements present
        "requirements": [
            {"requirement_name": f"TEST_Req_Cement_{ts}", "price": 12000},
            {"requirement_name": f"TEST_Req_Steel_{ts}", "price": 8500},
        ],
    }
    r = api.post(f"{BASE_URL}/api/estimates", json=payload, timeout=20)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["total_amount"] == 20500.0
    assert len(data["requirements"]) == 2
    est_id = data["id"]

    # GET verify persistence
    listed = api.get(f"{BASE_URL}/api/estimates", timeout=15).json()
    found = next(e for e in listed if e["id"] == est_id)
    assert found["total_amount"] == 20500.0
    assert len(found["requirements"]) == 2


def test_backward_compat_manual_total_no_requirements(api, refs):
    payload = {
        "client_id": refs["client_id"],
        "project_name": "TEST_Iter25_manual",
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "total_amount": 4321,
    }
    r = api.post(f"{BASE_URL}/api/estimates", json=payload, timeout=15)
    assert r.status_code == 201, r.text
    assert r.json()["total_amount"] == 4321.0


def test_neither_reqs_nor_total_returns_422(api, refs):
    payload = {
        "client_id": refs["client_id"],
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
    }
    r = api.post(f"{BASE_URL}/api/estimates", json=payload, timeout=15)
    assert r.status_code == 422
    assert "requirement" in r.text.lower() or "total" in r.text.lower()


def test_requirement_price_zero_or_negative_is_422(api, refs):
    payload = {
        "client_id": refs["client_id"],
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "requirements": [{"requirement_name": "TEST_Bad", "price": 0}],
    }
    r = api.post(f"{BASE_URL}/api/estimates", json=payload, timeout=15)
    assert r.status_code == 422


def test_requirements_master_dedupes_case_insensitive(api, refs):
    ts = int(time.time())
    uniq = f"TEST_MasterDup_{ts}"
    for name in [uniq, uniq.upper(), uniq.lower()]:
        r = api.post(f"{BASE_URL}/api/estimates", json={
            "client_id": refs["client_id"],
            "category_id": refs["cat_id"],
            "status_id": refs["status_id"],
            "requirements": [{"requirement_name": name, "price": 100}],
        }, timeout=15)
        assert r.status_code == 201
    master = api.get(f"{BASE_URL}/api/requirements-master", timeout=15).json()
    matches = [m for m in master if m["name"].lower() == uniq.lower()]
    assert len(matches) == 1, f"Expected exactly 1 master row (case-insensitive dedupe), got {matches}"


def test_requirements_master_endpoint_lists_names(api):
    r = api.get(f"{BASE_URL}/api/requirements-master", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    if data:
        assert "name" in data[0] and "id" in data[0]


# ---------- phase-options + phase sync ----------
def test_phase_options_unknown_project(api):
    r = api.get(f"{BASE_URL}/api/estimate-phase-options",
                params={"project_name": "TEST_NoSuchProject_xyz"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["project_id"] is None


def test_phase_options_existing_project_case_insensitive(api):
    projects = api.get(f"{BASE_URL}/api/projects", timeout=15).json()
    assert projects
    p = projects[0]
    r = api.get(f"{BASE_URL}/api/estimate-phase-options",
                params={"project_name": p["name"].upper()}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["project_id"] == p["id"]
    assert isinstance(data["phases"], list)


def test_phase_sync_creates_new_phase_and_dedupes(api, refs):
    projects = api.get(f"{BASE_URL}/api/projects", timeout=15).json()
    p = projects[0]
    ts = int(time.time())
    new_phase = f"TEST_SyncedPhase_{ts}"

    before = api.get(f"{BASE_URL}/api/projects/{p['id']}", timeout=15).json()
    before_phases = [ph["name"].lower() for ph in before.get("phases", [])]
    assert new_phase.lower() not in before_phases
    max_seq_before = max([ph["sequence_order"] for ph in before.get("phases", [])] or [0])

    # Create estimate with matching project name (any case) + new phase
    r = api.post(f"{BASE_URL}/api/estimates", json={
        "client_id": refs["client_id"],
        "project_name": p["name"].lower(),  # case insensitive match
        "phase": new_phase,
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "requirements": [{"requirement_name": f"TEST_R_{ts}", "price": 500}],
    }, timeout=20)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["synced_phase_id"] is not None, "Phase should have been synced"

    after = api.get(f"{BASE_URL}/api/projects/{p['id']}", timeout=15).json()
    match = [ph for ph in after["phases"] if ph["name"].lower() == new_phase.lower()]
    assert len(match) == 1, "phase should appear exactly once under project"
    assert match[0]["sequence_order"] == max_seq_before + 1

    # Recreate estimate with same phase in different case → NO duplicate phase
    r2 = api.post(f"{BASE_URL}/api/estimates", json={
        "client_id": refs["client_id"],
        "project_name": p["name"],
        "phase": new_phase.upper(),
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "requirements": [{"requirement_name": f"TEST_R2_{ts}", "price": 700}],
    }, timeout=20)
    assert r2.status_code == 201
    after2 = api.get(f"{BASE_URL}/api/projects/{p['id']}", timeout=15).json()
    match2 = [ph for ph in after2["phases"] if ph["name"].lower() == new_phase.lower()]
    assert len(match2) == 1, "Case-insensitive dedupe: should still be 1 phase"


def test_phase_not_synced_when_project_name_no_match(api, refs):
    r = api.post(f"{BASE_URL}/api/estimates", json={
        "client_id": refs["client_id"],
        "project_name": "TEST_NonMatchingProj_xyz",
        "phase": "SomeGhostPhase",
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "requirements": [{"requirement_name": "TEST_R_ghost", "price": 100}],
    }, timeout=15)
    assert r.status_code == 201
    assert r.json()["synced_phase_id"] is None


# ---------- send-approval sets 'Pending Approval' ----------
def test_send_for_approval_sets_pending_status(api, refs):
    ts = int(time.time())
    create = api.post(f"{BASE_URL}/api/estimates", json={
        "client_id": refs["client_id"],
        "project_name": f"TEST_SendAppr_{ts}",
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],  # Draft
        "requirements": [{"requirement_name": f"TEST_SA_{ts}", "price": 999}],
    }, timeout=15)
    assert create.status_code == 201
    est_id = create.json()["id"]

    r = api.post(f"{BASE_URL}/api/estimates/{est_id}/send-approval",
                 json={"client_email": "test@example.com"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["current_status"] == "Pending Approval"
    assert body["email_sent"] is False  # SMTP known-bad
    assert body["approve_url"] and body["reject_url"]
    assert len(body["requirements"]) == 1

    events = api.get(f"{BASE_URL}/api/estimates/{est_id}/events", timeout=15).json()
    assert any("sent for approval" in ev["action"] for ev in events)


def test_public_approval_link_regression(api, refs):
    ts = int(time.time())
    create = api.post(f"{BASE_URL}/api/estimates", json={
        "client_id": refs["client_id"],
        "project_name": f"TEST_Regression_{ts}",
        "category_id": refs["cat_id"],
        "status_id": refs["status_id"],
        "requirements": [{"requirement_name": f"TEST_RG_{ts}", "price": 111}],
    }, timeout=15).json()
    est_id = create["id"]
    send = api.post(f"{BASE_URL}/api/estimates/{est_id}/send-approval",
                    json={"client_email": "test@example.com"}, timeout=30).json()
    # Extract token from approve_url
    url = send["approve_url"]
    token = url.split("/")[-1].split("?")[0]
    # Public view
    pub = requests.get(f"{BASE_URL}/api/public/estimate-approval/{est_id}/{token}", timeout=15)
    assert pub.status_code == 200
    # Approve
    dec = requests.post(f"{BASE_URL}/api/public/estimate-approval/{est_id}/{token}",
                        json={"action": "approve"}, timeout=15)
    assert dec.status_code == 200
    assert dec.json()["approval_state"] == "approved"
