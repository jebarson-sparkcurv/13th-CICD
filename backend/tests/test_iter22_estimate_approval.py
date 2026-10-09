"""iter22 - Estimate approval workflow (token security, RBAC, link-project, audit events)."""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('kesari4416@gmail.com', 'admin123')}"}


@pytest.fixture(scope="module")
def acct_h():
    return {"Authorization": f"Bearer {_login('asha@buildcore.com', 'accountant123')}"}


@pytest.fixture(scope="module")
def client_h():
    return {"Authorization": f"Bearer {_login('priya@skyline.com', 'client123')}"}


@pytest.fixture(scope="module")
def vendor_h():
    return {"Authorization": f"Bearer {_login('vikram@apexsteel.com', 'vendor123')}"}


@pytest.fixture(scope="module")
def lookups(admin_h):
    cats = requests.get(f"{API}/estimate-categories", headers=admin_h, timeout=10).json()
    sts = requests.get(f"{API}/estimate-statuses", headers=admin_h, timeout=10).json()
    return cats[0]["id"], sts[0]["id"]


def _mk_estimate(headers, lookups, name_prefix="TEST_approval"):
    cat_id, st_id = lookups
    payload = {"project_name": f"{name_prefix}_{int(time.time()*1000)}",
               "phase": "Foundation", "category_id": cat_id, "status_id": st_id,
               "total_amount": 12345.67}
    r = requests.post(f"{API}/estimates", json=payload, headers=headers, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


def _send_approval(headers, est_id, email="test@example.com"):
    r = requests.post(f"{API}/estimates/{est_id}/send-approval",
                      json={"client_email": email}, headers=headers, timeout=25)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "approve_url" in body and "reject_url" in body
    assert body["approval_state"] == "pending"
    assert body["awaiting_response"] is True
    # SMTP is expected to fail — email_sent False is the graceful path
    return body


# --- Token security ---

class TestTokenSecurity:
    def test_wrong_token_403(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        _send_approval(admin_h, e["id"])
        r = requests.get(f"{API}/public/estimate-approval/{e['id']}/deadbeef", timeout=10)
        assert r.status_code == 403

    def test_reuse_token_410(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        body = _send_approval(admin_h, e["id"])
        token = body["approve_url"].split("/")[-1].split("?")[0]
        # first approve
        r1 = requests.post(f"{API}/public/estimate-approval/{e['id']}/{token}",
                           json={"action": "approve"}, timeout=15)
        assert r1.status_code == 200
        assert r1.json()["approval_state"] == "approved"
        # reuse -> 410
        r2 = requests.post(f"{API}/public/estimate-approval/{e['id']}/{token}",
                           json={"action": "approve"}, timeout=15)
        assert r2.status_code == 410
        # GET also 410
        r3 = requests.get(f"{API}/public/estimate-approval/{e['id']}/{token}", timeout=10)
        assert r3.status_code == 410

    def test_public_view_ok(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        body = _send_approval(admin_h, e["id"])
        token = body["approve_url"].split("/")[-1].split("?")[0]
        r = requests.get(f"{API}/public/estimate-approval/{e['id']}/{token}", timeout=10)
        assert r.status_code == 200
        j = r.json()
        assert j["project_name"] == e["project_name"]
        assert j["approval_state"] == "pending"
        assert float(j["total_amount"]) == 12345.67

    def test_public_reject_with_reason(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        body = _send_approval(admin_h, e["id"])
        token = body["reject_url"].split("/")[-1].split("?")[0]
        r = requests.post(f"{API}/public/estimate-approval/{e['id']}/{token}",
                          json={"action": "reject", "reason": "Too expensive"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["approval_state"] == "rejected"
        assert r.json()["rejection_reason"] == "Too expensive"


# --- Resend after rejection ---

class TestResend:
    def test_resend_resets_state_and_invalidates_old_token(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        first = _send_approval(admin_h, e["id"])
        old_token = first["approve_url"].split("/")[-1].split("?")[0]
        # reject via manual override
        r = requests.post(f"{API}/estimates/{e['id']}/decision",
                          json={"action": "reject", "reason": "cost"}, headers=admin_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["approval_state"] == "rejected"
        # resend
        second = _send_approval(admin_h, e["id"])
        new_token = second["approve_url"].split("/")[-1].split("?")[0]
        assert new_token != old_token
        assert second["approval_state"] == "pending"
        # old token now invalid (403)
        r_old = requests.get(f"{API}/public/estimate-approval/{e['id']}/{old_token}", timeout=10)
        assert r_old.status_code in (403, 410)
        # new token works
        r_new = requests.get(f"{API}/public/estimate-approval/{e['id']}/{new_token}", timeout=10)
        assert r_new.status_code == 200


# --- RBAC on manual decision ---

class TestManualDecisionRBAC:
    def test_client_forbidden(self, admin_h, client_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/decision",
                          json={"action": "approve"}, headers=client_h, timeout=15)
        assert r.status_code == 403

    def test_vendor_forbidden(self, admin_h, vendor_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/decision",
                          json={"action": "approve"}, headers=vendor_h, timeout=15)
        assert r.status_code == 403

    def test_accountant_can_approve(self, admin_h, acct_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/decision",
                          json={"action": "approve"}, headers=acct_h, timeout=15)
        assert r.status_code == 200
        assert r.json()["approval_state"] == "approved"

    def test_invalid_action_422(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/decision",
                          json={"action": "maybe"}, headers=admin_h, timeout=15)
        assert r.status_code == 422


# --- link-project ---

class TestLinkProject:
    def test_link_requires_approved(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/link-project",
                          json={"project_id": 1}, headers=admin_h, timeout=15)
        assert r.status_code == 422

    def test_link_success_then_prevent_double_link_and_send(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        # approve manually
        requests.post(f"{API}/estimates/{e['id']}/decision",
                      json={"action": "approve"}, headers=admin_h, timeout=15)
        # find any project id
        projs = requests.get(f"{API}/projects", headers=admin_h, timeout=10).json()
        pid = projs[0]["id"] if isinstance(projs, list) and projs else 1
        r = requests.post(f"{API}/estimates/{e['id']}/link-project",
                          json={"project_id": pid}, headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["linked_project_id"] == pid
        # double link -> 422
        r2 = requests.post(f"{API}/estimates/{e['id']}/link-project",
                           json={"project_id": pid}, headers=admin_h, timeout=15)
        assert r2.status_code == 422
        # send-approval after linked -> 422
        r3 = requests.post(f"{API}/estimates/{e['id']}/send-approval",
                           json={"client_email": "x@example.com"}, headers=admin_h, timeout=15)
        assert r3.status_code == 422

    def test_link_missing_project_404(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        requests.post(f"{API}/estimates/{e['id']}/decision",
                      json={"action": "approve"}, headers=admin_h, timeout=15)
        r = requests.post(f"{API}/estimates/{e['id']}/link-project",
                          json={"project_id": 999999}, headers=admin_h, timeout=15)
        assert r.status_code == 404

    def test_link_rbac_accountant_forbidden(self, admin_h, acct_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        requests.post(f"{API}/estimates/{e['id']}/decision",
                      json={"action": "approve"}, headers=admin_h, timeout=15)
        r = requests.post(f"{API}/estimates/{e['id']}/link-project",
                          json={"project_id": 1}, headers=acct_h, timeout=15)
        assert r.status_code == 403


# --- Audit events ---

class TestAuditEvents:
    def test_events_actor_attributed(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        _send_approval(admin_h, e["id"])
        requests.post(f"{API}/estimates/{e['id']}/decision",
                      json={"action": "approve"}, headers=admin_h, timeout=15)
        r = requests.get(f"{API}/estimates/{e['id']}/events", headers=admin_h, timeout=10)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list) and len(events) >= 2
        actions = [ev["action"] for ev in events]
        assert any("approved" in a for a in actions)
        assert any("sent for approval" in a for a in actions)
        for ev in events:
            assert ev["actor"], f"actor missing: {ev}"
