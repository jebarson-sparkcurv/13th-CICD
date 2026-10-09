"""iter23 — Verify send-approval returns ABSOLUTE https URLs and email_error is populated when SMTP fails."""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login('kesari4416@gmail.com', 'admin123')}"}


@pytest.fixture(scope="module")
def lookups(admin_h):
    cats = requests.get(f"{API}/estimate-categories", headers=admin_h, timeout=10).json()
    sts = requests.get(f"{API}/estimate-statuses", headers=admin_h, timeout=10).json()
    return cats[0]["id"], sts[0]["id"]


def _mk_estimate(headers, lookups):
    cat_id, st_id = lookups
    payload = {"project_name": f"TEST_absurl_{int(time.time()*1000)}",
               "phase": "Foundation", "category_id": cat_id, "status_id": st_id,
               "total_amount": 4321.0}
    r = requests.post(f"{API}/estimates", json=payload, headers=headers, timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


class TestAbsoluteUrls:
    def test_urls_absolute_https(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/send-approval",
                          json={"client_email": "test@example.com"},
                          headers=admin_h, timeout=25)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["approve_url"].startswith("https://"), body["approve_url"]
        assert body["reject_url"].startswith("https://"), body["reject_url"]
        assert "portal-construction.preview.emergentagent.com" in body["approve_url"]
        assert "portal-construction.preview.emergentagent.com" in body["reject_url"]
        assert f"/estimate-approval/{e['id']}/" in body["approve_url"]
        assert body["approve_url"].endswith("?action=approve")
        assert body["reject_url"].endswith("?action=reject")

    def test_email_error_populated_when_smtp_fails(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/send-approval",
                          json={"client_email": "test@example.com"},
                          headers=admin_h, timeout=25)
        assert r.status_code == 200
        body = r.json()
        # SMTP creds expected to fail (535) OR SMTP not configured.
        # If email_sent False -> email_error MUST be a non-empty string
        if body["email_sent"] is False:
            assert isinstance(body["email_error"], str) and len(body["email_error"]) > 0
        else:
            # unlikely in this env but if creds fixed, no error
            assert body["email_error"] in (None, "")

    def test_origin_header_still_absolute(self, admin_h, lookups):
        # Even if we pass a differing Origin header, code prefers FRONTEND_URL env; result must still be absolute
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/send-approval",
                          json={"client_email": "test@example.com"},
                          headers={**admin_h, "Origin": "https://foo.example.com"},
                          timeout=25)
        assert r.status_code == 200
        body = r.json()
        assert body["approve_url"].startswith("https://")
        assert body["reject_url"].startswith("https://")

    def test_public_link_actually_works(self, admin_h, lookups):
        e = _mk_estimate(admin_h, lookups)
        r = requests.post(f"{API}/estimates/{e['id']}/send-approval",
                          json={"client_email": "test@example.com"},
                          headers=admin_h, timeout=25)
        body = r.json()
        token = body["approve_url"].split("/")[-1].split("?")[0]
        # public GET works with no auth
        rv = requests.get(f"{API}/public/estimate-approval/{e['id']}/{token}", timeout=10)
        assert rv.status_code == 200
        # public approve works
        ra = requests.post(f"{API}/public/estimate-approval/{e['id']}/{token}",
                           json={"action": "approve"}, timeout=15)
        assert ra.status_code == 200
        assert ra.json()["approval_state"] == "approved"
