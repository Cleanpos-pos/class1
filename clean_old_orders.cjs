const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function cleanOldTestData() {
    console.log('Checking for old test data in Posso2...\n');

    // Get Posso2 tenant ID
    const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('subdomain', 'posso2')
        .single();

    if (!tenant) {
        console.log('Posso2 not found!');
        return;
    }

    const tenantId = tenant.id;

    // Check orders
    const { data: orders } = await supabase
        .from('cp_orders')
        .select('id, readable_id, customer_name, customer_address, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

    console.log(`Found ${orders?.length || 0} orders for Posso2:\n`);

    if (orders && orders.length > 0) {
        orders.forEach(o => {
            console.log(`  #${o.readable_id} - ${o.customer_name} (${o.customer_address?.substring(0, 30)}...)`);
        });

        console.log('\n⚠️  These appear to be old test orders.');
        console.log('Deleting all orders and related data...\n');

        // Delete order items first
        for (const order of orders) {
            await supabase.from('cp_order_items').delete().eq('order_id', order.id);
        }

        // Delete orders
        const { error } = await supabase
            .from('cp_orders')
            .delete()
            .eq('tenant_id', tenantId);

        if (error) {
            console.log('Error:', error.message);
        } else {
            console.log('✅ All old orders deleted!');
        }

        // Also clean up old test customers
        const { data: customers } = await supabase
            .from('cp_customers')
            .select('id, name, email')
            .eq('tenant_id', tenantId);

        console.log(`\nFound ${customers?.length || 0} customers. Deleting old test customers...`);

        await supabase.from('cp_invoices').delete().eq('tenant_id', tenantId);
        await supabase.from('cp_customers').delete().eq('tenant_id', tenantId);

        console.log('✅ All old customers and invoices deleted!');
    }

    console.log('\n✅ Posso2 is now clean and ready for fresh testing!');
}

cleanOldTestData();
