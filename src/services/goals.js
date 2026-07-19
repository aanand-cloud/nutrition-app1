export const DEFAULT_GOALS = {
  calories_kcal: 2000,
  protein_g: 100,
  carbs_g: 250,
  fat_g: 65,
  fibre_g: 30,
  sugar_g: 50,
  salt_mg: 6000,
};

const GOALS_KEY = 'nutrilog_goals';

export function getGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (raw) return { ...DEFAULT_GOALS, ...JSON.parse(raw) };
  } catch (_) {}
  return { ...DEFAULT_GOALS };
}

export function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function getUnitPrefs() {
  try {
    const raw = localStorage.getItem('nutrilog_units');
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { energy: 'kcal', weight: 'g' };
}

export function saveUnitPrefs(prefs) {
  localStorage.setItem('nutrilog_units', JSON.stringify(prefs));
}

export function kcalToKj(kcal) {
  return Math.round(kcal * 4.184);
}

export function formatEnergy(kcal, prefs = getUnitPrefs()) {
  if (prefs.energy === 'kJ') return `${kcalToKj(kcal)} kJ`;
  return `${Math.round(kcal)} kcal`;
}

/** Numeric value + unit for UI that splits label and number (e.g. progress ring). */
export function formatEnergyParts(kcal, prefs = getUnitPrefs()) {
  if (prefs.energy === 'kJ') {
    return { value: kcalToKj(kcal), unit: 'kJ' };
  }
  return { value: Math.round(kcal), unit: 'kcal' };
}
