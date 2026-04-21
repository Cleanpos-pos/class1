/**
 * Staff Password Migration Script
 * Converts plain text admin passwords to bcrypt hashes
 *
 * Run with: node scripts/migrate-staff-passwords.cjs
 */

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SALT_ROUNDS = 12;

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateStaffPasswords() {
  console.log('🔐 Starting staff password migration...\n');

  // Fetch all staff with plain text passwords
  const { data: staff, error } = await supabase
    .from('staff')
    .select('id, login_id, name, hashed_password')
    .not('hashed_password', 'like', '$2a$%')
    .not('hashed_password', 'like', '$2b$%')
    .not('hashed_password', 'is', null);

  if (error) {
    console.error('Error fetching staff:', error);
    process.exit(1);
  }

  if (!staff || staff.length === 0) {
    console.log('✅ No plain text passwords found. All staff passwords are already hashed!');
    return;
  }

  console.log(`Found ${staff.length} staff members with plain text passwords:\n`);

  let successCount = 0;
  let failCount = 0;

  for (const member of staff) {
    const { id, login_id, name, hashed_password } = member;

    if (!hashed_password || hashed_password.trim() === '') {
      console.log(`⚠️  Skipping ${login_id || id} - empty password`);
      continue;
    }

    try {
      // Hash the plain text password
      const hashedPassword = await bcrypt.hash(hashed_password, SALT_ROUNDS);

      // Update in database
      const { error: updateError } = await supabase
        .from('staff')
        .update({ hashed_password: hashedPassword })
        .eq('id', id);

      if (updateError) {
        console.log(`❌ Failed to update ${login_id}: ${updateError.message}`);
        failCount++;
      } else {
        console.log(`✅ Migrated: ${login_id || name || id}`);
        successCount++;
      }
    } catch (err) {
      console.log(`❌ Error hashing password for ${login_id}: ${err.message}`);
      failCount++;
    }
  }

  console.log('\n--- Migration Complete ---');
  console.log(`✅ Successfully migrated: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);

  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. Check the errors above.');
  }
}

migrateStaffPasswords().catch(console.error);
