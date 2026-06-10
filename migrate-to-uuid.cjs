const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const dotenv = require('dotenv');

const iamEnv = dotenv.parse(fs.readFileSync('./.env'));
const iamConfig = {
  user: iamEnv.DB_USER,
  password: iamEnv.DB_PASSWORD,
  host: iamEnv.DB_HOST,
  port: iamEnv.DB_PORT,
  database: iamEnv.DB_NAME,
};

const canteenEnv = dotenv.parse(fs.readFileSync('../canteen-service/.env'));
const canteenConfig = {
  user: canteenEnv.DB_USER,
  password: canteenEnv.DB_PASSWORD,
  host: canteenEnv.DB_HOST,
  port: canteenEnv.DB_PORT,
  database: canteenEnv.DB_NAME,
};

async function migrate() {
  const iamClient = new Client(iamConfig);
  const canteenClient = new Client(canteenConfig);

  try {
    console.log("Connecting to databases...");
    await iamClient.connect();
    await canteenClient.connect();

    console.log("Starting UUID data migration...");
    await iamClient.query('BEGIN');
    await canteenClient.query('BEGIN');

    // Step 1: Add new_id to iam users and new_user_id to verification_codes
    console.log("Adding temporary columns to IAM...");
    await iamClient.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS new_id UUID DEFAULT gen_random_uuid()');
    await iamClient.query('ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS new_user_id UUID');

    // Step 2: Fetch all users to map old ID to new UUID
    const res = await iamClient.query('SELECT id, new_id FROM users');
    const users = res.rows;
    console.log(`Found ${users.length} users to migrate.`);

    for (const user of users) {
      console.log(`Migrating user: ${user.id} -> ${user.new_id}`);
      
      // Update verification codes in IAM
      await iamClient.query('UPDATE verification_codes SET new_user_id = $1 WHERE user_id = $2', [user.new_id, user.id]);

      // Update Canteen iam_id
      await canteenClient.query('UPDATE users SET iam_id = $1 WHERE iam_id = $2', [user.new_id, user.id.toString()]);
    }

    // Step 3: Swap columns in IAM
    console.log("Swapping columns in IAM to establish UUID as primary key...");
    await iamClient.query('ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS verification_codes_user_id_fkey');
    
    // We cannot drop users.id if other things reference it, but we already dropped the only known fk
    await iamClient.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey CASCADE');
    await iamClient.query('ALTER TABLE users DROP COLUMN id');
    await iamClient.query('ALTER TABLE users RENAME COLUMN new_id TO id');
    await iamClient.query('ALTER TABLE users ADD PRIMARY KEY (id)');

    await iamClient.query('ALTER TABLE verification_codes DROP COLUMN user_id');
    await iamClient.query('ALTER TABLE verification_codes RENAME COLUMN new_user_id TO user_id');
    await iamClient.query('ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE');

    console.log("Marking IAM UUID migration as complete in pgmigrations...");
    await iamClient.query("INSERT INTO pgmigrations (name, run_on) SELECT '1780000000000_uuid-users', NOW() WHERE NOT EXISTS (SELECT 1 FROM pgmigrations WHERE name = '1780000000000_uuid-users')");

    console.log("Committing transactions...");
    await iamClient.query('COMMIT');
    await canteenClient.query('COMMIT');

    console.log("Migration completed successfully!");
  } catch (err) {
    console.error("Migration failed, rolling back...", err);
    try { await iamClient.query('ROLLBACK'); } catch(e) {}
    try { await canteenClient.query('ROLLBACK'); } catch(e) {}
  } finally {
    await iamClient.end();
    await canteenClient.end();
  }
}

migrate();
