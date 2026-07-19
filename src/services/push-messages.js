/**
 * Build personalised push notification copy from weekly report data.
 */

import { formatEnergy, getUnitPrefs } from './goals.js';

export function buildWeeklyPushMessage(report, cuisineTip = null, displayName = '') {
  const hi = displayName ? `${displayName}, ` : '';
  const prefs = getUnitPrefs();

  if (!report?.daysWithData) {
    return {
      title: displayName ? `${displayName}, start logging` : 'Start logging this week',
      body: `${hi}snap your meals in NutriLog to get personalised protein and calorie alerts.`,
      url: '/?view=log',
    };
  }

  const { averages: avg, goals, insights, daysWithData } = report;
  const proteinPct = pct(avg.protein_g, goals.protein_g);
  const fibrePct = pct(avg.fibre_g, goals.fibre_g);
  const calPct = pct(avg.calories_kcal, goals.calories_kcal);

  const topLow = insights.find((i) => i.type === 'low');

  if (topLow) {
    const avgText = formatNutrientStat(topLow, prefs);
    const goalText = formatNutrientGoal(topLow, prefs);
    let body = `${hi}${topLow.label} at ${topLow.percent}% of your ${goalText} goal — averaging ${avgText}.`;
    if (topLow.daysUnderTarget) {
      body += ` Off target ${topLow.daysUnderTarget}/${daysWithData} days.`;
    }
    const tip = cuisineTip?.tips?.[0];
    if (tip?.body) body += ` ${truncate(tip.body, 90)}`;

    return {
      title: displayName ? `${displayName}: ${topLow.label} ${topLow.percent}%` : `⚠️ ${topLow.label} ${topLow.percent}% this week`,
      body,
      url: '/?view=reports',
      stats: { proteinPct, fibrePct, calPct },
    };
  }

  if (insights.length) {
    const high = insights[0];
    return {
      title: `${high.label} above target (${high.percent}%)`,
      body: `Weekly avg ${Math.round(high.average)}${high.unit}/day vs ${high.goal}${high.unit} goal. Tap to review.`,
      url: '/?view=reports',
      stats: { proteinPct, fibrePct, calPct },
    };
  }

  return {
    title: displayName ? `${displayName}, on track this week ✅` : '✅ On track this week',
    body: `${hi}avg ${formatEnergy(avg.calories_kcal, prefs)} (${calPct}%), protein ${Math.round(avg.protein_g)}g (${proteinPct}%), fibre ${Math.round(avg.fibre_g)}g (${fibrePct}%). Nice work!`,
    url: '/?view=reports',
    stats: { proteinPct, fibrePct, calPct },
  };
}

export function buildDailyPushMessage(todayTotals, goals, mealsLogged, displayName = '') {
  const hi = displayName ? `${displayName}, ` : '';
  const prefs = getUnitPrefs();

  if (!mealsLogged) {
    return {
      title: displayName ? `${displayName}, log your meals` : 'Log your meals today',
      body: `${hi}no meals logged yet — take a photo to track calories and protein.`,
      url: '/?view=log',
    };
  }

  const calPct = pct(todayTotals.calories_kcal, goals.calories_kcal);
  const proteinPct = pct(todayTotals.protein_g, goals.protein_g);

  let body = `${hi}protein ${Math.round(todayTotals.protein_g)}g (${proteinPct}% of ${goals.protein_g}g goal). ${mealsLogged} meal${mealsLogged === 1 ? '' : 's'} logged.`;
  if (proteinPct < 80) {
    body += ' Consider a protein-rich snack or larger lunch portion.';
  }

  return {
    title: `Today: ${formatEnergy(todayTotals.calories_kcal, prefs)} (${calPct}%)`,
    body,
    url: '/',
    stats: { proteinPct, calPct },
  };
}

function formatNutrientStat(insight, prefs) {
  if (insight.nutrient === 'calories_kcal') {
    return `${formatEnergy(insight.average, prefs)}/day`;
  }
  return `${Math.round(insight.average)}${insight.unit}/day`;
}

function formatNutrientGoal(insight, prefs) {
  if (insight.nutrient === 'calories_kcal') {
    return formatEnergy(insight.goal, prefs);
  }
  return `${insight.goal}${insight.unit}`;
}

function pct(value, goal) {
  if (!goal) return 0;
  return Math.round((value / goal) * 100);
}

function truncate(s, max) {
  const t = String(s).trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
