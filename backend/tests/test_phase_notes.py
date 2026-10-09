"""Backend tests for Phase Description / Notes feature (TC-PD-01..07 + regression)."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "kesari4416@gmail.com", "password": "admin123"}
SE = {"email": "raj@buildcore.com", "password": "engineer123"}
PROJECT_ID = 1


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def se_token():
    return _login(SE)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def se_h(se_token):
    return {"Authorization": f"Bearer {se_token}"}


def _next_order(admin_h):
    r = requests.get(f"{API}/projects/{PROJECT_ID}/phases", headers=admin_h, timeout=30)
    assert r.status_code == 200
    phases = r.json()
    used = {p["sequence_order"] for p in phases}
    n = 1
    while n in used:
        n += 1
    return n, phases


@pytest.fixture(scope="module")
def created_phase(admin_h):
    """Create phase with description; yield phase dict; teardown deletes it."""
    order, _ = _next_order(admin_h)
    payload = {
        "name": f"TEST_TA_Phase_{int(time.time())}",
        "sequence_order": order,
        "status": "NotStarted",
        "percent_complete": 0,
        "description": "note one from TA",
    }
    r = requests.post(f"{API}/projects/{PROJECT_ID}/phases", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 201, r.text
    phase = r.json()
    yield phase
    # cleanup
    requests.delete(f"{API}/phases/{phase['id']}", headers=admin_h, timeout=30)


# ---------- Create with description ----------
def test_create_phase_with_description_returns_note(created_phase):
    assert "notes" in created_phase
    assert isinstance(created_phase["notes"], list)
    assert len(created_phase["notes"]) == 1
    n = created_phase["notes"][0]
    assert n["text"] == "note one from TA"
    assert n["date"]  # today's date
    assert "by" in n


def test_list_phases_returns_notes(admin_h, created_phase):
    r = requests.get(f"{API}/projects/{PROJECT_ID}/phases", headers=admin_h, timeout=30)
    assert r.status_code == 200
    phases = r.json()
    ph = next(p for p in phases if p["id"] == created_phase["id"])
    assert len(ph["notes"]) == 1
    assert ph["notes"][0]["text"] == "note one from TA"


# ---------- Edit with description appends new note ----------
def test_edit_phase_appends_note_newest_first(admin_h, created_phase):
    payload = {"description": "note two from TA"}
    r = requests.patch(f"{API}/phases/{created_phase['id']}", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["notes"]) == 2
    # newest first per phase_notes_map ordering
    assert data["notes"][0]["text"] == "note two from TA"
    assert data["notes"][1]["text"] == "note one from TA"


# ---------- Empty description doesn't add note ----------
def test_edit_empty_description_no_new_note(admin_h, created_phase):
    r = requests.patch(f"{API}/phases/{created_phase['id']}",
                       json={"percent_complete": 15}, headers=admin_h, timeout=30)
    assert r.status_code == 200
    assert len(r.json()["notes"]) == 2  # unchanged
    assert r.json()["percent_complete"] == 15


def test_edit_empty_string_description_no_new_note(admin_h, created_phase):
    r = requests.patch(f"{API}/phases/{created_phase['id']}",
                       json={"description": "   "}, headers=admin_h, timeout=30)
    assert r.status_code == 200
    assert len(r.json()["notes"]) == 2


# ---------- Notifications ----------
def test_site_engineer_receives_phasenote_notification(se_h, created_phase):
    # SE was not the actor (admin created), so should receive both notes
    r = requests.get(f"{API}/notifications", headers=se_h, timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    pn = [n for n in items if n.get("type") == "PhaseNote" and created_phase["name"] in (n.get("title", "") + n.get("message", ""))]
    assert len(pn) >= 2, f"Expected >=2 PhaseNote notifications for SE, got {len(pn)}"


def test_admin_receives_phasenote_when_se_creates(admin_h, se_h):
    """When SE adds description, Admin (non-actor) must be notified."""
    order, _ = _next_order(admin_h)
    r = requests.post(f"{API}/projects/{PROJECT_ID}/phases", json={
        "name": f"TEST_SE_Phase_{int(time.time())}",
        "sequence_order": order,
        "status": "NotStarted",
        "percent_complete": 0,
        "description": "note by SE for admin alert",
    }, headers=se_h, timeout=30)
    assert r.status_code == 201, r.text
    ph = r.json()
    try:
        assert len(ph["notes"]) == 1
        rn = requests.get(f"{API}/notifications", headers=admin_h, timeout=30)
        items = rn.json().get("items", rn.json()) if isinstance(rn.json(), dict) else rn.json()
        pn = [n for n in items if n.get("type") == "PhaseNote" and ph["name"] in (n.get("title", "") + n.get("message", ""))]
        assert len(pn) >= 1, f"Admin should receive PhaseNote notification when SE creates, got {len(pn)}"
    finally:
        requests.delete(f"{API}/phases/{ph['id']}", headers=admin_h, timeout=30)


# ---------- Regression: add/edit without description works ----------
def test_add_phase_without_description(admin_h):
    order, _ = _next_order(admin_h)
    r = requests.post(f"{API}/projects/{PROJECT_ID}/phases", json={
        "name": f"TEST_NoDesc_{int(time.time())}",
        "sequence_order": order,
        "status": "NotStarted",
        "percent_complete": 0,
    }, headers=admin_h, timeout=30)
    assert r.status_code == 201, r.text
    ph = r.json()
    assert ph["notes"] == []
    # cleanup
    d = requests.delete(f"{API}/phases/{ph['id']}", headers=admin_h, timeout=30)
    assert d.status_code == 204


# ---------- Regression: DELETE phase with notes returns 204 ----------
def test_delete_phase_with_notes_returns_204(admin_h):
    order, _ = _next_order(admin_h)
    r = requests.post(f"{API}/projects/{PROJECT_ID}/phases", json={
        "name": f"TEST_DelWithNotes_{int(time.time())}",
        "sequence_order": order,
        "status": "NotStarted",
        "percent_complete": 0,
        "description": "will be deleted",
    }, headers=admin_h, timeout=30)
    assert r.status_code == 201, r.text
    ph = r.json()
    assert len(ph["notes"]) == 1
    d = requests.delete(f"{API}/phases/{ph['id']}", headers=admin_h, timeout=30)
    assert d.status_code == 204, d.text
    # verify gone
    g = requests.get(f"{API}/projects/{PROJECT_ID}/phases", headers=admin_h, timeout=30)
    assert ph["id"] not in {p["id"] for p in g.json()}
