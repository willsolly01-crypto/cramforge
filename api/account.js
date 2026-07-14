// api/account.js — account state, public profiles/leaderboard, and cross-device
// sync behind one function. Dispatched by ?op=.
//
//   GET  /api/account?op=me                       → own plan, usage, referral, stats
//   GET  /api/account?op=profile&username=xxx     → public profile (no auth)
//   GET  /api/account?op=profile&leaderboard=1    → weekly leaderboard (no auth)
//   POST /api/account?op=profile                  → update own display_name/username/is_public
//   GET  /api/account?op=sync                      → load saved app state
//   POST /api/account?op=sync                      → save app state

import { requireUser, sendErr, adminClient, FREE_LIMITS } from "../lib/_auth.js";
import { readBody } from "../lib/_claude.js";

// ── ME ───────────────────────────────────────────────────────────────────────
async function opMe(req, res) {
  const { sb, user, profile } = await requireUser(req);
  const day = new Date().toISOString().slice(0, 10);
  const { data: row } = await sb
    .from("usage")
    .select("*")
    .eq("user_id", user.id)
    .eq("day", day)
    .maybeSingle();

  return res.status(200).json({
    email: user.email,
    plan: profile.plan,
    usage: {
      gen: row?.gen || 0,
      grade: row?.grade || 0,
      ingest: row?.ingest || 0,
    },
    limits: {
      gen: FREE_LIMITS.gen + (profile.bonus_gen || 0),
      grade: FREE_LIMITS.grade,
      ingest: FREE_LIMITS.ingest,
    },
    referral: {
      code: profile.referral_code || null,
      count: profile.referral_count || 0,
      bonus_gen: profile.bonus_gen || 0,
    },
    profile: {
      username: profile.username || null,
      display_name: profile.display_name || null,
      is_public: profile.is_public !== false,
      pdf_demo_used: profile.pdf_demo_used || false,
      total_xp: profile.total_xp || 0,
      questions_answered: profile.questions_answered || 0,
      questions_correct: profile.questions_correct || 0,
    },
  });
}

// ── PROFILE (public GET + own POST) ──────────────────────────────────────────
async function opProfile(req, res) {
  if (req.method === "GET") {
    const params = new URL(req.url, "http://x").searchParams;

    if (params.get("leaderboard")) {
      const sa = adminClient();
      const { data, error } = await sa
        .from("weekly_leaderboard")
        .select("username, display_name, total_seconds, session_count, active_days")
        .limit(10);
      if (error) {
        console.error("Leaderboard error:", error.message);
        return res.status(200).json({ leaderboard: [] });
      }
      return res.status(200).json({ leaderboard: data || [] });
    }

    const username = params.get("username");
    if (username) {
      const sa = adminClient();
      const { data: profile } = await sa
        .from("profiles")
        .select("id, username, display_name, is_public, created_at")
        .eq("username", username.toLowerCase())
        .maybeSingle();

      if (!profile || !profile.is_public) {
        return res.status(404).json({ error: "Profile not found or private." });
      }

      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: sessions } = await sa
        .from("study_sessions")
        .select("unit_name, duration_seconds, started_at, ended_at")
        .eq("user_id", profile.id)
        .gte("ended_at", since)
        .order("ended_at", { ascending: false })
        .limit(100);

      const totalSeconds = (sessions || []).reduce((a, s) => a + (s.duration_seconds || 0), 0);
      const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const weekSessions = (sessions || []).filter((s) => new Date(s.ended_at) >= weekAgo);
      const weekSeconds = weekSessions.reduce((a, s) => a + (s.duration_seconds || 0), 0);

      const unitMap = {};
      for (const s of sessions || []) {
        const key = s.unit_name || "General";
        unitMap[key] = (unitMap[key] || 0) + (s.duration_seconds || 0);
      }
      const units = Object.entries(unitMap)
        .sort((a, b) => b[1] - a[1])
        .map(([name, secs]) => ({ name, seconds: secs }));

      const { data: usageDays } = await sa
        .from("usage")
        .select("day")
        .eq("user_id", profile.id)
        .order("day", { ascending: false })
        .limit(60);

      const days = new Set((usageDays || []).map((r) => r.day));
      const today = new Date().toISOString().slice(0, 10);
      let streak = 0;
      let cursor = new Date(today);
      while (days.has(cursor.toISOString().slice(0, 10))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      return res.status(200).json({
        profile: {
          username: profile.username,
          displayName: profile.display_name || profile.username,
          memberSince: profile.created_at,
        },
        stats: { streak, totalSeconds, weekSeconds, weekSessions: weekSessions.length, units },
        recentSessions: (sessions || []).slice(0, 5),
      });
    }

    return res.status(400).json({ error: "username or leaderboard param required." });
  }

  if (req.method === "POST") {
    const { sb, user } = await requireUser(req);
    const { displayName, username, isPublic } = await readBody(req);

    const updates = {};
    if (displayName !== undefined) updates.display_name = String(displayName).slice(0, 60);
    if (isPublic !== undefined) updates.is_public = Boolean(isPublic);

    if (username !== undefined) {
      const slug = String(username).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
      if (!slug) return res.status(400).json({ error: "Username must contain at least one valid character (a–z, 0–9, _ or -)." });
      const { data: existing } = await sb
        .from("profiles")
        .select("id")
        .eq("username", slug)
        .neq("id", user.id)
        .maybeSingle();
      if (existing) return res.status(409).json({ error: `The username "${slug}" is already taken.` });
      updates.username = slug;
    }

    if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update." });

    await sb.from("profiles").update(updates).eq("id", user.id);
    return res.status(200).json({ ok: true, updates });
  }

  return res.status(405).json({ error: "GET or POST only" });
}

// ── SYNC ─────────────────────────────────────────────────────────────────────
async function opSync(req, res) {
  if (req.method === "GET") {
    const { sb, user } = await requireUser(req);
    const { data } = await sb
      .from("user_data")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();
    return res.status(200).json({ state: data?.data || null });
  }

  if (req.method === "POST") {
    const { sb, user } = await requireUser(req);
    const { state } = await readBody(req);
    if (!state || typeof state !== "object") {
      return res.status(400).json({ error: "Invalid state." });
    }
    await sb.from("user_data").upsert(
      { user_id: user.id, data: state, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "GET or POST only" });
}

// ── Router ───────────────────────────────────────────────────────────────────
const OPS = { me: opMe, profile: opProfile, sync: opSync };

export default async function handler(req, res) {
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
