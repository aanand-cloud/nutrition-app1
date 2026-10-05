import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEmail, friendlyAuthError } from '../src/services/auth-helpers.js';

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Sarah@Example.com  '), 'sarah@example.com');
  assert.equal(normalizeEmail(''), '');
  assert.equal(normalizeEmail(null), '');
});

test('friendlyAuthError maps common login failures', () => {
  assert.match(friendlyAuthError('Invalid login credentials'), /Wrong email or password/);
  assert.match(friendlyAuthError('Email not confirmed'), /confirm your email/);
  assert.match(friendlyAuthError('User already registered'), /already registered/);
  assert.match(friendlyAuthError('Failed to fetch'), /internet connection/);
  assert.match(friendlyAuthError('Email rate limit exceeded'), /Too many attempts/);
  assert.equal(friendlyAuthError(''), 'Something went wrong');
});
