const { createClient } = require('@supabase/supabase-js');

// Hardcoded from supabaseClient.ts
const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log('Checking Tenant Data...');

    // 1. Get Tenant ID for 'new'
    const { data: tenant, error: tErr } = await supabase
        .from('tenants')
        .select('*')
        .eq('subdomain', 'new')
        .single();

    if (tErr || !tenant) {
        console.error('Could not find tenant "new":', tErr);
        return;
    }

    console.log(`Found Tenant: ${tenant.name} (${tenant.id})`);

    // 2. Check Categories
    const { count: catCount, error: catErr } = await supabase
        .from('cp_categories')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

    console.log(`Categories for tenant: ${catCount}`);

    const { count: catNullCount } = await supabase
        .from('cp_categories')
        .select('*', { count: 'exact', head: true })
        .is('tenant_id', null);

    console.log(`Categories with NULL tenant_id: ${catNullCount}`);

    // 3. Check Services
    const { count: svcCount } = await supabase
        .from('cp_services')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);

    console.log(`Services for tenant: ${svcCount}`);

    const { count: svcNullCount } = await supabase
        .from('cp_services')
        .select('*', { count: 'exact', head: true })
        .is('tenant_id', null);

    console.log(`Services with NULL tenant_id: ${svcNullCount}`);

    // 4. Check if tenant_id column exists on these tables (infer from select error if any, or just try update)
    // If we have NULL items, we should try to assign them to this tenant if appropriate
    if ((catNullCount > 0 || svcNullCount > 0) && tenant.id) {
        console.log('Found orphaned items. Attempting to claim them for this tenant...');
        // Note: This requires RLS policy to allow update, or service role key. 
        // We only have anon key, so this might fail if RLS prevents updating rows where tenant_id is null

        const { error: updateCatErr } = await supabase
            .from('cp_categories')
            .update({ tenant_id: tenant.id })
            .is('tenant_id', null);

        if (updateCatErr) console.log('Update Categories Error:', updateCatErr.message);
        else console.log('Updated Categories successfully');

        const { error: updateSvcErr } = await supabase
            .from('cp_services')
            .update({ tenant_id: tenant.id })
            .is('tenant_id', null);

        if (updateSvcErr) console.log('Update Services Error:', updateSvcErr.message);
        else console.log('Updated Services successfully');
    }
}

checkData();
