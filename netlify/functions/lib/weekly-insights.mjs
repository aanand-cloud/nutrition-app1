/** Server-side weekly report + push message (mirrors client logic) */

const DEFAULT_GOALS = {
  calories_kcal: 2000,
  protein_g: 100,
  carbs_g: 250,
  fat_g: 65,
  fibre_g: 30,
  sugar_g: 50,
  salt_mg: 6000,
};

export function sumNutrition(meals) {
  const total = {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    sugar_g: 0,
    fibre_g: 0,
    salt_mg: 0,
  };
  for (const meal of meals) {
    const n = meal.total_nutrition || {};
    total.calories_kcal += meal.total_calories_kcal || 0;
    total.protein_g += n.protein_g || 0;
    total.carbs_g += n.carbs_g || 0;
    total.fat_g += n.fat_g || 0;
    total.sugar_g += n.sugar_g || 0;
    total.fibre_g += n.fibre_g || 0;
    total.salt_mg += n.salt_mg || 0;
  }
  return total;
}

export function weekReportFromMeals(meals, goals = DEFAULT_GOALS) {
  const byDate = {};
  for (const m of meals) {
    const d = m.date;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(m);
  }
  const daysWithData = Object.keys(byDate).length;
  const totals = sumNutrition(meals);
  const avg = {};
  for (const k of Object.keys(totals)) {
    avg[k] = daysWithData ? totals[k] / daysWithData : 0;
  }

  const insights = [];
  const checks = [
    { key: 'protein_g', label: 'Protein', goalKey: 'protein_g', unit: 'g', higher: true },
    { key: 'fibre_g', label: 'Fibre', goalKey: 'fibre_g', unit: 'g', higher: true },
    { key: 'sugar_g', label: 'Sugar', goalKey: 'sugar_g', unit: 'g', higher: false },
    { key: 'salt_mg', label: 'Salt', goalKey: 'salt_mg', unit: 'mg', higher: false },
    { key: 'calories_kcal', label: 'Calories', goalKey: 'calories_kcal', unit: 'kcal', higher: false },
  ];

  for (const c of checks) {
    const goal = goals[c.goalKey];
    const value = avg[c.key];
    const ratio = goal ? value / goal : 1;
    const daysUnder = countDaysUnder(byDate, c.key, goal, c.higher);

    if (c.higher && ratio < 0.8 && daysWithData >= 1) {
      insights.push({
        type: 'low',
        label: c.label,
        average: Math.round(value * 10) / 10,
        goal,
        unit: c.unit,
        percent: Math.round(ratio * 100),
        daysUnderTarget: daysUnder,
      });
    } else if (!c.higher && c.key !== 'calories_kcal' && ratio > 1.15) {
      insights.push({
        type: 'high',
        label: c.label,
        average: Math.round(value * 10) / 10,
        goal,
        unit: c.unit,
        percent: Math.round(ratio * 100),
        daysUnderTarget: daysUnder,
      });
    } else if (c.key === 'calories_kcal' && ratio < 0.75 && daysWithData >= 3) {
      insights.push({
        type: 'low',
        label: c.label,
        average: Math.round(value),
        goal,
        unit: c.unit,
        percent: Math.round(ratio * 100),
        daysUnderTarget: daysUnder,
      });
    }
  }

  return {
    daysWithData,
    averages: avg,
    goals,
    insights: insights.sort((a, b) => (a.type === 'low' ? -1 : 1)),
  };
}

export function buildWeeklyPushMessage(report, displayName = '') {
  const hi = displayName ? `${displayName}, ` : '';

  if (!report?.daysWithData) {
    return {
      title: displayName ? `${displayName}, start logging` : 'Your NutriLog weekly check-in',
      body: `${hi}log meals this week to get personalised protein and calorie alerts.`,
      url: '/?view=log',
    };
  }

  const { averages: avg, goals, insights, daysWithData } = report;
  const proteinPct = pct(avg.protein_g, goals.protein_g);
  const fibrePct = pct(avg.fibre_g, goals.fibre_g);
  const calPct = pct(avg.calories_kcal, goals.calories_kcal);
  const topLow = insights.find((i) => i.type === 'low');

  if (topLow) {
    let body = `${hi}${topLow.label} at ${topLow.percent}% of your ${topLow.goal}${topLow.unit} goal — averaging ${Math.round(topLow.average)}${topLow.unit}/day.`;
    if (topLow.daysUnderTarget) {
      body += ` Off target ${topLow.daysUnderTarget}/${daysWithData} days.`;
    }
    return {
      title: displayName ? `${displayName}: ${topLow.label} ${topLow.percent}%` : `${topLow.label} ${topLow.percent}% this week`,
      body,
      url: '/?view=reports',
    };
  }

  if (insights.length) {
    const high = insights[0];
    return {
      title: `${high.label} above target (${high.percent}%)`,
      body: `Weekly avg ${Math.round(high.average)}${high.unit}/day. Tap to review your report.`,
      url: '/?view=reports',
    };
  }

  return {
    title: 'On track this week 🎯',
    body: `Avg ${Math.round(avg.calories_kcal)} kcal (${calPct}%), protein ${Math.round(avg.protein_g)}g (${proteinPct}%), fibre ${Math.round(avg.fibre_g)}g (${fibrePct}%).`,
    url: '/?view=reports',
  };
}

function countDaysUnder(byDate, key, goal, higherIsBetter) {
  if (!goal) return 0;
  let n = 0;
  for (const dayMeals of Object.values(byDate)) {
    const val = sumNutrition(dayMeals)[key] || 0;
    if (higherIsBetter && val < goal * 0.8) n++;
    if (!higherIsBetter && val > goal * 1.15) n++;
  }
  return n;
}

function pct(value, goal) {
  if (!goal) return 0;
  return Math.round((value / goal) * 100);
}

export function mealRowToLocal(row) {
  return {
    date: row.date,
    total_calories_kcal: Number(row.total_calories_kcal || 0),
    total_nutrition: row.total_nutrition || {},
    items: row.items || [],
    meal_summary: row.meal_summary,
  };
}

export { DEFAULT_GOALS };
