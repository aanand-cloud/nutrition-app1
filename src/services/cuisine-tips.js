import { weekReport } from './reports.js';
import { getGoals } from './goals.js';

const CACHE_KEY = 'nutrilog_cuisine_tips';

export async function getCuisineTips(meals) {
  const weekKey = weekId();
  const cached = readCache();
  if (cached.weekKey === weekKey && cached.tips?.length) {
    return cached;
  }

  const context = buildMealContext(meals);
  if (!context.items.length && !context.summaries.length) {
    return { weekKey, tips: [], patterns: [], source: 'none' };
  }

  try {
    const res = await fetch('/api/cuisine-tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, goals: getGoals() }),
    });
    if (!res.ok) throw new Error('API failed');
    const data = await res.json();
    const result = {
      weekKey,
      tips: data.tips || [],
      patterns: data.patterns || [],
      source: 'ai',
    };
    writeCache(result);
    return result;
  } catch (_) {
    const fallback = demoCuisineTips(context);
    writeCache(fallback);
    return fallback;
  }
}

function buildMealContext(meals) {
  const report = weekReport(meals);
  const itemCounts = {};
  const summaries = [];

  for (const meal of meals) {
    if (meal.meal_summary) summaries.push(meal.meal_summary);
    for (const item of meal.items || []) {
      const name = (item.name || '').toLowerCase().trim();
      if (name) itemCounts[name] = (itemCounts[name] || 0) + 1;
    }
  }

  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  return {
    summaries: summaries.slice(0, 20),
    items: topItems,
    averages: report.averages,
    goals: report.goals,
    insights: report.insights.map((i) => ({
      nutrient: i.label,
      type: i.type,
      percent: i.percent,
    })),
    daysLogged: report.daysWithData,
  };
}

function demoCuisineTips(context) {
  const tips = [];
  const patterns = [];
  const names = context.items.map((i) => i.name).join(' ');

  if (/rice|biryani|pulao|fried rice/.test(names)) {
    patterns.push('Frequent rice-based meals');
    tips.push({
      title: 'Balance your rice meals',
      body: 'You eat a lot of rice this week — add dal, eggs, grilled fish, or a side of sabzi for protein and fibre.',
      cuisine: 'South Asian',
    });
  }
  if (/curry|masala|dal|roti|naan|paneer/.test(names)) {
    patterns.push('South Asian cuisine pattern');
    tips.push({
      title: 'Boost protein in curries',
      body: 'Try adding paneer, chicken, chana, or a bowl of raita with cucumber — keeps flavour, improves macros.',
      cuisine: 'South Asian',
    });
  }
  if (/pasta|pizza|bread|croissant/.test(names)) {
    patterns.push('Mediterranean / Italian carbs');
    tips.push({
      title: 'Pair carbs with protein',
      body: 'Add grilled chicken, tuna, beans, or a Greek salad with feta to pasta-heavy days.',
      cuisine: 'Mediterranean',
    });
  }
  if (/sushi|ramen|rice|tofu|miso/.test(names)) {
    patterns.push('East Asian meals');
    tips.push({
      title: 'East Asian balance tip',
      body: 'Include edamame, miso soup with seaweed, or an extra serving of fish/tofu — easy protein without heavy sauces.',
      cuisine: 'East Asian',
    });
  }

  const lowProtein = context.insights?.find((i) => i.nutrient === 'Protein' && i.type === 'low');
  if (lowProtein) {
    tips.unshift({
      title: 'Protein gap this week',
      body: 'Based on your meals, add one palm-sized protein portion at lunch — eggs, lentils, fish, or tofu fit most cuisines you logged.',
      cuisine: 'Personalised',
    });
  }

  if (!tips.length && context.items.length) {
    tips.push({
      title: 'Mix up your plate',
      body: `You often log ${context.items[0]?.name || 'similar foods'} — add a vegetable side and a protein source to round out nutrition.`,
      cuisine: 'General',
    });
  }

  return { weekKey: weekId(), tips, patterns, source: 'demo' };
}

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCache(data) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
}

function weekId() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

export function clearCuisineTipsCache() {
  localStorage.removeItem(CACHE_KEY);
}
