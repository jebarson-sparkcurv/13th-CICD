"""Regression tests for the Purchase Order module (customer-facing PO).

Covers:
 - Create PO from a Quotation (pre-fill from line items)
 - One-active-PO-per-quotation rule (409 on duplicate)
 - Editing prices/discount/tax → backend recomputes correct totals
 - Cancel sets CANCELLED + cancelled_at, and the flag persists on re-fetch
 - PDF endpoint returns a valid application/pdf stream
 - Quotation list carries the `purchase_order` summary
 - Sending via WhatsApp / Email is blocked once CANCELLED
 - WhatsApp with missing vendor phone → 422
 - After cancel, a new PO can be created against the same quotation
"""
import os
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def api():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "kesari4416@gmail.com", "password": "admin123"}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def refs(api):
    # Ensure required base rows exist (client, project, vendor with email+phone, product, quotation).
    clients = api.get(f"{BASE}/api/clients", timeout=15).json()
    if not clients:
        clients = [api.post(f"{BASE}/api/clients", json={
            "name": "PO Test Client", "email": "c@potest.com", "phone": "+919999999999"
        }, timeout=15).json()]
    client_id = clients[0]["id"]

    project = api.post(f"{BASE}/api/projects", json={
        "name": f"PO-Test-Proj-{int(time.time()*1000)}",
        "client_id": client_id, "status": "Planning",
    }, timeout=15).json()

    vendors = api.get(f"{BASE}/api/vendors", timeout=15).json()
    if not vendors:
        vendor = api.post(f"{BASE}/api/vendors", json={
            "name": "PO Test Vendor", "vendor_type": "Supplier",
            "email": "v@potest.com", "phone": "+911234567890"
        }, timeout=15).json()
    else:
        vendor = vendors[0]
        if not vendor.get("email") or not vendor.get("phone"):
            api.patch(f"{BASE}/api/vendors/{vendor['id']}", json={
                "email": vendor.get("email") or "v@potest.com",
                "phone": vendor.get("phone") or "+911234567890",
            }, timeout=15)
            vendor = api.get(f"{BASE}/api/vendors/{vendor['id']}", timeout=15).json()

    products = api.get(f"{BASE}/api/products", timeout=15).json()
    if not products:
        prod = api.post(f"{BASE}/api/products", json={
            "name": "PO Test Bag", "unit": "bag", "default_price": 450,
        }, timeout=15).json()
    else:
        prod = products[0]

    quotation = api.post(f"{BASE}/api/projects/{project['id']}/quotations", json={
        "vendor_id": vendor["id"],
        "line_items": [{"product_id": prod["id"], "quantity": 100, "unit_price": 450}],
    }, timeout=15).json()

    return {"project_id": project["id"], "quotation_id": quotation["id"],
            "vendor_id": vendor["id"]}


def _create_po(api, quotation_id):
    r = api.post(f"{BASE}/api/quotations/{quotation_id}/purchase-order", timeout=15)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_po_prefills_from_quotation(api, refs):
    po = _create_po(api, refs["quotation_id"])
    assert po["status"] == "DRAFT"
    assert po["po_number"].startswith("PO-")
    assert po["subtotal"] == 45000.0
    assert po["grand_total"] == 45000.0
    assert len(po["items"]) == 1 and po["items"][0]["unit_price"] == 450.0


def test_duplicate_active_po_returns_409(api, refs):
    r = api.post(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15)
    assert r.status_code == 409, r.text


def test_edit_price_recomputes_backend_totals(api, refs):
    po = api.get(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15).json()
    assert po is not None, "expected an active PO"
    upd = api.put(f"{BASE}/api/quotation-purchase-orders/{po['id']}", json={
        "discount": 5000, "tax": 8100, "notes": "15-day delivery",
        "items": [{"item_name": "Cement Bag", "description": "OPC 53",
                   "quantity": 100, "unit_price": 500}],
    }, timeout=15)
    assert upd.status_code == 200, upd.text
    body = upd.json()
    assert body["subtotal"] == 50000.0
    assert body["discount"] == 5000.0
    assert body["tax"] == 8100.0
    # 50000 - 5000 + 8100 = 53100
    assert body["grand_total"] == 53100.0
    assert body["notes"] == "15-day delivery"


def test_pdf_is_returned(api, refs):
    po = api.get(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15).json()
    r = api.get(f"{BASE}/api/quotation-purchase-orders/{po['id']}/pdf", timeout=15)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:5] == b"%PDF-"


def test_quotation_list_includes_po_summary(api, refs):
    lst = api.get(f"{BASE}/api/projects/{refs['project_id']}/quotations", timeout=15).json()
    row = next(q for q in lst if q["id"] == refs["quotation_id"])
    assert row["purchase_order"] is not None
    assert row["purchase_order"]["po_number"].startswith("PO-")


def test_cancel_persists_and_blocks_send(api, refs):
    po = api.get(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15).json()
    r = api.post(f"{BASE}/api/quotation-purchase-orders/{po['id']}/cancel", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "CANCELLED"
    assert r.json()["cancelled_at"] is not None

    # refresh — cancellation persists
    refreshed = api.get(f"{BASE}/api/quotation-purchase-orders/{po['id']}", timeout=15).json()
    assert refreshed["status"] == "CANCELLED"

    # sending on CANCELLED is blocked
    email = api.post(f"{BASE}/api/quotation-purchase-orders/{po['id']}/send-email", timeout=15)
    assert email.status_code == 422
    wa = api.post(f"{BASE}/api/quotation-purchase-orders/{po['id']}/send-whatsapp", timeout=15)
    assert wa.status_code == 422


def test_new_po_can_be_created_after_cancellation(api, refs):
    r = api.post(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15)
    assert r.status_code == 201, r.text
    new_po = r.json()
    assert new_po["status"] == "DRAFT"
    # sanity: it's a fresh PO number
    assert new_po["po_number"].startswith("PO-")


def test_whatsapp_returns_wa_link(api, refs):
    po = api.get(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15).json()
    r = api.post(f"{BASE}/api/quotation-purchase-orders/{po['id']}/send-whatsapp", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["wa_link"].startswith("https://wa.me/")
    assert body["po"]["status"] == "SENT"


def test_whatsapp_blocked_without_vendor_phone(api, refs):
    # Temporarily strip vendor phone.
    vendor = api.get(f"{BASE}/api/vendors/{refs['vendor_id']}", timeout=15).json()
    original_phone = vendor.get("phone")
    api.patch(f"{BASE}/api/vendors/{refs['vendor_id']}", json={"phone": None}, timeout=15)
    try:
        # New PO for a fresh test (previous is SENT); cancel first, then create.
        current = api.get(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15).json()
        api.post(f"{BASE}/api/quotation-purchase-orders/{current['id']}/cancel", timeout=15)
        fresh = api.post(f"{BASE}/api/quotations/{refs['quotation_id']}/purchase-order", timeout=15).json()
        r = api.post(f"{BASE}/api/quotation-purchase-orders/{fresh['id']}/send-whatsapp", timeout=15)
        assert r.status_code == 422
        assert "phone" in r.json()["detail"].lower()
    finally:
        api.patch(f"{BASE}/api/vendors/{refs['vendor_id']}", json={"phone": original_phone}, timeout=15)
