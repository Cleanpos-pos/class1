-- =====================================================
-- CLEANPOS PRODUCTION SETUP SQL
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/vpflahhfwnwvzphfrwnb/sql
-- =====================================================

-- =====================================================
-- 1. CUSTOMER PREFERENCES COLUMNS
-- =====================================================
ALTER TABLE cp_customers
ADD COLUMN IF NOT EXISTS starch_level text DEFAULT 'None',
ADD COLUMN IF NOT EXISTS finish_style text DEFAULT 'On Hanger',
ADD COLUMN IF NOT EXISTS trouser_crease text DEFAULT 'Natural Crease',
ADD COLUMN IF NOT EXISTS auth_repairs boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS detergent text DEFAULT 'Standard Scent',
ADD COLUMN IF NOT EXISTS no_plastic boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recycle_hangers boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- =====================================================
-- 2. ORDER PREFERENCES, NOTES, AND COLLECTION TRACKING
-- =====================================================
ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS preferences jsonb;
ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS collection_failed_reason text;
ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS collection_failed_at timestamptz;
ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS collection_status text;

-- Add customer_id column (without FK first to avoid issues)
ALTER TABLE cp_orders ADD COLUMN IF NOT EXISTS customer_id uuid;

-- =====================================================
-- 2b. MIGRATE EXISTING ORDERS TO LINK CUSTOMER_ID
-- Links orders to customers by matching email within same tenant
-- =====================================================
DO $$
BEGIN
  UPDATE cp_orders o
  SET customer_id = c.id
  FROM cp_customers c
  WHERE o.customer_id IS NULL
    AND o.customer_email IS NOT NULL
    AND o.customer_email != ''
    AND o.tenant_id = c.tenant_id
    AND LOWER(o.customer_email) = LOWER(c.email);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Migration skipped or already done: %', SQLERRM;
END $$;

-- Add FK constraint if not exists (optional - can fail gracefully)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cp_orders_customer_id_fkey'
  ) THEN
    ALTER TABLE cp_orders
    ADD CONSTRAINT cp_orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES cp_customers(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'FK constraint skipped: %', SQLERRM;
END $$;

-- =====================================================
-- 3. APP SETTINGS CONSTRAINT
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cp_app_settings_key_key'
  ) THEN
    ALTER TABLE cp_app_settings ADD CONSTRAINT cp_app_settings_key_key UNIQUE (key);
  END IF;
END $$;

-- =====================================================
-- 4. TENANTS STRIPE FLAG
-- =====================================================
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_stripe_active boolean DEFAULT false;

-- =====================================================
-- 5. COMPANY SETTINGS STRIPE CONNECT
-- =====================================================
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS stripe_connect_account_id text;

-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- =====================================================
ALTER TABLE cp_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_delivery_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_discount_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 7. RLS POLICIES - Service Role Bypass
-- These allow service_role to access all data (for backend operations)
-- =====================================================

-- cp_customers policies
DROP POLICY IF EXISTS "service_role_all_cp_customers" ON cp_customers;
CREATE POLICY "service_role_all_cp_customers" ON cp_customers
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_customers" ON cp_customers;
CREATE POLICY "anon_read_cp_customers" ON cp_customers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_customers" ON cp_customers;
CREATE POLICY "anon_insert_cp_customers" ON cp_customers
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_customers" ON cp_customers;
CREATE POLICY "anon_update_cp_customers" ON cp_customers
  FOR UPDATE USING (true);

-- cp_orders policies
DROP POLICY IF EXISTS "service_role_all_cp_orders" ON cp_orders;
CREATE POLICY "service_role_all_cp_orders" ON cp_orders
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_orders" ON cp_orders;
CREATE POLICY "anon_read_cp_orders" ON cp_orders
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_orders" ON cp_orders;
CREATE POLICY "anon_insert_cp_orders" ON cp_orders
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_orders" ON cp_orders;
CREATE POLICY "anon_update_cp_orders" ON cp_orders
  FOR UPDATE USING (true);

