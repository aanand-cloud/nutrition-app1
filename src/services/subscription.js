import {
  DAILY_SOFT_CAP,
  MAX_TOPUP_CARRY,
  TOPUP_PACK,
  formatPlanPrice,
  formatTopUpPrice,
  getPlanConfig,
  freeDailyScanLimit,
  isPaidPlan,
  LEGACY_PLAN_MAP,
  monthResetLabel,
  monthlyScanAllowance,
  PLANS,
} from './plans.js';
import { getDiscountEligibility } from './discount.js';
import { getUser } from './auth.js';
import { getProfile } from './profile.js';

const PLAN_KEY = 'nutrilog_plan';
const USAGE_KEY = 'nutrilog_monthly_usage';
const TOPUP_KEY = 'nutrilog_topup_balance';
const DAILY_KEY = 'nutrilog_daily_usage';
const REDEEMED_KEY = 'nutrilog_redeemed_checkouts';

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getPlan() {
  const p = localStorage.getItem(PLAN_KEY) || 'free';
  const id = LEGACY_PLAN_MAP[p] || p;
  return PLANS[id] ? id : 'free';
}

export function setPlan(plan) {
  const id = LEGACY_PLAN_MAP[plan] || plan;
  localStorage.setItem(PLAN_KEY, PLANS[id] ? id : 'free');
}

export function isPro() {
  return isPaidPlan(getPlan());
}

export function getTopUpBalance() {
  return Math.min(MAX_TOPUP_CARRY, Number(localStorage.getItem(TOPUP_KEY)) || 0);
}

export function getScansUsedThisMonth() {
  const usage = readJson(USAGE_KEY, {});
  return usage[monthKey()] || 0;
}

export function getScansToday() {
  const daily = readJson(DAILY_KEY, {});
  return daily[todayKey()] || 0;
}

export function getScanBudget(planId = getPlan()) {
  const usedToday = getScansToday();

  if (!isPaidPlan(planId)) {
    const limit = freeDailyScanLimit();
    const remaining = Math.max(0, limit - usedToday);
    return {
      allowed: remaining > 0,
      remaining,
      limit,
      used: usedToday,
      allowance: limit,
      topUp: 0,
      topUpStored: 0,
      usedToday,
      dailyCapHit: false,
      reason: remaining <= 0 ? 'daily_limit' : null,
      resetsOn: 'midnight',
      isDaily: true,
    };
  }

  const allowance = monthlyScanAllowance(planId);
  const topUpStored = getTopUpBalance();
  const used = getScansUsedThisMonth();
  const usedFromTopUp = Math.max(0, used - allowance);
  const topUpRemaining = Math.max(0, topUpStored - usedFromTopUp);
  const total = allowance + topUpStored;
  const remaining = Math.max(0, total - used);
  const dailyCapHit = usedToday >= DAILY_SOFT_CAP;

  let allowed = remaining > 0 && !dailyCapHit;
  let reason = null;
  if (dailyCapHit) reason = 'daily_cap';
  else if (remaining <= 0) reason = 'monthly_limit';

  return {
    allowed,
    remaining,
    limit: total,
    used,
    allowance,
    topUp: topUpRemaining,
    topUpStored,
    usedToday,
    dailyCapHit,
    reason,
    resetsOn: monthResetLabel(),
    isDaily: false,
  };
}

export function canScan(planId = getPlan()) {
  return getScanBudget(planId);
}

export function recordScan() {
  const daily = readJson(DAILY_KEY, {});
  const dk = todayKey();
  daily[dk] = (daily[dk] || 0) + 1;
  writeJson(DAILY_KEY, daily);

  if (isPaidPlan(getPlan())) {
    const usage = readJson(USAGE_KEY, {});
    const mk = monthKey();
    usage[mk] = (usage[mk] || 0) + 1;
    writeJson(USAGE_KEY, usage);
  }
}

