const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function investigate() {
    console.log('Investigating database structure...');

    const tables = [
        'tenants', 
        'cp_customers', 
        'cp_orders', 
        'cp_order_items',
        'cp_drivers', 
        'cp_services', 
        'cp_categories', 
        'cp_app_settings', 
        'staff', 
        'company_settings', 
        'cp_time_slots', 
        'cp_delivery_options', 
        'cp_discount_codes', 
        'cp_promotions',
        'cp_invoices',
        'cp_email_templates',
        'cp_postcode_areas',
        'cp_postcode_service_slots',
        'cp_postcode_slot_bookings',
        'cp_partner_passes',
        'cp_company_settings',
        'cp_delivery_photos',
        'cp_admin_auth'
    ];

    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`Table [${table}]: ERROR - ${error.message} (${error.code})`);
        } else if (data.length === 0) {
            console.log(`Table [${table}]: FOUND (Empty)`);
        } else {
            console.log(`Table [${table}]: FOUND (Columns: ${Object.keys(data[0]).join(', ')})`);
        }
    }
}

investigate();