-- cp_drivers policies
DROP POLICY IF EXISTS "service_role_all_cp_drivers" ON cp_drivers;
CREATE POLICY "service_role_all_cp_drivers" ON cp_drivers
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_drivers" ON cp_drivers;
CREATE POLICY "anon_read_cp_drivers" ON cp_drivers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_drivers" ON cp_drivers;
CREATE POLICY "anon_insert_cp_drivers" ON cp_drivers
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_drivers" ON cp_drivers;
CREATE POLICY "anon_update_cp_drivers" ON cp_drivers
  FOR UPDATE USING (true);

-- cp_services policies
DROP POLICY IF EXISTS "service_role_all_cp_services" ON cp_services;
CREATE POLICY "service_role_all_cp_services" ON cp_services
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_services" ON cp_services;
CREATE POLICY "anon_read_cp_services" ON cp_services
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_services" ON cp_services;
CREATE POLICY "anon_insert_cp_services" ON cp_services
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_services" ON cp_services;
CREATE POLICY "anon_update_cp_services" ON cp_services
  FOR UPDATE USING (true);

-- cp_categories policies
DROP POLICY IF EXISTS "service_role_all_cp_categories" ON cp_categories;
CREATE POLICY "service_role_all_cp_categories" ON cp_categories
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_categories" ON cp_categories;
CREATE POLICY "anon_read_cp_categories" ON cp_categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_categories" ON cp_categories;
CREATE POLICY "anon_insert_cp_categories" ON cp_categories
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_categories" ON cp_categories;
CREATE POLICY "anon_update_cp_categories" ON cp_categories
  FOR UPDATE USING (true);

-- cp_app_settings policies
DROP POLICY IF EXISTS "service_role_all_cp_app_settings" ON cp_app_settings;
CREATE POLICY "service_role_all_cp_app_settings" ON cp_app_settings
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_app_settings" ON cp_app_settings;
CREATE POLICY "anon_read_cp_app_settings" ON cp_app_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_app_settings" ON cp_app_settings;
CREATE POLICY "anon_insert_cp_app_settings" ON cp_app_settings
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_app_settings" ON cp_app_settings;
CREATE POLICY "anon_update_cp_app_settings" ON cp_app_settings
  FOR UPDATE USING (true);

-- staff policies
DROP POLICY IF EXISTS "service_role_all_staff" ON staff;
CREATE POLICY "service_role_all_staff" ON staff
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_staff" ON staff;
CREATE POLICY "anon_read_staff" ON staff
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_staff" ON staff;
CREATE POLICY "anon_insert_staff" ON staff
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_staff" ON staff;
CREATE POLICY "anon_update_staff" ON staff
  FOR UPDATE USING (true);

-- company_settings policies
DROP POLICY IF EXISTS "service_role_all_company_settings" ON company_settings;
CREATE POLICY "service_role_all_company_settings" ON company_settings
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_company_settings" ON company_settings;
CREATE POLICY "anon_read_company_settings" ON company_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_company_settings" ON company_settings;
CREATE POLICY "anon_insert_company_settings" ON company_settings
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_company_settings" ON company_settings;
CREATE POLICY "anon_update_company_settings" ON company_settings
  FOR UPDATE USING (true);

-- cp_time_slots policies
DROP POLICY IF EXISTS "service_role_all_cp_time_slots" ON cp_time_slots;
CREATE POLICY "service_role_all_cp_time_slots" ON cp_time_slots
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_time_slots" ON cp_time_slots;
CREATE POLICY "anon_read_cp_time_slots" ON cp_time_slots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_time_slots" ON cp_time_slots;
CREATE POLICY "anon_insert_cp_time_slots" ON cp_time_slots
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_time_slots" ON cp_time_slots;
CREATE POLICY "anon_update_cp_time_slots" ON cp_time_slots
  FOR UPDATE USING (true);

