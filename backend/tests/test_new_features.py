"""Backend tests for iteration 2: dashboard-summary, has_issues filter, milestones,
phase reorder, archive, delete update, documents CRUD (incl. client-scoped)."""
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://portal-construction.preview.emergentagent.com").rstrip("/")

ADMIN = {"email": "kesari4416@gmail.com", "password": "admin123"}
ENGINEER = {"email": "raj@buildcore.com", "password": "engineer123"}
CLIENT_USER = {"email": "priya@skyline.com", "password": "client123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=10)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def eng_h():
    return _login(ENGINEER)


@pytest.fixture(scope="module")
def client_h():
    return _login(CLIENT_USER)


# ---- Dashboard summary ----
class TestDashboardSummary:
    def test_admin_summary_shape_and_values(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/projects/dashboard-summary", headers=admin_h)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_projects", "ongoing", "with_issues", "total_budget"):
            assert k in d
        # Seed expectations: 5, 2, 2, 895000000 — but tolerate prior TEST_ data
        assert d["total_projects"] >= 5
        assert d["with_issues"] >= 2
        assert d["total_budget"] >= 895_000_000

    def test_client_summary_is_scoped(self, client_h):
        r = requests.get(f"{BASE_URL}/api/projects/dashboard-summary", headers=client_h)
        assert r.status_code == 200
        d = r.json()
        # client 1 (Skyline Developers) has 2 projects per seed
        assert d["total_projects"] <= 3
        assert d["total_projects"] >= 1

    def test_summary_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/projects/dashboard-summary")
        assert r.status_code == 401


# ---- has_issues filter ----
class TestHasIssuesFilter:
    def test_has_issues_true(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/projects", headers=admin_h,
                         params={"has_issues": "true", "limit": 200})
        assert r.status_code == 200
        items = r.json()["items"]
        names = {p["name"] for p in items}
        # Expect 2 flagged per seed
        assert "Metro Depot Complex" in names
        assert "GreenField Villas Phase 1" in names

    def test_has_issues_false_excludes_flagged(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/projects", headers=admin_h,
                         params={"has_issues": "false", "limit": 200})
        assert r.status_code == 200
        names = {p["name"] for p in r.json()["items"]}
        assert "Metro Depot Complex" not in names
        assert "GreenField Villas Phase 1" not in names


# ---- Milestones ----
class TestMilestones:
    @pytest.fixture(scope="class")
    def phase_id(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/projects/1/phases", headers=admin_h)
        assert r.status_code == 200
        assert len(r.json()) > 0
        return r.json()[0]["id"]

    def test_create_done_sets_completed_at(self, admin_h, phase_id):
        r = requests.post(f"{BASE_URL}/api/phases/{phase_id}/milestones", headers=admin_h,
                          json={"title": "TEST_MS_done", "sequence_order": 91, "status": "Done"})
        assert r.status_code == 201
        m = r.json()
        assert m["status"] == "Done"
        assert m["completed_at"] is not None
        # cleanup handled at class scope end (patch to keep tidy)
        requests.patch(f"{BASE_URL}/api/milestones/{m['id']}", headers=admin_h,
                       json={"status": "Pending"})

    def test_list_ordered_by_sequence_order(self, admin_h, phase_id):
        # add two milestones
        a = requests.post(f"{BASE_URL}/api/phases/{phase_id}/milestones", headers=admin_h,
                          json={"title": "TEST_MS_a", "sequence_order": 92})
        b = requests.post(f"{BASE_URL}/api/phases/{phase_id}/milestones", headers=admin_h,
                          json={"title": "TEST_MS_b", "sequence_order": 93})
        assert a.status_code == 201 and b.status_code == 201
        r = requests.get(f"{BASE_URL}/api/phases/{phase_id}/milestones", headers=admin_h)
        assert r.status_code == 200
        orders = [m["sequence_order"] for m in r.json()]
        assert orders == sorted(orders)

    def test_patch_status_updates_completed_at(self, admin_h, phase_id):
        r = requests.post(f"{BASE_URL}/api/phases/{phase_id}/milestones", headers=admin_h,
                          json={"title": "TEST_MS_patch", "sequence_order": 94, "status": "Pending"})
        assert r.status_code == 201
        mid = r.json()["id"]
        r2 = requests.patch(f"{BASE_URL}/api/milestones/{mid}", headers=admin_h,
                            json={"status": "Done"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "Done"
        assert r2.json()["completed_at"] is not None
        r3 = requests.patch(f"{BASE_URL}/api/milestones/{mid}", headers=admin_h,
                            json={"status": "Pending"})
        assert r3.status_code == 200
        assert r3.json()["completed_at"] is None


# ---- Phase reorder ----
class TestPhaseReorder:
    def test_invalid_partial_ids_returns_422(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/projects/1/phases", headers=admin_h)
        ids = [p["id"] for p in r.json()]
        # Missing one id
        r2 = requests.post(f"{BASE_URL}/api/projects/1/phases/reorder", headers=admin_h,
                           json={"phase_ids": ids[:-1]})
        assert r2.status_code == 422

    def test_reorder_all_ids_updates_sequence(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/projects/1/phases", headers=admin_h)
        ids = [p["id"] for p in r.json()]
        reversed_ids = list(reversed(ids))
        r2 = requests.post(f"{BASE_URL}/api/projects/1/phases/reorder", headers=admin_h,
                           json={"phase_ids": reversed_ids})
        assert r2.status_code == 200
        # Verify sequence
        r3 = requests.get(f"{BASE_URL}/api/projects/1/phases", headers=admin_h)
        new_ids_by_seq = [p["id"] for p in r3.json()]
        assert new_ids_by_seq == reversed_ids
        # restore original order
        requests.post(f"{BASE_URL}/api/projects/1/phases/reorder", headers=admin_h,
                      json={"phase_ids": ids})


# ---- Archive & delete update ----
class TestArchiveAndDeleteUpdate:
    def test_archive_admin_only(self, admin_h, client_h):
        # create a temp project
        r = requests.post(f"{BASE_URL}/api/projects", headers=admin_h, json={
            "name": "TEST_archive_target", "client_id": 1,
            "start_date_planned": "2026-01-01", "end_date_planned": "2026-06-30",
            "budget": 100000})
        assert r.status_code == 201
        pid = r.json()["id"]
        # client cannot archive
        r2 = requests.post(f"{BASE_URL}/api/projects/{pid}/archive", headers=client_h)
        assert r2.status_code == 403
        # admin archives
        r3 = requests.post(f"{BASE_URL}/api/projects/{pid}/archive", headers=admin_h)
        assert r3.status_code == 200
        assert r3.json().get("is_archived") is True
        # now 404 in normal GET
        assert requests.get(f"{BASE_URL}/api/projects/{pid}", headers=admin_h).status_code == 404

    def test_delete_update_client_forbidden(self, admin_h, client_h):
        # create an update on project 1
        r = requests.post(f"{BASE_URL}/api/projects/1/updates", headers=admin_h,
                          json={"description": "TEST_delupd_marker"})
        assert r.status_code == 201
        uid = r.json()["id"]
        r2 = requests.delete(f"{BASE_URL}/api/updates/{uid}", headers=client_h)
        assert r2.status_code == 403
        r3 = requests.delete(f"{BASE_URL}/api/updates/{uid}", headers=admin_h)
        assert r3.status_code == 204
        # already deleted -> 404
        r4 = requests.delete(f"{BASE_URL}/api/updates/{uid}", headers=admin_h)
        assert r4.status_code == 404


# ---- Documents ----
class TestDocuments:
    @pytest.fixture(scope="class")
    def uploaded_doc(self, admin_h):
        files = {"file": ("test_report.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
        data = {"document_name": "TEST_Custom_Doc", "category": "Report",
                "is_client_visible": "true"}
        r = requests.post(f"{BASE_URL}/api/projects/1/documents", headers=admin_h,
                          files=files, data=data)
        assert r.status_code == 201, r.text
        return r.json()

    def test_upload_custom_name(self, uploaded_doc):
        assert uploaded_doc["document_name"] == "TEST_Custom_Doc"
        assert uploaded_doc["category"] == "Report"
        assert uploaded_doc["is_client_visible"] is True

    def test_upload_blank_name_defaults_to_filename(self, admin_h):
        files = {"file": ("blank_named.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        data = {"document_name": "", "category": "Other", "is_client_visible": "false"}
        r = requests.post(f"{BASE_URL}/api/projects/1/documents", headers=admin_h,
                          files=files, data=data)
        assert r.status_code == 201
        assert r.json()["document_name"] == "blank_named.pdf"
        # cleanup
        requests.delete(f"{BASE_URL}/api/documents/{r.json()['id']}", headers=admin_h)

    def test_list_search_and_filter(self, admin_h, uploaded_doc):
        r = requests.get(f"{BASE_URL}/api/projects/1/documents", headers=admin_h,
                        params={"search": "TEST_Custom"})
        assert r.status_code == 200
        assert any(d["id"] == uploaded_doc["id"] for d in r.json())
        r2 = requests.get(f"{BASE_URL}/api/projects/1/documents", headers=admin_h,
                         params={"category": "Report"})
        assert r2.status_code == 200
        assert all(d["category"] == "Report" for d in r2.json())

    def test_get_document_includes_download_url(self, admin_h, uploaded_doc):
        r = requests.get(f"{BASE_URL}/api/documents/{uploaded_doc['id']}", headers=admin_h)
        assert r.status_code == 200
        assert "download_url" in r.json()
        assert r.json()["download_url"].startswith("/api/uploads/")

    def test_patch_rename_and_category(self, admin_h, uploaded_doc):
        r = requests.patch(f"{BASE_URL}/api/documents/{uploaded_doc['id']}", headers=admin_h,
                          json={"document_name": "TEST_Renamed", "category": "Contract"})
        assert r.status_code == 200
        assert r.json()["document_name"] == "TEST_Renamed"
        assert r.json()["category"] == "Contract"

    def test_delete_admin_only(self, admin_h, eng_h, client_h):
        # Upload an ephemeral doc as admin (raj is engineer for project 1)
        files = {"file": ("todel.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/projects/1/documents", headers=admin_h,
                          files=files, data={"document_name": "TEST_todel"})
        did = r.json()["id"]
        # engineer cannot delete
        assert requests.delete(f"{BASE_URL}/api/documents/{did}", headers=eng_h).status_code == 403
        # client cannot delete
        assert requests.delete(f"{BASE_URL}/api/documents/{did}", headers=client_h).status_code == 403
        # admin deletes
        assert requests.delete(f"{BASE_URL}/api/documents/{did}", headers=admin_h).status_code == 204

    def test_client_scoped_hides_internal(self, admin_h, client_h):
        # Upload internal doc
        files = {"file": ("secret.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
        r = requests.post(f"{BASE_URL}/api/projects/1/documents", headers=admin_h,
                          files=files, data={"document_name": "TEST_internal_secret",
                                             "is_client_visible": "false"})
        assert r.status_code == 201
        secret_id = r.json()["id"]

        # Client via /api/projects/1/documents shouldn't see it
        r1 = requests.get(f"{BASE_URL}/api/projects/1/documents", headers=client_h)
        assert r1.status_code == 200
        assert all(d["id"] != secret_id for d in r1.json())

        # Client via /api/clients/1/projects/1/documents shouldn't see it either
        r2 = requests.get(f"{BASE_URL}/api/clients/1/projects/1/documents", headers=client_h)
        assert r2.status_code == 200
        assert all(d["id"] != secret_id for d in r2.json())

        # Direct GET should 404 for client
        r3 = requests.get(f"{BASE_URL}/api/documents/{secret_id}", headers=client_h)
        assert r3.status_code == 404

        # Cross-client denied
        r4 = requests.get(f"{BASE_URL}/api/clients/2/projects/1/documents", headers=client_h)
        assert r4.status_code == 403

        # cleanup
        requests.delete(f"{BASE_URL}/api/documents/{secret_id}", headers=admin_h)

    def test_cleanup_uploaded(self, admin_h, uploaded_doc):
        r = requests.delete(f"{BASE_URL}/api/documents/{uploaded_doc['id']}", headers=admin_h)
        assert r.status_code == 204
