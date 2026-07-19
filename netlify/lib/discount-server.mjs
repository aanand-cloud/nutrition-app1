import { validateVoucherCode } from './voucher.mjs';

const PUBLIC_SUFFIXES = [
  'nhs.net', 'nhs.uk', 'nhs.scot', 'gov.uk', 'police.uk', 'mod.uk', 'ac.uk',
];

function emailDomain(email) {
  const e = (email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  return at > 0 ? e.slice(at + 1) : '';
}

export function isPublicSectorEmail(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return PUBLIC_SUFFIXES.some((s) => domain === s || domain.endsWith(`.${s}`));
}

/** Server-side discount check — never trust client discount flag alone. */
export async function resolveDiscountEligible(supabase, { userId, email } = {}) {
  if (!supabase || !userId) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, discount_senior, discount_work_email, discount_public_sector, discount_voucher_redeemed')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return false;

  const accountEmail = profile.email || email || '';
  const publicSector =
    isPublicSectorEmail(accountEmail) ||
    isPublicSectorEmail(profile.discount_work_email) ||
    Boolean(profile.discount_public_sector);

  return Boolean(publicSector || profile.discount_senior || profile.discount_voucher_redeemed);
}

export { validateVoucherCode };
