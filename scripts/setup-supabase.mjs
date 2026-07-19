import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const path = resolve(root, '.env');
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function readSql(name) {
  return readFileSync(resolve(root, 'supabase', name), 'utf8');
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const isPlaceholder = (v) => !v || v.includes('your-project') || v.includes('eyJ...') || v === 'eyJ';

console.log('\n🥗 NutriLog — Supabase setup\n');

if (!url || !anonKey || isPlaceholder(url) || isPlaceholder(anonKey)) {
  console.log('Step 1 — Create a Supabase project (2 minutes)');
  console.log('  → https://supabase.com/dashboard/new/new-project');
  console.log('  → Name: nutrilog   Region: closest to your customers   Password: save it\n');

  console.log('Step 2 — Copy API keys');
  console.log('  → Project Settings → API');
  console.log('  → Copy Project URL and anon public key\n');

  console.log('Step 3 — Create .env file in nutrition-app/');
  if (!existsSync(resolve(root, '.env'))) {
    const example = readFileSync(resolve(root, '.env.example'), 'utf8');
    writeFileSync(resolve(root, '.env'), example);
    console.log('  ✅ Created .env from .env.example — paste your keys there\n');
  } else {
    console.log('  → Edit .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY\n');
  }

  console.log('Step 4 — Run database SQL');
  console.log('  → Supabase Dashboard → SQL Editor → New query');
  console.log('  → Paste contents of: supabase/full-setup.sql');
  console.log('  → Click Run\n');

  console.log('Step 5 — Enable email auth');
  console.log('  → Authentication → Providers → Email → ON');
  console.log('  → (Optional) disable "Confirm email" for faster testing\n');

  console.log('Step 6 — Re-run this script');
  console.log('  → node scripts/setup-supabase.mjs\n');
  process.exit(0);
}

// Verify connection
const sb = createClient(url, anonKey);
const { error } = await sb.from('profiles').select('id').limit(1);

if (error && error.code === 'PGRST205') {
  console.log('❌ Connected to Supabase but tables not created yet.\n');
  console.log('Run this SQL in Dashboard → SQL Editor:');
  console.log('  supabase/full-setup.sql\n');
  process.exit(1);
}

if (error) {
  console.log('❌ Connection failed:', error.message);
  console.log('Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env\n');
  process.exit(1);
}

const { error: schemaErr } = await sb
  .from('profiles')
  .select('discount_senior')
  .limit(1);
if (schemaErr?.code === '42703') {
  console.log('⚠️  Database is missing newer columns (signup/login may fail).');
  console.log('   Run in Supabase SQL Editor: supabase/migration-fix-missing-columns.sql\n');
}

console.log('✅ Supabase connection OK');
console.log(`   URL: ${url}`);

// Check storage bucket
if (serviceKey) {
  const admin = createClient(url, serviceKey);
  const { data: buckets } = await admin.storage.listBuckets();
  const hasPhotos = buckets?.some((b) => b.name === 'meal-photos');
  if (hasPhotos) {
    console.log('✅ Storage bucket meal-photos exists');
  } else {
    console.log('⚠️  Storage bucket missing — run supabase/storage.sql in SQL Editor');
  }
} else {
  console.log('ℹ️  Add SUPABASE_SERVICE_ROLE_KEY to .env to verify storage (optional for local dev)');
}

console.log('\n✅ Setup complete! Restart dev server:');
console.log('   npm run dev -- --host\n');
console.log('Test login: Goals → Create account (first name + email + password)\n');
