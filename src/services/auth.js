import { createClient } from '@supabase/supabase-js';
import { normalizeEmail } from './auth-helpers.js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const RECOVERY_KEY = 'nutrilog_password_recovery';
const RESET_HINT_KEY = 'nutrilog_reset_link';

let client = null;
const listeners = new Set();
let authIntent = 'signin';
let authActionPending = false;

/** Remember whether the in-flight auth action is sign-in or account creation. */
export function setAuthIntent(intent) {
  authIntent = intent === 'signup' ? 'signup' : 'signin';
  authActionPending = true;
}

/** Drop a pending auth action after a validation or request failure. */
export function cancelAuthIntent() {
  authIntent = 'signin';
  authActionPending = false;
}

/** Returns 'signin' or 'signup' only when the user just submitted the auth form. */
export function consumeAuthIntent() {
  if (!authActionPending) return null;
  const intent = authIntent;
  cancelAuthIntent();
  return intent;
}

function storageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function storageSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch (_) {}
}

function storageRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch (_) {}
}

/** Remember that the current visit came from a password-reset email. */
export function markPasswordRecovery() {
  storageSet(RECOVERY_KEY, '1');
  storageRemove(RESET_HINT_KEY);
}

export function isPasswordRecoveryPending() {
  return storageGet(RECOVERY_KEY) === '1';
}

export function hasResetLinkHint() {
  return storageGet(RESET_HINT_KEY) === '1';
}

export function clearResetLinkHint() {
  storageRemove(RESET_HINT_KEY);
}

export function clearPasswordRecovery() {
  storageRemove(RECOVERY_KEY);
  clearResetLinkHint();
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('reset')) return;
  url.searchParams.delete('reset');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

/**
 * Read the reset link before the Supabase client consumes the URL hash.
 * Call this once at startup, before getSupabase().
 */
export function capturePasswordRecoveryFromUrl() {
  if (typeof window === 'undefined') return isPasswordRecoveryPending();
  const url = new URL(window.location.href);
  if ((url.hash || '').includes('type=recovery')) markPasswordRecovery();
  if (url.searchParams.get('reset') === '1' && !isPasswordRecoveryPending()) {
    storageSet(RESET_HINT_KEY, '1');
  }
  if (url.searchParams.has('reset')) {
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }
  return isPasswordRecoveryPending();
}

export function isSupabaseConfigured() {
  return Boolean(url && anonKey);
}

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createClient(url, anonKey);
  return client;
}

export async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export function onAuthChange(cb) {
  listeners.add(cb);
  const sb = getSupabase();
  if (!sb) return () => listeners.delete(cb);
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') markPasswordRecovery();
    listeners.forEach((fn) => fn(session, event));
  });
  return () => {
    listeners.delete(cb);
    data.subscription.unsubscribe();
  };
}

export async function signUp(email, password, displayName = '') {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');
  const trimmedEmail = normalizeEmail(email);
  const trimmedPassword = String(password || '');
  if (!trimmedEmail || !trimmedPassword) throw new Error('Enter email and password');
  if (trimmedPassword.length < 6) throw new Error('Password must be at least 6 characters');

  const { data, error } = await sb.auth.signUp({
    email: trimmedEmail,
    password: trimmedPassword,
    options: {
      data: { display_name: String(displayName || '').trim() },
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');
  const trimmedEmail = normalizeEmail(email);
  const rawPassword = String(password || '');
  if (!trimmedEmail || !rawPassword) throw new Error('Enter email and password');
  const { data, error } = await sb.auth.signInWithPassword({
    email: trimmedEmail,
    password: rawPassword,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function resetPassword(email) {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');
  const trimmedEmail = normalizeEmail(email);
  if (!trimmedEmail) throw new Error('Enter your email address');
  const { error } = await sb.auth.resetPasswordForEmail(trimmedEmail, {
    redirectTo: `${window.location.origin}/?reset=1`,
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');
  const next = String(password || '');
  if (next.length < 6) throw new Error('Password must be at least 6 characters');
  const { data, error } = await sb.auth.updateUser({ password: next });
  if (error) throw error;
  clearPasswordRecovery();
  return data;
}
