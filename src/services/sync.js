import { getSupabase, getUser } from './auth.js';
import { getGoals, getUnitPrefs, saveGoals, saveUnitPrefs } from './goals.js';
import * as local from './storage.js';

const BUCKET = 'meal-photos';

export async function pullCloudMeals() {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return { pulled: 0 };

  const { data, error } = await sb
    .from('meals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) throw error;

  let pulled = 0;
  for (const row of data || []) {
    const meal = rowToLocal(row);
    if (row.photo_path) {
      const signed = await signedPhotoUrl(row.photo_path);
      if (signed) meal.photoDataUrl = signed;
    }
    await local.saveMeal({ ...meal, cloudSynced: true });
    pulled++;
  }
  return { pulled };
}

export async function pushMeal(meal) {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return meal;

  let photo_path = meal.photo_path || null;
  if (meal.photoDataUrl && !photo_path) {
    photo_path = await uploadPhoto(meal.photoDataUrl, meal.id);
  }

  const row = {
    id: meal.id,
    user_id: user.id,
    date: meal.date,
    meal_summary: meal.meal_summary,
    meal_type: meal.meal_type || null,
    meal_notes: meal.meal_notes || null,
    total_calories_kcal: meal.total_calories_kcal,
    total_nutrition: meal.total_nutrition,
    items: meal.items,
    confidence_score: meal.confidence_score,
    clarifications: meal.clarifications || [],
    photo_path,
    created_at: meal.createdAt,
  };

  let { error } = await sb.from('meals').upsert(row);
  if (error?.code === '42703') {
    const { meal_type, meal_notes, ...coreRow } = row;
    ({ error } = await sb.from('meals').upsert(coreRow));
  }
  if (error) throw error;
  return { ...meal, photo_path, cloudSynced: true };
}

export async function removeCloudMeal(id) {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return;

  const { data } = await sb.from('meals').select('photo_path').eq('id', id).maybeSingle();
  if (data?.photo_path) {
    await sb.storage.from(BUCKET).remove([data.photo_path]);
  }
  await sb.from('meals').delete().eq('id', id).eq('user_id', user.id);
}

export async function syncGoalsToCloud() {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return;

  await sb.from('profiles').update({
    goals: getGoals(),
    unit_prefs: getUnitPrefs(),
    updated_at: new Date().toISOString(),
  }).eq('id', user.id);
}

export async function pullGoalsFromCloud() {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return;

  const { data, error } = await sb.from('profiles').select('display_name, goals, unit_prefs, plan, topup_balance, scan_month, scan_used').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (data?.goals) saveGoals(data.goals);
  if (data?.unit_prefs) saveUnitPrefs(data.unit_prefs);
  if (data?.display_name) {
    const { saveLocalDisplayName } = await import('./profile.js');
    saveLocalDisplayName(data.display_name);
  }
  if (data?.plan) {
    const { setPlan } = await import('./subscription.js');
    setPlan(data.plan === 'pro' ? 'daily25' : data.plan);
  }
  if (data?.topup_balance != null) {
    const { syncTopUpFromCloud } = await import('./subscription.js');
    syncTopUpFromCloud(data.topup_balance);
  }
  if (data?.scan_used != null || data?.scan_month) {
    const { syncScanStateFromProfile } = await import('./subscription.js');
    syncScanStateFromProfile(data);
  }
  return data;
}

export async function pushLocalMealsToCloud() {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return { pushed: 0, failed: 0 };

  const meals = await local.getAllMeals();
  let pushed = 0;
  let failed = 0;
  for (const meal of meals) {
    try {
      await pushMeal(meal);
      pushed++;
    } catch (err) {
      failed++;
      console.warn('Could not upload meal', meal.id, err);
    }
  }
  return { pushed, failed };
}

export async function fullSync() {
  const profile = await pullGoalsFromCloud();
  const { pushed, failed } = await pushLocalMealsToCloud();
  const { pulled } = await pullCloudMeals();
  await syncGoalsToCloud();
  return { pulled, pushed, failed, plan: profile?.plan || 'free' };
}

async function uploadPhoto(dataUrl, mealId) {
  const sb = getSupabase();
  const user = await getUser();
  if (!sb || !user) return null;

  const blob = dataUrlToBlob(dataUrl);
  const path = `${user.id}/${mealId}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) {
    console.warn('Photo upload failed', error);
    return null;
  }
  return path;
}

async function signedPhotoUrl(path) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

function rowToLocal(row) {
  return {
    id: row.id,
    date: row.date,
    meal_summary: row.meal_summary,
    meal_type: row.meal_type,
    meal_notes: row.meal_notes,
    total_calories_kcal: Number(row.total_calories_kcal),
    total_nutrition: row.total_nutrition,
    items: row.items,
    confidence_score: row.confidence_score,
    clarifications: row.clarifications,
    photo_path: row.photo_path,
    createdAt: row.created_at,
    cloudSynced: true,
  };
}

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