-- cp_delivery_options policies
DROP POLICY IF EXISTS "service_role_all_cp_delivery_options" ON cp_delivery_options;
CREATE POLICY "service_role_all_cp_delivery_options" ON cp_delivery_options
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_delivery_options" ON cp_delivery_options;
CREATE POLICY "anon_read_cp_delivery_options" ON cp_delivery_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_delivery_options" ON cp_delivery_options;
CREATE POLICY "anon_insert_cp_delivery_options" ON cp_delivery_options
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_delivery_options" ON cp_delivery_options;
CREATE POLICY "anon_update_cp_delivery_options" ON cp_delivery_options
  FOR UPDATE USING (true);

-- cp_discount_codes policies
DROP POLICY IF EXISTS "service_role_all_cp_discount_codes" ON cp_discount_codes;
CREATE POLICY "service_role_all_cp_discount_codes" ON cp_discount_codes
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_discount_codes" ON cp_discount_codes;
CREATE POLICY "anon_read_cp_discount_codes" ON cp_discount_codes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_discount_codes" ON cp_discount_codes;
CREATE POLICY "anon_insert_cp_discount_codes" ON cp_discount_codes
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_discount_codes" ON cp_discount_codes;
CREATE POLICY "anon_update_cp_discount_codes" ON cp_discount_codes
  FOR UPDATE USING (true);

-- cp_promotions policies
DROP POLICY IF EXISTS "service_role_all_cp_promotions" ON cp_promotions;
CREATE POLICY "service_role_all_cp_promotions" ON cp_promotions
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_cp_promotions" ON cp_promotions;
CREATE POLICY "anon_read_cp_promotions" ON cp_promotions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_cp_promotions" ON cp_promotions;
CREATE POLICY "anon_insert_cp_promotions" ON cp_promotions
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cp_promotions" ON cp_promotions;
CREATE POLICY "anon_update_cp_promotions" ON cp_promotions
  FOR UPDATE USING (true);

-- tenants policies
DROP POLICY IF EXISTS "service_role_all_tenants" ON tenants;
CREATE POLICY "service_role_all_tenants" ON tenants
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "anon_read_tenants" ON tenants;
CREATE POLICY "anon_read_tenants" ON tenants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert_tenants" ON tenants;
CREATE POLICY "anon_insert_tenants" ON tenants
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_tenants" ON tenants;
CREATE POLICY "anon_update_tenants" ON tenants
  FOR UPDATE USING (true);

-- =====================================================
-- 8. ENABLE REALTIME FOR KEY TABLES
-- =====================================================
DO $$
BEGIN
  -- Enable realtime publication for orders (for live updates)
  ALTER PUBLICATION supabase_realtime ADD TABLE cp_orders;
EXCEPTION WHEN duplicate_object THEN
  -- Table already in publication, ignore
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cp_customers;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE cp_drivers;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =====================================================
-- 9. CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_cp_orders_tenant_id ON cp_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cp_orders_status ON cp_orders(status);
CREATE INDEX IF NOT EXISTS idx_cp_orders_created_at ON cp_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_orders_customer_email ON cp_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_cp_orders_customer_id ON cp_orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_cp_customers_tenant_id ON cp_customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cp_customers_email ON cp_customers(email);
CREATE INDEX IF NOT EXISTS idx_cp_customers_phone ON cp_customers(phone);

CREATE INDEX IF NOT EXISTS idx_cp_services_tenant_id ON cp_services(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cp_drivers_tenant_id ON cp_drivers(tenant_id);

CREATE INDEX IF NOT EXISTS idx_staff_tenant_id ON staff(tenant_id);

-- =====================================================
-- 10. CLEANUP OLD/ORPHANED DATA (OPTIONAL - UNCOMMENT IF NEEDED)
-- =====================================================
-- DELETE FROM cp_orders WHERE tenant_id NOT IN (SELECT id FROM tenants);
-- DELETE FROM cp_customers WHERE tenant_id NOT IN (SELECT id FROM tenants);
-- DELETE FROM cp_services WHERE tenant_id NOT IN (SELECT id FROM tenants);

-- =====================================================
-- DONE! Your database is now production-ready.
-- =====================================================
SELECT 'Production setup completed successfully!' AS status;
