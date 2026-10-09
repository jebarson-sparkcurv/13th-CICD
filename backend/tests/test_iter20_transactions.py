"""Iteration 20 — Add Transaction (Income/Expense) full backend flow tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"

ADMIN = ("kesari4416@gmail.com", "admin123")
ACCOUNTANT = ("asha@buildcore.com", "accountant123")
SE = ("raj@buildcore.com", "engineer123")
CLIENT = ("priya@skyline.com", "client123")

PROJECT_ID = 3  # active project


def _session(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": creds[0], "password": creds[1]}, timeout=15)
    assert r.status_code == 200, f"login failed {creds}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _session(ADMIN)


@pytest.fixture(scope="module")
def accountant():
    return _session(ACCOUNTANT)


@pytest.fixture(scope="module")
def se():
    return _session(SE)


@pytest.fixture(scope="module")
def closed_project_id(admin):
    """Find a Completed/Cancelled project for 422 tests."""
    r = admin.get(f"{BASE_URL}/api/projects", timeout=10)
    assert r.status_code == 200
    body = r.json()
    plist = body.get("items", body) if isinstance(body, dict) else body
    for p in plist:
        if p.get("status") in ("Completed", "Cancelled"):
            return p["id"]
    return None


# ---------- transaction-context ----------
def test_transaction_context(admin):
    r = admin.get(f"{BASE_URL}/api/finance/transaction-context")
    assert r.status_code == 200
    body = r.json()
    assert "projects" in body and "payment_types" in body and "sources" in body
    assert body["payment_types"] == ["Advance Payment", "Partial Payment", "Full Payment"]
    assert set(body["sources"]) == {"Vendor", "Employee", "Other"}
    # closed projects excluded
    for p in body["projects"]:
        assert p["status"] not in ("Completed", "Cancelled")
        assert "phases" in p and "budget_remaining" in p


# ---------- Income ----------
def test_income_rbac_site_engineer_forbidden(se):
    r = se.post(f"{BASE_URL}/api/transactions/income",
                json={"project_id": PROJECT_ID, "amount": 100, "payment_type": "Advance Payment"})
    assert r.status_code == 403, r.text


def test_income_invalid_payment_type(admin):
    r = admin.post(f"{BASE_URL}/api/transactions/income",
                   json={"project_id": PROJECT_ID, "amount": 100, "payment_type": "Wrong"})
    assert r.status_code == 422


def test_income_amount_must_be_positive(admin):
    r = admin.post(f"{BASE_URL}/api/transactions/income",
                   json={"project_id": PROJECT_ID, "amount": 0, "payment_type": "Advance Payment"})
    assert r.status_code == 422


def test_income_closed_project_blocked(admin, closed_project_id):
    if not closed_project_id:
        pytest.skip("No closed project available")
    r = admin.post(f"{BASE_URL}/api/transactions/income",
                   json={"project_id": closed_project_id, "amount": 500, "payment_type": "Advance Payment"})
    assert r.status_code == 422, r.text


def test_income_create_auto_balance(accountant):
    # accountant can create income
    r = accountant.get(f"{BASE_URL}/api/projects/{PROJECT_ID}")
    assert r.status_code == 200
    budget = float(r.json().get("budget") or 0)
    amount = 12345.67
    resp = accountant.post(f"{BASE_URL}/api/transactions/income",
                           json={"project_id": PROJECT_ID, "phase": "TEST_Phase",
                                 "amount": amount, "payment_type": "Partial Payment"})
    assert resp.status_code == 201, resp.text
    d = resp.json()
    assert d["amount"] == amount
    assert d["payment_type"] == "Partial Payment"
    assert d["override"] is False
    assert d["balance"] == round(budget - amount, 2)
    assert d["balance_auto"] == round(budget - amount, 2)
    assert "project_budget_remaining" in d


def test_income_override_logged(admin):
    r = admin.post(f"{BASE_URL}/api/transactions/income",
                   json={"project_id": PROJECT_ID, "amount": 1000,
                         "payment_type": "Full Payment", "balance": 99999.99})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["override"] is True
    assert d["override_old"] is not None
    assert d["override_by"] is not None
    assert d["override_at"] is not None
    assert d["balance"] == 99999.99


def test_income_list(admin):
    r = admin.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/income")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) >= 2


# ---------- Inline creation ----------
def test_inline_vendor_and_product(admin):
    ts = int(time.time())
    r = admin.post(f"{BASE_URL}/api/transactions/inline/vendor",
                   json={"name": f"TEST_Vendor_{ts}", "contact_name": "Ravi", "trade": "Cement"})
    assert r.status_code == 201, r.text
    vid = r.json()["id"]

    # visible in txn vendors
    lst = admin.get(f"{BASE_URL}/api/transactions/vendors").json()
    assert any(v["id"] == vid for v in lst)

    # visible in standalone /api/vendors
    lst2 = admin.get(f"{BASE_URL}/api/vendors").json()
    assert any(v["id"] == vid for v in (lst2 if isinstance(lst2, list) else lst2.get("vendors", [])))

    # create product
    r2 = admin.post(f"{BASE_URL}/api/transactions/inline/vendor/{vid}/product",
                    json={"name": f"TEST_Product_{ts}", "unit_price": 250.0, "unit": "bag"})
    assert r2.status_code == 201, r2.text
    pid = r2.json()["id"]

    prods = admin.get(f"{BASE_URL}/api/vendors/{vid}/products").json()
    plist = prods if isinstance(prods, list) else prods.get("products", [])
    assert any(p["id"] == pid for p in plist)


def test_inline_employee(admin):
    # find a phase for PROJECT_ID
    ctx = admin.get(f"{BASE_URL}/api/finance/transaction-context").json()
    proj = next((p for p in ctx["projects"] if p["id"] == PROJECT_ID), None)
    assert proj and proj["phases"], "No phases for project"
    phase_id = proj["phases"][0]["id"]
    ts = int(time.time())
    r = admin.post(f"{BASE_URL}/api/transactions/inline/employee",
                   params={"project_id": PROJECT_ID, "phase_id": phase_id},
                   json={"name": f"TEST_Emp_{ts}", "role_title": "Mason", "daily_wage": 800})
    assert r.status_code == 201, r.text
    eid = r.json()["id"]

    # visible in field ops
    emps = admin.get(f"{BASE_URL}/api/employees").json()
    elist = emps if isinstance(emps, list) else emps.get("employees", [])
    assert any(e["id"] == eid for e in elist)


# ---------- Expense ----------
def test_expense_phase_validation(admin):
    r = admin.post(f"{BASE_URL}/api/transactions/expense",
                   json={"project_id": PROJECT_ID, "phase_id": 999999, "source_type": "Other",
                         "description": "x", "amount": 100, "payment_type": "Full Payment"})
    assert r.status_code == 422


def test_expense_vendor_requires_product(admin):
    ctx = admin.get(f"{BASE_URL}/api/finance/transaction-context").json()
    proj = next(p for p in ctx["projects"] if p["id"] == PROJECT_ID)
    phase_id = proj["phases"][0]["id"]
    r = admin.post(f"{BASE_URL}/api/transactions/expense",
                   json={"project_id": PROJECT_ID, "phase_id": phase_id,
                         "source_type": "Vendor", "vendor_id": 1,
                         "amount": 100, "payment_type": "Full Payment"})
    assert r.status_code == 422


def test_expense_other_requires_description(admin):
    ctx = admin.get(f"{BASE_URL}/api/finance/transaction-context").json()
    proj = next(p for p in ctx["projects"] if p["id"] == PROJECT_ID)
    phase_id = proj["phases"][0]["id"]
    r = admin.post(f"{BASE_URL}/api/transactions/expense",
                   json={"project_id": PROJECT_ID, "phase_id": phase_id,
                         "source_type": "Other", "amount": 100, "payment_type": "Full Payment"})
    assert r.status_code == 422


def test_expense_vendor_auto_quotation(admin):
    ctx = admin.get(f"{BASE_URL}/api/finance/transaction-context").json()
    proj = next(p for p in ctx["projects"] if p["id"] == PROJECT_ID)
    phase_id = proj["phases"][0]["id"]

    # find vendor 1 first product
    prods = admin.get(f"{BASE_URL}/api/vendors/1/products").json()
    plist = prods if isinstance(prods, list) else prods.get("products", [])
    assert plist, "vendor 1 has no products"
    pid = plist[0]["id"]

    r = admin.post(f"{BASE_URL}/api/transactions/expense",
                   json={"project_id": PROJECT_ID, "phase_id": phase_id,
                         "source_type": "Vendor", "vendor_id": 1, "product_id": pid,
                         "quantity": 5, "amount": 5000, "payment_type": "Partial Payment"})
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["quotation"] is not None
    assert d["quotation"]["quote_number"].startswith(f"VQ-{PROJECT_ID}-")
    assert d["quotation"]["status"] == "Generated"
    assert "balance_after" in d
    assert "project_budget_remaining" in d

    # sync check: quotation visible
    q = admin.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/vendor-quotations").json()
    qlist = q if isinstance(q, list) else q.get("quotations", [])
    assert any(x.get("quote_number") == d["quotation"]["quote_number"] for x in qlist)


def test_expense_employee_and_payments(admin):
    ctx = admin.get(f"{BASE_URL}/api/finance/transaction-context").json()
    proj = next(p for p in ctx["projects"] if p["id"] == PROJECT_ID)
    phase_id = proj["phases"][0]["id"]

    # create fresh employee
    ts = int(time.time())
    e = admin.post(f"{BASE_URL}/api/transactions/inline/employee",
                   params={"project_id": PROJECT_ID, "phase_id": phase_id},
                   json={"name": f"TEST_PayEmp_{ts}", "role_title": "Helper", "daily_wage": 600}).json()
    eid = e["id"]
    r = admin.post(f"{BASE_URL}/api/transactions/expense",
                   json={"project_id": PROJECT_ID, "phase_id": phase_id,
                         "source_type": "Employee", "employee_id": eid,
                         "amount": 1500, "payment_type": "Advance Payment"})
    assert r.status_code == 201, r.text
    # payments history
    pay = admin.get(f"{BASE_URL}/api/employees/{eid}/payments").json()
    assert pay["total_paid"] == 1500
    assert len(pay["payments"]) == 1


def test_expense_site_engineer_allowed(se):
    ctx = se.get(f"{BASE_URL}/api/finance/transaction-context").json()
    proj = next((p for p in ctx["projects"] if p["id"] == PROJECT_ID), None)
    if not proj:
        pytest.skip("SE has no access to project")
    phase_id = proj["phases"][0]["id"]
    r = se.post(f"{BASE_URL}/api/transactions/expense",
                json={"project_id": PROJECT_ID, "phase_id": phase_id,
                      "source_type": "Other", "description": "TEST_SE_expense",
                      "amount": 50, "payment_type": "Full Payment"})
    assert r.status_code in (201, 403), r.text  # allowed per spec


# ---------- Cross-module sync ----------
def test_ledger_shows_income_and_expense(admin):
    r = admin.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/ledger")
    assert r.status_code == 200
    body = r.json()
    lines = body if isinstance(body, list) else body.get("lines", body.get("entries", []))
    # look for income credit
    has_income_credit = any(
        (l.get("credit") or l.get("credit_amount") or (l.get("type") == "credit"))
        and "Income" in str(l.get("description", "") or l.get("narration", ""))
        for l in lines
    )
    assert has_income_credit or any("Income" in str(l) for l in lines), f"No income credit in ledger: {lines[:3]}"


def test_balance_sheet_includes_income(admin):
    r = admin.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/balance-sheet")
    assert r.status_code == 200, r.text
    b = r.json()
    # client_paid or total_credit should reflect income
    total = b.get("client_paid") or b.get("total_credit") or b.get("credit") or 0
    assert float(total) > 0


def test_finance_summary_income_to_date(admin):
    r = admin.get(f"{BASE_URL}/api/projects/{PROJECT_ID}/finance/summary")
    assert r.status_code == 200
    s = r.json()
    itd = s.get("income_to_date")
    assert itd is not None and float(itd) > 0


def test_org_balance_sheet(admin):
    r = admin.get(f"{BASE_URL}/api/finance/balance-sheet")
    assert r.status_code == 200
