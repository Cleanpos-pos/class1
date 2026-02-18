const { createClient } = require('@supabase/supabase-js');

// Hardcoded from supabaseClient.ts
const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedCategories() {
    console.log('Seeding Categories for "new" tenant...');

    // 1. Get Tenant ID for 'new'
    const { data: tenant, error: tErr } = await supabase.from('tenants').select('id').eq('subdomain', 'new').single();
    if (tErr || !tenant) return console.error('Tenant not found');

    const tenantId = tenant.id;
    console.log(`Target Tenant ID: ${tenantId}`);

    // 2. Get distinct categories from existing services for this tenant
    // Note: Supabase doesn't support 'distinct' easily on client, so we fetch all and dedup.
    const { data: services, error: sErr } = await supabase
        .from('cp_services')
        .select('category')
        .eq('tenant_id', tenantId);

    if (sErr) return console.error('Error fetching services', sErr);

    const categoriesNeeded = [...new Set(services.map(s => s.category))];
    console.log('Categories required based on services:', categoriesNeeded);

    // 3. Insert specific default categories if they match, or just all of them.
    // Let's iterate and insert.
    for (const catName of categoriesNeeded) {
        if (!catName) continue;

        // Check if exists
        const { data: existing } = await supabase
            .from('cp_categories')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('name', catName)
            .maybeSingle();

        if (!existing) {
            console.log(`Creating category: ${catName}`);
            const { error: insErr } = await supabase.from('cp_categories').insert({
                name: catName,
                active: true,
                tenant_id: tenantId,
                sort_order: 10
            });
            if (insErr) console.error(`Failed to create ${catName}:`, insErr.message);
        } else {
            console.log(`Category exists: ${catName}`);
        }
    }

    // Also add "Promotions" and "Other" just in case if not present
    const defaults = ["Promotions", "Other"];
    for (const catName of defaults) {
        const { data: existing } = await supabase.from('cp_categories').select('id').eq('tenant_id', tenantId).eq('name', catName).maybeSingle();
        if (!existing) {
            console.log(`Creating default category: ${catName}`);
            await supabase.from('cp_categories').insert({ name: catName, active: true, tenant_id: tenantId, sort_order: 99 });
        }
    }

    console.log('Seeding complete.');
}

seedCategories();
