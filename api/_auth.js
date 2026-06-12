// Shared auth + usage metering for serverless functions.
// Verifies the user's Supabase session token, loads their profile,
// lazily re-checks Stripe subscription status, and enforces free-tier limits.

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

// Free base limits + any bonus_gen earned through referrals
export const FREE_LIMITS = { gen: 5, grade: 25, ingest: 2 };

// Generate a short random referral code
function genReferralCode() {
  return Math.random().toString(36).slice(2, 10); // 8 random alphanumeric chars
}

// Auto-generate a username from email (e.g. "will.smith@uni.edu" → "willsmith")
// with a 3-digit suffix if the base is already taken.
async function genUsername(sb, email) {
  const base = (email || "")
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 18) || "user";

  // Try base first, then base+NNN
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = attempt === 0
      ? base
      : base + String(Math.floor(Math.random() * 900 + 100));
    const { data } = await sb
      .from("profiles")
      .select("id")
      .eq("username", candidate)
      .maybeSingle();
    if (!data) return candidate; // available
  }
  // Fallback: base + timestamp suffix (guaranteed unique)
  return base + Date.now().toString(36).slice(-4);
}

// Fire-and-forget welcome email via Resend.
// Set RESEND_API_KEY in Vercel env vars. From address must match a verified Resend domain.
async function sendWelcomeEmail(email) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // silently skip if not configured
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "CramForge <noreply@cramforge.app>",
        to: email,
        subject: "You're in — here's how to get started",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fbfbf8;font-family:system-ui,sans-serif;color:#1a2238">
  <div style="max-width:560px;margin:40px auto;padding:0 20px 40px">
    <h1 style="font-size:28px;font-weight:700;margin:0 0 4px">
      Cram<span style="color:#d7263d">Forge</span>
    </h1>
    <p style="font-family:monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8b90a0;margin:0 0 32px">
      Unlimited exam practice
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 24px">
      Your account is ready. Here's how to get your first practice questions in under 2 minutes:
    </p>

    <div style="background:#fff;border:1.5px solid #1a2238;border-radius:6px;padding:20px 22px;margin-bottom:16px">
      <p style="font-family:monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8b90a0;margin:0 0 8px">Step 1</p>
      <p style="font-size:15px;font-weight:600;margin:0 0 4px">Add a unit</p>
      <p style="font-size:14px;color:#4a5168;margin:0;line-height:1.5">Click "+ New unit" in the sidebar and name it after your subject (e.g. MATH1051).</p>
    </div>

    <div style="background:#fff;border:1.5px solid #1a2238;border-radius:6px;padding:20px 22px;margin-bottom:16px">
      <p style="font-family:monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8b90a0;margin:0 0 8px">Step 2</p>
      <p style="font-size:15px;font-weight:600;margin:0 0 4px">Upload your notes</p>
      <p style="font-size:14px;color:#4a5168;margin:0;line-height:1.5">Go to Materials and upload lecture slides, summary notes, or past papers as a PDF — or paste text directly.</p>
    </div>

    <div style="background:#fff;border:1.5px solid #1a2238;border-radius:6px;padding:20px 22px;margin-bottom:32px">
      <p style="font-family:monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8b90a0;margin:0 0 8px">Step 3</p>
      <p style="font-size:15px;font-weight:600;margin:0 0 4px">Generate questions</p>
      <p style="font-size:14px;color:#4a5168;margin:0;line-height:1.5">Go to Practice, pick a difficulty, and generate. Type your working and get it marked like a real exam.</p>
    </div>

    <p style="font-size:13px;color:#8b90a0;text-align:center;margin:0">
      You get 5 question sets a day on the free plan.<br>
      Reply to this email if you have any questions.
    </p>
  </div>
