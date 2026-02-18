const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanupTestTenants() {
    console.log('Cleaning up test tenants...\n');

    // Get all tenants except Posso2
    const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name, subdomain')
        .neq('subdomain', 'posso2');

    if (!tenants || tenants.length === 0) {
        console.log('No tenants to delete.');
        return;
    }

    console.log(`Found ${tenants.length} tenants to delete:\n`);
    tenants.forEach(t => console.log(`  - ${t.name} (${t.subdomain})`));

    for (const tenant of tenants) {
        console.log(`\nDeleting ${tenant.name}...`);

        // Delete related data first (due to foreign key constraints)
        await supabase.from('cp_order_items').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_orders').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_invoices').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_customers').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_services').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_categories').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_drivers').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_promotions').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_discount_codes').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_email_templates').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_app_settings').delete().eq('tenant_id', tenant.id);
        await supabase.from('cp_time_slots').delete().eq('tenant_id', tenant.id);
        await supabase.from('staff').delete().eq('tenant_id', tenant.id);

        // Finally delete the tenant itself
        const { error } = await supabase.from('tenants').delete().eq('id', tenant.id);

        if (error) {
            console.log(`  ❌ Error: ${error.message}`);
        } else {
            console.log(`  ✅ Deleted successfully`);
        }
    }

    console.log('\n✅ Cleanup complete! Only Posso2 remains.');
}

cleanupTestTenants();
