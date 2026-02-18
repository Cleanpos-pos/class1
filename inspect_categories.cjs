const { createClient } = require('@supabase/supabase-js');

// Hardcoded from supabaseClient.ts
const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectCategories() {
    console.log('Inspecting Categories Table...');

    const { data, error } = await supabase
        .from('cp_categories')
        .select('*')
        .limit(10);

    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Found categories:', data);
        console.log('Total found:', data.length);
        if (data.length > 0) {
            console.log('Sample Tenant ID:', data[0].tenant_id);
        }
    }
}

inspectCategories();
