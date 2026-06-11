// Shared auth + usage metering for serverless functions.
// Verifies the user's Supabase session token, loads their profile,
// lazily re-checks Stripe subscription status, and enforces free-tier limits.

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const FREE_LIMITS = { gen: 5, grade: 25, ingest: 2 };

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
    const ins = await sb
      .from("profiles")
      .insert({ id: user.id, email: user.email })
      .select()
      .single();
    profile = ins.data;
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
  if (profile.plan === "pro") return { plan: "pro" };

  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await sb
    .from("usage")
    .select("*")
    .eq("user_id", user.id)
    .eq("day", day)
    .maybeSingle();

  const used = row ? row[kind] || 0 : 0;
  const limit = FREE_LIMITS[kind];
  if (used >= limit) {
    throw httpErr(
      402,
      `Daily free limit reached (${limit} per day). Upgrade to Pro for unlimited — see the Account tab.`
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
