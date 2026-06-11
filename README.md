# CramForge v2 — with accounts & subscriptions

Unlimited AI-generated exam practice. Upload lecture notes and past papers, get exam-style questions with worked solutions, AI marking with partial credit, weak-topic tracking, timed exam mode — now with user accounts, a free daily limit, and Stripe-powered Pro subscriptions.

## Architecture

- **Frontend:** React (Vite) — any modern browser
- **Auth & user data:** Supabase (free tier) — email/password accounts, plan + daily usage stored in Postgres
- **Payments:** Stripe Checkout subscriptions + customer billing portal
- **AI:** serverless functions proxy the Anthropic API; every AI route requires a signed-in user and enforces free-tier limits (5 question sets / 25 markings / 2 material ingests per day; Pro = unlimited)

## Setup — about 30 minutes total

### 1. Anthropic (5 min)
console.anthropic.com → API Keys → create key. Add credit. Keep the key for step 5.

### 2. Supabase (10 min)
1. supabase.com → New project (free tier)
2. SQL Editor → paste the contents of `supabase-setup.sql` → Run
3. Authentication → Providers → Email: ON. (Optional for testing: turn OFF "Confirm email" so sign-ups work instantly.)
4. Project Settings → API: copy the **Project URL**, **anon public key**, and **service_role key**

### 3. Stripe (10 min)
1. stripe.com → create account
2. Products → Add product: "CramForge Pro", recurring, e.g. A$8.99/month → copy the **Price ID** (starts with `price_`)
3. Developers → API keys → copy the **Secret key**
4. Settings → Billing → Customer portal → activate it (default settings are fine)

### 4. GitHub
```bash
git init && git add . && git commit -m "CramForge v2"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cramforge.git
git push -u origin main
```

### 5. Vercel (5 min)
Add New → Project → import the repo (preset: Vite). Add these Environment Variables, then Deploy:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | from step 1 |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (server-side only) |
| `VITE_SUPABASE_URL` | same Project URL (exposed to browser — safe) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (exposed to browser — safe by design) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRICE_ID` | the price_… ID |
| `APP_URL` | your deployed URL, e.g. https://cramforge.vercel.app (add after first deploy, then redeploy) |

### 6. Test the money path
Use Stripe **test mode** keys first. Card `4242 4242 4242 4242`, any future expiry, any CVC. Sign up → hit the free limit or go to Account → Upgrade → pay with the test card → you should land back in the app as PRO. Then swap in live keys.

## How subscription status works
Checkout success redirects back with a session id which the server verifies with Stripe before upgrading the account. Pro status is re-verified with Stripe at most once per 24h, so cancellations downgrade within a day. (A webhook would make this instant — reasonable future hardening, not needed at launch.)

## Run locally
```bash
npm install
npx vercel dev
```
Create `.env.local` with all eight variables above (use http://localhost:3000 for APP_URL).

## Honest launch notes
- Free tier limits protect your Anthropic bill; watch the usage dashboard the first week anyway.
- Terms/refunds: even a simple terms page linked in the footer is worth adding before charging real money.
- Australian GST: once revenue is real, talk to an accountant about ABN + GST registration thresholds.
