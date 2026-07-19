import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { isDevEnvironment } from '../lib/is-dev.mjs';
import { resolveDiscountEligible } from '../lib/discount-server.mjs';

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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!stripe) {
    if (isDevEnvironment()) {
      return json({ mock: true, type: 'topup', scans: 100 }, 200);
    }
    return json({ error: 'Payments are not configured' }, 503);
  }

  try {
    const body = await req.json();
    const userId = body.userId || null;
    const email = body.email || undefined;

    let useDiscount = false;
    if (userId && supabase) {
      useDiscount = await resolveDiscountEligible(supabase, { userId, email });
    }

    const envKey = useDiscount ? 'STRIPE_TOPUP_DISCOUNT_PRICE_ID' : 'STRIPE_TOPUP_PRICE_ID';
    const priceId = process.env[envKey];

    if (!priceId) {
      if (isDevEnvironment()) {
        return json({ mock: true, type: 'topup', scans: 100 }, 200);
      }
      return json({ error: `${envKey} not set in Netlify env` }, 503);
    }

    const origin = body.origin || process.env.URL || 'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: userId || undefined,
      success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancelled`,
      metadata: {
        product: 'nutrilog',
        type: 'topup',
        scans: '100',
        discount: useDiscount ? 'yes' : 'no',
      },
    });

    return json({ url: session.url, sessionId: session.id, discountApplied: useDiscount });
  } catch (err) {
    console.error('create-topup error', err);
    return json({ error: err.message || 'Checkout failed' }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
