"""Iter 21 — Estimates module: RBAC, CRUD, validation, inline categories/statuses, uploads."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin": ("kesari4416@gmail.com", "admin123"),
    "accountant": ("asha@buildcore.com", "accountant123"),
    "engineer": ("raj@buildcore.com", "engineer123"),
    "client": ("priya@skyline.com", "client123"),
    "vendor": ("vikram@apexsteel.com", "vendor123"),
}


def _session(role):
    email, pw = CREDS[role]
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin():
    return _session("admin")


@pytest.fixture(scope="module")
def accountant():
    return _session("accountant")


@pytest.fixture(scope="module")
def engineer():
    return _session("engineer")


@pytest.fixture(scope="module")
def client_sess():
    return _session("client")


@pytest.fixture(scope="module")
def vendor():
    return _session("vendor")


# ---------- Lookups ----------
class TestLookups:
    def test_categories_seeded(self, admin):
        r = admin.get(f"{API}/estimate-categories")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 4
        assert all("id" in c and "name" in c for c in data)

    def test_statuses_seeded(self, admin):
        r = admin.get(f"{API}/estimate-statuses")
        assert r.status_code == 200
        assert any(s["name"] == "Draft" for s in r.json())

    def test_category_dedup_ci(self, admin):
        r1 = admin.post(f"{API}/estimate-categories", json={"name": "TEST_LandCI"})
        assert r1.status_code == 201
        first_id = r1.json()["id"]
        # duplicate ci
        r2 = admin.post(f"{API}/estimate-categories", json={"name": "test_landci"})
        assert r2.status_code == 201
        assert r2.json()["id"] == first_id, "case-insensitive dedup must return existing id"

    def test_status_dedup_ci(self, admin):
        r1 = admin.post(f"{API}/estimate-statuses", json={"name": "TEST_OnHoldCI"})
        assert r1.status_code == 201
        first_id = r1.json()["id"]
        r2 = admin.post(f"{API}/estimate-statuses", json={"name": "test_onholdci"})
        assert r2.status_code == 201
        assert r2.json()["id"] == first_id


# ---------- RBAC ----------
class TestRBAC:
    def test_admin_list(self, admin):
        assert admin.get(f"{API}/estimates").status_code == 200

    def test_accountant_list(self, accountant):
        assert accountant.get(f"{API}/estimates").status_code == 200

    def test_engineer_list(self, engineer):
        assert engineer.get(f"{API}/estimates").status_code == 200

    def test_client_forbidden(self, client_sess):
        assert client_sess.get(f"{API}/estimates").status_code == 403

    def test_vendor_forbidden(self, vendor):
        assert vendor.get(f"{API}/estimates").status_code == 403

    def test_client_cats_forbidden(self, client_sess):
        assert client_sess.get(f"{API}/estimate-categories").status_code == 403

    def test_vendor_statuses_forbidden(self, vendor):
        assert vendor.get(f"{API}/estimate-statuses").status_code == 403


# ---------- CRUD + Validation ----------
class TestEstimateCRUD:
    def _ids(self, admin):
        cats = admin.get(f"{API}/estimate-categories").json()
        sts = admin.get(f"{API}/estimate-statuses").json()
        return cats[0]["id"], sts[0]["id"]

    def test_create_and_persist(self, admin):
        cid, sid = self._ids(admin)
        payload = {
            "project_name": "TEST_Lakeview_pytest",
            "phase": "Structure",
            "category_id": cid,
            "total_amount": 750000,
            "status_id": sid,
        }
        r = admin.post(f"{API}/estimates", json=payload)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["project_name"] == "TEST_Lakeview_pytest"
        assert body["total_amount"] == 750000
        assert body["category"] is not None
        assert body["current_status"] is not None
        assert "id" in body

        # verify persistence via list
        lst = admin.get(f"{API}/estimates").json()
        assert any(e["id"] == body["id"] for e in lst)

    def test_missing_project_name_422(self, admin):
        cid, sid = self._ids(admin)
        r = admin.post(f"{API}/estimates", json={"project_name": "", "category_id": cid,
                                                 "total_amount": 500, "status_id": sid})
        assert r.status_code == 422

    def test_amount_zero_422(self, admin):
        cid, sid = self._ids(admin)
        r = admin.post(f"{API}/estimates", json={"project_name": "TEST_Zero", "category_id": cid,
                                                 "total_amount": 0, "status_id": sid})
        assert r.status_code == 422

    def test_amount_negative_422(self, admin):
        cid, sid = self._ids(admin)
        r = admin.post(f"{API}/estimates", json={"project_name": "TEST_Neg", "category_id": cid,
                                                 "total_amount": -10, "status_id": sid})
        assert r.status_code == 422

    def test_invalid_category(self, admin):
        _, sid = self._ids(admin)
        r = admin.post(f"{API}/estimates", json={"project_name": "TEST_BadCat", "category_id": 999999,
                                                 "total_amount": 100, "status_id": sid})
        assert r.status_code == 422

    def test_delete_as_engineer_forbidden(self, admin, engineer):
        cid, sid = self._ids(admin)
        r = admin.post(f"{API}/estimates", json={"project_name": "TEST_DelSE", "category_id": cid,
                                                 "total_amount": 111, "status_id": sid})
        eid = r.json()["id"]
        rd = engineer.delete(f"{API}/estimates/{eid}")
        assert rd.status_code == 403
        # cleanup
        assert admin.delete(f"{API}/estimates/{eid}").status_code == 204

    def test_delete_as_admin_204(self, admin):
        cid, sid = self._ids(admin)
        r = admin.post(f"{API}/estimates", json={"project_name": "TEST_DelAdmin", "category_id": cid,
                                                 "total_amount": 222, "status_id": sid})
        eid = r.json()["id"]
        assert admin.delete(f"{API}/estimates/{eid}").status_code == 204
        # verify gone
        lst = admin.get(f"{API}/estimates").json()
        assert all(e["id"] != eid for e in lst)

    def test_delete_missing_404(self, admin):
        assert admin.delete(f"{API}/estimates/999999").status_code == 404


# ---------- Uploads (broadened roles) ----------
class TestUploads:
    def _png(self):
        # minimal 1x1 PNG
        return b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\xdb\xd8\x1d\xa8\x00\x00\x00\x00IEND\xaeB`\x82"

    def test_accountant_can_upload(self, accountant):
        files = {"file": ("test.png", io.BytesIO(self._png()), "image/png")}
        r = accountant.post(f"{API}/upload", files=files)
        assert r.status_code == 201, r.text
        assert "url" in r.json()

    def test_engineer_can_upload(self, engineer):
        files = {"file": ("test.png", io.BytesIO(self._png()), "image/png")}
        r = engineer.post(f"{API}/upload", files=files)
        assert r.status_code == 201

    def test_client_upload_forbidden(self, client_sess):
        files = {"file": ("test.png", io.BytesIO(self._png()), "image/png")}
        r = client_sess.post(f"{API}/upload", files=files)
        assert r.status_code == 403
