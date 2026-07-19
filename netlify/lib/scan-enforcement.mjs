const PLAN_MONTHLY = { daily10: 300, daily25: 750, pro: 750 };

const FREE_DAILY = 1;



function monthKey(date = new Date()) {

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

}



function dayKey(date = new Date()) {

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

}



function normalizePlan(plan) {

  if (plan === 'pro') return 'daily25';

  if (plan === 'daily10' || plan === 'daily25') return plan;

  return 'free';

}



/** Validate clarification refinement payload (blocks fake context bypass). */

export function isValidRefinementContext(context) {

  if (!context || typeof context !== 'object') return false;

  const prev = context.previous;

  if (!prev || typeof prev !== 'object') return false;

  if (typeof prev.meal_summary !== 'string' || !prev.meal_summary.trim()) return false;

  if (!Array.isArray(prev.items) || prev.items.length === 0) return false;

  if (!Array.isArray(context.answers)) return false;

  return true;

}



/** Read-only check before calling AI (fail fast, save Gemini cost). */

export async function checkScanAllowed(supabase, userId) {

  if (!supabase || !userId) {

    return { ok: false, error: 'Sign in required to log meals with AI' };

  }



  const { data: profile, error } = await supabase

    .from('profiles')

    .select('plan, scan_month, scan_used, topup_balance')

    .eq('id', userId)

    .maybeSingle();



  if (error) return { ok: false, error: 'Could not verify scan allowance' };

  if (!profile) return { ok: false, error: 'Account profile not found' };



  const plan = normalizePlan(profile.plan);

  const mk = monthKey();

  const dk = dayKey();



  if (plan === 'free') {

    const usedToday = profile.scan_month === dk ? profile.scan_used || 0 : 0;

    if (usedToday >= FREE_DAILY) {

      return { ok: false, error: 'Daily meal log limit reached. Resets at midnight.' };

    }

    return { ok: true, plan, scan_month: dk, scan_used: usedToday, remaining: FREE_DAILY - usedToday, limit: FREE_DAILY };

  }



  const allowance = PLAN_MONTHLY[plan] || 0;

  const topup = profile.topup_balance || 0;

  const used = profile.scan_month === mk ? profile.scan_used || 0 : 0;

  const limit = allowance + topup;

  if (used >= limit) {

    return { ok: false, error: 'Monthly meal log limit reached.' };

  }

  return { ok: true, plan, scan_month: mk, scan_used: used, remaining: limit - used, limit };

}



/** Atomic consume after successful AI — uses DB RPC with row lock. */

export async function consumeMealScan(supabase, userId) {

  if (!supabase || !userId) {

    return { ok: false, error: 'Sign in required' };

  }



  const { data, error } = await supabase.rpc('consume_meal_scan', {
    p_user_id: userId,
    p_local_day: localDayKey,
  });

  if (error) {

    console.error('consume_meal_scan RPC error', error);

    return { ok: false, error: 'Could not record scan usage' };

  }

  if (!data?.ok) {

    return { ok: false, error: data?.error || 'Scan limit reached' };

  }

  return { ok: true, usage: data };

}



/** @deprecated use consumeMealScan */

export async function recordScanUsage(supabase, userId, checkResult) {

  return consumeMealScan(supabase, userId);

}



/** @deprecated use checkScanAllowed + consumeMealScan */

export async function assertScanAllowed(supabase, userId) {

  const check = await checkScanAllowed(supabase, userId);

  if (!check.ok) return check;

  return consumeMealScan(supabase, userId);

}



export async function applyTopUpToProfile(supabase, userId, scans = 100) {

  if (!supabase || !userId) return { ok: false };

  const { data: profile } = await supabase

    .from('profiles')

    .select('topup_balance')

    .eq('id', userId)

    .maybeSingle();

  const next = Math.min(200, (profile?.topup_balance || 0) + scans);

  await supabase

    .from('profiles')

    .update({ topup_balance: next, updated_at: new Date().toISOString() })

    .eq('id', userId);

  return { ok: true, balance: next };

}



export async function getProfileScanState(supabase, userId) {

  if (!supabase || !userId) return null;

  const { data } = await supabase

    .from('profiles')

    .select('plan, scan_month, scan_used, topup_balance')

    .eq('id', userId)

    .maybeSingle();

  return data;

}


