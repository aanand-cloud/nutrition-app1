import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { isDevEnvironment } from '../lib/is-dev.mjs';
import { redeemCheckoutSession } from '../lib/redeem-checkout.mjs';
import { applyTopUpToProfile } from '../lib/scan-enforcement.mjs';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    return json({ error: 'session_id required' }, 400);
  }

  if (!stripe) {
    if (isDevEnvironment()) {
      return json({ mock: true, ok: true, type: 'topup', scans: 100, sessionId }, 200);
    }
    return json({ error: 'Payments are not configured' }, 503);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    const paid =
      session.payment_status === 'paid' ||
      session.status === 'complete' ||
      session.subscription?.status === 'active' ||
      session.subscription?.status === 'trialing';

    if (!paid) {
      return json({ ok: false, status: session.payment_status }, 402);
    }

    const userId = session.client_reference_id || null;
    const metaType = session.metadata?.type;

    if (metaType === 'topup') {
      const scans = Number(session.metadata?.scans) || 100;
      const redemption = await redeemCheckoutSession(supabase, {
        sessionId: session.id,
        userId,
        type: 'topup',
        scans,
      });

      if (!redemption.ok) {
        return json({ error: redemption.error || 'Could not redeem purchase' }, 500);
      }

      if (redemption.fresh && userId && supabase) {
        await applyTopUpToProfile(supabase, userId, scans);
      }

      return json({
        ok: true,
        type: 'topup',
        scans,
        sessionId: session.id,
        alreadyRedeemed: Boolean(redemption.alreadyRedeemed),
        appliedToCloud: Boolean(redemption.fresh && userId && supabase),
      });
    }

    await redeemCheckoutSession(supabase, {
      sessionId: session.id,
      userId,
      type: 'subscription',
      scans: 0,
    });

    const plan = ['daily10', 'daily25'].includes(session.metadata?.plan)
      ? session.metadata.plan
      : 'free';

    if (userId && supabase && plan !== 'free') {
      await supabase
        .from('profiles')
        .update({
          plan,
          stripe_customer_id: String(session.customer || ''),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
    }

    return json({
      ok: true,
      type: 'subscription',
      sessionId: session.id,
      plan,
      customerId: session.customer,
      subscriptionId: session.subscription?.id || session.subscription,
    });
  } catch (err) {
    console.error('verify-subscription error', err);
    return json({ error: err.message || 'Verification failed' }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
