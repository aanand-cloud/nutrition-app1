export function getVoucherConfig(env = process.env) {
  return {
    code: (env.VOUCHER_CODE || 'NUTRIPROMO').trim().toUpperCase(),
    expires: (env.VOUCHER_EXPIRES || '2027-07-16').trim(),
  };
}

export function validateVoucherCode(code, env = process.env) {
  const { code: expected, expires } = getVoucherConfig(env);
  const entered = (code || '').trim().toUpperCase();

  if (!entered) {
    return { ok: false, error: 'Enter your voucher code' };
  }
  if (entered !== expected) {
    return { ok: false, error: 'That code is not valid' };
  }

  const expiry = new Date(`${expires}T23:59:59`);
  if (Number.isNaN(expiry.getTime())) {
    return { ok: false, error: 'Voucher is not configured correctly' };
  }
  if (new Date() > expiry) {
    return { ok: false, error: 'This voucher has expired' };
  }

  return {
    ok: true,
    code: expected,
    validUntil: expires,
    label: '30% off voucher',
  };
}
