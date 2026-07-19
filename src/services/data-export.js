import { getAllMeals } from './storage.js';
import { getGoals, getUnitPrefs } from './goals.js';
import { getPlan, getScanBudget, getTopUpBalance } from './subscription.js';

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function stripMealForExport(meal) {
  const { photoDataUrl, ...rest } = meal;
  return {
    ...rest,
    hasPhoto: Boolean(photoDataUrl),
  };
}

export async function buildUserDataExport(profile = {}) {
  const meals = await getAllMeals();
  return {
    exportedAt: new Date().toISOString(),
    app: 'NutriLog',
    version: '0.2.0',
    profile: {
      displayName: profile.displayName || '',
      email: profile.email || '',
      plan: getPlan(),
      scanBudget: getScanBudget(),
      topUpBalance: getTopUpBalance(),
    },
    goals: getGoals(),
    unitPrefs: getUnitPrefs(),
    meals: meals.map(stripMealForExport),
    mealCount: meals.length,
    note: 'Meal photos may also be stored in your cloud account when signed in. This export omits image data to keep file size manageable.',
  };
}

export async function exportUserDataJson(profile = {}) {
  const data = await buildUserDataExport(profile);
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(`nutrilog-export-${stamp}.json`, blob);
  return data;
}

export async function exportMealsCsv(profile = {}) {
  const meals = await getAllMeals();
  const headers = [
    'date',
    'meal_summary',
    'meal_type',
    'calories_kcal',
    'protein_g',
    'carbs_g',
    'fat_g',
    'fibre_g',
    'sugar_g',
    'salt_mg',
    'confidence_score',
    'meal_notes',
    'source',
  ];
  const rows = meals.map((m) => {
    const n = m.total_nutrition || {};
    return [
      m.date,
      m.meal_summary,
      m.meal_type,
      m.total_calories_kcal,
      n.protein_g,
      n.carbs_g,
      n.fat_g,
      n.fibre_g,
      n.sugar_g,
      n.salt_mg,
      m.confidence_score,
      m.meal_notes,
      m.source || 'photo',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(`nutrilog-meals-${stamp}.csv`, new Blob([csv], { type: 'text/csv' }));
  return meals.length;
}
