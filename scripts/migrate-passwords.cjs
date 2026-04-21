/**
 * Password Migration Script
 * Converts plain text passwords to bcrypt hashes
 *
 * Run with: node scripts/migrate-passwords.cjs
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

async function migratePasswords() {
  console.log('🔐 Starting password migration...\n');

  // Fetch all customers with plain text passwords
  const { data: customers, error } = await supabase
    .from('cp_customers')
    .select('id, email, name, password')
    .not('password', 'like', '$2a$%')
    .not('password', 'like', '$2b$%')
    .not('password', 'is', null);

  if (error) {
    console.error('Error fetching customers:', error);
    process.exit(1);
  }

  if (!customers || customers.length === 0) {
    console.log('✅ No plain text passwords found. All passwords are already hashed!');
    return;
  }

  console.log(`Found ${customers.length} customers with plain text passwords:\n`);

  let successCount = 0;
  let failCount = 0;

  for (const customer of customers) {
    const { id, email, name, password } = customer;

    if (!password || password.trim() === '') {
      console.log(`⚠️  Skipping ${email || id} - empty password`);
      continue;
    }

    try {
      // Hash the plain text password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Update in database
      const { error: updateError } = await supabase
        .from('cp_customers')
        .update({ password: hashedPassword })
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

  if (failCount > 0) {
    console.log('\n⚠️  Some migrations failed. Check the errors above.');
  }
}

migratePasswords().catch(console.error);
