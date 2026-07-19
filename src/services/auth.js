import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let client = null;
const listeners = new Set();

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
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    listeners.forEach((fn) => fn(session));
  });
  return () => {
    listeners.delete(cb);
    data.subscription.unsubscribe();
  };
}

export async function signUp(email, password, displayName = '') {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');
  const trimmedEmail = String(email || '').trim();
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
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
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
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset=1`,
  });
  if (error) throw error;
}
