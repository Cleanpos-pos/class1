-- Add tenant_id to cp_time_slots table
ALTER TABLE cp_time_slots ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_time_slots_tenant ON cp_time_slots(tenant_id);

-- Refresh schema
NOTIFY pgrst, 'reload schema';
