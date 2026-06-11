import Stripe from "stripe";
import { requireUser, sendErr, httpErr } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { profile } = await requireUser(req);
    if (!profile.stripe_customer_id) throw httpErr(400, "No billing account yet — upgrade first.");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: appUrl,
    });
    return res.status(200).json({ url: portal.url });
  } catch (e) {
    return sendErr(res, e);
  }
}
