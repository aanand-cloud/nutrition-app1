# Production launch checklist

## 1. Real AI food scans (replace demo mode)

| Step | Action |
|------|--------|
| 1 | Create a [Gemini API key](https://aistudio.google.com/apikey) |
| 2 | Deploy `nutrition-app` to **Netlify** (separate site from VisaNova) |
| 3 | Netlify → **Site settings → Environment variables** → add `GEMINI_API_KEY` |
| 4 | Optional: `GEMINI_VISION_MODEL=gemini-2.0-flash` (default) |
| 5 | Run locally with AI: `npm run dev` (loads `.env` + dev API routes) |
| 6 | Test: Log tab → photo → should analyse real food (no "demo data" toast) |

**Cost guide:** `gemini-2.0-flash` is very low cost; free tier often covers early testing.

---

## 2. Customer login (Supabase)

| Step | Action |
|------|--------|
| 1 | Create project at [supabase.com](https://supabase.com) |
| 2 | Run `supabase/schema.sql` in SQL editor |
| 3 | If upgrading existing DB: also run `supabase/migration-display-name.sql` |
| 4 | **Authentication → Providers** → enable Email |
| 5 | **Storage** → create bucket `meal-photos` (private) |
| 6 | Add storage policy: authenticated users read/write `{user_id}/*` |
| 7 | Copy **Project URL** + **anon key** → Netlify env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| 8 | Copy **service role key** → Netlify env: `SUPABASE_SERVICE_ROLE_KEY` (server only) |

Customers sign up with **first name + email + password**. Name is used in greetings, reports, and push alerts.

---

## 3. Deploy to production

```bash
cd nutrition-app
npm run build
# Netlify: base dir = nutrition-app, build = npm run build, publish = dist
```

**Netlify env vars (minimum for launch):**
- `GEMINI_API_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL` (same as above)
- `SUPABASE_SERVICE_ROLE_KEY`
- `URL` (your live site, e.g. https://nutrilog.netlify.app)

---

## 4. Personalisation (built in)

Once logged in, customers see:
- **Header:** "Good afternoon, Sarah"
- **Reports:** "Hi Sarah, here's how you've been doing"
- **Insights:** "Sarah, protein target not reached this week…"
- **Push:** "Sarah: Protein 52% this week"
- **Cloud sync:** meals + goals backed up per account

---

## 5. Optional (Pro + push)

- Stripe keys for subscriptions
- VAPID keys for web push when app is closed (`npx web-push generate-vapid-keys`)

---

## Quick test after setup

1. Open live site on phone
2. Goals → Create account (first name + email)
3. Log → take food photo → real AI analysis
4. Reports → see name in greeting
5. Goals → Notification preview → see "Sarah: Protein…"
