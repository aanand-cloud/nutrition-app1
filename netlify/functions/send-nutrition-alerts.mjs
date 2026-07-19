import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import {
  weekReportFromMeals,
  buildWeeklyPushMessage,
  mealRowToLocal,
  DEFAULT_GOALS,
} from './lib/weekly-insights.mjs';

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:nutrilog@example.com';

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
}

/** Weekly personalised push — Netlify scheduled (Mondays) or manual POST */
export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!supabase || !vapidPublic || !vapidPrivate) {
    return json({ ok: false, reason: 'Push not fully configured' });
  }

  const override = await req.json().catch(() => ({}));
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const startDate = weekStart.toISOString().slice(0, 10);

  const { data: subs, error } = await supabase.from('push_subscriptions').select('*');
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  const results = [];

  for (const sub of subs || []) {
    let msg = override.title
      ? { title: override.title, body: override.body, url: override.url || '/?view=reports' }
      : null;

    if (!msg && sub.user_id) {
      msg = await personalisedMessageForUser(sub.user_id, startDate);
    }

    if (!msg) {
      msg = {
        title: 'Your NutriLog weekly summary',
        body: 'Review your protein, fibre, and calorie progress — tap to open your report.',
        url: '/?view=reports',
      };
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(msg)
      );
      sent++;
      results.push({ endpoint: sub.endpoint.slice(0, 40), title: msg.title });
    } catch (err) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }

  return json({ ok: true, sent, failed, total: (subs || []).length, samples: results.slice(0, 5) });
};

async function personalisedMessageForUser(userId, startDate) {
  const [{ data: meals }, { data: profile }] = await Promise.all([
    supabase
      .from('meals')
      .select('date, meal_summary, total_calories_kcal, total_nutrition, items')
      .eq('user_id', userId)
      .gte('date', startDate)
      .order('date', { ascending: true }),
    supabase.from('profiles').select('goals, display_name').eq('id', userId).maybeSingle(),
  ]);

  const goals = profile?.goals || DEFAULT_GOALS;
  const displayName = profile?.display_name || '';
  const localMeals = (meals || []).map(mealRowToLocal);
  const report = weekReportFromMeals(localMeals, goals);
  return buildWeeklyPushMessage(report, displayName);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  schedule: '0 9 * * 1',
};
