// Stripe webhook — handles subscription lifecycle events server-side.
// This makes Pro upgrades bulletproof: even if the user closes the tab before
// returning from Stripe, their plan still activates.
//
// Required: STRIPE_WEBHOOK_SECRET env var.
// Get it from: Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret
//
// Events to enable in Stripe Dashboard:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted

import Stripe from "stripe";
import { adminClient } from "./_auth.js";

// Must disable Vercel's body parser — Stripe signature verification needs the raw body.
export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Webhook not configured." });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    // Invalid signature — reject silently (could be a probe/replay attack)
    console.error("Webhook signature verification failed:", e.message);
    return res.status(400).json({ error: "Invalid signature." });
  }

  const sb = adminClient();

  try {
    switch (event.type) {
      // User completed checkout — upgrade to Pro
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;
        if (session.payment_status !== "paid" && session.status !== "complete") break;

        const userId = session.client_reference_id;
        if (!userId) {
          console.error("checkout.session.completed missing client_reference_id");
          break;
        }

        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id || null;

        await sb.from("profiles").update({
          plan: "pro",
          stripe_customer_id: session.customer,
          stripe_subscription_id: subId,
          plan_checked_at: new Date().toISOString(),
        }).eq("id", userId);

        console.log(`Upgraded user ${userId} to Pro via webhook`);
        break;
      }

      // Subscription cancelled (immediately or at period end)
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await sb.from("profiles")
          .update({ plan: "free", plan_checked_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        console.log(`Downgraded subscription ${sub.id} to free (deleted)`);
        break;
      }

      // Subscription status changed (payment failed, paused, reactivated, etc.)
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const active = ["active", "trialing", "past_due"].includes(sub.status);
        await sb.from("profiles")
          .update({ plan: active ? "pro" : "free", plan_checked_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        console.log(`Subscription ${sub.id} updated → ${active ? "pro" : "free"} (status: ${sub.status})`);
        break;
      }

      default:
        // Unexpected event type — safe to ignore
        break;
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    // Return 200 so Stripe doesn't retry — the error is ours to fix, not a delivery problem
    return res.status(200).json({ received: true, error: "Handler error logged." });
  }
}
