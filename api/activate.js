import Stripe from "stripe";
import { requireUser, sendErr, httpErr } from "./_auth.js";
import { readBody } from "./_claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { sb, user } = await requireUser(req);
    const { sessionId } = await readBody(req);
    if (!sessionId) throw httpErr(400, "Missing session id.");

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
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
  } catch (e) {
    return sendErr(res, e);
  }
}
