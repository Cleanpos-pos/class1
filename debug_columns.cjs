const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkColumns() {
    console.log('Checking columns for cp_discount_codes...');
    // We try to insert a dummy record with tenant_id to see if it fails on column existence
    const { data, error } = await supabase
        .from('cp_discount_codes')
        .insert([{
            code: 'DEBUG',
            tenant_id: '00000000-0000-0000-0000-000000000000',
            discount_type: 'percentage',
            discount_value: 0
        }])
        .select();

    if (error) {
        console.log('Error Message:', error.message);
        console.log('Error Code:', error.code);
        console.log('Full Error:', JSON.stringify(error, null, 2));
    } else {
        console.log('Success! Column exists.');
        // Clean up
        await supabase.from('cp_discount_codes').delete().eq('code', 'DEBUG');
    }
}

checkColumns();
