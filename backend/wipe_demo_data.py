"""Wipe demo data from the Sitera database.

Two modes:
  * ``--mode=full``    — delete EVERYTHING except the admin user
                          (transactions, projects, clients, vendors,
                           employees, lookup tables, everything).
  * ``--mode=keep-lookups`` (default) — delete transactional/demo rows but
                          keep lookup/reference data
                          (employee_categories, estimate_categories,
                           estimate_statuses, expense_categories,
                           milestones, requirements_master, users other
                           than demo ones).

Usage on EC2::

    cd /var/www/buildcore/backend
    source .venv/bin/activate            # if applicable
    python /var/www/buildcore/scripts/wipe_demo_data.py --mode=full --yes
    python /var/www/buildcore/scripts/wipe_demo_data.py --mode=keep-lookups --yes

The admin user (kesari4416@gmail.com) is always preserved. All other users
are wiped in ``full`` mode; in ``keep-lookups`` mode only demo users
(role != 'Admin') are wiped.

Add ``SEED_DEMO_DATA=false`` to ``backend/.env`` to prevent demo data from
being re-seeded on the next backend restart.
"""
import argparse
import os
import sys
from pathlib import Path

# Ensure backend package is importable regardless of CWD
BACKEND_ROOT = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_ROOT))

from dotenv import load_dotenv
load_dotenv(BACKEND_ROOT / ".env")

from sqlalchemy import text

from app.database import SessionLocal  # noqa: E402


# Ordered so child rows are truncated before their parents. Postgres CASCADE
# would work too but this list is explicit and portable.
TRANSACTIONAL_TABLES = [
    "notifications",
    "concept_cost_lines",
    "concept_generations",
    "model3d_annotations",
    "model3d_files",
    "attendance",
    "payroll_entries",
    "payroll_runs",
    "phase_employees",
    "phase_notes",
    "progress_updates",
    "estimate_approval_events",
    "estimate_requirements",
    "estimates",
    "pay_application_line_items",
    "pay_applications",
    "lien_waivers",
    "material_deliveries",
    "vendor_quotation_items",
    "vendor_quotations",
    "bid_line_item_quotes",
    "bid_line_items",
    "bid_invitations",
    "bids",
    "bid_packages",
    "quotation_share_logs",
    "quotation_line_items",
    "quotations",
    "po_line_items",
    "purchase_orders",
    "subcontracts",
    "procurement_documents",
    "vendor_documents",
    "vendor_products",
    "cost_code_budgets",
    "invoices",
    "income_entries",
    "expense_entries",
    "payments",
    "project_change_order_events",
    "project_change_order_revisions",
    "project_change_orders",
    "change_orders",
    "project_assignments",
    "project_documents",
    "phases",
    "projects",
    "products",
    "vendors",
    "employees",
    "clients",
]

# Wiped only in ``full`` mode
LOOKUP_TABLES = [
    "employee_categories",
    "estimate_categories",
    "estimate_statuses",
    "expense_categories",
    "milestones",
    "requirements_master",
]


def truncate_tables(session, tables):
    """Truncate a list of tables in one statement (RESTART IDENTITY, CASCADE)."""
    if not tables:
        return
    joined = ", ".join(tables)
    session.execute(text(f"TRUNCATE TABLE {joined} RESTART IDENTITY CASCADE"))


def _reseed_admin(session) -> None:
    """After a CASCADE wipe the users table can be empty. Re-run the app's
    own admin seeder so the operator can log in again."""
    from app.seed import seed_admin
    seed_admin(session)
    session.commit()
    print("[wipe] admin re-seeded")


def wipe(mode: str) -> None:
    session = SessionLocal()
    try:
        # Existence filter — production may not have every table
        rows = session.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = current_schema()"
        )).all()
        existing = {r[0] for r in rows}

        txn = [t for t in TRANSACTIONAL_TABLES if t in existing]
        lookups = [t for t in LOOKUP_TABLES if t in existing]

        print(f"[wipe] mode={mode}")
        print(f"[wipe] transactional tables to truncate: {len(txn)}")
        truncate_tables(session, txn)

        if mode == "full":
            print(f"[wipe] lookup tables to truncate: {len(lookups)}")
            truncate_tables(session, lookups)
            print("[wipe] deleting non-admin users")
            session.execute(text(
                "DELETE FROM users WHERE lower(role) != 'admin'"
            ))
        else:
            print("[wipe] keeping lookup tables intact")
            print("[wipe] deleting non-admin users")
            session.execute(text(
                "DELETE FROM users WHERE lower(role) != 'admin'"
            ))

        session.commit()
        # Re-seed admin — TRUNCATE ... CASCADE may have cleared the users
        # table via FK cascades, and we always want at least one login.
        _reseed_admin(session)
        print("[wipe] done")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["full", "keep-lookups"],
                          default="keep-lookups")
    parser.add_argument("--yes", action="store_true",
                          help="Skip the interactive confirmation prompt.")
    args = parser.parse_args()

    if not args.yes:
        prompt = (f"About to WIPE database (mode={args.mode}). "
                    "Type 'wipe' to proceed: ")
        if input(prompt).strip().lower() != "wipe":
            print("aborted")
            sys.exit(1)

    wipe(args.mode)


if __name__ == "__main__":
    main()
