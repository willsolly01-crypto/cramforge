// api/bank.js — Public question bank (browseable shared sets).
// No auth required to browse; Pro required for "featured" sets above the free quota.
//
// GET /api/bank                   → list recent/popular sets (paginated)
// GET /api/bank?subject=stem      → filter by subject type
// GET /api/bank?featured=1        → featured sets (curated) — Pro gate applied client-side
// POST /api/bank { action: "feature", shareId, featured } → admin: toggle featured flag

import { adminClient, requireUser, sendErr } from "./_auth.js";

// Admin user IDs — set these to the Supabase UUIDs of your admin accounts
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

export default async function handler(req, res) {
  const sa = adminClient();

  if (req.method === "GET") {
    const params    = new URL(req.url, "http://x").searchParams;
    const subject   = params.get("subject");
    const featured  = params.get("featured") === "1";
    const page      = Math.max(0, Number(params.get("page")) || 0);
    const perPage   = 12;

    let query = sa
      .from("shared_sets")
      .select("id, unit_name, subject_type, question_count, view_count, featured, created_at")
      .order(featured ? "view_count" : "created_at", { ascending: false })
      .range(page * perPage, (page + 1) * perPage - 1);

    if (subject) query = query.eq("subject_type", subject);
    if (featured) query = query.eq("featured", true);

    const { data, error, count } = await query;
    if (error) {
      // Gracefully handle if featured column doesn't exist yet
      console.error("Bank query error:", error.message);
      return res.status(200).json({ sets: [], total: 0 });
    }

    return res.status(200).json({
      sets:    data || [],
      total:   count,
      page,
      perPage,
    });
  }

  if (req.method === "POST") {
    try {
      const { sb, user } = await requireUser(req);
      if (!ADMIN_IDS.includes(user.id)) {
        return res.status(403).json({ error: "Admin only." });
      }

      const body = await (req.body && typeof req.body === "object"
        ? Promise.resolve(req.body)
        : new Promise((resolve) => {
            let raw = "";
            req.on("data", (c) => (raw += c));
            req.on("end", () => resolve(JSON.parse(raw || "{}")));
          }));

      const { action, shareId, featured } = body;

      if (action === "feature") {
        await sa.from("shared_sets").update({ featured: Boolean(featured) }).eq("id", shareId);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: `Unknown action: ${action}` });
    } catch (e) {
      return sendErr(res, e);
    }
  }

  return res.status(405).json({ error: "GET or POST only" });
}
