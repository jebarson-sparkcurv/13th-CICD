"""Focused tests for procurement module — bid flow, vendors, deliveries,
procurement docs (client-scoped/rename/delete perms), CO approve perms."""
import io
import os
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_CREDS = {"email": "kesari4416@gmail.com", "password": "admin123"}
ENG_CREDS = {"email": "raj@buildcore.com", "password": "engineer123"}
CLIENT_CREDS = {"email": "priya@skyline.com", "password": "client123"}


def _token(creds):
    r = requests.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_token(ADMIN_CREDS)}"
    return s


@pytest.fixture(scope="module")
def engineer():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_token(ENG_CREDS)}"
    return s


@pytest.fixture(scope="module")
def client_user():
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {_token(CLIENT_CREDS)}"
    return s


# ---------- Vendors ----------
class TestVendors:
    def test_list_vendors(self, admin):
        r = admin.get(f"{API}/vendors")
        assert r.status_code == 200
        vendors = r.json()
        assert len(vendors) > 0
        assert all("id" in v and "name" in v for v in vendors)

    def test_expiring_insurance_filter(self, admin):
        r = admin.get(f"{API}/vendors", params={"expiring_insurance": "true"})
        assert r.status_code == 200
        names = [v["name"] for v in r.json()]
        # Per spec: Nova Concrete + Zenith should appear (expired/expiring within 30 days)
        assert any("Nova" in n for n in names), f"Expected Nova Concrete in expiring list; got {names}"
        assert any("Zenith" in n for n in names), f"Expected Zenith in expiring list; got {names}"

    def test_trade_filter(self, admin):
        r = admin.get(f"{API}/vendors", params={"trade": "Concrete"})
        assert r.status_code == 200
        for v in r.json():
            assert "concrete" in (v.get("trade") or "").lower()

    def test_prequalified_filter(self, admin):
        r = admin.get(f"{API}/vendors", params={"prequalified": "true"})
        assert r.status_code == 200
        assert all(v.get("prequalified") is True for v in r.json())

    def test_vendor_doc_upload_coi(self, admin):
        # find any vendor
        vendors = admin.get(f"{API}/vendors").json()
        vid = vendors[0]["id"]
        files = {"file": ("TEST_coi.pdf", io.BytesIO(b"%PDF-1.4 test coi"), "application/pdf")}
        expiry = (date.today() + timedelta(days=365)).isoformat()
        data = {"document_name": "TEST_COI_doc", "category": "COI", "expiry_date": expiry}
        r = admin.post(f"{API}/vendors/{vid}/documents", files=files, data=data)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["category"] == "COI"
        assert body["expiry_date"] == expiry
        assert body["document_name"] == "TEST_COI_doc"
        # cleanup
        admin.delete(f"{API}/vendor-documents/{body['id']}")


