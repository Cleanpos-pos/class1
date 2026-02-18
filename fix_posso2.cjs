const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fixPosso2Data() {
    console.log('Fixing Posso2 tenant data...\n');

    // Get Posso2 tenant ID
    const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('subdomain', 'posso2')
        .single();

    if (!tenant) {
        console.log('ERROR: Posso2 tenant not found!');
        return;
    }

    const tenantId = tenant.id;
    console.log(`Posso2 Tenant ID: ${tenantId}\n`);

    // Update categories
    const { data: cats, error: catError } = await supabase
        .from('cp_categories')
        .update({ tenant_id: tenantId })
        .is('tenant_id', null)
        .select();

    console.log(`Updated ${cats?.length || 0} categories`);
    if (catError) console.log('Category error:', catError.message);

    // Update services
    const { data: svcs, error: svcError } = await supabase
        .from('cp_services')
        .update({ tenant_id: tenantId })
        .is('tenant_id', null)
        .select();

    console.log(`Updated ${svcs?.length || 0} services`);
    if (svcError) console.log('Service error:', svcError.message);

    // Update customers
    const { data: custs, error: custError } = await supabase
        .from('cp_customers')
        .update({ tenant_id: tenantId })
        .is('tenant_id', null)
        .select();

    console.log(`Updated ${custs?.length || 0} customers`);
    if (custError) console.log('Customer error:', custError.message);

    // Update orders
    const { data: orders, error: orderError } = await supabase
        .from('cp_orders')
        .update({ tenant_id: tenantId })
        .is('tenant_id', null)
        .select();

    console.log(`Updated ${orders?.length || 0} orders`);
    if (orderError) console.log('Order error:', orderError.message);

    // Update drivers
    const { data: drivers, error: driverError } = await supabase
        .from('cp_drivers')
        .update({ tenant_id: tenantId })
        .is('tenant_id', null)
        .select();

    console.log(`Updated ${drivers?.length || 0} drivers`);
    if (driverError) console.log('Driver error:', driverError.message);

    console.log('\n✅ All data assigned to Posso2!');
    console.log('Refresh your booking page to see services.');
}

fixPosso2Data();
