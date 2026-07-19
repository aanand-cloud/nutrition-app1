/** Meal-log allowances — free tier is daily; paid tiers are monthly pools. */

export const MAX_TOPUP_CARRY = 200;
export const DAILY_SOFT_CAP = 40;
export const FREE_DAILY_SCANS = 1;

export const TOPUP_PACK = {
  id: 'topup100',
  scans: 100,
  priceStandard: 1.49,
  priceDiscount: 1.04,
  label: '+100 meal logs',
};

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: '1 meal log per day',
    dailyScans: FREE_DAILY_SCANS,
    monthlyScans: 0,
    priceStandard: 0,
    priceDiscount: 0,
  },
  daily10: {
    id: 'daily10',
    name: 'Standard',
    tagline: '300 meal logs / month',
    monthlyScans: 300,
    priceStandard: 2.99,
    priceDiscount: 1.99,
  },
  daily25: {
    id: 'daily25',
    name: 'Plus',
    tagline: '750 meal logs / month',
    monthlyScans: 750,
    priceStandard: 4.99,
    priceDiscount: 3.49,
  },
};

/** Legacy plan ids still used in Stripe / Supabase. */
export const LEGACY_PLAN_MAP = {
  pro: 'daily25',
};

export function getPlanConfig(planId) {
  const id = LEGACY_PLAN_MAP[planId] || planId;
  return PLANS[id] || PLANS.free;
}

export function monthlyScanAllowance(planId) {
  return getPlanConfig(planId).monthlyScans || 0;
}

export function freeDailyScanLimit() {
  return PLANS.free.dailyScans;
}

export function isPaidPlan(planId) {
  const id = LEGACY_PLAN_MAP[planId] || planId;
  return id === 'daily10' || id === 'daily25';
}

export function formatPlanPrice(planId, discounted = false) {
  const p = getPlanConfig(planId);
  if (!isPaidPlan(planId)) return 'Free';
  const amount = discounted ? p.priceDiscount : p.priceStandard;
  return `£${amount.toFixed(2)}/month`;
}

export function formatTopUpPrice(discounted = false) {
  const amount = discounted ? TOPUP_PACK.priceDiscount : TOPUP_PACK.priceStandard;
  return `£${amount.toFixed(2)}`;
}

export function monthResetLabel(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return next.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
