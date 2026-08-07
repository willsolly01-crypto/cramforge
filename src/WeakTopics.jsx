// Weak Topic Tracker — log wrong questions from CramForge papers, get targeted
// practice, fill the mastery bar. Leitner spaced repetition (box 0-4 per topic).
// Topic lookup reads your existing `question_topics` table directly.
//
// WIRING (2 things to check):
// 1. The supabase import path below — point it at your existing client.
// 2. generatePractice() below calls /api/ai?op=generate with your real
//    contract (unitName, notes, topics, weakTopics, count). It needs SOME
//    notes text to generate from — see the sourceNotes() note below.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase"; // <-- adjust to your client's path

const SUBJECTS = ["Mathematical Methods", "Physics"]; // must match question_topics.subject exactly
const BOX_LABEL = ["Shaky", "Learning", "Improving", "Solid", "Mastered"];
const XP_PER_CORRECT = 10;
const XP_PER_BOX = 25;

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data?.session?.access_token || ""}` };
}

async function api(method, body) {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  const res = await fetch("/api/weak-topics", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json()).error || "Request failed");
  return res.json();
}

// generate needs some source "notes" text to write questions from — it's not
// a bare topic-only generator. A student practising a weak topic doesn't
// have fresh notes handy, so we hand it a short instruction block naming the
// topic and let the subject-area prompt (already in api/ai.js) do the rest.
// This costs one "gen" credit against the free-tier limit, same as any
// other generation — same cost surface, nothing new to protect.
function syntheticNotes(subject, topic) {
  return `VCE ${subject} — focused revision on the topic "${topic}". ` +
    `Write self-contained questions that test this topic specifically, ` +
    `at the standard of a real VCE exam question.`;
}

async function generatePractice(subject, topic) {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  const res = await fetch("/api/ai?op=generate", {
    method: "POST",
    headers,
    body: JSON.stringify({
      unitName: subject,
      notes: syntheticNotes(subject, topic),
      topics: [topic],
      weakTopics: [topic],
      difficulty: "medium",
      count: 3,
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Generation failed");
  const data = await res.json();
  const qs = data.questions || [];
  return qs.map((q, i) => ({ id: i, text: q.text, solution: q.solution, marks: q.marks }));
}

// Look up topics for a set of {paper_code, question_no} pairs directly
// against question_topics — same table your paper cards already read from.
async function fetchTopicsForPaper(paperCode) {
  const { data, error } = await supabase
    .from("question_topics")
    .select("question_no, section, topic, marks")
    .eq("paper_code", paperCode)
    .order("question_no");
  if (error) throw error;
  return data || [];
}

async function fetchPaperCodes(subject) {
  const { data, error } = await supabase
    .from("question_topics")
    .select("paper_code")
    .eq("subject", subject);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.paper_code))].sort();
}

async function fetchDistinctTopics(subject) {
  const { data, error } = await supabase
    .from("question_topics")
    .select("topic")
    .eq("subject", subject);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.topic))].sort();
}

export default function WeakTopics() {
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [topics, setTopics] = useState([]);      // distinct topics for this subject
  const [paperCodes, setPaperCodes] = useState([]); // paper_codes with rows in question_topics
  const [paperQuestions, setPaperQuestions] = useState([]); // [{question_no, topic}] for selected paper
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("dashboard"); // dashboard | log | practice
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // log state
  const [paper, setPaper] = useState("");
  const [ticked, setTicked] = useState({});

  // practice state
  const [practiceTopic, setPracticeTopic] = useState("");
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionResults, setSessionResults] = useState([]);

  useEffect(() => {
    setError("");
    Promise.all([fetchDistinctTopics(subject), fetchPaperCodes(subject)])
      .then(([t, codes]) => {
        setTopics(t);
        setPaperCodes(codes);
        setPaper(codes[0] || "");
        if (!t.length) setError(`No question_topics rows for "${subject}" yet`);
      })
      .catch((e) => setError(e.message));
    api("GET").then((d) => setRows(d.rows)).catch((e) => setError(e.message));
  }, [subject]);

  useEffect(() => {
    if (!paper) { setPaperQuestions([]); return; }
    fetchTopicsForPaper(paper).then(setPaperQuestions).catch((e) => setError(e.message));
  }, [paper]);

  const subjectRows = useMemo(
    () => rows.filter((r) => r.subject === subject),
    [rows, subject]
  );

  const stats = useMemo(() => {
    const byTopic = Object.fromEntries(subjectRows.map((r) => [r.topic, r]));
    const today = new Date().toISOString().slice(0, 10);
    const due = subjectRows.filter((r) => r.next_due <= today && r.box < 4);
    const tracked = topics.filter((t) => byTopic[t]);
    const masteryPct = topics.length
      ? Math.round((topics.reduce((s, t) => s + (byTopic[t]?.box || 0), 0) / (topics.length * 4)) * 100)
      : 0;
    const xp = subjectRows.reduce((s, r) => s + r.correct * XP_PER_CORRECT + r.box * XP_PER_BOX, 0);
    const bestStreak = Math.max(0, ...subjectRows.map((r) => r.streak));
    return { topics, byTopic, due, tracked, masteryPct, xp, bestStreak };
  }, [topics, subjectRows]);

  async function saveWrong() {
    const entries = Object.keys(ticked)
      .filter((qn) => ticked[qn])
      .map((qn) => ({ paper_code: paper, question_no: qn }));
    if (!entries.length) return;
    setBusy(true); setError("");
    try {
      await api("POST", { action: "log_wrong", subject, entries });
      const d = await api("GET");
      setRows(d.rows);
      setTicked({});
      setTab("dashboard");
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function startPractice(topic) {
    setBusy(true); setError(""); setQuestions([]); setSessionResults([]);
    setPracticeTopic(topic); setQIndex(0); setRevealed(false); setTab("practice");
    try {
      setQuestions(await generatePractice(subject, topic));
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function markSelf(correct) {
    setSessionResults((s) => [...s, correct]);
    setRevealed(false);
    setQIndex((i) => i + 1);
    try {
      await api("POST", { action: "result", subject, topic: practiceTopic, correct });
      const d = await api("GET");
      setRows(d.rows);
    } catch (e) { setError(e.message); }
  }

  const q = questions[qIndex];

  return (
    <div className="wt">
      <style>{CSS}</style>

      <header className="wt-head">
        <div>
          <h1>Weak Topic Tracker</h1>
          <p className="wt-sub">Mark what you got wrong. Practise it until it isn't.</p>
        </div>
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </header>

      <div className="wt-scoreboard">
        <div className="wt-score-main">
          <div className="wt-mastery-bar"><div style={{ width: `${stats.masteryPct}%` }} /></div>
          <span className="wt-mastery-label">{stats.masteryPct}% mastered</span>
        </div>
        <div className="wt-chips">
          <span className="wt-chip">⚡ {stats.xp} XP</span>
          <span className="wt-chip">🔥 streak {stats.bestStreak}</span>
          <span className={`wt-chip ${stats.due.length ? "wt-chip-due" : ""}`}>
            {stats.due.length ? `${stats.due.length} due today` : "all reviews done"}
          </span>
        </div>
      </div>

      <nav className="wt-tabs">
        {["dashboard", "log"].map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "log" ? "Log wrong questions" : "Dashboard"}
          </button>
        ))}
      </nav>

      {error && <div className="wt-error">{error}</div>}

      {tab === "dashboard" && (
        <div className="wt-panel">
          {!stats.tracked.length && (
            <div className="wt-empty">
              Sit a CramForge paper, mark it with the solutions, then log the questions
              you dropped marks on. Your weak topics show up here.
              <button className="wt-primary" onClick={() => setTab("log")}>Log a paper</button>
            </div>
          )}
          {stats.due.length > 0 && (
            <div className="wt-due-strip">
              <strong>Due for review:</strong>
              {stats.due.map((r) => (
                <button key={r.topic} className="wt-due-btn" onClick={() => startPractice(r.topic)}>
                  {r.topic} →
                </button>
              ))}
            </div>
          )}
          {stats.topics.map((t) => {
            const r = stats.byTopic[t];
            const box = r?.box || 0;
            return (
              <div key={t} className="wt-topic-row">
                <div className="wt-topic-info">
                  <span className="wt-topic-name">{t}</span>
                  <span className="wt-topic-meta">
                    {r ? `${BOX_LABEL[box]} · ${r.wrong} wrong · ${r.correct} correct` : "not tracked yet"}
                    {r?.streak >= 2 && ` · 🔥${r.streak}`}
                  </span>
                </div>
                <div className="wt-boxes">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`wt-box ${box > i ? "fill" : ""}`} />
                  ))}
                  {box === 4 && <span className="wt-stamp">MASTERED</span>}
                </div>
                {r && box < 4 && (
                  <button className="wt-practice-btn" onClick={() => startPractice(t)} disabled={busy}>
                    Practise
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "log" && (
        <div className="wt-panel">
          {!paperCodes.length ? (
            <p className="wt-loading">
              No papers with topic data for {subject} yet. Add rows to <code>question_topics</code> for
              a paper (see UPLOADING-NEW-PAPERS.md pattern you already use) and it'll show up here.
            </p>
          ) : (
            <>
              <label className="wt-label">Which paper did you sit?</label>
              <select value={paper} onChange={(e) => { setPaper(e.target.value); setTicked({}); }}>
                {paperCodes.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <label className="wt-label">Tick every question you dropped marks on</label>
              <div className="wt-qgrid">
                {paperQuestions.map(({ question_no, topic }) => (
                  <button
                    key={question_no}
                    className={`wt-q ${ticked[question_no] ? "wrong" : ""}`}
                    title={topic}
                    onClick={() => setTicked((s) => ({ ...s, [question_no]: !s[question_no] }))}
                  >
                    {question_no}
                  </button>
                ))}
              </div>
              <button className="wt-primary" onClick={saveWrong} disabled={busy || !Object.values(ticked).some(Boolean)}>
                {busy ? "Saving…" : `Save ${Object.values(ticked).filter(Boolean).length} wrong`}
              </button>
            </>
          )}
        </div>
      )}

      {tab === "practice" && (
        <div className="wt-panel">
          <div className="wt-practice-head">
            <h2>{practiceTopic}</h2>
            <button className="wt-quiet" onClick={() => setTab("dashboard")}>← back</button>
          </div>
          {busy && <p className="wt-loading">Writing you fresh questions…</p>}
          {!busy && q && (
            <div className="wt-question">
              <div className="wt-qnum">Question {qIndex + 1} of {questions.length}</div>
              <p className="wt-qtext">{q.text}</p>
              {!revealed ? (
                <button className="wt-primary" onClick={() => setRevealed(true)}>
                  Show solution
                </button>
              ) : (
                <>
                  <div className="wt-solution">{q.solution || "Compare against your working."}</div>
                  <p className="wt-honesty">Did you get it right? (Be honest — the bar only means something if you are.)</p>
                  <div className="wt-mark-row">
                    <button className="wt-mark right" onClick={() => markSelf(true)}>✓ Got it</button>
                    <button className="wt-mark wrongm" onClick={() => markSelf(false)}>✗ Missed it</button>
                  </div>
                </>
              )}
            </div>
          )}
          {!busy && !q && questions.length > 0 && (
            <div className="wt-done">
              <div className="wt-stamp big">
                {sessionResults.filter(Boolean).length}/{sessionResults.length}
              </div>
              <p>
                {sessionResults.every(Boolean)
                  ? "Clean sweep — box up. It'll come back for review in a few days."
                  : "Logged. This topic stays in today's queue until it sticks."}
              </p>
              <button className="wt-primary" onClick={() => startPractice(practiceTopic)}>Another round</button>
              <button className="wt-quiet" onClick={() => setTab("dashboard")}>Back to dashboard</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CSS = `
