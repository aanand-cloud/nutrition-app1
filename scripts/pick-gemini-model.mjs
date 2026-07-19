import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(resolve(root, '.env'), 'utf8');
const key = raw.split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='))?.slice('GEMINI_API_KEY='.length).trim();

const candidates = [
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
];

for (const model of candidates) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with JSON: {"ok":true}' }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 50 },
      }),
    }
  );
  const text = await res.text();
  const ok = res.ok ? 'OK' : `FAIL ${res.status}`;
  console.log(`${ok} — ${model}`);
  if (!res.ok) console.log('  ', text.slice(0, 120));
}
