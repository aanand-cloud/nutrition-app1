# NutriLog — Photo Calorie Tracker

Photo-first calorie and nutrition tracking for a **worldwide, multi-cuisine** audience.

## Features

- **Photo logging** — snap a meal, AI estimates calories & macros (any cuisine)
- **Clarification questions** — quick taps when AI is unsure (oil, portions, cooking)
- **Daily dashboard** — calorie ring, macros vs goals
- **Reports** — 7-day / 30-day trends + “low protein / low fibre” suggestions
- **Push notifications** — personalised weekly alerts with real protein % / calorie stats + daily reminders
- **AI cuisine coach** — personalised tips based on what customers actually eat
- **Accounts** — Supabase sign-in + cloud meal backup
- **Pro subscription** — Stripe monthly plan (unlimited scans)
- **Android** — PWA install + Capacitor native camera

## Quick start

```bash
cd nutrition-app
npm install
cp .env.example .env   # add keys locally for dev
npm run dev
```

Without API keys, the app runs in **demo mode** (sample meal data, mock Pro).

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_SUPABASE_URL` | Client | Auth + cloud sync |
| `VITE_SUPABASE_ANON_KEY` | Client | Auth + cloud sync |
| `GEMINI_API_KEY` | Netlify | Food photo AI + cuisine coach |
| `GEMINI_VISION_MODEL` | Netlify | Optional — default `gemini-2.0-flash` |
| `STRIPE_SECRET_KEY` | Netlify | Pro checkout |
| `STRIPE_PRO_PRICE_ID` | Netlify | Monthly Pro price ID |
| `STRIPE_WEBHOOK_SECRET` | Netlify | Subscription lifecycle |
| `SUPABASE_URL` | Netlify | Webhook updates user plan |
| `SUPABASE_SERVICE_ROLE_KEY` | Netlify | Webhook updates user plan |

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL editor
3. Create Storage bucket **`meal-photos`** (private)
4. Add storage policies so users can read/write `{user_id}/*`
5. Copy project URL + anon key into `.env`

## Stripe setup

1. Create a **Product** → recurring **Price** (e.g. £4.99/month)
2. Copy Price ID → `STRIPE_PRO_PRICE_ID`
3. Deploy Netlify site, add env vars
4. Stripe Dashboard → Webhooks → `https://yoursite.netlify.app/api/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`

## Plans

| Free | Pro |
|------|-----|
| 3 AI scans / day | Unlimited scans |
| Local storage | Cloud backup |
| Basic reports | Full reports |

## Personalised push examples

| Scenario | Notification |
|----------|----------------|
| Low protein | **Protein 52% this week** — Protein at 52% of your 120g goal — averaging 62g/day. Off target 4/5 days. |
| On track | **On track this week** — Avg 1850 kcal (93%), protein 95g (95%), fibre 28g (93%). |
| Daily | **Today: 840 kcal (42%)** — Protein 28g (28% of 100g goal). 2 meals logged. |

**Try it:** Goals → Notifications → **Send test notification (preview)**

Server-side Monday push uses each user's logged meals + goals from Supabase when `user_id` is linked to their subscription.

```bash
npm run build
npx cap add android    # first time only
npm run cap:android    # build + sync + open Android Studio
```

Native camera uses `@capacitor/camera` automatically on device; web PWA uses file input.

## Deploy (Netlify)

- Base directory: `nutrition-app`
- Build: `npm run build`
- Publish: `dist`
- Functions: `netlify/functions`

## Project structure

```
nutrition-app/
  src/services/   auth, sync, subscription, camera, storage, ai-analysis, reports
  src/views/      today, log, reports
  netlify/functions/
    analyze-food.mjs
    create-subscription.mjs
    verify-subscription.mjs
    stripe-webhook.mjs
  supabase/schema.sql
```

Separate from the VisaNova passport photo app in the parent repo.