export function addTopUpCredits(amount = TOPUP_PACK.scans) {
  const next = Math.min(MAX_TOPUP_CARRY, getTopUpBalance() + amount);
  localStorage.setItem(TOPUP_KEY, String(next));
  return next;
}

export function syncTopUpFromCloud(balance) {
  if (balance == null) return;
  localStorage.setItem(TOPUP_KEY, String(Math.min(MAX_TOPUP_CARRY, Number(balance) || 0)));
}

/** Apply authoritative scan counts returned by the server after AI analysis. */
export function syncScanUsageFromServer(usage) {
  if (!usage?.ok && usage?.used == null) return;
  if (usage.plan) setPlan(usage.plan);

  if (usage.isDaily) {
    const daily = readJson(DAILY_KEY, {});
    daily[todayKey()] = usage.used ?? 0;
    writeJson(DAILY_KEY, daily);
    return;
  }

  const monthly = readJson(USAGE_KEY, {});
  monthly[monthKey()] = usage.used ?? 0;
  writeJson(USAGE_KEY, monthly);
  if (usage.topup != null) {
    localStorage.setItem(TOPUP_KEY, String(Math.min(MAX_TOPUP_CARRY, Number(usage.topup) || 0)));
  }
}

/** Mirror cloud profile scan counters into local UI state. */
export function syncScanStateFromProfile(profile) {
  if (!profile) return;
  if (profile.plan) setPlan(profile.plan === 'pro' ? 'daily25' : profile.plan);
  if (profile.topup_balance != null) syncTopUpFromCloud(profile.topup_balance);

  const used = Number(profile.scan_used) || 0;
  const period = profile.scan_month || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    const daily = readJson(DAILY_KEY, {});
    daily[period] = used;
    writeJson(DAILY_KEY, daily);
  } else if (/^\d{4}-\d{2}$/.test(period)) {
    const monthly = readJson(USAGE_KEY, {});
    monthly[period] = used;
    writeJson(USAGE_KEY, monthly);
  }
}

function readRedeemedSessions() {
  try {
    return new Set(JSON.parse(localStorage.getItem(REDEEMED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markSessionRedeemed(sessionId) {
  if (!sessionId) return;
  const set = readRedeemedSessions();
  set.add(sessionId);
  localStorage.setItem(REDEEMED_KEY, JSON.stringify([...set].slice(-50)));
}

function isSessionRedeemed(sessionId) {
  return sessionId && readRedeemedSessions().has(sessionId);
}

async function checkoutIdentity() {
  const user = await getUser();
  return { userId: user?.id || '', email: user?.email || '' };
}

export async function startPlanCheckout(planId, { email = '', userId = '', discount = false } = {}) {
  const identity = await checkoutIdentity();
  const res = await fetch('/api/create-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: window.location.origin,
      email: email || identity.email,
      userId: userId || identity.userId,
      plan: planId,
    }),
  });
  const data = await res.json();
  if (data.mock) {
    if (import.meta.env.PROD) throw new Error('Payments are not configured');
    setPlan(planId);
    return { mock: true, plan: planId };
  }
  if (!res.ok) throw new Error(data.error || 'Checkout failed');
  if (data.url) {
    window.location.href = data.url;
    return data;
  }
  throw new Error('No checkout URL returned');
}

export async function startTopUpCheckout({ email = '', discount = false } = {}) {
  const identity = await checkoutIdentity();
  const res = await fetch('/api/create-topup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: window.location.origin,
      email: email || identity.email,
      userId: identity.userId,
    }),
  });
  const data = await res.json();
  if (data.mock) {
    if (import.meta.env.PROD) throw new Error('Payments are not configured');
    const balance = addTopUpCredits(TOPUP_PACK.scans);
    return { mock: true, balance };
  }
  if (!res.ok) throw new Error(data.error || 'Checkout failed');
  if (data.url) {
    window.location.href = data.url;
    return data;
  }
  throw new Error('No checkout URL returned');
}

