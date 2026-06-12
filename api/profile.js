// api/profile.js — Public profile page + leaderboard data.
//
// GET /api/profile?username=xxx   → public stats for that user
// GET /api/profile?leaderboard=1  → weekly study leaderboard (top 10)
// POST /api/profile               → update own profile (display_name, username, is_public)

import { requireUser, sendErr, adminClient } from "./_auth.js";
import { readBody } from "./_claude.js";

const sb_admin = () => adminClient();

export default async function handler(req, res) {
  // ── GET: public profile OR leaderboard ────────────────────────────────
  if (req.method === "GET") {
    const params = new URL(req.url, "http://x").searchParams;

    // Weekly leaderboard (no auth needed)
    if (params.get("leaderboard")) {
      const sa = sb_admin();
      const { data, error } = await sa
        .from("weekly_leaderboard")
        .select("username, display_name, total_seconds, session_count, active_days")
        .limit(10);

      if (error) {
        // View may not exist yet — return empty gracefully
        console.error("Leaderboard error:", error.message);
        return res.status(200).json({ leaderboard: [] });
      }
      return res.status(200).json({ leaderboard: data || [] });
    }

    // Public profile by username (no auth needed)
    const username = params.get("username");
    if (username) {
      const sa = sb_admin();
      const { data: profile, error } = await sa
        .from("profiles")
        .select("id, username, display_name, is_public, created_at")
        .eq("username", username.toLowerCase())
        .maybeSingle();

      if (!profile || !profile.is_public) {
        return res.status(404).json({ error: "Profile not found or private." });
      }

      // Last 30 days study sessions
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: sessions } = await sa
        .from("study_sessions")
        .select("unit_name, duration_seconds, started_at, ended_at")
        .eq("user_id", profile.id)
        .gte("ended_at", since)
        .order("ended_at", { ascending: false })
        .limit(100);

      // Compute stats
      const totalSeconds = (sessions || []).reduce((a, s) => a + (s.duration_seconds || 0), 0);
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const weekSessions = (sessions || []).filter((s) => new Date(s.ended_at) >= weekAgo);
      const weekSeconds  = weekSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);

      // Per-unit study breakdown
      const unitMap = {};
      for (const s of sessions || []) {
        const key = s.unit_name || "General";
        unitMap[key] = (unitMap[key] || 0) + (s.duration_seconds || 0);
      }
      const units = Object.entries(unitMap)
        .sort((a, b) => b[1] - a[1])
        .map(([name, secs]) => ({ name, seconds: secs }));

      // Streak from usage table (need service role)
      const { data: usageDays } = await sa
        .from("usage")
        .select("day")
        .eq("user_id", profile.id)
        .order("day", { ascending: false })
        .limit(60);

      const days    = new Set((usageDays || []).map((r) => r.day));
      const today   = new Date().toISOString().slice(0, 10);
      let streak    = 0;
      let cursor    = new Date(today);
      while (days.has(cursor.toISOString().slice(0, 10))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      return res.status(200).json({
        profile: {
          username:    profile.username,
          displayName: profile.display_name || profile.username,
          memberSince: profile.created_at,
        },
        stats: {
          streak,
          totalSeconds,
          weekSeconds,
          weekSessions: weekSessions.length,
          units,
        },
        recentSessions: (sessions || []).slice(0, 5),
      });
    }

    return res.status(400).json({ error: "username or leaderboard param required." });
  }

  // ── POST: update own profile ───────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const { sb, user, profile } = await requireUser(req);
      const { displayName, username, isPublic } = await readBody(req);

      const updates = {};
      if (displayName !== undefined) updates.display_name = String(displayName).slice(0, 60);
      if (isPublic    !== undefined) updates.is_public    = Boolean(isPublic);

      if (username !== undefined) {
        const slug = String(username).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
        if (!slug) return res.status(400).json({ error: "Username must contain at least one valid character (a–z, 0–9, _ or -)." });

        // Check uniqueness (excluding self)
        const { data: existing } = await sb
          .from("profiles")
          .select("id")
          .eq("username", slug)
          .neq("id", user.id)
          .maybeSingle();

        if (existing) {
          return res.status(409).json({ error: `The username "${slug}" is already taken.` });
        }
        updates.username = slug;
      }

      if (!Object.keys(updates).length) {
        return res.status(400).json({ error: "Nothing to update." });
      }

      await sb.from("profiles").update(updates).eq("id", user.id);
      return res.status(200).json({ ok: true, updates });
    } catch (e) {
      return sendErr(res, e);
    }
  }

  return res.status(405).json({ error: "GET or POST only" });
}