</body>
</html>`,
      }),
    });
  } catch (e) {
    // Don't let email failures block the request
    console.error("Welcome email failed:", e.message);
  }
}

// Monthly caps for Pro users — "unlimited" with a fair-use ceiling.
// Worst-case cost at these limits (Haiku pricing):
//   gen  200 calls × ~4 000 tokens avg = ~$1.92
//   grade 1000 calls × ~1 400 tokens avg = ~$3.68
//   ingest 20 calls × ~11 000 tokens avg = ~$0.37
//   Total worst-case Pro user ≈ $5.97 / month — safely under $9 plan price.
export const PRO_MONTHLY_LIMITS = { gen: 200, grade: 1000, ingest: 20 };

export function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function requireUser(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw httpErr(401, "Sign in required.");

  const sb = adminClient();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw httpErr(401, "Session expired — please sign in again.");
  const user = data.user;

  let { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    // New user — create profile with a referral code + auto-generated username
    const referral_code = genReferralCode();
    const username      = await genUsername(sb, user.email);
    const ins = await sb
      .from("profiles")
      .insert({ id: user.id, email: user.email, referral_code, username })
      .select()
      .single();
    profile = ins.data;

    // Send welcome email — fire and forget, never blocks the request
    sendWelcomeEmail(user.email).catch(() => {});

    // If they signed up via a referral link, credit the referrer +5 bonus_gen (capped at 50)
    const referred_by = user.user_metadata?.referred_by;
    if (referred_by) {
      // Fetch the referrer's current values first (avoid stale-read overwrite bug)
      const { data: referrer } = await sb
        .from("profiles")
        .select("id, referral_count, bonus_gen")
        .eq("referral_code", referred_by)
        .neq("id", user.id) // can't refer yourself
        .maybeSingle();

      if (referrer) {
        await sb.from("profiles").update({
          referral_count: (referrer.referral_count || 0) + 1,
          bonus_gen: Math.min((referrer.bonus_gen || 0) + 5, 50), // hard cap: 10 referrals max
        }).eq("id", referrer.id);
        // Mark new user credited so a re-login never double-credits
        await sb.from("profiles").update({ referral_credited: true }).eq("id", user.id);
        profile = { ...profile, referral_credited: true };
      }
    }
  }

  // Lazy subscription re-check (max once per 24h) so cancellations downgrade
  // without needing a webhook.
  if (profile.plan === "pro" && profile.stripe_subscription_id) {
    const last = profile.plan_checked_at ? new Date(profile.plan_checked_at).getTime() : 0;
    if (Date.now() - last > 24 * 3600 * 1000) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        const active = ["active", "trialing", "past_due"].includes(sub.status);
        await sb
          .from("profiles")
          .update({ plan: active ? "pro" : "free", plan_checked_at: new Date().toISOString() })
          .eq("id", user.id);
        profile.plan = active ? "pro" : "free";
      } catch (e) {
        // Stripe hiccup — keep current plan, try again next day
      }
    }
  }

  return { sb, user, profile };
}

// kind: "gen" | "grade" | "ingest"
export async function checkAndCount({ sb, user, profile }, kind) {
  if (profile.plan === "pro") {
    // Pro users: enforce monthly fair-use cap to protect against runaway costs.
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    const { data: row } = await sb
      .from("monthly_usage")
      .select("*")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle();

    const used = row ? row[kind] || 0 : 0;
    const limit = PRO_MONTHLY_LIMITS[kind];
    if (used >= limit) {
      throw httpErr(
        429,
        `You've reached the monthly ${kind === "gen" ? "question generation" : kind === "grade" ? "grading" : "material upload"} limit for this month (${limit}). This resets on the 1st. Contact support if you need more.`
      );
    }

    if (row) {
      await sb.from("monthly_usage").update({ [kind]: used + 1 }).eq("id", row.id);
    } else {
      await sb.from("monthly_usage").insert({ user_id: user.id, month, [kind]: 1 });
    }
    return { plan: "pro", used: used + 1, limit };
  }

  // Free users: enforce daily limits + bonus_gen from referrals (gen only)
  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await sb
    .from("usage")
    .select("*")
    .eq("user_id", user.id)
    .eq("day", day)
    .maybeSingle();

  const used = row ? row[kind] || 0 : 0;
  const baseLimit = FREE_LIMITS[kind];
  // bonus_gen is a one-off pool of extra generate calls earned through referrals
  const bonusGen = (kind === "gen") ? (profile.bonus_gen || 0) : 0;
  const limit = baseLimit + bonusGen;
  if (used >= limit) {
    const extra = bonusGen > 0 ? ` (includes ${bonusGen} bonus from referrals)` : "";
    throw httpErr(
      402,
      `Daily free limit reached (${limit} per day${extra}). Upgrade to Pro for unlimited — see the Account tab.`
    );
  }

  if (row) {
    await sb.from("usage").update({ [kind]: used + 1 }).eq("id", row.id);
  } else {
    await sb.from("usage").insert({ user_id: user.id, day, [kind]: 1 });
  }
  return { plan: "free", used: used + 1, limit };
}

export function sendErr(res, e) {
  console.error(e);
  return res.status(e.status || 500).json({ error: e.message || "Server error" });
}
