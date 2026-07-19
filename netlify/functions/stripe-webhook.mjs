import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { redeemCheckoutSession } from '../lib/redeem-checkout.mjs';
import { applyTopUpToProfile } from '../lib/scan-enforcement.mjs';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
  : null;

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!stripe) {
    return new Response('Stripe not configured', { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return new Response('Webhook not configured', { status: 503 });
  }

  let event;
  try {
    const raw = await req.text();
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error('Webhook signature error', err.message);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.metadata?.product !== 'nutrilog' || !supabase) {
        return ok();
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
        if (redemption.ok && redemption.fresh && userId) {
          await applyTopUpToProfile(supabase, userId, scans);
        }
        return ok();
      }

      const plan = session.metadata?.plan;
      if (plan === 'daily10' || plan === 'daily25') {
        await redeemCheckoutSession(supabase, {
          sessionId: session.id,
          userId,
          type: 'subscription',
          scans: 0,
        });
        const patch = { plan, stripe_customer_id: String(session.customer || '') };
        if (userId) {
          await supabase.from('profiles').update(patch).eq('id', userId);
        } else if (session.customer_email) {
          await supabase.from('profiles').update(patch).eq('email', session.customer_email);
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      if (supabase && sub.customer) {
        await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('stripe_customer_id', String(sub.customer));
      }
    }
  } catch (err) {
    console.error('Webhook handler error', err);
    return new Response('Handler failed', { status: 500 });
  }

  return ok();
};

function ok() {
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
