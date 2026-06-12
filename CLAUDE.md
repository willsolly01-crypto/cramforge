# CramForge — Claude Code Project Guide

CramForge is an AI-powered exam practice web app. Students upload lecture notes and get
unlimited practice questions with worked solutions, graded like a real exam. Think of it
as a personal exam marker that never sleeps.

## Stack at a glance

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite (SPA, full ESM, `"type": "module"`) |
| Backend | Vercel Serverless Functions (Node, ESM) in `api/` |
| Database | Supabase (Postgres + Row Level Security + Auth) |
| AI | Anthropic API — Haiku for generate/grade, Sonnet for ingest/explain |
| Payments | Stripe Subscriptions (webhook in `api/webhook.js`) |
| PDF | pdfkit (server-side, imported as CJS into ESM) |
| Styling | Vanilla CSS custom properties (`src/styles.css`) |
| Deployment | Vercel (auto-deploy from git) |

## Environment variables (Vercel + local .env)

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
STRIPE_SECRET_KEY=sk_live_... (or sk_test_...)
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...          (optional — welcome emails)
ADMIN_USER_IDS=uuid1,uuid2     (optional — question bank admin)
APP_URL=https://cramforge.app  (optional — absolute share URLs)
```

## Key file map

### API (Vercel Serverless — `api/`)
Each file exports a default `async function handler(req, res)`.

| File | Purpose |
|---|---|
| `_auth.js` | `requireUser()`, `checkAndCount()`, `sendErr()`, `httpErr()`, free limits, pro limits, username generation |
| `_claude.js` | `callClaude()`, `parseJson()`, `readBody()`, model constants (`MODEL_FAST` = Haiku, `MODEL_SMART` = Sonnet) |
| `generate.js` | POST — generate open-ended exam questions from notes |
| `grade.js` | POST — mark a student's written answer against the solution |
| `quick.js` | POST — generate 5 MCQ questions for Quick Study mode |
| `explain.js` | POST — deep concept explanation after wrong answer (Pro only) |
| `ingest.js` | POST — summarise uploaded PDF/text into structured notes |
| `me.js` | POST — return current user's plan, usage, profile, XP stats |
| `export-pdf.js` | POST — generate branded A4 exam PDF (pdfkit, Pro / 1 free demo) |
| `checkout.js` | POST — create Stripe checkout session |
| `webhook.js` | POST — Stripe webhook (activates Pro on payment) |
| `activate.js` | POST — re-check Stripe session after checkout redirect |
| `portal.js` | POST — Stripe billing portal |
| `share.js` | GET/POST — create and retrieve public shared question sets |
| `bank.js` | GET/POST — browse public question bank, admin feature-flag |
| `study-session.js` | GET/POST — save/load study sessions, streak, XP accumulation |
| `class.js` | POST (actions: create/join/leave/delete) + GET — tutor class codes |
| `profile.js` | GET/POST — public social profiles, leaderboard |
| `sync.js` | GET/POST — cross-device state sync |

### Frontend (`src/`)

| File | Purpose |
|---|---|
| `App.jsx` | Root component — routing, auth, sidebar, tab switching, install banner |
| `Auth.jsx` | Sign-in / sign-up screen |
| `Materials.jsx` | Upload + manage course materials (PDF, text, paste) |
| `Practice.jsx` | Open-ended practice questions with AI marking + Explain button |
| `Exam.jsx` | Timed exam mode — full paper, submit, results, PDF export |
| `QuickStudy.jsx` | Full-screen dark MCQ card mode (TikTok-style, XP, combos) |
| `Progress.jsx` | Accuracy charts and weak topic tracking |
| `Account.jsx` | Plan, billing, public profile, class manager |
| `StudyTimer.jsx` | Study timer with weekly leaderboard |
| `QuestionBank.jsx` | Browse/search public question bank |
| `ClassManager.jsx` | Create/join classes with 6-char codes |
| `SocialProfile.jsx` | Public profile page (accessed via `?profile=username`) |
| `SharedView.jsx` | Public shared question set (accessed via `?share=id`) |
| `MathText.jsx` | KaTeX math rendering wrapper |
| `api.js` | All fetch calls to the serverless API — single import point |
| `storage.js` | Local state management (units, topics, results, backups) |
| `supabase.js` | Supabase client (anon key, reads from `VITE_*` env vars) |
| `styles.css` | All styles — CSS custom properties, component styles, Quick Study dark mode |

### Database (Supabase)

Tables (with RLS):
- `profiles` — user plan, referral, username, XP, PDF demo flag, streak
- `usage` — daily gen/grade/ingest counters per user
- `shared_sets` — public question sets (featured, view_count, question_count)
- `study_sessions` — timer/quick sessions with duration, XP, accuracy
- `classes` — tutor classes with 6-char join codes
- `class_members` — student ↔ class membership

Views:
- `weekly_leaderboard` — top study-hours this week (public profiles only)

RPC functions:
- `increment_quick_stats(p_user_id, p_xp, p_correct, p_total)` — atomic XP update

### SQL migration files (run in this order)
1. `supabase-setup.sql` — base schema (profiles, usage)
2. `supabase-monthly-usage-migration.sql` — monthly usage caps for Pro
3. `supabase-referral-migration.sql` — referral_code, bonus_gen, referral_count
4. `supabase-user-data-migration.sql` — server-side state sync
5. `supabase-shared-sets-migration.sql` — shared_sets table
6. `supabase-social-migration.sql` — username, study_sessions, weekly_leaderboard view
7. `supabase-classes-migration.sql` — classes + class_members
8. `supabase-bank-migration.sql` — featured/view_count on shared_sets
9. `supabase-quick-study-migration.sql` — XP columns, increment_quick_stats RPC

## URL routing
The app is a SPA; routing happens via URL search params:

| Param | Behaviour |
|---|---|
| `?share=<id>` | Show public shared set (no auth) |
| `?profile=<username>` | Show public user profile (no auth) |
| `?quick=1` | Launch Quick Study overlay after login (PWA shortcut) |
| `?tab=study` | Open on Study Timer tab |
| `?ref=<code>` | Referral attribution (stored in localStorage) |
| `?session_id=<id>` | Post-Stripe-checkout activation |

## Billing logic
- Free tier: 5 gen / 25 grade / 2 ingest per day
- Pro: 200 gen / 1000 grade / 20 ingest per month (fair-use ceiling)
- `profiles.plan` = `"free"` | `"pro"`
- Stripe webhook sets plan to `"pro"`; portal cancellation sets back to `"free"`
- PDF export: Pro unlimited; free = 1 lifetime demo (`profiles.pdf_demo_used`)
- Explain: Pro only
- Question bank full access: Pro only (free gets 3 preview sets per session)

## PDF generation
`api/export-pdf.js` uses `pdfkit` (CJS, imported into ESM). Pattern:
```js
const doc = new PDFDocument({ bufferPages: true, ... });
// draw cover → draw question pages
// then: switchToPage() loop for footers, flushPages(), end()
// buffer chunks via doc.on("data", ...), resolve on doc.on("end", ...)
```
Design constants: INK=#1a2238, RED=#d7263d, YELLOW=#ffe45c. Built-in fonts only
(Times-Bold, Helvetica, Courier). No image embedding needed.

## AI model usage
- `MODEL_FAST` = `claude-haiku-4-5-20251001` — generate, grade, quick MCQ
- `MODEL_SMART` = `claude-sonnet-4-6` — ingest (processes long PDFs), explain

All prompts ask for JSON output. Use `parseJson()` from `_claude.js` to extract —
it strips markdown fences and finds the first `{` / `[`.

## PWA
- `public/manifest.json` — shortcuts to `?quick=1` and `?tab=study`
- `public/sw.js` — network-first for navigation, cache-first for assets, never caches `/api/`
- `public/icons/` — icon-192.png, icon-512.png, icon-maskable-512.png
- `index.html` — full meta tags including iOS apple-touch-icon, theme-color
- SW registered in `App.jsx` on `window load`
- Install banner on `beforeinstallprompt` event

## Quick Study (MCQ mode)
`src/QuickStudy.jsx` — full-screen dark overlay component.
- XP formula: BASE_XP=10, multiplied by combo (2× at 3 streak, 2.5× at 5+)
- `api/quick.js` generates 5 MCQ; rate-limited same as regular generate
- Results saved to `study_sessions` with `mode="quick"`; XP written atomically via `increment_quick_stats` RPC

## Social features
- Public profiles at `?profile=<username>` — stats, recent sessions, unit accuracy bars
- Weekly leaderboard (top 10 by study hours last 7 days)
- Share score via Web Share API (falls back to clipboard copy)

## Common patterns

### Rate limiting check
```js
const auth = await requireUser(req);
await checkAndCount(auth, "gen"); // "gen" | "grade" | "ingest"
```

### Throwing HTTP errors
```js
throw httpErr(402, "This is a Pro-only feature.");
// sendErr() in the catch block maps e.status → response status
```

### Supabase in API
```js
const { sb, user, profile } = await requireUser(req);
// sb is a per-request client scoped to the user's JWT
```

### Frontend event bus (upgrade modal)
```js
window.dispatchEvent(new CustomEvent("cramforge:limit", { detail: { message: "..." } }));
// App.jsx listens and shows the upgrade modal
```

## Dev commands
```bash
npm install          # install deps (includes pdfkit, stripe, react)
npm run dev          # Vite dev server at localhost:5173
npm run build        # production build → dist/
```
Note: Serverless API functions only run in production (Vercel) or via `vercel dev`.
For local API testing use `vercel dev` (requires Vercel CLI).

## Deployment
```bash
git add -A && git commit -m "feat: ..."
git push origin main  # Vercel auto-deploys on push
```
Or deploy directly: `vercel --prod`
