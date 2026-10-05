/** Trim and lowercase an email so sign-in matches the stored account. */
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Turn Supabase auth errors into short messages suitable for the sign-in form.
 * @param {string} message
 * @param {{ dev?: boolean }} [options]
 */
export function friendlyAuthError(message = '', { dev = false } = {}) {
  const msg = String(message || '');
  if (/fetch|Failed to fetch|NetworkError/i.test(msg)) {
    return 'Cannot reach the server — check your internet connection and try again';
  }
  if (/rate limit|too many requests|only request this after/i.test(msg)) {
    return 'Too many attempts — wait a moment and try again';
  }
  if (/unable to validate email|invalid email|email address.*invalid/i.test(msg)) {
    return 'Enter a valid email address';
  }
  if (/password should be at least|at least 6 characters/i.test(msg)) {
    return 'Password must be at least 6 characters';
  }
  if (/Email not confirmed/i.test(msg)) {
    return 'Please confirm your email first — check your inbox, then sign in';
  }
  if (/User already registered|already been registered|already registered/i.test(msg)) {
    return 'That email is already registered — switch to Sign in';
  }
  if (/Invalid login credentials/i.test(msg)) {
    return 'Wrong email or password — double-check and try again';
  }
  if (/42703|discount_senior|schema cache/i.test(msg)) {
    return dev
      ? 'Database needs an update — run supabase/migration-fix-missing-columns.sql in Supabase SQL Editor'
      : 'Account setup incomplete — please try again in a few minutes';
  }
  return msg || 'Something went wrong';
}

export function authErrorText(err) {
  if (!err) return 'Something went wrong';
  if (typeof err === 'string') return err;
  return err.message || err.error_description || 'Something went wrong';
}
