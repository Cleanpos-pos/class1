const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkColumns() {
    console.log('Fetching one row to check keys...');
    const { data, error } = await supabase.from('cp_discount_codes').select('*').limit(1);

    if (error) {
        console.log('Error:', error.message);
    } else if (data && data.length > 0) {
        console.log('Available columns:', Object.keys(data[0]));
    } else {
        console.log('Table is empty, trying to fetch schema info...');
        // If table is empty, we can try to select a non-existent column to see the specialized error message
        const { error: error2 } = await supabase.from('cp_discount_codes').select('tenant_id').limit(1);
        if (error2) {
            console.log('Specialized error when selecting tenant_id:', error2.message);
        } else {
            console.log('Column tenant_id SELECTABLE (it exists)!');
        }
    }
}

checkColumns();
