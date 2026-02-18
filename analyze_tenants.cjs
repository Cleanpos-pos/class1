const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function analyzeData() {
    console.log('Analyzing data distribution across tenants...\n');

    const { data: tenants } = await supabase.from('tenants').select('id, name, subdomain');

    if (!tenants) return;

    for (const tenant of tenants) {
        console.log(`\n=== ${tenant.name} (${tenant.subdomain}) ===`);

        const { data: services } = await supabase
            .from('cp_services')
            .select('id, name, category')
            .eq('tenant_id', tenant.id)
            .limit(5);

        const { data: serviceCount } = await supabase
            .from('cp_services')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id);

        console.log(`Services: ${services?.length || 0} (showing first 5)`);
        if (services && services.length > 0) {
            services.forEach(s => console.log(`  - ${s.category}: ${s.name}`));
        }
    }
}

analyzeData();
