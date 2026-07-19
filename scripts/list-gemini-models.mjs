import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(resolve(root, '.env'), 'utf8');
const key = raw.split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='))?.slice('GEMINI_API_KEY='.length).trim();

const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
  headers: { 'x-goog-api-key': key },
});
const data = await res.json();
if (!res.ok) {
  console.error('Failed:', data);
  process.exit(1);
}
const flash = (data.models || [])
  .map((m) => m.name?.replace('models/', ''))
  .filter((n) => n && /flash/i.test(n))
  .slice(0, 15);
console.log('Flash models available on your account:');
flash.forEach((m) => console.log(' -', m));
