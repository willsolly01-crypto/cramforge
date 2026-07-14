// POST /api/share  — save a question set and return a share ID
// GET  /api/share?id=xxx — retrieve a shared set (no auth required)

import { requireUser, sendErr, adminClient, httpErr } from "../lib/_auth.js";
import { readBody } from "../lib/_claude.js";

function genId() {
  return Math.random().toString(36).slice(2, 10); // 8-char slug
}

export default async function handler(req, res) {
  // ── GET: retrieve a shared set ──────────────────────────────────────
  if (req.method === "GET") {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: "Missing share id." });

    try {
      const sb = adminClient();
      const { data, error } = await sb
        .from("shared_sets")
        .select("id, unit_name, subject_type, questions, views, created_at")
        .eq("id", id)
        .maybeSingle();

      if (error || !data) return res.status(404).json({ error: "Shared set not found." });

      // Increment view count — fire and forget, never fails the request
      sb.from("shared_sets").update({ views: (data.views || 0) + 1 }).eq("id", id).then(() => {});

      return res.status(200).json(data);
    } catch (e) {
      return sendErr(res, e);
    }
  }

  // ── POST: create a shared set (auth required) ───────────────────────
  if (req.method === "POST") {
    try {
      const { user } = await requireUser(req);
      const body = await readBody(req);

      const { unitName, questions, subjectType } = body;
      if (!unitName || !questions?.length) {
        throw httpErr(400, "unitName and questions are required.");
      }

      const sb = adminClient();
      const id = genId();

      await sb.from("shared_sets").insert({
        id,
        user_id: user.id,
        unit_name: unitName,
        subject_type: subjectType || null,
        questions,
      });

      const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
      return res.status(200).json({ id, url: `${appUrl}?share=${id}` });
    } catch (e) {
      return sendErr(res, e);
    }
  }

  return res.status(405).json({ error: "GET or POST only" });
}