export async function openBillingPortal() {
  const identity = await checkoutIdentity();
  if (!identity.userId) {
    throw new Error('Sign in to manage your subscription');
  }

  const res = await fetch('/api/create-billing-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: window.location.origin,
      email: identity.email,
      userId: identity.userId,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not open billing portal');
  if (data.url) {
    window.location.href = data.url;
    return data;
  }
  throw new Error('No billing portal URL returned');
}

export async function verifyCheckoutSession(sessionId) {
  if (isSessionRedeemed(sessionId)) {
    return { ok: true, alreadyRedeemed: true, sessionId };
  }

  const res = await fetch(`/api/verify-subscription?session_id=${encodeURIComponent(sessionId)}`);
  const data = await res.json();
  if (data.mock && import.meta.env.PROD) {
    throw new Error('Payments are not configured');
  }
  if (!res.ok && !data.mock) throw new Error(data.error || 'Verification failed');

  if (data.ok && data.type === 'topup') {
    if (!data.alreadyRedeemed) {
      if (data.appliedToCloud) {
        const profile = await getProfile();
        syncTopUpFromCloud(profile.topup_balance);
      } else {
        addTopUpCredits(data.scans || TOPUP_PACK.scans);
      }
    }
    markSessionRedeemed(sessionId);
    return data;
  }

  if ((data.ok || data.mock) && data.plan && PLANS[data.plan]) {
    setPlan(data.plan);
    markSessionRedeemed(sessionId);
  } else if (data.mock && data.type === 'topup') {
    if (!data.alreadyRedeemed) addTopUpCredits(TOPUP_PACK.scans);
    markSessionRedeemed(sessionId);
  }

  return data;
}

export function planLabel(planId = getPlan()) {
  return getPlanConfig(planId).name;
}

export function scansLabel(planId = getPlan()) {
  const b = getScanBudget(planId);
  if (b.isDaily) {
    return `${b.used}/${b.limit} meal log today · ${b.remaining} left · resets midnight`;
  }
  const parts = [`${b.remaining} of ${b.limit} meal logs left`];
  if (b.topUp > 0) parts.push(`${b.topUp} bonus`);
  parts.push(`resets ${b.resetsOn}`);
  return parts.join(' · ');
}

export function usageMeterPercent(planId = getPlan()) {
  const b = getScanBudget(planId);
  if (!b.limit) return 0;
  return Math.min(100, Math.round((b.used / b.limit) * 100));
}

/** Bar fill matching “X left” label (remaining allowance). */
export function usageMeterRemainingPercent(planId = getPlan()) {
  const b = getScanBudget(planId);
  if (!b.limit) return 100;
  return Math.min(100, Math.round((b.remaining / b.limit) * 100));
}

export function paywallMessage(budget = getScanBudget()) {
  if (budget.reason === 'daily_limit') {
    return "You've used your free meal log for today. It resets at midnight (12am). Upgrade in Goals for a monthly allowance.";
  }
  if (budget.reason === 'daily_cap') {
    return `You've logged ${DAILY_SOFT_CAP} meals today — a fair daily limit. Try again tomorrow, or add a top-up pack in Goals.`;
  }
  return `You've used your meal logs for this month. Top up with +100 logs, upgrade your plan, or wait until ${budget.resetsOn}.`;
}

export function planPriceLabel(planId, profile, accountEmail) {
  const disc = getDiscountEligibility(profile, accountEmail);
  return formatPlanPrice(planId, disc.eligible);
}

export function topUpPriceLabel(profile, accountEmail) {
  const disc = getDiscountEligibility(profile, accountEmail);
  return formatTopUpPrice(disc.eligible);
}

export function resetScansForTesting() {
  const usage = readJson(USAGE_KEY, {});
  delete usage[monthKey()];
  writeJson(USAGE_KEY, usage);
  const daily = readJson(DAILY_KEY, {});
  delete daily[todayKey()];
  writeJson(DAILY_KEY, daily);
}

/** @deprecated */
export function resetScansToday() {
  resetScansForTesting();
}