.wt { max-width: 780px; margin: 0 auto; padding: 24px 16px 64px; font-family: Inter, sans-serif; color: #1a1f2e;
  background-image: linear-gradient(rgba(120,140,180,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(120,140,180,.10) 1px, transparent 1px);
  background-size: 22px 22px; }
.wt-head { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom:16px; }
.wt-head h1 { font-family: Spectral, serif; font-size: 1.7rem; margin: 0; }
.wt-sub { margin: 2px 0 0; color:#5b6270; font-size:.9rem; }
.wt select { font-family:'IBM Plex Mono',monospace; padding:8px 10px; border:1.5px solid #1a1f2e; background:#fff; }
.wt-scoreboard { background:#fff; border:1.5px solid #1a1f2e; padding:14px; margin-bottom:14px; box-shadow:4px 4px 0 rgba(26,31,46,.15); }
.wt-mastery-bar { height:14px; border:1.5px solid #1a1f2e; background:#fff; }
.wt-mastery-bar div { height:100%; background:repeating-linear-gradient(45deg,#2f7d4f,#2f7d4f 6px,#3c9b63 6px,#3c9b63 12px); transition:width .5s; }
.wt-mastery-label { font-family:'IBM Plex Mono',monospace; font-size:.8rem; }
.wt-chips { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
.wt-chip { font-family:'IBM Plex Mono',monospace; font-size:.75rem; border:1px solid #1a1f2e; padding:2px 8px; background:#fff; }
.wt-chip-due { background:#c0392b; color:#fff; border-color:#c0392b; }
.wt-tabs { display:flex; gap:8px; margin-bottom:12px; }
.wt-tabs button { font-family:'IBM Plex Mono',monospace; padding:8px 14px; border:1.5px solid #1a1f2e; background:#fff; cursor:pointer; }
.wt-tabs button.on { background:#1a1f2e; color:#fff; }
.wt-panel { background:#fff; border:1.5px solid #1a1f2e; padding:18px; box-shadow:4px 4px 0 rgba(26,31,46,.15); }
.wt-error { background:#fdecea; border:1.5px solid #c0392b; color:#c0392b; padding:10px; margin-bottom:12px; font-size:.9rem; }
.wt-empty { text-align:center; padding:24px 12px; color:#5b6270; display:flex; flex-direction:column; gap:14px; align-items:center; }
.wt-topic-row { display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px dashed #b8c0cf; }
.wt-topic-info { flex:1; min-width:0; }
.wt-topic-name { display:block; font-weight:600; }
.wt-topic-meta { font-size:.78rem; color:#5b6270; font-family:'IBM Plex Mono',monospace; }
.wt-boxes { display:flex; gap:4px; align-items:center; }
.wt-box { width:16px; height:16px; border:1.5px solid #1a1f2e; background:#fff; }
.wt-box.fill { background:#2f7d4f; }
.wt-stamp { font-family:'IBM Plex Mono',monospace; font-weight:700; color:#2f7d4f; border:2px solid #2f7d4f; padding:1px 6px; font-size:.7rem; transform:rotate(-4deg); }
.wt-stamp.big { font-size:2rem; padding:6px 18px; display:inline-block; margin-bottom:8px; color:#c0392b; border-color:#c0392b; }
.wt-practice-btn, .wt-due-btn { font-family:'IBM Plex Mono',monospace; border:1.5px solid #1a1f2e; background:#fff; padding:5px 10px; cursor:pointer; font-size:.8rem; }
.wt-practice-btn:hover, .wt-due-btn:hover { background:#1a1f2e; color:#fff; }
.wt-due-strip { display:flex; gap:8px; align-items:center; flex-wrap:wrap; background:#fff8e6; border:1.5px dashed #b8860b; padding:10px; margin-bottom:14px; font-size:.85rem; }
.wt-label { display:block; font-family:'IBM Plex Mono',monospace; font-size:.8rem; margin:14px 0 6px; }
.wt-qgrid { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:16px; }
.wt-q { width:44px; height:38px; border:1.5px solid #1a1f2e; background:#fff; font-family:'IBM Plex Mono',monospace; cursor:pointer; }
.wt-q.wrong { background:#c0392b; color:#fff; border-color:#c0392b; text-decoration:line-through; }
.wt-primary { font-family:'IBM Plex Mono',monospace; background:#1a1f2e; color:#fff; border:1.5px solid #1a1f2e; padding:10px 18px; cursor:pointer; }
.wt-primary:disabled { opacity:.4; cursor:default; }
.wt-quiet { background:none; border:none; color:#5b6270; cursor:pointer; font-family:'IBM Plex Mono',monospace; padding:8px; }
.wt-practice-head { display:flex; justify-content:space-between; align-items:center; }
.wt-practice-head h2 { font-family:Spectral,serif; margin:0; }
.wt-loading { font-family:'IBM Plex Mono',monospace; color:#5b6270; }
.wt-qnum { font-family:'IBM Plex Mono',monospace; font-size:.75rem; color:#5b6270; margin-bottom:6px; }
.wt-qtext { font-size:1.02rem; line-height:1.55; white-space:pre-wrap; }
.wt-solution { border-left:3px solid #c0392b; padding:10px 12px; background:#fdf7f6; color:#7a2318; margin:12px 0; white-space:pre-wrap; font-size:.95rem; }
.wt-honesty { font-size:.8rem; color:#5b6270; }
.wt-mark-row { display:flex; gap:10px; }
.wt-mark { flex:1; padding:12px; font-family:'IBM Plex Mono',monospace; font-size:1rem; border:1.5px solid; cursor:pointer; background:#fff; }
.wt-mark.right { color:#2f7d4f; border-color:#2f7d4f; }
.wt-mark.right:hover { background:#2f7d4f; color:#fff; }
.wt-mark.wrongm { color:#c0392b; border-color:#c0392b; }
.wt-mark.wrongm:hover { background:#c0392b; color:#fff; }
.wt-done { text-align:center; padding:20px 0; display:flex; flex-direction:column; gap:10px; align-items:center; }
@media (max-width:560px){ .wt-topic-row{flex-wrap:wrap;} .wt-boxes{order:3;} }
`;
