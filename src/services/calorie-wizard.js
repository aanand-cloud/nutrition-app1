/** Mifflin–St Jeor estimate — wellness guidance only, not medical advice. */

const ACTIVITY = {
  sedentary: { factor: 1.2, label: 'Mostly sitting' },
  light: { factor: 1.375, label: 'Light exercise 1–3 days/week' },
  moderate: { factor: 1.55, label: 'Moderate exercise 3–5 days/week' },
  active: { factor: 1.725, label: 'Hard exercise 6–7 days/week' },
  very: { factor: 1.9, label: 'Physical job or athlete' },
};

export function activityOptions() {
  return Object.entries(ACTIVITY).map(([id, meta]) => ({ id, label: meta.label }));
}

export function estimateDailyCalories({
  sex = 'female',
  age,
  weightKg,
  heightCm,
  activity = 'light',
  weightGoal = 'maintain',
}) {
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);
  if (!w || !h || !a || w < 30 || h < 120 || a < 16 || a > 100) {
    throw new Error('Enter a valid age (16+), weight (kg), and height (cm)');
  }

  const base = 10 * w + 6.25 * h - 5 * a;
  const bmr = Math.round(base + (sex === 'female' ? -161 : 5));
  const factor = ACTIVITY[activity]?.factor || 1.375;
  const tdee = Math.round(bmr * factor);

  let delta = 0;
  if (weightGoal === 'lose') delta = -500;
  if (weightGoal === 'gain') delta = 300;

  const target = Math.max(1200, Math.min(5000, tdee + delta));
  return { bmr, tdee, target, activity, weightGoal };
}

export function suggestMacros(caloriesKcal, weightKg) {
  const w = Number(weightKg) || 70;
  const kcal = Number(caloriesKcal) || 2000;
  const protein_g = Math.round(Math.max(50, w * 1.6));
  const fat_g = Math.round((kcal * 0.3) / 9);
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, fat_g, carbs_g };
}
