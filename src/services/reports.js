import { getGoals, getUnitPrefs, formatEnergy } from './goals.js';
import { sumNutrition, todayKey } from './storage.js';

const NUTRIENT_META = [
  { key: 'calories_kcal', label: 'Calories', goalKey: 'calories_kcal', unit: 'kcal', higherIsBetter: false },
  { key: 'protein_g', label: 'Protein', goalKey: 'protein_g', unit: 'g', higherIsBetter: true },
  { key: 'carbs_g', label: 'Carbs', goalKey: 'carbs_g', unit: 'g', higherIsBetter: null },
  { key: 'fat_g', label: 'Fat', goalKey: 'fat_g', unit: 'g', higherIsBetter: null },
  { key: 'fibre_g', label: 'Fibre', goalKey: 'fibre_g', unit: 'g', higherIsBetter: true },
  { key: 'sugar_g', label: 'Sugar', goalKey: 'sugar_g', unit: 'g', higherIsBetter: false },
  { key: 'salt_mg', label: 'Salt', goalKey: 'salt_mg', unit: 'mg', higherIsBetter: false },
];

const SUGGESTIONS = {
  protein_g: [
    'Add eggs, Greek yogurt, lentils, chicken, fish, or tofu to one meal.',
    'Try a protein-rich snack: nuts, cottage cheese, or a shake.',
  ],
  fibre_g: [
    'Add vegetables, beans, oats, or whole grains to your next meal.',
    'Include fruit with skins or a side salad.',
  ],
  calories_kcal: [
    'You are under your calorie goal — add a balanced snack or larger portion at lunch.',
  ],
  sugar_g: [
    'Swap sugary drinks for water or unsweetened tea.',
    'Choose whole fruit instead of juice or desserts.',
  ],
  salt_mg: [
    'Cook with less added salt; use herbs, lemon, and spices for flavour.',
  ],
};

export function groupMealsByDate(meals) {
  const map = {};
  for (const m of meals) {
    if (!map[m.date]) map[m.date] = [];
    map[m.date].push(m);
  }
  return map;
}

export function dailyTotals(meals) {
  return sumNutrition(meals);
}

export function periodReport(meals, dayCount) {
  const goals = getGoals();
  const prefs = getUnitPrefs();
  const byDate = groupMealsByDate(meals);
  const dates = Object.keys(byDate).sort();
  const daysWithData = dates.length;
  const periodLabel = dayCount <= 7 ? 'this week' : 'this month';
  const totals = sumNutrition(meals);
  const avg = {};
  for (const n of NUTRIENT_META) {
    avg[n.key] = daysWithData ? totals[n.key] / daysWithData : 0;
  }

  const insights = [];
  for (const n of NUTRIENT_META) {
    if (n.higherIsBetter === null) continue;
    const goal = goals[n.goalKey];
    const value = avg[n.key];
    const ratio = goal ? value / goal : 1;
    const daysUnderTarget = countDaysUnderGoal(byDate, n.key, goal, n.higherIsBetter);

    if (n.higherIsBetter && ratio < 0.8 && daysWithData >= 1) {
      const tips = SUGGESTIONS[n.key] || [];
      const gap = Math.max(0, Math.round(goal - value));
      insights.push({
        type: 'low',
        nutrient: n.key,
        label: n.label,
        average: Math.round(value * 10) / 10,
        goal,
        unit: n.unit,
        percent: Math.round(ratio * 100),
        daysUnderTarget,
        periodLabel,
        message: `${n.label} target not reached ${periodLabel} — you averaged ${Math.round(value)}${n.unit}/day (${Math.round(ratio * 100)}% of your ${goal}${n.unit} goal). Try adding ~${gap}${n.unit} more per day.`,
        suggestions: tips,
      });
    } else if (!n.higherIsBetter && ratio > 1.15 && n.key !== 'calories_kcal') {
      const tips = SUGGESTIONS[n.key] || [];
      insights.push({
        type: 'high',
        nutrient: n.key,
        label: n.label,
        average: Math.round(value * 10) / 10,
        goal,
        unit: n.unit,
        percent: Math.round(ratio * 100),
        daysUnderTarget,
        periodLabel,
        message: `Your average ${n.label.toLowerCase()} is above your goal ${periodLabel} (${Math.round(ratio * 100)}%).`,
        suggestions: tips,
      });
    } else if (n.key === 'calories_kcal' && ratio < 0.75 && daysWithData >= 3) {
      insights.push({
        type: 'low',
        nutrient: n.key,
        label: n.label,
        average: Math.round(value),
        goal,
        unit: n.unit,
        percent: Math.round(ratio * 100),
        daysUnderTarget,
        periodLabel,
        message: `Calorie target not reached ${periodLabel} — you averaged ${formatEnergy(value, prefs)}/day vs your ${formatEnergy(goal, prefs)} goal.`,
        suggestions: SUGGESTIONS.calories_kcal,
      });
    }
  }

  const chartDays = [];
  const end = new Date();
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const dayMeals = byDate[key] || [];
    chartDays.push({
      date: key,
      label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }),
      ...sumNutrition(dayMeals),
      mealCount: dayMeals.length,
    });
  }

  return {
    dayCount,
    daysWithData,
    totals,
    averages: avg,
    goals,
    insights: insights.sort((a, b) => (a.type === 'low' ? -1 : 1)),
    chartDays,
    nutrients: NUTRIENT_META,
  };
}

export function weekReport(meals) {
  return periodReport(meals, 7);
}

export function monthReport(meals) {
  return periodReport(meals, 30);
}

/** Top weekly insight for Today screen banner */
export function topWeeklyInsight(meals) {
  const report = weekReport(meals);
  if (!report.insights.length) return null;
  const top = report.insights.find((i) => i.type === 'low') || report.insights[0];
  return top;
}

function countDaysUnderGoal(byDate, nutrientKey, goal, higherIsBetter) {
  if (!goal) return 0;
  let count = 0;
  for (const dayMeals of Object.values(byDate)) {
    const dayTotal = sumNutrition(dayMeals);
    const val = dayTotal[nutrientKey] || 0;
    if (higherIsBetter && val < goal * 0.8) count++;
    if (!higherIsBetter && val > goal * 1.15) count++;
  }
  return count;
}
