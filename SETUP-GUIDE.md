# CramForge — Complete Setup Guide
Everything you need to do, in order, before the app is live.

---

## Before you start — what you'll need
- [ ] Node.js installed (check: `node -v` in terminal — needs v18+)
- [ ] Git installed
- [ ] A Vercel account (vercel.com — free)
- [ ] A Supabase project already created (supabase.com — free tier)
- [ ] A Stripe account (stripe.com — free to set up, takes % on transactions)
- [ ] An Anthropic API key (console.anthropic.com — pay-as-you-go)
- [ ] Optional: Resend account for welcome emails (resend.com — free tier)

---

## STEP 1 — Install dependencies

Open your terminal and navigate to the project folder:
```bash
cd Downloads/cramforge-v2/cramforge
```

Then install everything:
```bash
npm install
```

This installs React, pdfkit, Stripe, Supabase, and Vite. It will take about 30 seconds.
When it finishes you should see a `node_modules/` folder appear.

✅ Test it worked: `npm run dev` — the app should open at http://localhost:5173

---

## STEP 2 — Create a `.env` file for local development

In the `cramforge` folder, create a file called `.env` (no extension) and add:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
ANTHROPIC_API_KEY=sk-ant-...your-key...
SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
SUPABASE_ANON_KEY=eyJ...your-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key...
STRIPE_SECRET_KEY=sk_test_...your-test-key...
STRIPE_PRICE_ID=price_...your-price-id...
STRIPE_WEBHOOK_SECRET=whsec_... (fill in after Step 5)
```

Where to find these values:
- **Supabase URL + keys**: Supabase dashboard → Project Settings → API
- **Anthropic key**: console.anthropic.com → API Keys
- **Stripe keys**: dashboard.stripe.com → Developers → API Keys

---

## STEP 3 — Run Supabase SQL migrations

Go to your Supabase dashboard → **SQL Editor** → click **New query**.

Run these files **in order** (copy the content of each file, paste it in the SQL editor, click Run):

1. `supabase-setup.sql`
2. `supabase-monthly-usage-migration.sql`
3. `supabase-referral-migration.sql`
4. `supabase-user-data-migration.sql`
5. `supabase-shared-sets-migration.sql`
6. `supabase-social-migration.sql`
7. `supabase-classes-migration.sql`
8. `supabase-bank-migration.sql`
9. `supabase-quick-study-migration.sql`

Each query should complete with no errors (green tick). If you see a "column already exists" warning, that's fine — the migrations are written to be safe to re-run.

✅ Check it worked: Supabase → Table Editor — you should see tables including `profiles`, `usage`, `shared_sets`, `study_sessions`, `classes`.

---

## STEP 4 — Set up Stripe

### Create a product
1. Go to Stripe dashboard → **Products** → **Add product**
2. Name: "CramForge Pro"
3. Pricing: $8.99/month, recurring, monthly
4. Save and copy the **Price ID** (looks like `price_1ABC...`) — add to `.env` as `STRIPE_PRICE_ID`

### Set up a webhook (for local testing)
1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Run: `stripe listen --forward-to localhost:5173/api/webhook`
3. Copy the webhook signing secret it shows → add to `.env` as `STRIPE_WEBHOOK_SECRET`

### For production webhook (do this after Vercel deploy in Step 5):
1. Stripe dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. URL: `https://your-vercel-domain.vercel.app/api/webhook`
3. Events to listen for: `checkout.session.completed`, `customer.subscription.deleted`
4. Copy the signing secret → add to Vercel env vars

---

## STEP 5 — Deploy to Vercel

### Option A: GitHub (recommended — auto-deploys on every push)
1. Push your code to GitHub: `git add -A && git commit -m "initial" && git push`
2. Go to vercel.com → **New Project** → import your GitHub repo
3. Framework: **Vite** (Vercel usually auto-detects this)
4. Click **Deploy** — first deploy takes ~2 minutes

### Option B: Vercel CLI
```bash
npm install -g vercel
vercel --prod
```

### Add environment variables on Vercel
After deploy, go to Vercel dashboard → your project → **Settings** → **Environment Variables**.

Add all of these (same as your `.env` file but WITHOUT the `VITE_` prefix for server-side vars):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | your Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `SUPABASE_URL` | your Supabase URL |
| `SUPABASE_ANON_KEY` | your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service role key |
| `STRIPE_SECRET_KEY` | your live Stripe key (or test) |
| `STRIPE_PRICE_ID` | your Pro price ID |
| `STRIPE_WEBHOOK_SECRET` | your production webhook secret |

Click **Redeploy** after adding env vars.

✅ Test it worked: visit your Vercel URL, sign up for an account, upload a note, generate a question.

---

## STEP 6 — Test core features

Work through this checklist to confirm everything is working:

- [ ] Sign up creates an account (check Supabase → Auth → Users)
- [ ] Add a unit → upload a PDF → ingest completes
- [ ] Generate questions → questions appear
- [ ] Mark an answer → feedback shows
- [ ] Quick Study → 5 MCQ questions load
- [ ] Stripe checkout → Pro upgrade completes (use test card `4242 4242 4242 4242`)
- [ ] PDF export → downloads a branded exam PDF
- [ ] Study timer → session saves, streak shows

---

## STEP 7 — Install as app on your phone

### iOS (iPhone/iPad):
1. Open Safari → go to your Vercel URL
2. Tap the **Share** icon (box with arrow) at the bottom
3. Scroll down → tap **"Add to Home Screen"**
4. Name it "CramForge" → tap **Add**
5. Long-press the icon on your home screen → you'll see Quick Study and Study Timer shortcuts

### Android:
1. Open Chrome → go to your Vercel URL
2. The install banner should appear at the bottom automatically
3. Tap **Install**
4. Or: tap the three-dot menu → "Add to Home Screen"

---

## STEP 8 — Optional extras

### Custom domain
Vercel dashboard → your project → **Domains** → add `cramforge.app` (or whatever you have)

### Welcome emails
1. Create a free Resend account at resend.com
2. Verify your sending domain
3. Add `RESEND_API_KEY=re_...` to Vercel env vars

### Admin question bank
To mark question sets as "featured" in the public bank:
1. Get your Supabase user UUID (Auth → Users → click your account)
2. Add to Vercel: `ADMIN_USER_IDS=your-uuid-here`

### Absolute profile share URLs
Add `APP_URL=https://cramforge.app` to Vercel env vars (makes share links use your domain)

---

## Quick reference — useful commands

```bash
npm run dev              # local dev server
npm run build            # production build
vercel dev               # local dev with serverless API functions
vercel --prod            # manual deploy to production
stripe listen --forward-to localhost:5173/api/webhook   # local Stripe webhooks
```

---

## Troubleshooting

**"npm install" fails** — make sure Node.js v18+ is installed. Check: `node -v`

**SQL migrations error** — run them one at a time. If a column/table already exists, that's fine, keep going.

**API returns 500 errors** — check Vercel function logs: Vercel dashboard → project → **Deployments** → click a deployment → **Functions** tab

**Stripe webhook not firing** — make sure the webhook URL is the production URL, not localhost

**PDF export fails locally** — PDF generation only works on Vercel (pdfkit needs the Node.js environment). Test in production.

**Questions not generating** — check your `ANTHROPIC_API_KEY` is set correctly in Vercel env vars and has credits
