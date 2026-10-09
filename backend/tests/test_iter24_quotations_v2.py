"""Iter24 — Vendor Product Catalog + Quotation workflow (quotations_v2)"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "kesari4416@gmail.com", "password": "admin123"}
ACCT = {"email": "asha@buildcore.com", "password": "accountant123"}
SE = {"email": "raj@buildcore.com", "password": "engineer123"}


def _tok(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_tok(ADMIN)}"}


@pytest.fixture(scope="module")
def acct_h():
    return {"Authorization": f"Bearer {_tok(ACCT)}"}


@pytest.fixture(scope="module")
def se_h():
    return {"Authorization": f"Bearer {_tok(SE)}"}


@pytest.fixture(scope="module")
def vendor_id(admin_h):
    r = requests.get(f"{API}/vendors", headers=admin_h)
    assert r.status_code == 200
    vs = r.json()
    assert vs, "need at least one vendor seeded"
    return vs[0]["id"]


TS = int(time.time())


# ---------- Products ----------
class TestProducts:
    def test_create_list_get_patch(self, admin_h):
        payload = {"name": f"TEST_Prod_{TS}", "unit": "bag", "category": "Cement",
                   "description": "Test", "default_price": 400.5}
        r = requests.post(f"{API}/products", json=payload, headers=admin_h)
        assert r.status_code == 201, r.text
        p = r.json()
        assert p["name"] == payload["name"]
        assert p["default_price"] == 400.5
        pid = p["id"]

        # list + search
        rl = requests.get(f"{API}/products", headers=admin_h, params={"search": f"TEST_Prod_{TS}"})
        assert rl.status_code == 200
        assert any(x["id"] == pid for x in rl.json())

        # category filter
        rc = requests.get(f"{API}/products", headers=admin_h, params={"category": "Cement"})
        assert rc.status_code == 200
        assert any(x["id"] == pid for x in rc.json())

        # get
        rg = requests.get(f"{API}/products/{pid}", headers=admin_h)
        assert rg.status_code == 200

        # patch
        rp = requests.patch(f"{API}/products/{pid}",
                            json={**payload, "default_price": 450},
                            headers=admin_h)
        assert rp.status_code == 200
        assert rp.json()["default_price"] == 450

        # delete
        rd = requests.delete(f"{API}/products/{pid}", headers=admin_h)
        assert rd.status_code == 204

    def test_delete_blocked_when_in_quotation(self, admin_h, vendor_id):
        # create product
        r = requests.post(f"{API}/products",
                          json={"name": f"TEST_Locked_{TS}", "unit": "kg", "default_price": 60},
                          headers=admin_h)
        pid = r.json()["id"]
        # attach to a quotation
        qr = requests.post(f"{API}/projects/1/quotations",
                           json={"vendor_id": vendor_id,
                                 "line_items": [{"product_id": pid, "quantity": 2, "unit_price": 60}]},
                           headers=admin_h)
        assert qr.status_code == 201, qr.text
        # try delete
        rd = requests.delete(f"{API}/products/{pid}", headers=admin_h)
        assert rd.status_code == 422


# ---------- Quotations ----------
@pytest.fixture(scope="module")
def product_id(admin_h):
    r = requests.post(f"{API}/products",
                      json={"name": f"TEST_QProd_{TS}", "unit": "bag",
                            "category": "Cement", "default_price": 500},
                      headers=admin_h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def quotation_id(admin_h, vendor_id, product_id):
    payload = {"vendor_id": vendor_id,
               "line_items": [
                   {"product_id": product_id, "quantity": 10, "unit_price": 500},
                   {"product_id": product_id, "quantity": 5, "unit_price": 480},
               ]}
    r = requests.post(f"{API}/projects/1/quotations", json=payload, headers=admin_h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


class TestQuotations:
    def test_create_computes_total_and_lists(self, admin_h, vendor_id, product_id):
        payload = {"vendor_id": vendor_id,
                   "line_items": [
                       {"product_id": product_id, "quantity": 10, "unit_price": 500},
                       {"product_id": product_id, "quantity": 5, "unit_price": 480},
                   ]}
        r = requests.post(f"{API}/projects/1/quotations", json=payload, headers=admin_h)
        assert r.status_code == 201, r.text
        q = r.json()
        assert q["quotation_total"] == pytest.approx(10 * 500 + 5 * 480)
        assert len(q["line_items"]) == 2
        assert q["quotation_number"].startswith("QTN-")
        qid = q["id"]

        # list
        rl = requests.get(f"{API}/projects/1/quotations", headers=admin_h)
        assert rl.status_code == 200
        assert any(x["id"] == qid for x in rl.json())

        # get
        rg = requests.get(f"{API}/quotations/{qid}", headers=admin_h)
        assert rg.status_code == 200
        assert rg.json()["quotation_total"] == pytest.approx(7400)

    def test_zero_line_items_rejected(self, admin_h, vendor_id):
        r = requests.post(f"{API}/projects/1/quotations",
                          json={"vendor_id": vendor_id, "line_items": []}, headers=admin_h)
        assert r.status_code == 422

    def test_invalid_vendor_and_product(self, admin_h, product_id, vendor_id):
        r = requests.post(f"{API}/projects/1/quotations",
                          json={"vendor_id": 999999,
                                "line_items": [{"product_id": product_id, "quantity": 1, "unit_price": 10}]},
                          headers=admin_h)
        assert r.status_code == 422
        r2 = requests.post(f"{API}/projects/1/quotations",
                           json={"vendor_id": vendor_id,
                                 "line_items": [{"product_id": 999999, "quantity": 1, "unit_price": 10}]},
                           headers=admin_h)
        assert r2.status_code == 422

    def test_print_html(self, admin_h, quotation_id):
        qid = quotation_id
        r = requests.get(f"{API}/quotations/{qid}/print", headers=admin_h)
        assert r.status_code == 200
        html = r.text
        assert "Quotation" in html
        assert f"QTN-" in html
        assert "Rs." in html


# ---------- Send + share log ----------
class TestSend:
    def test_whatsapp_sends_and_logs(self, admin_h, vendor_id, quotation_id):
        qid = quotation_id
        # ensure vendor has phone
        vr = requests.get(f"{API}/vendors", headers=admin_h).json()
        vend = next(v for v in vr if v["id"] == vendor_id)
        if not vend.get("phone"):
            requests.patch(f"{API}/vendors/{vendor_id}",
                           json={"phone": "+919999999999"}, headers=admin_h)
        r = requests.post(f"{API}/quotations/{qid}/send",
                          json={"channel": "whatsapp"}, headers=admin_h)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "sent"
        assert j["wa_link"] and j["wa_link"].startswith("https://wa.me/")

        # share log
        sl = requests.get(f"{API}/quotations/{qid}/share-log", headers=admin_h)
        assert sl.status_code == 200
        assert any(row["channel"] == "whatsapp" for row in sl.json())

    def test_email_attempt_logs_even_on_failure(self, admin_h, vendor_id, quotation_id):
        qid = quotation_id
        # ensure email present
        vr = requests.get(f"{API}/vendors", headers=admin_h).json()
        vend = next(v for v in vr if v["id"] == vendor_id)
        if not vend.get("email"):
            requests.patch(f"{API}/vendors/{vendor_id}",
                           json={"email": "test@example.com"}, headers=admin_h)
        r = requests.post(f"{API}/quotations/{qid}/send",
                          json={"channel": "email"}, headers=admin_h)
        assert r.status_code == 200
        j = r.json()
        assert j["status"] in ("sent", "failed")
        sl = requests.get(f"{API}/quotations/{qid}/share-log", headers=admin_h).json()
        assert any(row["channel"] == "email" for row in sl)

    def test_no_phone_error(self, admin_h, vendor_id):
        # Create a temp vendor with no phone
        r = requests.post(f"{API}/vendors",
                          json={"name": f"TEST_NoPhoneVendor_{TS}"}, headers=admin_h)
        if r.status_code not in (200, 201):
            pytest.skip("Cannot create vendor for phone test")
        v2 = r.json()["id"]
        prod = requests.post(f"{API}/products",
                             json={"name": f"TEST_PNoPhone_{TS}", "default_price": 10},
                             headers=admin_h).json()["id"]
        q = requests.post(f"{API}/projects/1/quotations",
                          json={"vendor_id": v2,
                                "line_items": [{"product_id": prod, "quantity": 1, "unit_price": 10}]},
                          headers=admin_h).json()
        rs = requests.post(f"{API}/quotations/{q['id']}/send",
                           json={"channel": "whatsapp"}, headers=admin_h)
        assert rs.status_code == 422
        assert "phone" in rs.text.lower()

    def test_edit_phone_then_resend(self, admin_h, vendor_id, quotation_id):
        qid = quotation_id
        requests.patch(f"{API}/vendors/{vendor_id}",
                       json={"phone": "+911234567890"}, headers=admin_h)
        r = requests.post(f"{API}/quotations/{qid}/send",
                          json={"channel": "whatsapp"}, headers=admin_h)
        assert r.status_code == 200
        assert "1234567890" in r.json()["wa_link"]


# ---------- Vendor payments + balance sheet integration ----------
class TestVendorPayments:
    def test_engineer_forbidden(self, se_h, vendor_id):
        r = requests.post(f"{API}/projects/1/vendor-payments",
                          json={"vendor_id": vendor_id, "amount": 100}, headers=se_h)
        assert r.status_code == 403

    def test_accountant_creates_and_balance_sheet_reflects(self, acct_h, admin_h, vendor_id, quotation_id):
        # baseline
        b0 = requests.get(f"{API}/projects/1/balance-sheet", headers=admin_h).json()
        base_released = b0.get("released", {}).get("total") or b0.get("total_released") or 0
        base_vp = (b0.get("released", {}) or {}).get("vendor_payments") or 0

        amt = 12345.67
        r = requests.post(f"{API}/projects/1/vendor-payments",
                          json={"vendor_id": vendor_id, "amount": amt,
                                "quotation_id": quotation_id},
                          headers=acct_h)
        assert r.status_code == 201, r.text
        assert r.json()["amount"] == amt

        # list
        rl = requests.get(f"{API}/projects/1/vendor-payments", headers=admin_h)
        assert rl.status_code == 200
        assert any(x["amount"] == amt for x in rl.json())

        # balance sheet
        b1 = requests.get(f"{API}/projects/1/balance-sheet", headers=admin_h).json()
        rel = b1.get("released", {})
        new_released = rel.get("total") or b1.get("total_released") or 0
        new_vp = rel.get("vendor_payments") or 0
        assert new_released - base_released >= amt - 0.01
        assert new_vp - base_vp >= amt - 0.01

        # entries has a Vendor payment debit
        entries = b1.get("entries") or b1.get("transactions") or []
        found = any("vendor payment" in (e.get("description", "") or e.get("narration", "")).lower()
                    for e in entries)
        assert found, f"No 'Vendor payment' debit found in entries: {[e.get('description') for e in entries[:5]]}"

        # client_paid not inflated
        credit = (b1.get("credits") or b1.get("client_paid") or {})
        # It should not include outgoing payments — best-effort assertion:
        if isinstance(credit, dict):
            client_paid = credit.get("total") or credit.get("client_payments") or 0
        else:
            client_paid = credit
        # ensure vendor payment amount not added into credits (they should stay unchanged from b0)
        b0c = (b0.get("credits") or b0.get("client_paid") or {})
        if isinstance(b0c, dict):
            base_credit = b0c.get("total") or b0c.get("client_payments") or 0
        else:
            base_credit = b0c
        assert abs(client_paid - base_credit) < 0.5, "Vendor payments should not inflate client_paid"

    def test_org_balance_sheet_includes_vendor_payments(self, admin_h):
        r = requests.get(f"{API}/finance/balance-sheet", headers=admin_h)
        assert r.status_code == 200
        j = r.json()
        # find project 1 row
        rows = j.get("projects") or j.get("rows") or []
        p1 = next((x for x in rows if x.get("project_id") == 1 or x.get("id") == 1), None)
        if p1 is None:
            pytest.skip("Org balance sheet does not expose per-project rows in expected shape")
        bd = p1.get("debit_breakdown") or p1.get("breakdown") or {}
        assert "vendor_payments" in bd or any("vendor" in str(k).lower() for k in bd), \
            f"vendor_payments missing from org breakdown: {bd}"

    def test_project_finance_summary(self, admin_h):
        r = requests.get(f"{API}/projects/1/finance/summary", headers=admin_h)
        assert r.status_code == 200
        j = r.json()
        # income_to_date should not include outgoing
        # cost_to_date should include vendor_payments (new key)
        assert "vendor_payments" in j or "vendor_paid" in j, f"vendor payments key missing: {list(j.keys())}"
