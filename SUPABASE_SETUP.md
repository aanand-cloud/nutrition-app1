# Supabase setup for NutriLog

I can't create a Supabase account for you (needs your login), but everything is prepared — **about 5 minutes** on your side.

## Quick setup

### 1. Create project
→ [supabase.com/dashboard/new](https://supabase.com/dashboard/new/new-project)

- **Name:** `nutrilog`
- **Region:** pick closest to customers (e.g. London for UK/EU)
- **Password:** save the database password somewhere safe

### 2. Run the database SQL
→ Dashboard → **SQL Editor** → **New query**

Copy **all** of `supabase/full-setup.sql`, paste, click **Run**.

This creates:
- `profiles` (name, goals, plan)
- `meals` (synced meal logs)
- `push_subscriptions`
- `meal-photos` storage bucket
- Security rules (users only see their own data)

### 3. Enable email login
→ **Authentication** → **Providers** → **Email** → Enable

For testing, you can disable **Confirm email** under Auth settings.

### 4. Add keys to `.env`

→ **Project Settings** → **API**

Copy into `nutrition-app/.env`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

(Service role key is under "service_role" — keep secret, server only.)

### 5. Verify

```bash
cd nutrition-app
npm run supabase:setup
```

Should print `✅ Supabase connection OK`

### 6. Restart app

```bash
npm run dev -- --host
```

On phone: **Goals** → Create account with first name + email.

---

## Files in this repo

| File | Purpose |
|------|---------|
| `supabase/full-setup.sql` | **Run this once** in SQL Editor |
| `scripts/setup-supabase.mjs` | Verifies your `.env` keys work |
| `supabase/migrations/` | For Supabase CLI if you use it later |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cloud sync not configured" | Add `VITE_SUPABASE_*` to `.env`, restart dev server |
| Sign up fails | Enable Email provider in Supabase Auth |
| Tables missing | Run `full-setup.sql` again |
| Photo upload fails | Re-run storage section of `full-setup.sql` |
