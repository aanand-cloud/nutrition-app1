/**
 * Quick check: dev server loads GEMINI_API_KEY and analyze-food works.
 * Usage: node scripts/verify-gemini.mjs [baseUrl]
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const base = process.argv[2] || 'http://localhost:5173';

function loadEnv() {
  try {
    const raw = readFileSync(envPath, 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.replace(/\r$/, '').trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

async function waitForServer(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok || res.status === 404) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

const PROMPT = `Analyse this photo of food and return ONLY valid JSON with meal_summary, total_calories_kcal, total_nutrition, confidence_score, items, clarification_questions.`;

const TEST_IMAGES = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Banana-Single.jpg/220px-Banana-Single.jpg',
];

const env = loadEnv();
if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.length < 10) {
  console.error('FAIL: GEMINI_API_KEY missing or empty in .env');
  console.error('Get one at https://aistudio.google.com/apikey');
  process.exit(1);
}
console.log('OK: GEMINI_API_KEY is set in .env');

console.log('Waiting for dev server at', base, '...');
if (!(await waitForServer(base))) {
  console.error('FAIL: Dev server not responding. Run: npm run dev');
  process.exit(1);
}
console.log('OK: Dev server is up');

let image;
let mimeType = 'image/jpeg';
for (const url of TEST_IMAGES) {
  try {
    const imageRes = await fetch(url);
    if (!imageRes.ok) continue;
    mimeType = imageRes.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    const buf = Buffer.from(await imageRes.arrayBuffer());
    image = buf.toString('base64');
    console.log('Using test image:', url);
    break;
  } catch {
    /* try next */
  }
}
if (!image) {
  console.error('FAIL: Could not download a test food image');
  process.exit(1);
}

console.log('Calling /api/analyze-food via Gemini (10–20s)...');
const res = await fetch(`${base}/api/analyze-food`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image, mimeType: 'image/jpeg', prompt: PROMPT }),
});

const data = await res.json().catch(() => ({}));
if (res.status === 503 && data.needsKey) {
  console.error('FAIL: Server has no key — restart npm run dev after saving .env');
  process.exit(1);
}
if (!res.ok) {
  console.error('FAIL:', data.error || res.statusText);
  process.exit(1);
}

const meal = data.analysis?.meal_summary;
const kcal = data.analysis?.total_calories_kcal;
if (!meal || typeof kcal !== 'number') {
  console.error('FAIL: Unexpected API response shape');
  process.exit(1);
}

console.log('SUCCESS: Gemini meal scan works!');
console.log(`  Meal: ${meal}`);
console.log(`  Calories: ${kcal} kcal`);
console.log('\nOpen the app → Log tab → snap a meal photo to try it yourself.');
