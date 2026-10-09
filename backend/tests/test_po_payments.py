"""Record vendor payments on a Purchase Order.

Covers: Draft PO can't be paid · partial + full payments update paid / balance /
payment_status · overpayment refused · future date refused · payment shows in
the project balance sheet as vendor payment · PO with payments can't be
cancelled or reduced below the paid amount · quotation summary carries paid.

Run:  cd backend && pytest tests/test_po_payments.py -n 0 -v
(needs REACT_APP_BACKEND_URL pointing at the running backend, like test_purchase_orders.py)
"""
import os
import time
from datetime import date, timedelta

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": os.environ.get("ADMIN_EMAIL", "kesari4416@gmail.com"),
         "password": os.environ.get("ADMIN_PASSWORD", "admin123")}


@pytest.fixture(scope="module")
def api():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s


@pytest.fixture(scope="module")
def po(api):
    stamp = int(time.time() * 1000)
    client = api.post(f"{BASE}/api/clients", json={"name": f"PayTest Client {stamp}", "phone": "9000000001"}, timeout=15).json()
    project = api.post(f"{BASE}/api/projects", json={"name": f"PayTest-Proj-{stamp}", "client_id": client["id"],
                                                     "status": "Planning"}, timeout=15).json()
    vendors = api.get(f"{BASE}/api/vendors", timeout=15).json()
    vendor = vendors[0] if vendors else api.post(f"{BASE}/api/vendors", json={
        "name": "PayTest Vendor", "vendor_type": "Supplier", "phone": "+911234567890"}, timeout=15).json()
    products = api.get(f"{BASE}/api/products", timeout=15).json()
    prod = products[0] if products else api.post(f"{BASE}/api/products", json={
        "name": "PayTest Bag", "unit": "bag", "default_price": 400}, timeout=15).json()
    q = api.post(f"{BASE}/api/projects/{project['id']}/quotations", json={
        "vendor_id": vendor["id"], "line_items": [{"product_id": prod["id"], "quantity": 100, "unit_price": 400}]},
        timeout=15).json()
    r = api.post(f"{BASE}/api/quotations/{q['id']}/purchase-order", timeout=15)
    assert r.status_code == 201, r.text
    return {"po": r.json(), "project_id": project["id"], "quotation_id": q["id"]}


def _pay(api, po_id, amount, **kw):
    return api.post(f"{BASE}/api/quotation-purchase-orders/{po_id}/payments",
                    json={"amount": amount, "payment_method": "UPI", **kw}, timeout=15)


def test_draft_po_cannot_be_paid(api, po):
    assert po["po"]["status"] == "DRAFT"
    assert _pay(api, po["po"]["id"], 100).status_code == 409


def test_issue_then_partial_and_full_payment(api, po):
    pid = po["po"]["id"]
    r = api.put(f"{BASE}/api/quotation-purchase-orders/{pid}", json={"status": "ISSUED"}, timeout=15)
    assert r.status_code == 200, r.text
    total = r.json()["grand_total"]
    assert r.json()["amount_paid"] == 0 and r.json()["balance_due"] == total and r.json()["payment_status"] == "Unpaid"

    bs_before = api.get(f"{BASE}/api/projects/{po['project_id']}/balance-sheet", timeout=15).json()

    r = _pay(api, pid, 15000, reference_no="UTR123", notes="Advance")
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["amount_paid"] == 15000 and out["balance_due"] == round(total - 15000, 2)
    assert out["payment_status"] == "Partially Paid"

    # overpay / future date / bad method refused
    assert _pay(api, pid, total).status_code == 422
    assert _pay(api, pid, 10, payment_date=str(date.today() + timedelta(days=2))).status_code == 422
    assert api.post(f"{BASE}/api/quotation-purchase-orders/{pid}/payments",
                    json={"amount": 10, "payment_method": "Bitcoin"}, timeout=15).status_code == 422

    r = _pay(api, pid, out["balance_due"])
    assert r.status_code == 201 and r.json()["payment_status"] == "Paid" and r.json()["balance_due"] == 0

    lst = api.get(f"{BASE}/api/quotation-purchase-orders/{pid}/payments", timeout=15).json()
    assert len(lst["payments"]) == 2 and lst["amount_paid"] == total
    assert any(p["reference_no"] == "UTR123" for p in lst["payments"])

    bs_after = api.get(f"{BASE}/api/projects/{po['project_id']}/balance-sheet", timeout=15).json()
    vp = lambda b: (b.get("released") or {}).get("vendor_payments", 0)
    assert round(vp(bs_after) - vp(bs_before), 2) == total

    q = api.get(f"{BASE}/api/quotations/{po['quotation_id']}", timeout=15).json()
    assert q["purchase_order"]["amount_paid"] == total


def test_paid_po_is_protected(api, po):
    pid = po["po"]["id"]
    assert api.post(f"{BASE}/api/quotation-purchase-orders/{pid}/cancel", timeout=15).status_code == 409
    # Reducing the total below what was paid is refused
    cur = api.get(f"{BASE}/api/quotation-purchase-orders/{pid}", timeout=15).json()
    items = [{"item_name": it["item_name"], "description": it["description"], "quantity": 1,
              "unit_price": 1, "quotation_item_id": it["quotation_item_id"]} for it in cur["items"]]
    assert api.put(f"{BASE}/api/quotation-purchase-orders/{pid}", json={"items": items}, timeout=15).status_code == 422
    after = api.get(f"{BASE}/api/quotation-purchase-orders/{pid}", timeout=15).json()
    assert after["grand_total"] == cur["grand_total"]          # unchanged
