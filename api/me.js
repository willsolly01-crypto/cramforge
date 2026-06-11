import { requireUser, sendErr, FREE_LIMITS } from "./_auth.js";

export default async function handler(req, res) {
  try {
    const { sb, user, profile } = await requireUser(req);
    const day = new Date().toISOString().slice(0, 10);
    const { data: row } = await sb
      .from("usage").select("*").eq("user_id", user.id).eq("day", day).maybeSingle();
    return res.status(200).json({
      email: user.email,
      plan: profile.plan,
      usage: { gen: row?.gen || 0, grade: row?.grade || 0, ingest: row?.ingest || 0 },
      limits: FREE_LIMITS,
    });
  } catch (e) {
    return sendErr(res, e);
  }
}
