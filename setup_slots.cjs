const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vpflahhfwnwvzphfrwnb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwZmxhaGhmd253dnpwaGZyd25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg3NzEzNjQsImV4cCI6MjA2NDM0NzM2NH0.OC1TijrakZYIG-jEWm4JaR8SqPht0qg5BSNptQ5VaaM';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function setupDefaultSlots() {
    console.log('Setting up default time slots for Posso2...\n');

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

    // Check existing slots
    const { data: existing } = await supabase
        .from('cp_time_slots')
        .select('*')
        .eq('tenant_id', tenantId);

    console.log(`Found ${existing?.length || 0} existing time slots`);

    if (existing && existing.length > 0) {
        console.log('Time slots already exist. Skipping...');
        return;
    }

    // Create default time slots for each day
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const defaultSlots = [
        { label: '09:00 - 12:00', active: true },
        { label: '12:00 - 15:00', active: true },
        { label: '15:00 - 18:00', active: true }
    ];

    const slotsToInsert = [];

    for (const day of days) {
        for (const slot of defaultSlots) {
            slotsToInsert.push({
                tenant_id: tenantId,
                day: day,
                label: slot.label,
                active: slot.active
            });
        }
    }

    console.log(`Creating ${slotsToInsert.length} time slots...`);

    const { data, error } = await supabase
        .from('cp_time_slots')
        .insert(slotsToInsert)
        .select();

    if (error) {
        console.log('Error:', error.message);
    } else {
        console.log(`✅ Created ${data?.length || 0} time slots successfully!`);
        console.log('\nSlots created for each day:');
        days.forEach(day => {
            console.log(`  ${day}: 3 slots (09:00-12:00, 12:00-15:00, 15:00-18:00)`);
        });
    }
}

setupDefaultSlots();
