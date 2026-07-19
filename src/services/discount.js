/**
 * Safe discount eligibility — no ID collection.
 * - Public sector: verified work email domain (or account email domain)
 * - 60+: self-declaration with consent checkbox
 * - Voucher: NUTRIPROMO (validated server-side, stored on profile / device)
 */

import { isVoucherRedeemedLocally } from './voucher.js';

const PUBLIC_SECTOR_SUFFIXES = [
  'nhs.net',
  'nhs.uk',
  'nhs.scot',
  'gov.uk',
  'police.uk',
  'mod.uk',
  'ac.uk', // universities / public colleges
];

export function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

export function emailDomain(email) {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  return at > 0 ? e.slice(at + 1) : '';
}

/** NHS, civil service, police, MOD, .gov.uk, etc. */
export function isPublicSectorEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return PUBLIC_SECTOR_SUFFIXES.some(
    (suffix) => domain === suffix || domain.endsWith(`.${suffix}`)
  );
}

export function getDiscountEligibility(profile = {}, accountEmail = '') {
  const senior = Boolean(profile.discount_senior);
  const workEmail = profile.discount_work_email || '';
  const publicFromAccount = isPublicSectorEmail(accountEmail);
  const publicFromWork = isPublicSectorEmail(workEmail);
  const publicSector = publicFromAccount || publicFromWork || Boolean(profile.discount_public_sector);
  const voucher = Boolean(profile.discount_voucher_redeemed) || isVoucherRedeemedLocally();

  const eligible = publicSector || senior || voucher;
  const reasons = [];
  if (publicSector) reasons.push('public_sector');
  if (senior) reasons.push('senior');
  if (voucher) reasons.push('voucher');

  let label = null;
  if (eligible) {
    if (voucher && !publicSector && !senior) label = 'Voucher code — 30% off';
    else if (publicSector && senior) label = 'NHS/public sector & 60+ discount';
    else if (publicSector) label = 'NHS/public sector discount';
    else if (senior) label = '60+ discount';
    else label = '30% discount';
  }

  return {
    eligible,
    publicSector,
    senior,
    voucher,
    reasons,
    label,
  };
}

export function validateWorkEmailForDiscount(email) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return { ok: false, error: 'Enter a valid work email' };
  if (!isPublicSectorEmail(e)) {
    return {
      ok: false,
      error: 'Use your NHS, .gov.uk, police, MOD or public-sector work email',
    };
  }
  return { ok: true, email: e };
}
