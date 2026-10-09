"""Regression tests for the Leads (lead generation) module.

Covers: CRUD, duplicate detection, status-change logging, activity auto-advance,
follow-up filters, stats, CSV import/export, convert-to-client, the public
enquiry form (submit, repeat-enquiry merge, honeypot, disable), module gating
and tenant isolation.

Run:  cd backend && pytest tests/test_leads.py -n 0 -v
"""
import os
import sys
import time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import pytest
from fastapi.testclient import TestClient

from app.main import app

ADMIN = {"email": os.environ.get("ADMIN_EMAIL", "kesari4416@gmail.com"),
         "password": os.environ.get("ADMIN_PASSWORD", "admin123")}
SUPER = {"email": os.environ.get("SUPERADMIN_EMAIL", "ponish.jino@sparkcurv.com"),
         "password": os.environ.get("SUPERADMIN_PASSWORD", "superadmin123")}
STAMP = str(int(time.time() * 1000))[-8:]


def _phone(n: int) -> str:
    return f"9{STAMP}{n:01d}"[:10]


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _login(client, creds):
    r = client.post("/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin(client):
    return _login(client, ADMIN)


@pytest.fixture(scope="module")
def lead(client, admin):
    r = client.post("/api/leads", headers=admin, json={
        "name": f"Test Lead {STAMP}", "phone": f"+91 {_phone(1)}", "location": "Nagercoil",
        "project_type": "Residential", "budget": "4500000", "source": "Walk-in", "priority": "High",
    })
    assert r.status_code == 201, r.text
    return r.json()


def test_create_lead(lead):
    assert lead["status"] == "New"
    assert lead["budget"] == 4500000
    assert lead["activities"][0]["type"] == "System"


def test_requires_contact(client, admin):
    r = client.post("/api/leads", headers=admin, json={"name": "No contact"})
    assert r.status_code == 422


def test_bad_budget_rejected_not_500(client, admin):
    for bad in ("NaN", "Infinity", "1e15", "-5", "abc"):
        r = client.post("/api/leads", headers=admin, json={"name": "Budget", "phone": "9123400000", "budget": bad})
        assert r.status_code == 422, (bad, r.status_code)


def test_duplicate_phone_detected(client, admin, lead):
    # Same number, different formatting → still a duplicate
    r = client.post("/api/leads", headers=admin, json={"name": "Dup", "phone": _phone(1)})
    assert r.status_code == 409
    assert r.json()["detail"]["duplicate_id"] == lead["id"]
    r = client.post("/api/leads", headers=admin, json={"name": "Dup", "phone": _phone(1), "allow_duplicate": True})
    assert r.status_code == 201
    client.delete(f"/api/leads/{r.json()['id']}", headers=admin)


def test_status_change_is_logged(client, admin, lead):
    r = client.patch(f"/api/leads/{lead['id']}", headers=admin, json={"status": "Qualified"})
    assert r.status_code == 200
    assert r.json()["status"] == "Qualified"
    assert any("New → Qualified" in (a["content"] or "") for a in r.json()["activities"])


def test_lost_requires_reason(client, admin, lead):
    r = client.patch(f"/api/leads/{lead['id']}", headers=admin, json={"status": "Lost"})
    assert r.status_code == 422


def test_activity_sets_follow_up_and_contacted(client, admin):
    r = client.post("/api/leads", headers=admin, json={"name": "Act Lead", "email": f"act{STAMP}@test.com"})
    lid = r.json()["id"]
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    r = client.post(f"/api/leads/{lid}/activities", headers=admin,
                    json={"type": "Call", "content": "Discussed plot", "next_follow_up": past})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "Contacted"           # auto-advanced from New
    assert body["last_contacted_at"]
    assert body["follow_up_overdue"] is True
    overdue = client.get("/api/leads", headers=admin, params={"follow_up": "overdue"}).json()
    assert lid in [l["id"] for l in overdue]
    r = client.post(f"/api/leads/{lid}/activities", headers=admin, json={"type": "StatusChange", "content": "x"})
    assert r.status_code == 422                     # system-only type
    client.delete(f"/api/leads/{lid}", headers=admin)


def test_list_search_and_stats(client, admin, lead):
    rows = client.get("/api/leads", headers=admin, params={"q": STAMP}).json()
    assert lead["id"] in [l["id"] for l in rows]
    stats = client.get("/api/leads/stats", headers=admin).json()
    assert stats["total"] >= 1 and "by_status" in stats and "pipeline_value" in stats


def test_export_csv(client, admin, lead):
    r = client.get("/api/leads/export", headers=admin)
    assert r.status_code == 200
    assert "text/csv" in r.headers["content-type"]
    assert lead["name"] in r.text


def test_export_neutralises_formulas(client, admin):
    r = client.post("/api/leads", headers=admin, json={"name": f"=HYPERLINK(\"x\") {STAMP}", "email": f"f{STAMP}@t.com"})
    lid = r.json()["id"]
    text = client.get("/api/leads/export", headers=admin).text
    assert f"'=HYPERLINK" in text
    client.delete(f"/api/leads/{lid}", headers=admin)


def test_import_csv(client, admin):
    csv_body = ("Name,Mobile,City,Budget,Lead Source\n"
                f"Import One {STAMP},{_phone(5)},Madurai,2500000,JustDial\n"
                f"Import Dup {STAMP},{_phone(5)},Madurai,,JustDial\n"
                ",9000000000,,,\n")
    r = client.post("/api/leads/import", headers=admin,
                    files={"file": ("leads.csv", csv_body, "text/csv")})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["created"] == 1 and out["skipped_duplicates"] == 1 and len(out["errors"]) == 1
    rows = client.get("/api/leads", headers=admin, params={"q": f"Import One {STAMP}"}).json()
    assert rows[0]["source"] == "JustDial" and rows[0]["location"] == "Madurai"
    client.delete(f"/api/leads/{rows[0]['id']}", headers=admin)


def test_convert_to_client(client, admin, lead):
    r = client.post(f"/api/leads/{lead['id']}/convert", headers=admin, json={})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["lead"]["status"] == "Won"
    assert out["lead"]["converted_client_id"] == out["client"]["id"]
    assert out["client"]["name"] == lead["name"]
    assert client.post(f"/api/leads/{lead['id']}/convert", headers=admin, json={}).status_code == 409
    # Converted leads stay Won
    assert client.patch(f"/api/leads/{lead['id']}", headers=admin, json={"status": "New"}).status_code == 409


def test_public_form_flow(client, admin):
    form = client.get("/api/leads/capture-form", headers=admin).json()
    token = form["token"]
    info = client.get(f"/api/public/lead-form/{token}")
    assert info.status_code == 200 and info.json()["company_name"]

    payload = {"name": f"Web Visitor {STAMP}", "phone": _phone(7), "project_type": "Villa",
               "budget": "8000000", "requirement": "G+1 villa"}
    assert client.post(f"/api/public/lead-form/{token}", json=payload).status_code == 201
    rows = client.get("/api/leads", headers=admin, params={"q": f"Web Visitor {STAMP}"}).json()
    assert len(rows) == 1 and rows[0]["source"] == "Website" and rows[0]["next_follow_up"]
    lid = rows[0]["id"]

    # Repeat enquiry merges into the same lead
    assert client.post(f"/api/public/lead-form/{token}", json=payload).status_code == 201
    rows = client.get("/api/leads", headers=admin, params={"q": f"Web Visitor {STAMP}"}).json()
    assert len(rows) == 1
    detail = client.get(f"/api/leads/{lid}", headers=admin).json()
    assert sum(1 for a in detail["activities"] if a["type"] == "Enquiry") == 2

    # Honeypot submissions are silently dropped
    client.post(f"/api/public/lead-form/{token}", json={**payload, "name": f"Bot {STAMP}", "phone": _phone(8), "website": "spam.example"})
    assert client.get("/api/leads", headers=admin, params={"q": f"Bot {STAMP}"}).json() == []

    # Disabled form → 404; re-enable for other tests
    client.patch("/api/leads/capture-form", headers=admin, json={"is_enabled": False})
    assert client.get(f"/api/public/lead-form/{token}").status_code == 404
    client.patch("/api/leads/capture-form", headers=admin, json={"is_enabled": True})

    # Regenerating invalidates the old token
    new = client.post("/api/leads/capture-form/regenerate", headers=admin).json()
    assert new["token"] != token
    assert client.get(f"/api/public/lead-form/{token}").status_code == 404
    client.delete(f"/api/leads/{lid}", headers=admin)


def test_public_form_validation(client, admin):
    token = client.get("/api/leads/capture-form", headers=admin).json()["token"]
    assert client.post(f"/api/public/lead-form/{token}", json={"name": "x"}).status_code == 422
    assert client.post(f"/api/public/lead-form/{token}", json={"name": "x", "email": "bad"}).status_code == 422
    # Garbage budget from the internet is ignored, never a 500
    r = client.post(f"/api/public/lead-form/{token}", json={"name": f"NaN {STAMP}", "phone": _phone(9), "budget": "NaN"})
    assert r.status_code == 201
    assert client.get("/api/public/lead-form/not-a-real-token").status_code == 404


def test_tenant_isolation_and_module_gating(client, admin, lead):
    su = _login(client, SUPER)
    iso_email = f"leads_iso_{STAMP}@test.com"
    r = client.post("/api/tenants", headers=su, json={
        "name": f"LeadsIso_{STAMP}", "admin_email": iso_email, "admin_name": "Iso Admin",
        "admin_password": "isotest123", "allowed_modules": ["projects", "clients"],
    })
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    try:
        iso = _login(client, {"email": iso_email, "password": "isotest123"})
        # Module not granted → 403
        assert client.get("/api/leads", headers=iso).status_code == 403
        # Grant it → works, but sees none of the default tenant's leads
        client.patch(f"/api/tenants/{tid}", headers=su, json={"allowed_modules": ["projects", "clients", "leads"]})
        iso = _login(client, {"email": iso_email, "password": "isotest123"})
        assert client.get("/api/leads", headers=iso).json() == []
        assert client.get(f"/api/leads/{lead['id']}", headers=iso).status_code == 404
        assert client.patch(f"/api/leads/{lead['id']}", headers=iso, json={"status": "New"}).status_code == 404
        # Same phone is NOT a duplicate across tenants
        r = client.post("/api/leads", headers=iso, json={"name": "Iso Lead", "phone": _phone(1)})
        assert r.status_code == 201
    finally:
        client.delete(f"/api/tenants/{tid}/permanent", headers=su)


def test_delete_lead(client, admin, lead):
    assert client.delete(f"/api/leads/{lead['id']}", headers=admin).status_code == 200
    assert client.get(f"/api/leads/{lead['id']}", headers=admin).status_code == 404
