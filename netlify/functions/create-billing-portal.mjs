import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { isDevEnvironment } from '../lib/is-dev.mjs';

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
      return json(
        {
          error:
            'Billing portal needs Stripe configured. In local dev, change plan via checkout mock or reset in browser storage.',
        },
        503
      );
    }
    return json({ error: 'Payments are not configured' }, 503);
  }

  try {
    const body = await req.json();
    const userId = body.userId || null;
    const email = body.email || undefined;
    const origin = body.origin || process.env.URL || 'http://localhost:5173';

    let customerId = null;

    if (userId && supabase) {
      const { data } = await supabase
        .from('profiles')
        .select('stripe_customer_id, email')
        .eq('id', userId)
        .maybeSingle();
      customerId = data?.stripe_customer_id || null;
      if (!email && data?.email) {
        body.email = data.email;
      }
    }

    if (!customerId && email) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      customerId = customers.data[0]?.id || null;
    }

    if (!customerId) {
      return json({ error: 'No subscription found for this account. Subscribe first, then manage billing here.' }, 404);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/?view=settings`,
    });

    return json({ url: session.url });
  } catch (err) {
    console.error('create-billing-portal error', err);
    return json({ error: err.message || 'Could not open billing portal' }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
