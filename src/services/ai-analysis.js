import { getSession, isSupabaseConfigured } from './auth.js';
import { syncScanUsageFromServer } from './subscription.js';
import { todayKey } from './storage.js';

async function authPayload() {
  if (isSupabaseConfigured()) {
    const session = await getSession();
    if (!session?.access_token) {
      const err = new Error('Sign in required to log meals with AI');
      err.requiresAuth = true;
      throw err;
    }
    return { accessToken: session.access_token, localDayKey: todayKey() };
  }
  const session = await getSession();
  return session?.access_token
    ? { accessToken: session.access_token, localDayKey: todayKey() }
    : { localDayKey: todayKey() };
}

export async function analyzeFoodPhoto(imageBase64, mimeType = 'image/jpeg', userNotes = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch('/api/analyze-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        image: imageBase64,
        mimeType,
        userNotes: userNotes?.trim() || undefined,
        ...(await authPayload()),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = err.error || `Analysis failed (${res.status})`;
      const error = new Error(message);
      if (err.requiresAuth) error.requiresAuth = true;
      if (res.status === 429) error.limitReached = true;
      throw error;
    }
    const data = await res.json();
    const analysis = parseAnalysisResponse(data);
    if (data.usage) syncScanUsageFromServer(data.usage);
    if (data.demo) analysis.demo = true;
    return analysis;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Analysis took too long — try again with a smaller photo');
    }
    if (err instanceof TypeError) {
      throw new Error('Could not reach the server — check you are on the latest dev URL and refresh');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function refineWithClarifications(imageBase64, mimeType, previousAnalysis, answers, userNotes = '') {
  const context = {
    previous: previousAnalysis,
    answers: answers.map((a) => ({ question: a.question, answer: a.answer })),
  };
  const res = await fetch('/api/analyze-food', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      mimeType,
      context,
      userNotes: userNotes?.trim() || undefined,
      ...(await authPayload()),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.error || `Refinement failed (${res.status})`;
    const error = new Error(message);
    if (err.requiresAuth) error.requiresAuth = true;
    throw error;
  }
  return parseAnalysisResponse(await res.json());
}

function parseAnalysisResponse(data) {
  const raw = data.analysis || data;
  if (typeof raw === 'string') {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid analysis response');
    return JSON.parse(jsonMatch[0]);
  }
  return raw;
}

export function needsClarification(analysis, threshold = 0.72) {
  const questions = analysis.clarification_questions || [];
  const lowConfidence = (analysis.confidence_score ?? 1) < threshold;
  return questions.length > 0 && (lowConfidence || questions.length >= 2);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, dataUrl, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(reader.error);
  });
}

export async function compressImage(file, maxWidth = 1280, quality = 0.82) {
  if (!file || file.size === 0) {
    throw new Error('That file is empty — pick another photo');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Photo is too large — try one under 25 MB');
  }

  let workingFile = file;
  const name = (file.name || '').toLowerCase();
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif');

  if (isHeic) {
    try {
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
      const blob = Array.isArray(converted) ? converted[0] : converted;
      workingFile = new File([blob], name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
    } catch (_) {
      throw new Error('Could not read iPhone photo — try JPG or PNG instead');
    }
  }

  try {
    const img = await decodeImageFile(workingFile);
    let { width, height } = img;
    if (!width || !height) throw new Error('Could not read image dimensions');
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process photo');
    ctx.drawImage(img, 0, 0, width, height);
    const outMime = 'image/jpeg';
    const compressed = canvas.toDataURL(outMime, quality);
    if (compressed.length < 100) throw new Error('Photo export failed');
    return {
      dataUrl: compressed,
      base64: compressed.split(',')[1],
      mimeType: outMime,
    };
  } catch (_) {
    const raw = await fileToBase64(workingFile);
    if (!raw.base64 || raw.base64.length < 100) {
      throw new Error('Could not read this photo — try JPG or PNG');
    }
    return {
      ...raw,
      mimeType: raw.mimeType?.startsWith('image/') ? raw.mimeType : 'image/jpeg',
    };
  }
}

async function decodeImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const img = await bitmapToImage(bitmap);
      bitmap.close?.();
      return img;
    } catch {
      /* fall through */
    }
  }
  const { dataUrl } = await fileToBase64(file);
  return loadImage(dataUrl);
}

function bitmapToImage(bitmap) {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return loadImage(canvas.toDataURL('image/jpeg', 0.92));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Demo analysis when API is unavailable (dev / offline) */
export function demoAnalysis() {
  return {
    meal_summary: 'Medium banana',
    total_calories_kcal: 105,
    total_nutrition: { protein_g: 1.3, carbs_g: 27, fat_g: 0.4, sugar_g: 14, fibre_g: 3.1, salt_mg: 1 },
    confidence_score: 0.85,
    items: [
      {
        name: 'Banana',
        portion_estimate: '1 medium (~118g)',
        calories_kcal: 105,
        nutrition: { protein_g: 1.3, carbs_g: 27, fat_g: 0.4 },
        confidence: 0.85,
      },
    ],
    clarification_questions: [],
  };
}
