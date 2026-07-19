const VOUCHER_KEY = 'nutrilog_voucher_redeemed';

export function isVoucherRedeemedLocally() {
  return localStorage.getItem(VOUCHER_KEY) === '1';
}

export function markVoucherRedeemedLocally() {
  localStorage.setItem(VOUCHER_KEY, '1');
}

export async function validateAndRedeemVoucher(code) {
  const res = await fetch('/api/validate-voucher', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Invalid voucher code');
  }
  markVoucherRedeemedLocally();
  return data;
}
