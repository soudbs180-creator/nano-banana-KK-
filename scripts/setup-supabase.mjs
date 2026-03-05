/**
 * Supabase Setup Script
 * Run: node scripts/setup-supabase.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRef = process.env.SUPABASE_PROJECT_REF || '';
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const migrationFile = path.join(__dirname, '..', 'supabase', 'migrations', '20250303000000_complete_setup.sql');

console.log('========================================');
console.log('KK Studio Supabase Setup Guide');
console.log('========================================\n');
console.log(`Project URL: ${supabaseUrl || '(not set)'}`);
console.log(`Project Ref: ${projectRef || '(not set)'}`);
console.log(`Migration File: ${migrationFile}\n`);

if (!fs.existsSync(migrationFile)) {
  console.error('Migration file not found.');
  process.exit(1);
}

console.log('Migration file found.\n');
console.log('Method 1: Supabase CLI (recommended)');
console.log('1. npm install -g supabase');
console.log('2. supabase login');
if (projectRef) {
  console.log(`3. supabase link --project-ref ${projectRef}`);
} else {
  console.log('3. supabase link --project-ref <your-project-ref>');
}
console.log('4. supabase db push\n');

console.log('Method 2: Supabase Dashboard (manual)');
if (projectRef) {
  console.log(`1. Visit: https://app.supabase.com/project/${projectRef}`);
} else {
  console.log('1. Visit: https://app.supabase.com/project/<your-project-ref>');
}
console.log('2. Open SQL Editor');
console.log('3. Create New Query');
console.log('4. Paste migration SQL below and run:\n');

const sql = fs.readFileSync(migrationFile, 'utf8');
console.log('-'.repeat(72));
console.log(sql);
console.log('-'.repeat(72));

console.log('\nVerification checklist:');
console.log('- profiles');
console.log('- credit_transactions');
console.log('- admin_providers');
console.log('- provider_pricing_cache');