# ---------- Bid Flow ----------
class TestBidFlow:
    def test_bid_flow_end_to_end(self, admin):
        vendors = admin.get(f"{API}/vendors").json()
        # pick two vendors with valid insurance (not "Zenith" if expired)
        # We just pick first two
        v1, v2 = vendors[0]["id"], vendors[1]["id"]

        # 1. Create bid package on project 1
        bp_payload = {"title": "TEST_bid_pkg_flow", "scope_description": "Test scope",
                      "cost_code": "03-3000", "status": "Draft"}
        r = admin.post(f"{API}/projects/1/bid-packages", json=bp_payload)
        assert r.status_code == 201, r.text
        bp = r.json()
        bp_id = bp["id"]

        # 2. Bulk invite vendors
        r = admin.post(f"{API}/bid-packages/{bp_id}/invite", json={"vendor_ids": [v1, v2]})
        assert r.status_code == 201, r.text
        pkg = r.json()
        assert len(pkg["invitations"]) == 2
        inv_statuses = {i["vendor_id"]: i["response_status"] for i in pkg["invitations"]}

        # 3. Submit bid for v1 → invitation flips to Submitted
        r = admin.post(f"{API}/bid-packages/{bp_id}/bids",
                       json={"vendor_id": v1, "amount": "1000000", "notes": "TEST bid"})
        assert r.status_code == 201, r.text
        bid = r.json()
        bid_id = bid["id"]

        r = admin.get(f"{API}/bid-packages/{bp_id}")
        pkg2 = r.json()
        inv2 = {i["vendor_id"]: i["response_status"] for i in pkg2["invitations"]}
        assert inv2[v1] == "Submitted", f"Invitation should flip to Submitted, got {inv2}"

        # 4. PATCH bid is_leveled
        r = admin.patch(f"{API}/bids/{bid_id}", json={"is_leveled": True})
        assert r.status_code == 200
        assert r.json()["is_leveled"] is True

        # 5. Award — commitment_type = po → creates draft PO, marks package & bid Awarded
        r = admin.post(f"{API}/bid-packages/{bp_id}/award",
                       json={"bid_id": bid_id, "commitment_type": "po"})
        assert r.status_code == 201, r.text
        new_po = r.json()
        assert new_po["status"] == "Draft"
        assert new_po["vendor_id"] == v1

        r = admin.get(f"{API}/bid-packages/{bp_id}")
        pkg3 = r.json()
        assert pkg3["status"] == "Awarded"
        assert any(b["status"] == "Awarded" for b in pkg3["bids"])

        # cleanup: cancel PO to avoid affecting dashboard
        admin.post(f"{API}/purchase-orders/{new_po['id']}/cancel")

    def test_award_subcontract_commitment_type(self, admin):
        vendors = admin.get(f"{API}/vendors").json()
        v1 = vendors[0]["id"]
        bp = admin.post(f"{API}/projects/1/bid-packages",
                        json={"title": "TEST_bid_pkg_sub", "cost_code": "05-1000"}).json()
        admin.post(f"{API}/bid-packages/{bp['id']}/invite", json={"vendor_ids": [v1]})
        bid = admin.post(f"{API}/bid-packages/{bp['id']}/bids",
                         json={"vendor_id": v1, "amount": "500000"}).json()
        r = admin.post(f"{API}/bid-packages/{bp['id']}/award",
                       json={"bid_id": bid["id"], "commitment_type": "subcontract"})
        assert r.status_code == 201, r.text
        sub = r.json()
        assert "contract_number" in sub
        assert sub["vendor_id"] == v1


# ---------- Change Order engineer 403 ----------
class TestChangeOrderPerms:
    def test_engineer_cannot_approve_co(self, admin, engineer):
        # create a CO on subcontract 1 as engineer
        r = engineer.post(f"{API}/commitments/subcontract/1/change-orders",
                          json={"reason": "TEST_perm_check", "amount": "10000"})
        assert r.status_code == 201, r.text
        co_id = r.json()["id"]
        # engineer tries to approve → 403
        r = engineer.patch(f"{API}/change-orders/{co_id}", json={"status": "Approved"})
        assert r.status_code == 403, r.text
        # admin cleanup — void it
        admin.patch(f"{API}/change-orders/{co_id}", json={"status": "Void"})


# ---------- Deliveries ----------
class TestDeliveries:
    def test_delivery_crud(self, admin):
        payload = {"item_description": "TEST_rebar_delivery", "quantity_delivered": "500",
                   "delivery_date": date.today().isoformat(), "status": "Pending"}
        r = admin.post(f"{API}/projects/1/deliveries", json=payload)
        assert r.status_code == 201, r.text
        dv = r.json()
        dv_id = dv["id"]
        assert dv["item_description"] == "TEST_rebar_delivery"

        r = admin.get(f"{API}/projects/1/deliveries")
        assert r.status_code == 200
        assert any(d["id"] == dv_id for d in r.json())

        r = admin.patch(f"{API}/deliveries/{dv_id}", json={"status": "Complete"})
        assert r.status_code == 200
        assert r.json()["status"] == "Complete"


