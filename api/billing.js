// api/billing.js — Stripe checkout, billing portal, and post-checkout activation
// behind one function. Dispatched by ?op=.
//
//   POST /api/billing?op=checkout   → create a Checkout session, returns { url }
//   POST /api/billing?op=portal     → create a billing-portal session, returns { url }
//   POST /api/billing?op=activate   → verify a completed session, upgrade to Pro

import Stripe from "stripe";
import { requireUser, sendErr, httpErr } from "../lib/_auth.js";
import { readBody } from "../lib/_claude.js";

const stripe = () => new Stripe(process.env.STRIPE_SECRET_KEY);
const appUrl = (req) => process.env.APP_URL || `https://${req.headers.host}`;

async function opCheckout(req, res) {
  const { user, profile } = await requireUser(req);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    client_reference_id: user.id,
    ...(profile.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: user.email }),
    success_url: `${appUrl(req)}/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: appUrl(req),
    allow_promotion_codes: true,
  });
  return res.status(200).json({ url: session.url });
}

async function opPortal(req, res) {
  const { profile } = await requireUser(req);
  if (!profile.stripe_customer_id) throw httpErr(400, "No billing account yet — upgrade first.");
  const portal = await stripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: appUrl(req),
  });
  return res.status(200).json({ url: portal.url });
}

async function opActivate(req, res) {
  const { sb, user } = await requireUser(req);
  const { sessionId } = await readBody(req);
  if (!sessionId) throw httpErr(400, "Missing session id.");

  const session = await stripe().checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.client_reference_id !== user.id) {
    throw httpErr(403, "This checkout session belongs to a different account.");
  }
  if (session.payment_status !== "paid" && session.status !== "complete") {
    throw httpErr(400, "Payment not completed.");
  }

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id || null;

  await sb
    .from("profiles")
    .update({
      plan: "pro",
      stripe_customer_id: session.customer,
      stripe_subscription_id: subId,
      plan_checked_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return res.status(200).json({ plan: "pro" });
}

const OPS = { checkout: opCheckout, portal: opPortal, activate: opActivate };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const op = new URL(req.url, "http://x").searchParams.get("op");
  const fn = OPS[op];
  if (!fn) {
    return res.status(400).json({ error: `Unknown op "${op}". Use one of: ${Object.keys(OPS).join(", ")}.` });
  }
  try {
    return await fn(req, res);
  } catch (e) {
    return sendErr(res, e);
  }
}
