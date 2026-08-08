// GET  /api/weak-topics                -> all rows for the signed-in user
// POST /api/weak-topics {action: "log_wrong", subject, entries:[{topic, ref}]}
// POST /api/weak-topics {action: "result",   subject, topic, correct: bool}
//
// Leitner spaced repetition:
//   correct -> box+1 (max 4), streak+1, next_due = today + [1,1,3,7,14][newBox]
//   wrong   -> box-1 (min 0), streak=0, next_due = today (back in the queue)
//
// If you already have a requireUser() helper in api/_auth.js, swap the
// inline auth block below for it — the rest is drop-in.

import { createClient } from "@supabase/supabase-js";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const INTERVALS = [1, 1, 3, 7, 14]; // days until next review, by box
const MISSED_CAP = 20;              // keep rows tiny

function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  // --- auth (replace with your _auth.js helper if you prefer) ---
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not signed in" });
  const { data: userData, error: authErr } = await supa.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: "Not signed in" });
  const uid = userData.user.id;
  // --------------------------------------------------------------

  if (req.method === "GET") {
    const { data, error } = await supa
      .from("weak_topics")
      .select("*")
      .eq("user_id", uid);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ rows: data || [] });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { action, subject } = body;
  if (!subject) return res.status(400).json({ error: "subject required" });

  if (action === "log_wrong") {
    // entries: [{paper_code: "Methods-A-Exam1", question_no: "6c"}, ...]
    // Topic is looked up from your existing question_topics table — no
    // duplicate topic data to maintain, and it covers every paper you've
    // already added rows for.
    const raw = Array.isArray(body.entries) ? body.entries.slice(0, 60) : [];
    if (!raw.length) return res.status(400).json({ error: "entries required" });

    const paperCodes = [...new Set(raw.map((e) => e.paper_code).filter(Boolean))];
    const { data: lookup, error: lookupErr } = await supa
      .from("question_topics")
      .select("paper_code, question_no, topic")
      .in("paper_code", paperCodes);
    if (lookupErr) return res.status(500).json({ error: lookupErr.message });

    const topicOf = {};
    for (const row of lookup || []) topicOf[`${row.paper_code}::${row.question_no}`] = row.topic;

    const byTopic = {};
    for (const e of raw) {
      const topic = topicOf[`${e.paper_code}::${e.question_no}`];
      if (!topic) continue; // question_topics has no row for this one yet — skip, don't guess
      (byTopic[topic] ||= []).push(`${e.paper_code}:${e.question_no}`.slice(0, 40));
    }
    if (!Object.keys(byTopic).length) {
      return res.status(400).json({ error: "None of those questions are in question_topics yet." });
    }

    for (const [topic, refs] of Object.entries(byTopic)) {
      const { data: existing } = await supa
        .from("weak_topics")
        .select("box, wrong, missed")
        .eq("user_id", uid).eq("subject", subject).eq("topic", topic)
        .maybeSingle();

      const prev = existing || { box: 0, wrong: 0, missed: [] };
      const missed = [...new Set([...prev.missed, ...refs])].slice(-MISSED_CAP);

      const { error } = await supa.from("weak_topics").upsert({
        user_id: uid, subject, topic,
        box: Math.max(0, prev.box - 1),
        streak: 0,
        wrong: Math.min(999, prev.wrong + refs.length),
        missed,
        next_due: addDays(0),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,subject,topic" });
      if (error) {
        console.error("weak_topics upsert failed:", error);
        return res.status(500).json({ error: error.message });
      }
    }
    // Diagnostic: verify what actually landed, and report it.
    const { data: check } = await supa
      .from("weak_topics")
      .select("topic, box, wrong")
      .eq("user_id", uid).eq("subject", subject);
    return res.status(200).json({
      ok: true,
      sent: raw.length,
      matchedTopics: Object.keys(byTopic),
      rowsNow: (check || []).length,
      rows: check || [],
    });
  }

  if (action === "result") {
    const { topic, correct } = body;
    if (!topic) return res.status(400).json({ error: "topic required" });

    const { data: existing } = await supa
      .from("weak_topics")
      .select("box, streak, wrong, correct, missed")
      .eq("user_id", uid).eq("subject", subject).eq("topic", topic)
      .maybeSingle();

    const prev = existing || { box: 0, streak: 0, wrong: 0, correct: 0, missed: [] };
    const box = correct ? Math.min(4, prev.box + 1) : Math.max(0, prev.box - 1);

    const { error } = await supa.from("weak_topics").upsert({
      user_id: uid, subject, topic,
      box,
      streak: correct ? Math.min(999, prev.streak + 1) : 0,
      wrong: correct ? prev.wrong : Math.min(999, prev.wrong + 1),
      correct: correct ? Math.min(999, prev.correct + 1) : prev.correct,
      missed: prev.missed,
      next_due: addDays(correct ? INTERVALS[box] : 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,subject,topic" });
    if (error) {
      console.error("weak_topics result upsert failed:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true, box });
  }

  return res.status(400).json({ error: "unknown action" });
}
