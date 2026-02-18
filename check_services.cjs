const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkData() {
    console.log('Checking services and categories...\n');

    // Check tenants
    const { data: tenants } = await supabase.from('tenants').select('id, name, subdomain');
    console.log('Tenants:', tenants);

    if (tenants && tenants.length > 0) {
        const tenantId = tenants[0].id;
        console.log(`\nUsing tenant: ${tenants[0].name} (${tenantId})\n`);

        // Check categories
        const { data: categories } = await supabase.from('cp_categories').select('*');
        console.log('Total categories in DB:', categories?.length || 0);
        console.log('Categories with tenant_id:', categories?.filter(c => c.tenant_id).length || 0);
        console.log('Categories WITHOUT tenant_id:', categories?.filter(c => !c.tenant_id).length || 0);

        // Check services
        const { data: services } = await supabase.from('cp_services').select('*');
        console.log('\nTotal services in DB:', services?.length || 0);
        console.log('Services with tenant_id:', services?.filter(s => s.tenant_id).length || 0);
        console.log('Services WITHOUT tenant_id:', services?.filter(s => !s.tenant_id).length || 0);

        // Check what the query with tenant_id returns
        const { data: filteredServices } = await supabase.from('cp_services').select('*').eq('tenant_id', tenantId);
        console.log('\nServices when filtering by tenant_id:', filteredServices?.length || 0);
    }
}

checkData();
