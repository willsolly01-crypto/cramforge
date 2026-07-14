// lib/_auth.js — auth middleware, free-tier usage limits, admin client.
// Reconstructed to match every call site across the API routes.
//
// Exports:
//   requireUser(req)        → { sb, user, profile }   (throws 401 if not signed in)
//   checkAndCount(auth, k)  → increments usage, throws 402 if free limit hit
//   adminClient()           → service-role Supabase client (bypasses RLS)
//   sendErr(res, e)         → uniform error response
//   httpErr(status, msg)    → make an Error carrying an HTTP status
//   FREE_LIMITS             → { gen, grade, ingest }

import { createClient } from "@supabase/supabase-js";

// Daily free-tier limits (Pro = unlimited, bypasses checkAndCount entirely).
export const FREE_LIMITS = { gen: 5, grade: 25, ingest: 2 };

// Columns pulled into `profile` on every authed request. Add here if a route
// needs another profile field.
const PROFILE_COLS =
  "id, email, plan, stripe_customer_id, stripe_subscription_id, plan_checked_at, " +
  "username, display_name, is_public, pdf_demo_used, bonus_gen, referral_code, " +
  "referral_count, total_xp, questions_answered, questions_correct, created_at";

export function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function sendErr(res, e) {
  const status = e?.status || 500;
  const message = e?.message || "Server error";
  if (status >= 500) console.error("API error:", e);
  return res.status(status).json({ error: message });
}

// Service-role client — bypasses Row Level Security. Server-side only.
export function adminClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Verify the bearer token, load the profile, return a per-request context.
// `sb` is a service-role client scoped to this user's rows by explicit
// user_id filters in each route (RLS is intentionally off — see supabase SQL).
export async function requireUser(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) throw httpErr(401, "Sign in required.");

  const sb = adminClient();

  const {
    data: { user },
    error,
  } = await sb.auth.getUser(token);

  if (error || !user) throw httpErr(401, "Your session has expired — please sign in again.");

  // Load profile. The DB trigger guarantees a row exists, but we self-heal
  // just in case this route runs before the trigger has been installed.
  let { data: profile } = await sb
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await sb
      .from("profiles")
      .insert({ id: user.id, email: user.email, plan: "free" })
      .then(() => {});
    const reload = await sb
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", user.id)
      .maybeSingle();
    profile = reload.data || { id: user.id, email: user.email, plan: "free" };
  }

  return { sb, user, profile };
}

// Enforce + increment a daily usage counter for free users.
// `kind` is one of "gen" | "grade" | "ingest".
// Pro users skip the check but we still record usage for analytics.
export async function checkAndCount(auth, kind) {
  const { sb, user, profile } = auth;
  const day = new Date().toISOString().slice(0, 10);

  const { data: row } = await sb
    .from("usage")
    .select("*")
    .eq("user_id", user.id)
    .eq("day", day)
    .maybeSingle();

  const used = row?.[kind] || 0;

  if (profile.plan !== "pro") {
    // Base limit plus any referral bonus (only "gen" has a bonus lever today).
    const bonus = kind === "gen" ? profile.bonus_gen || 0 : 0;
    const limit = (FREE_LIMITS[kind] ?? 0) + bonus;

    if (used >= limit) {
      throw httpErr(
        402,
        `You've hit today's free limit (${limit} ${kind}). Upgrade to Pro in the Account tab for unlimited access, or come back tomorrow.`
      );
    }
  }

  // Increment (upsert the per-day row).
  if (row) {
    await sb
      .from("usage")
      .update({ [kind]: used + 1 })
      .eq("user_id", user.id)
      .eq("day", day);
  } else {
    await sb.from("usage").insert({
      user_id: user.id,
      day,
      gen: kind === "gen" ? 1 : 0,
      grade: kind === "grade" ? 1 : 0,
      ingest: kind === "ingest" ? 1 : 0,
    });
  }
}
