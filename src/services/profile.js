import { getSupabase, getUser } from './auth.js';
import { isPublicSectorEmail } from './discount.js';
import { markVoucherRedeemedLocally } from './voucher.js';

const LOCAL_NAME_KEY = 'nutrilog_display_name';

export function getLocalDisplayName() {
  return localStorage.getItem(LOCAL_NAME_KEY) || '';
}

export function saveLocalDisplayName(name) {
  if (name) localStorage.setItem(LOCAL_NAME_KEY, name.trim());
}

export async function getProfile() {
  const user = await getUser();
  if (!user) {
    return {
      loggedIn: false,
      displayName: getLocalDisplayName(),
      email: null,
    };
  }

  const sb = getSupabase();
  if (!sb) {
    return {
      loggedIn: true,
      displayName: getLocalDisplayName() || firstNameFromEmail(user.email),
      email: user.email,
    };
  }

  const coreSelect = 'display_name, plan, goals, unit_prefs, topup_balance, scan_month, scan_used';
  const fullSelect = `${coreSelect}, discount_senior, discount_work_email, discount_public_sector, discount_voucher_redeemed`;

  let { data, error } = await sb
    .from('profiles')
    .select(fullSelect)
    .eq('id', user.id)
    .maybeSingle();

  // Older Supabase projects may be missing discount columns — fall back gracefully.
  if (error?.code === '42703') {
    ({ data, error } = await sb
      .from('profiles')
      .select(coreSelect)
      .eq('id', user.id)
      .maybeSingle());
  }

  if (error) throw error;

  const displayName =
    data?.display_name ||
    user.user_metadata?.display_name ||
    getLocalDisplayName() ||
    firstNameFromEmail(user.email);

  saveLocalDisplayName(displayName);

  return {
    loggedIn: true,
    displayName,
    email: user.email,
    plan: data?.plan === 'pro' ? 'daily25' : data?.plan,
    goals: data?.goals,
    unit_prefs: data?.unit_prefs,
    discount_senior: data?.discount_senior,
    discount_work_email: data?.discount_work_email,
    discount_public_sector: data?.discount_public_sector || isPublicSectorEmail(user.email),
    discount_voucher_redeemed: Boolean(data?.discount_voucher_redeemed),
    topup_balance: data?.topup_balance ?? 0,
    scan_month: data?.scan_month ?? null,
    scan_used: data?.scan_used ?? 0,
  };
}

export async function saveDisplayName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Please enter your name');

  saveLocalDisplayName(trimmed);

  const user = await getUser();
  const sb = getSupabase();
  if (user && sb) {
    const { error } = await sb
      .from('profiles')
      .update({ display_name: trimmed, updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (error) throw error;
  }

  return trimmed;
}

export async function saveDiscountPrefs({ senior, workEmail }) {
  const user = await getUser();
  const sb = getSupabase();
  if (!user || !sb) throw new Error('Sign in to save discount preferences');

  const patch = {
    discount_senior: Boolean(senior),
    updated_at: new Date().toISOString(),
  };
  if (workEmail !== undefined) {
    patch.discount_work_email = workEmail || null;
    patch.discount_public_sector = isPublicSectorEmail(workEmail) || isPublicSectorEmail(user.email);
  }

  const { error } = await sb.from('profiles').update(patch).eq('id', user.id);
  if (error) throw error;
  return patch;
}

export async function saveVoucherRedemption() {
  markVoucherRedeemedLocally();

  const user = await getUser();
  const sb = getSupabase();
  if (!user || !sb) return { savedToCloud: false };

  const { error } = await sb
    .from('profiles')
    .update({
      discount_voucher_redeemed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (error) throw error;
  return { savedToCloud: true };
}

export function getGreeting(displayName) {
  const h = new Date().getHours();
  const period = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return displayName ? `${period}, ${displayName}` : period;
}

function firstNameFromEmail(email) {
  if (!email) return '';
  const local = email.split('@')[0] || '';
  const part = local.split(/[._-]/)[0] || local;
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}
