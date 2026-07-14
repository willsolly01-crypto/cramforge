// api/study-session.js — Save and retrieve study sessions for the social timer.
// GET  ?limit=N         → last N sessions for the logged-in user
// POST { unitName, durationSeconds, startedAt, endedAt } → save a new session

import { requireUser, sendErr, adminClient } from "../lib/_auth.js";
import { readBody } from "../lib/_claude.js";

export default async function handler(req, res) {
  try {
    const { sb, user, profile } = await requireUser(req);

    // ── GET: last sessions ─────────────────────────────────────────────────
    if (req.method === "GET") {
      const limit = Math.min(50, Number(new URL(req.url, "http://x").searchParams.get("limit")) || 20);
      const { data, error } = await sb
        .from("study_sessions")
        .select("id, unit_name, duration_seconds, started_at, ended_at")
        .eq("user_id", user.id)
        .order("ended_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      // Calculate streak from usage table
      const today = new Date().toISOString().slice(0, 10);
      const { data: usageDays } = await sb
        .from("usage")
        .select("day")
        .eq("user_id", user.id)
        .order("day", { ascending: false })
        .limit(60); // look back 60 days max

      const days = new Set((usageDays || []).map((r) => r.day));
      // Also count today if there are study sessions today
      if ((data || []).some((s) => s.ended_at?.slice(0, 10) === today)) {
        days.add(today);
      }

      let streak = 0;
      let cursor = new Date(today);
      while (days.has(cursor.toISOString().slice(0, 10))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      // Weekly summary
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const weekSessions = (data || []).filter(
        (s) => new Date(s.ended_at) >= weekAgo
      );
      const weekSeconds = weekSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);

      return res.status(200).json({
        sessions: data || [],
        streak,
        weekSeconds,
        weekSessions: weekSessions.length,
      });
    }

    // ── POST: save a session ───────────────────────────────────────────────
    if (req.method === "POST") {
      const {
        unitName, durationSeconds, startedAt, endedAt,
        mode = "timer", xpEarned = 0, correct = 0, total = 0,
      } = await readBody(req);

      if (!durationSeconds || durationSeconds < 30) {
        return res.status(400).json({ error: "Session must be at least 30 seconds." });
      }

      const { data, error } = await sb
        .from("study_sessions")
        .insert({
          user_id:          user.id,
          unit_name:        unitName   || null,
          duration_seconds: Math.min(Number(durationSeconds), 86400),
          started_at:       startedAt  || new Date(Date.now() - durationSeconds * 1000).toISOString(),
          ended_at:         endedAt    || new Date().toISOString(),
          mode:             mode === "quick" ? "quick" : "timer",
          xp_earned:        Number(xpEarned) || 0,
          qs_correct:       Number(correct)  || 0,
          qs_total:         Number(total)    || 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Atomically update lifetime XP + accuracy counters on quick sessions
      if (mode === "quick" && (xpEarned > 0 || total > 0)) {
        const adminSb = adminClient();
        await adminSb.rpc("increment_quick_stats", {
          p_user_id: user.id,
          p_xp:      Math.max(0, Number(xpEarned)),
          p_correct: Math.max(0, Number(correct)),
          p_total:   Math.max(0, Number(total)),
        }).then(() => {}).catch((e) => console.error("XP increment failed:", e.message));
      }

      return res.status(201).json({ session: data });
    }

    return res.status(405).json({ error: "GET or POST only" });
  } catch (e) {
    return sendErr(res, e);
  }
}

