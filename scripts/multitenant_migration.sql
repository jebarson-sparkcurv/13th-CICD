-- =====================================================================
-- Sitera — Multi-Tenant Migration (PostgreSQL)
-- =====================================================================
--
-- Run once on your EC2 database. Safe to re-run (all statements are
-- idempotent: IF NOT EXISTS / ON CONFLICT).
--
--   psql -h localhost -U postgres -d buildcore \
--     -f /var/www/buildcore/scripts/multitenant_migration.sql
--
-- After running, either:
--   (a) restart the backend and it will seed the SuperAdmin from
--       SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD env vars automatically, or
--   (b) run the "MANUAL SUPERADMIN SEED" block at the bottom of this file.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Tenants master table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id                SERIAL PRIMARY KEY,
    name              VARCHAR NOT NULL,
    slug              VARCHAR UNIQUE NOT NULL,
    allowed_modules   JSONB,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tenants_slug ON tenants(slug);

-- ---------------------------------------------------------------------
-- 2. Add tenant_id to every top-level owning table
-- ---------------------------------------------------------------------
ALTER TABLE users               ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE users               ADD COLUMN IF NOT EXISTS allowed_modules JSONB;
ALTER TABLE projects            ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE clients             ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE vendors             ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE employees           ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE estimates           ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE invoices            ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE payments            ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE expense_entries     ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE income_entries      ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE purchase_orders     ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE subcontracts        ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE change_orders       ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE quotations          ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE bid_packages        ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE vendor_quotations   ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE concept_generations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE model3d_files       ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

-- Indexes for the tenant_id filter (every list query hits this column)
CREATE INDEX IF NOT EXISTS ix_users_tenant_id                ON users(tenant_id);
CREATE INDEX IF NOT EXISTS ix_projects_tenant_id             ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS ix_clients_tenant_id              ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS ix_vendors_tenant_id              ON vendors(tenant_id);
CREATE INDEX IF NOT EXISTS ix_employees_tenant_id            ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS ix_estimates_tenant_id            ON estimates(tenant_id);
CREATE INDEX IF NOT EXISTS ix_invoices_tenant_id             ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS ix_payments_tenant_id             ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS ix_expense_entries_tenant_id      ON expense_entries(tenant_id);
CREATE INDEX IF NOT EXISTS ix_income_entries_tenant_id       ON income_entries(tenant_id);
CREATE INDEX IF NOT EXISTS ix_purchase_orders_tenant_id      ON purchase_orders(tenant_id);
CREATE INDEX IF NOT EXISTS ix_subcontracts_tenant_id         ON subcontracts(tenant_id);
CREATE INDEX IF NOT EXISTS ix_change_orders_tenant_id        ON change_orders(tenant_id);
CREATE INDEX IF NOT EXISTS ix_quotations_tenant_id           ON quotations(tenant_id);
CREATE INDEX IF NOT EXISTS ix_bid_packages_tenant_id         ON bid_packages(tenant_id);
CREATE INDEX IF NOT EXISTS ix_vendor_quotations_tenant_id    ON vendor_quotations(tenant_id);
CREATE INDEX IF NOT EXISTS ix_concept_generations_tenant_id  ON concept_generations(tenant_id);
CREATE INDEX IF NOT EXISTS ix_model3d_files_tenant_id        ON model3d_files(tenant_id);

-- ---------------------------------------------------------------------
-- 3. Seed the Default Company (id=1). All legacy rows belong here.
-- ---------------------------------------------------------------------
INSERT INTO tenants (id, name, slug, allowed_modules, is_active)
VALUES (
    1,
    'Default Company',
    'default',
    '["projects","phases_tracking","field_ops","clients","finance","estimates","procurement","change_orders","model3d_viewer","concept_studio","client_portal","vendor_portal","site_engineer_portal"]'::jsonb,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- Keep the SERIAL counter aligned after the explicit id=1 insert
SELECT setval('tenants_id_seq', GREATEST(1, (SELECT MAX(id) FROM tenants)));

-- ---------------------------------------------------------------------
-- 4. Backfill tenant_id = 1 for every pre-existing row
-- ---------------------------------------------------------------------
UPDATE users               SET tenant_id = 1 WHERE tenant_id IS NULL AND role <> 'SuperAdmin';
UPDATE projects            SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE clients             SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE vendors             SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE employees           SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE estimates           SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE invoices            SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE payments            SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE expense_entries     SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE income_entries      SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE purchase_orders     SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE subcontracts        SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE change_orders       SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE quotations          SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE bid_packages        SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE vendor_quotations   SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE concept_generations SET tenant_id = 1 WHERE tenant_id IS NULL;
UPDATE model3d_files       SET tenant_id = 1 WHERE tenant_id IS NULL;

COMMIT;

-- =====================================================================
-- MANUAL SUPERADMIN SEED (only run if you don't want to use env vars)
-- =====================================================================
-- Replace the password_hash with a bcrypt hash of your chosen password.
-- Generate one from a Python shell inside the backend venv:
--
--   from app.core.security import hash_password
--   print(hash_password("your-strong-password"))
--
-- Then paste it below and uncomment the INSERT:
--
-- INSERT INTO users (email, password_hash, name, role, tenant_id, status)
-- VALUES (
--     'ponish.jino@sparkcurv.com',
--     '$2b$12$replace_this_with_a_real_bcrypt_hash',
--     'Sitera SuperAdmin',
--     'SuperAdmin',
--     NULL,
--     'Active'
-- )
-- ON CONFLICT (email) DO UPDATE SET role = 'SuperAdmin', tenant_id = NULL;