# ---------- Procurement Documents perms + client-scoped ----------
class TestProcDocs:
    def _upload(self, session, rtype, rid, name, client_visible):
        files = {"file": (f"{name}.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
        data = {"document_name": name, "category": "Contract",
                "is_client_visible": "true" if client_visible else "false"}
        r = session.post(f"{API}/procurement/{rtype}/{rid}/documents", files=files, data=data)
        assert r.status_code == 201, r.text
        return r.json()

    def test_upload_default_internal(self, admin):
        doc = self._upload(admin, "subcontract", 1, "TEST_default_internal", False)
        assert doc["is_client_visible"] is False
        assert doc["document_name"] == "TEST_default_internal"
        admin.delete(f"{API}/procurement-documents/{doc['id']}")

    def test_client_scoped_only_visible(self, admin, client_user):
        # Upload one visible, one not
        vis = self._upload(admin, "subcontract", 1, "TEST_client_vis", True)
        internal = self._upload(admin, "subcontract", 1, "TEST_client_hidden", False)
        try:
            r = client_user.get(f"{API}/clients/1/projects/1/procurement-documents")
            assert r.status_code == 200, r.text
            names = [d["document_name"] for d in r.json()]
            assert "TEST_client_vis" in names
            assert "TEST_client_hidden" not in names
        finally:
            admin.delete(f"{API}/procurement-documents/{vis['id']}")
            admin.delete(f"{API}/procurement-documents/{internal['id']}")

    def test_rename_engineer_ok_delete_admin_only(self, admin, engineer):
        doc = self._upload(admin, "subcontract", 1, "TEST_rename_flow", False)
        try:
            # engineer can PATCH (STAFF)
            r = engineer.patch(f"{API}/procurement-documents/{doc['id']}",
                               json={"document_name": "TEST_renamed"})
            assert r.status_code == 200, r.text
            assert r.json()["document_name"] == "TEST_renamed"
            # engineer cannot DELETE (ADMIN only)
            r = engineer.delete(f"{API}/procurement-documents/{doc['id']}")
            assert r.status_code == 403, r.text
        finally:
            admin.delete(f"{API}/procurement-documents/{doc['id']}")

    def test_search_and_category_filter(self, admin):
        d1 = self._upload(admin, "subcontract", 1, "TEST_search_unique_xyz", False)
        try:
            r = admin.get(f"{API}/procurement/subcontract/1/documents",
                          params={"search": "unique_xyz"})
            assert r.status_code == 200
            assert any(d["id"] == d1["id"] for d in r.json())
            r = admin.get(f"{API}/procurement/subcontract/1/documents",
                          params={"category": "Contract"})
            assert r.status_code == 200
            assert all(d["category"] == "Contract" for d in r.json())
        finally:
            admin.delete(f"{API}/procurement-documents/{d1['id']}")


# ---------- Dashboard summary sanity ----------
class TestDashboard:
    def test_summary_fields(self, admin):
        r = admin.get(f"{API}/projects/1/procurement/dashboard-summary")
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("total_committed", "budget_variance", "open_pos",
                    "pending_approvals", "expiring_insurance"):
            assert key in body, f"missing key {key} in {body}"

    def test_commitments_over_budget_filter(self, admin):
        r = admin.get(f"{API}/projects/1/procurement/commitments",
                      params={"over_budget": "true"})
        assert r.status_code == 200
        items = r.json()["items"]
        # SC-1-001 should be over budget per spec
        contracts = [i for i in items if i.get("contract_number") == "SC-1-001"]
        assert len(contracts) == 1, f"Expected SC-1-001 in over_budget list; got {[i.get('contract_number') or i.get('po_number') for i in items]}"

    def test_commitments_open_status_filter(self, admin):
        r = admin.get(f"{API}/projects/1/procurement/commitments",
                      params={"type": "po", "status": "open"})
        assert r.status_code == 200
        for item in r.json()["items"]:
            assert item["status"] in ("Approved", "PartiallyReceived")

    def test_insurance_gate_po_zenith(self, admin):
        # find PO-1-002 (Zenith, expired) → approve must 422
        pos = admin.get(f"{API}/projects/1/purchase-orders").json()
        target = next((p for p in pos if p.get("po_number") == "PO-1-002"), None)
        if not target:
            pytest.skip("PO-1-002 not seeded")
        r = admin.post(f"{API}/purchase-orders/{target['id']}/approve")
        assert r.status_code == 422, r.text
