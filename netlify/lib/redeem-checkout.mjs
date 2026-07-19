/** Idempotent Stripe checkout redemption (prevents refresh/replay abuse). */

export async function redeemCheckoutSession(supabase, { sessionId, userId, type, scans = 0 }) {
  if (!supabase || !sessionId) {
    return { ok: false, error: 'Cannot verify redemption' };
  }

  const { error: insertError } = await supabase.from('checkout_redemptions').insert({
    session_id: sessionId,
    user_id: userId || null,
    redemption_type: type,
    scans_added: scans || null,
  });

  if (!insertError) {
    return { ok: true, fresh: true };
  }

  if (insertError.code === '23505') {
    return { ok: true, fresh: false, alreadyRedeemed: true };
  }

  return { ok: false, error: insertError.message };
}
