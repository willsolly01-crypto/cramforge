// GET  /api/sync  — load user's saved app state (for cross-device sync)
// POST /api/sync  — save user's app state

import { requireUser, sendErr } from "./_auth.js";

export default async function handler(req, res) {
  // ── GET: load state ──────────────────────────────────────────────────
  if (req.method === "GET") {
    try {
      const { sb, user } = await requireUser(req);
      const { data } = await sb
        .from("user_data")
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle();
      return res.status(200).json({ state: data?.data || null });
    } catch (e) {
      return sendErr(res, e);
    }
  }

  // ── POST: save state ─────────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const { sb, user } = await requireUser(req);
      const { state } = req.body && typeof req.body === "object"
        ? req.body
        : JSON.parse(await rawBody(req));

      if (!state || typeof state !== "object") {
        return res.status(400).json({ error: "Invalid state." });
      }

      // Upsert — create or replace the row for this user
      await sb.from("user_data").upsert({
        user_id: user.id,
        data: state,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      return res.status(200).json({ ok: true });
    } catch (e) {
      return sendErr(res, e);
    }
  }

  return res.status(405).json({ error: "GET or POST only" });
}
