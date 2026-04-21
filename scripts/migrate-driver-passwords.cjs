/**
 * Driver Password Migration Script
 * Converts plain text driver passwords to bcrypt hashes
 *
 * Run with: node scripts/migrate-driver-passwords.cjs
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

async function migrateDriverPasswords() {
  console.log('🔐 Starting driver password migration...\n');

  // Fetch all drivers with plain text passwords
  const { data: drivers, error } = await supabase
    .from('cp_drivers')
    .select('id, email, name, password_hash')
    .not('password_hash', 'like', '$2a$%')
    .not('password_hash', 'like', '$2b$%')
    .not('password_hash', 'is', null);

  if (error) {
    console.error('Error fetching drivers:', error);
    process.exit(1);
  }

  if (!drivers || drivers.length === 0) {
    console.log('✅ No plain text passwords found. All driver passwords are already hashed!');
    return;
  }

  console.log(`Found ${drivers.length} drivers with plain text passwords:\n`);

  let successCount = 0;
  let failCount = 0;

  for (const driver of drivers) {
    const { id, email, name, password_hash } = driver;

    if (!password_hash || password_hash.trim() === '') {
      console.log(`⚠️  Skipping ${email || id} - empty password`);
      continue;
    }

    try {
      // Hash the plain text password
      const hashedPassword = await bcrypt.hash(password_hash, SALT_ROUNDS);

      // Update in database
      const { error: updateError } = await supabase
        .from('cp_drivers')
        .update({ password_hash: hashedPassword })
        .eq('id', id);

      if (updateError) {
        console.log(`❌ Failed to update ${email}: ${updateError.message}`);
        failCount++;
      } else {
        console.log(`✅ Migrated: ${email || name || id}`);
        successCount++;
      }
    } catch (err) {
      console.log(`❌ Error hashing password for ${email}: ${err.message}`);
      failCount++;
    }
  }

  console.log('\n--- Migration Complete ---');
  console.log(`✅ Successfully migrated: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
}

migrateDriverPasswords().catch(console.error);
