# Sitera — Construction Project Management Portal (PRD)

## Original Problem Statement
Build a comprehensive construction project management portal covering: Projects, Phases, Field Ops (attendance, labour payments), Clients, Finance (Ledger, Balance Sheet, Payroll, Invoicing), Estimates, Procurement (Vendor Catalog, Quotations, Bid Packages), Change Orders, and Portals for Vendors + Site Engineers + Clients. Must be fully mobile responsive.

## Tech Stack
- Backend: FastAPI + SQLAlchemy + PostgreSQL
- Frontend: React + Tailwind CSS + shadcn/ui + React Query
- Auth: JWT (httpOnly cookies + Bearer fallback)

## Design System — "Architectural Swiss" (Phase 1 landed 2026-02-28)
Reference: "Zoho Books but nicer" (user's verbatim direction). Mobile-first priority.
- Typography: Outfit (headings, tight tracking) + IBM Plex Sans body + JetBrains Mono for numeric ledgers; tabular-nums globally
- Colors: Slate base + Amber-600 (light) / Amber-500 (dark) as brand accent (used only for active states + focus rings)
- Radii: rounded-xl cards, rounded-lg buttons/inputs
- Motion: hover lift, tap-scale, glass sticky headers
- Primary CTA: slate-900 background with white text (Zoho-inspired), NOT amber
- Sidebar: deep slate-950 with subtle amber active pill (bg-amber-500/10 ring-amber-500/20)
- Full spec at `/app/design_guidelines.json`

## What's Implemented (recent → oldest)
- **2026-09-06** — **Feature: Purchase Order module (Procurement)**. Adds a customer-facing Purchase Order document generated from an existing Quotation. New tables `quotation_purchase_orders` + `quotation_purchase_order_items` (chosen namespace to avoid clashing with the existing construction-commitment `purchase_orders` table). New router at `/app/backend/app/routers/quotation_purchase_orders.py` mounted on the api-router:
    - `POST /api/quotations/{qid}/purchase-order` — create DRAFT PO pre-filled from quotation items
    - `GET /api/quotations/{qid}/purchase-order` — fetch the active (non-cancelled) PO for a quotation
    - `GET/PUT /api/quotation-purchase-orders/{id}` — read + edit prices/items/discount/tax/notes; server always recomputes totals
    - `POST /api/quotation-purchase-orders/{id}/cancel` — sets `CANCELLED` + `cancelled_at`
    - `GET /api/quotation-purchase-orders/{id}/pdf` — reportlab-built A4 PDF (inline or `?download=1`)
    - `POST /api/quotation-purchase-orders/{id}/send-email` — reuses `send_html` (now supports PDF attachments via `MIMEMultipart`); pulls vendor email from DB, never hardcoded
    - `POST /api/quotation-purchase-orders/{id}/send-whatsapp` — builds `wa.me/<digits>?text=…` link using vendor phone; embeds hosted PDF URL if `PUBLIC_BASE_URL` env is set
  - Business rules enforced server-side: one non-cancelled PO per quotation (409 on duplicate); cancelled POs are never deleted; sending is blocked on CANCELLED; backend is source of truth for `subtotal / discount / tax / grand_total`.
  - Quotation list responses now carry a `purchase_order` summary (`id, po_number, status, grand_total`) so the UI can render Pending / PO Created / PO Sent / PO Cancelled chips without extra calls.
  - Frontend: new `PurchaseOrderPage.jsx` route at `/admin/projects/:id/procurement/quotations/:quotationId/purchase-order` — pre-filled form, editable prices with live recalc (Item Total → Subtotal → Grand Total including discount/tax), Cancel (confirmation dialog) / Save Draft / Purchase Order (issue) / Print / Download / Email / WhatsApp actions. Print-friendly CSS added globally to hide app chrome under `@media print`.
  - Regression tests: `/app/backend/tests/test_purchase_orders.py` — 9 tests pass (create, prefill, duplicate 409, edit-recalc, PDF, list-summary, cancel-persistence, blocked-send-on-cancel, whatsapp-link, missing-phone 422, new-po-after-cancel).
- **2026-08-31** — **Feature ADMIN/PROJECTS_002 (Sub-Contractors on Projects)**: New "Sub-Contractors" section on Project Create + Edit forms. Each entry captures type (with datalist of common types: Electrical / Plumbing / Construction / Civil Works / Painting / Interior / Carpentry / HVAC / Roofing / Tiling / Waterproofing / Landscaping — plus free-text custom types), firm/contact name, allocated amount (₹), materials provided (tag input), and free-text notes. Backend: new `project_subcontractors` table (tenant_id, project_id FK, type, name, allocated_amount, materials JSON, notes); `ProjectCreate` schema accepts inline `subcontractors: [...]`. New CRUD endpoints: `GET/POST /api/projects/{id}/subcontractors`, `PATCH/DELETE /api/subcontractors/{id}`. `GET /api/projects/{id}` (detail=True) now returns the sub-contractor list; the Project Overview tab shows a summary card with total-allocated. Validation: type required, allocated_amount ≥ 0, materials trimmed and empty entries dropped. 6 new regression tests in `/app/backend/tests/test_project_subcontractors.py` (all pass). E2E verified in preview browser.
- **2026-08-31** — **Bug fix ADMIN/PROJECT_001**: Phases entered during Estimate Creation are now automatically carried over to Project Phases when the estimate is linked to a project. Fix in `POST /api/estimates/{id}/link-project`: after linking, the estimate's `phase` is materialised as a `Phase` row on the project, and any other approved unlinked estimates in the same tenant sharing the same `project_name` are also auto-linked and their phases copied. Also tightened `sync_phase_to_project` to be tenant-scoped (prevents cross-tenant project-name collisions). New regression tests: `/app/backend/tests/test_estimate_to_project_phase_carryover.py` (2/2 pass).
- **2026-02-29** — Phase 2 continued (Finance / Procurement isolation): `tenant_id` mapped on Invoice, Payment, ExpenseEntry, IncomeEntry, PurchaseOrder, Subcontract, ChangeOrder, Quotation, BidPackage, VendorQuotation. Auto-migration + `/app/scripts/multitenant_migration.sql` updated. Routers patched: `/finance/balance-sheet` scopes projects + payroll via project_id; `/transactions/*` (income, expense, vendor, employee, product) set `tenant_id` and assert same-tenant on vendor/employee lookups; `/invoices/{id}` GET/PATCH + `/invoices/{id}/payments` assert same tenant. Auto-generated invoices from income now carry `project.tenant_id`. Wipe script preserves SuperAdmin (`role='superadmin'` protected). **End-to-end verified**: two tenants each create client + project + vendor + income, and every list endpoint returns only their own rows; cross-tenant URL probe returns 404.
- **2026-02-29** — Phase 2 Tenant Data Isolation + SuperAdmin professional redesign:
  - New `app.core.tenant_scope` helper: `tenant_scope(query, model, user)`, `ensure_tenant_owned(instance, user)`, `assert_same_tenant(instance, user)`. `require_roles` now treats SuperAdmin as implicitly authorized everywhere.
  - `tenant_id` added to ORM models: Client, Project, Vendor, Employee, Estimate, ConceptGeneration, Model3D (was DB-only before).
  - Endpoints scoped: `/clients`, `/vendors`, `/employees` (list_all), `/estimates`, `/estimate-clients`, and Projects (via `scope_by_role`). GET/PATCH/DELETE by id in these routers now assert same tenant → 404 on cross-tenant probe.
  - SQL migration file `/app/scripts/multitenant_migration.sql` ready to run on EC2 (idempotent).
  - SuperAdmin console rebuilt with dark left sidebar (Stripe/Linear style), gradient shield logo, sidebar nav (Overview/Tenants/Users/Modules/Audit), 4 metric cards with hints, structured table with column headers + module progress bars + gradient initial avatars, redesigned Create + Edit modals with sticky footer and gradient headers.
- **2026-02-29** — SuperAdmin polish + impersonation: `POST /api/tenants/{id}/impersonate` issues a fresh access/refresh cookie set for the tenant's primary Admin. SuperAdminPage rebuilt with stats strip (Total/Active/On-Hold/Users), search + segmented filter, colored initials avatars, chips, and a prominent "Login as Admin" button per row. Global `<ImpersonationBanner>` in Layout shows a sticky amber banner with an Exit button whenever `sessionStorage.sitera_impersonation` is set. Impersonation disabled for on-hold tenants.
- **2026-02-29** — Phase 4 (Tenant Team Management + SuperAdmin Ops): `users.allowed_modules` (JSON) per-user overrides clamped by tenant's `allowed_modules`. `/api/users/allowed-modules` returns the Admin's granting pool. `UsersPage` now has a Modules column + toggle modal (Inherit-All / Custom Set). Tenant scoping on all `/api/users*` endpoints (Admin only sees own tenant's users; hard-delete replaces old soft-delete via `DELETE /users/{id}`; separate `/users/{id}/disable` for pause). SuperAdmin: `DELETE /tenants/{id}/permanent` (cascading wipe, protects tenant id=1), `GET /tenants/{id}/data-summary` (row counts). SuperAdminPage row shows quick Hold/Resume/Delete buttons, and Edit modal shows an 8-metric data drill-down grid.
- **2026-02-29** — Phase 1 Multi-Tenant scaffolding: `tenants` table + `tenant_id` FK on users/projects/clients/vendors/employees/estimates/concept_generations/model3d_files. New `SuperAdmin` role (tenant_id=NULL). SuperAdmin API `/api/tenants` (list/create/patch/delete + module toggle). New SuperAdmin console at `/superadmin` (login redirect, tenant CRUD UI with module grid). Default tenant id=1 always seeded ("Default Company"); ADMIN belongs to it. Legacy rows backfilled to tenant_id=1. Login page routes SuperAdmin → `/superadmin`, everyone else → `/admin`.
- **2026-02-29** — Demo-data wipe scripts at `/app/scripts/wipe_demo_data.py` (modes: `full` / `keep-lookups`), always re-seeds admin. `main.py` guards all demo seeders behind `SEED_DEMO_DATA=true`. `SEED_DEMO_DATA=false` added to `backend/.env`.
- **2026-02-29** — 3D Drawing Viewer wired up: route `/admin/projects/:projectId/3d-viewer` and "3D Drawings" button on project header; upload GLB/GLTF, camera presets (Front/Rear/Left/Right/Top/Iso/Free), wireframe toggle, click-to-drop pin annotations with local storage on `/app/backend/uploads/models3d/`
- **2026-02-29** — AI Concept Studio migrated off Emergent LLM: `/app/backend/app/core/concept_ai.py` now uses native `google-genai` SDK (Gemini 2.5 Flash Image) for restyle and native `anthropic` SDK (Claude Sonnet 5) for cost estimate. Env vars: `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, optional `ANTHROPIC_WORKSPACE_ID` for identity-linked keys
- **2026-02-28 Phase 1 Redesign — Foundations**: New color tokens (light + dark), typography upgrade to Outfit, glass sticky headers, sidebar refresh with amber active pills, all 4 StatCard variants unified (Dashboard local, DashboardStatCard, OrgBalanceSheetTab, ProjectBalanceSheetTab) — icon chip + Outfit numerals + hover lift, Login page split-screen refined with inline SITE**RA** wordmark, 38 files bulk-updated to slate-primary buttons (was blue-600) and amber focus rings
- **2026-02-27** — Global layout overflow fix (min-width:0 grid/flex, overflow-x:clip root, num-wrap utility, responsive stat cards for large budgets)
- **2026-02-26** — Auto-invoice on client income: `Invoice.income_entry_id` FK with partial unique index, `ensure_invoice_for_income` helper, `paid_sum` treats linked income as paid, startup backfill for pre-existing rows
- **2026-02-25** — Balance Sheet rebuilt as accounting ledger (7 cols, Opening b/f, Totals/Closing c/f, voucher numbers, Rs. Indian-comma format)
- Full Vendor Product Catalog + Quotation workflow, mobile drawer sidebar, 10-item QA fixes

## Prioritized Backlog
- **P1 Phase 2 (Redesign continued)**: Project Detail tabs (Overview/Phases/Tracking/Change Orders/Employees), Estimates page, Vendors + Procurement, Site Engineer + Vendor + Client portals — apply the new design language
- **P1 Phase 3**: Ledger PDF/Excel exports match new 7-column ledger, Voucher drill-down (click voucher → open source transaction)
- **P1 Phase 4**: Double-entry accounting (Chart of Accounts, Vouchers, Trial Balance, Day Book)
- **P2**: Balance Sheet date range filter, fresh Google App Password for SMTP

## Known Environmental Issues
- PostgreSQL in the preview container drops periodically → run `bash /app/scripts/restore_postgres.sh`
- User self-hosts on EC2 (sitera.in); when they report 500s not reproducible in preview, provide raw SQL for schema patches
- On production, keep `SEED_DEMO_DATA=false` in backend .env so demo data doesn't re-seed after wipe

## Key Files
- Design: `/app/design_guidelines.json`, `/app/frontend/src/index.css` (tokens + utility classes)
- Layout: `/app/frontend/src/components/Layout.jsx` (sidebar + mobile drawer + glass header)
- StatCards: `DashboardPage.jsx`, `DashboardStatCard.jsx`, `OrgBalanceSheetTab.jsx`, `ProjectBalanceSheetTab.jsx`
- Backend: `/app/backend/app/routers/finance.py`, `routers/transactions.py`, `main.py`, `models/finance.py`
