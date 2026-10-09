"""Iteration 19: Change Order export endpoints + backend API sweep across all admin/client/SE/vendor tabs.
Regression file — pytest -o addopts=''"""
import os
import io
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")

CREDS = {
    "admin": ("kesari4416@gmail.com", "admin123"),
    "se": ("raj@buildcore.com", "engineer123"),
    "client_priya": ("priya@skyline.com", "client123"),
    "client_arun": ("arun@greenfield.com", "client123"),
    "vendor": ("vikram@apexsteel.com", "vendor123"),
    "accountant": ("asha@buildcore.com", "accountant123"),
}


def login(role):
    email, pwd = CREDS[role]
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"login failed {role}: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


def H(token):
    return {"Authorization": f"Bearer {token}"}


# -------- Change Order Export --------
class TestCOExport:
    def test_admin_export_pdf(self):
        t = login("admin")
        r = requests.get(f"{BASE_URL}/api/projects/1/change-orders/export?fmt=pdf", headers=H(t), timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 500
        assert "attachment" in r.headers.get("content-disposition", "").lower()

    def test_admin_export_xlsx(self):
        t = login("admin")
        r = requests.get(f"{BASE_URL}/api/projects/1/change-orders/export?fmt=xlsx", headers=H(t), timeout=30)
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type", "")
        assert "spreadsheet" in ct or "excel" in ct or "officedocument" in ct
        assert len(r.content) > 500

    def test_client_priya_owner_export_pdf(self):
        t = login("client_priya")
        r = requests.get(f"{BASE_URL}/api/projects/1/change-orders/export?fmt=pdf", headers=H(t), timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_client_arun_other_project_forbidden(self):
        t = login("client_arun")
        r = requests.get(f"{BASE_URL}/api/projects/1/change-orders/export?fmt=pdf", headers=H(t), timeout=30)
        assert r.status_code == 403, f"expected 403 got {r.status_code}"

    def test_export_with_filters(self):
        t = login("admin")
        r = requests.get(f"{BASE_URL}/api/projects/1/change-orders/export?fmt=xlsx&status=Approved", headers=H(t), timeout=30)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/projects/1/change-orders/export?fmt=pdf&category=Design%20Change", headers=H(t), timeout=30)
        assert r2.status_code == 200
        # Get a phase id for project 1
        phases = requests.get(f"{BASE_URL}/api/projects/1/phases", headers=H(t), timeout=15).json()
        if phases:
            pid = phases[0]["id"]
            r3 = requests.get(f"{BASE_URL}/api/projects/1/change-orders/export?fmt=pdf&phase_id={pid}", headers=H(t), timeout=30)
            assert r3.status_code == 200


# -------- Upload endpoint --------
class TestUpload:
    def _make_png(self):
        # Minimal 1x1 PNG
        return (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
                b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
                b"\xc0\x00\x00\x00\x03\x00\x01\x5b\xd6\x86\xff\x00\x00\x00\x00IEND\xaeB`\x82")

    def test_admin_upload_png(self):
        t = login("admin")
        files = {"file": ("TEST_iter19.png", self._make_png(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/upload", headers=H(t), files=files, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]

    def test_se_upload_png(self):
        t = login("se")
        files = {"file": ("TEST_iter19_se.png", self._make_png(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/upload", headers=H(t), files=files, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]

    def test_client_upload_forbidden(self):
        t = login("client_priya")
        files = {"file": ("x.png", self._make_png(), "image/png")}
        r = requests.post(f"{BASE_URL}/api/upload", headers=H(t), files=files, timeout=30)
        assert r.status_code in (401, 403), f"expected 4xx got {r.status_code}"


# -------- Backend API sweep to detect any 500s (Postgres connection issues) --------
ADMIN_ENDPOINTS = [
    "/api/auth/me",
    "/api/projects",
    "/api/projects/1",
    "/api/projects/1/phases",
    "/api/projects/1/change-orders",
    "/api/projects/1/finance/summary",
    "/api/projects/1/balance-sheet",
    "/api/projects/1/employees",
    "/api/projects/1/procurement/dashboard-summary",
    "/api/clients",
    "/api/clients/1",
    "/api/finance/dashboard-summary",
    "/api/finance/balance-sheet",
    "/api/payroll-runs",
    "/api/users",
    "/api/vendors",
    "/api/notifications",
]


class TestAdminSweep:
    @pytest.mark.parametrize("path", ADMIN_ENDPOINTS)
    def test_admin_endpoint(self, path):
        t = login("admin")
        r = requests.get(f"{BASE_URL}{path}", headers=H(t), timeout=20)
        assert r.status_code < 500, f"5xx on {path}: {r.status_code} {r.text[:200]}"
        assert r.status_code != 404, f"404 on {path}"


CLIENT_ENDPOINTS = [
    "/api/auth/me",
    "/api/projects",
    "/api/projects/1",
    "/api/projects/1/change-orders",
    "/api/projects/1/finance/summary",
    "/api/projects/1/balance-sheet",
    "/api/invoices",
    "/api/notifications",
]


class TestClientSweep:
    @pytest.mark.parametrize("path", CLIENT_ENDPOINTS)
    def test_client_endpoint(self, path):
        t = login("client_priya")
        r = requests.get(f"{BASE_URL}{path}", headers=H(t), timeout=20)
        assert r.status_code < 500, f"5xx on {path}: {r.status_code} {r.text[:200]}"


SE_ENDPOINTS = [
    "/api/auth/me",
    "/api/projects",
    "/api/projects/1",
    "/api/projects/1/phases",
    "/api/projects/1/change-orders",
    "/api/projects/1/tracking",
    "/api/notifications",
]


class TestSESweep:
    @pytest.mark.parametrize("path", SE_ENDPOINTS)
    def test_se_endpoint(self, path):
        t = login("se")
        r = requests.get(f"{BASE_URL}{path}", headers=H(t), timeout=20)
        assert r.status_code < 500, f"5xx on {path}: {r.status_code} {r.text[:200]}"


VENDOR_ENDPOINTS = [
    "/api/auth/me",
    "/api/vendor/dashboard",
    "/api/vendor/bid-packages",
    "/api/notifications",
]


class TestVendorSweep:
    @pytest.mark.parametrize("path", VENDOR_ENDPOINTS)
    def test_vendor_endpoint(self, path):
        t = login("vendor")
        r = requests.get(f"{BASE_URL}{path}", headers=H(t), timeout=20)
        assert r.status_code < 500, f"5xx on {path}: {r.status_code} {r.text[:200]}"
