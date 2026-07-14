// api/ai.js — all AI operations behind one function to stay under Vercel's
// Hobby function limit. Dispatched by ?op=  (or body.op).
//
//   POST /api/ai?op=generate   → exam questions from notes  (anon trial allowed)
//   POST /api/ai?op=grade      → mark an attempt with partial credit
//   POST /api/ai?op=ingest     → extract topics + condensed notes from material
//   POST /api/ai?op=quick      → 5-question MCQ quiz
//   POST /api/ai?op=explain    → deep concept explanation (Pro only)

import { callClaude, parseJson, readBody, MODEL_FAST, MODEL_SMART } from "../lib/_claude.js";
import { requireUser, checkAndCount, sendErr, httpErr } from "../lib/_auth.js";
import { focusOnWeakTopics, truncateNotes } from "../lib/_compress.js";

// ── Anonymous trial rate limiter (generate only) ─────────────────────────────
const ANON_RATE = new Map();
const ANON_LIMIT = 3;
const ANON_WINDOW_MS = 60 * 60 * 1000;

const SUBJECT_PROMPTS = {
  stem: `- Use LaTeX notation for all mathematics: $...$ for inline math (e.g. $x^2 + 3x - 4 = 0$), $$...$$ for display equations (e.g. $$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$).
- Questions must be solvable with pen and paper (no computer required).
- Show every algebraic/calculus step in the worked solution, using $...$ and $$...$$ throughout.`,
  essay: `- Questions should require a structured written response (thesis + evidence + analysis).
- Each question must specify a word-count guide (e.g. "in approximately 400 words").
- The worked solution should be a model essay plan: thesis statement, 3 supporting arguments with evidence, a counter-argument, and a conclusion sentence.
- Avoid questions with a single correct factual answer — target analysis, comparison, or argument.`,
  law: `- Frame every question as a legal problem scenario (a set of facts the student must analyse).
- The student must apply the IRAC method: Issue, Rule, Application, Conclusion.
- The worked solution must follow IRAC explicitly, citing the relevant legal rule or statute by name.
- Each question should involve at least one contested element where the outcome isn't obvious.`,
  accounting: `- Questions must involve numerical calculations: journal entries, T-accounts, trial balances, ratios, or financial statement preparation.
- Provide all necessary figures in the question (no missing data).
- The worked solution must show every journal entry with debit/credit columns, or every ratio with the formula and substituted values.
- Specify what standard applies where relevant (AASB, IFRS, etc.).`,
  medicine: `- Frame questions as clinical scenarios: a patient presentation with relevant history, symptoms, and test results.
- Questions should target diagnosis, investigation, management, or pathophysiology.
- Worked solutions must explain the reasoning, not just the answer (e.g. why this diagnosis over the differentials).
- Avoid pure memorisation questions — favour applied clinical reasoning.`,
};
const getSubjectInstructions = (t) => SUBJECT_PROMPTS[t] || SUBJECT_PROMPTS.stem;

function checkAnonRate(req) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    "unknown";
  const now = Date.now();
  const entry = ANON_RATE.get(ip);
  if (!entry || now > entry.resetAt) {
    ANON_RATE.set(ip, { count: 1, resetAt: now + ANON_WINDOW_MS });
    return;
  }
  if (entry.count >= ANON_LIMIT) {
    const err = new Error("Sign up free to keep practising — it takes 30 seconds.");
    err.status = 429;
    throw err;
  }
  entry.count++;
}

// ── Operation handlers ───────────────────────────────────────────────────────

async function opGenerate(req, res) {
  // Anonymous trial path: a few questions, no account.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    try {
      checkAnonRate(req);
      const { notes, difficulty } = await readBody(req);
      if (!notes) return res.status(400).json({ error: "No notes provided." });
      const compressedNotes = truncateNotes(notes, 4000);
      const anonPrompt = `You are a university examiner. From the course notes below, write exactly 1 exam-style question with a full worked solution. Difficulty: ${difficulty || "medium"}.

COURSE NOTES:
${compressedNotes}

Respond with ONLY JSON, no markdown:
{"questions": [{"topic": "topic name", "marks": 5, "text": "full question", "solution": "complete worked solution"}]}`;
      const out = await callClaude([{ type: "text", text: anonPrompt }], 1200, MODEL_FAST);
      return res.status(200).json({ ...parseJson(out), anon: true });
    } catch (e) {
      return res.status(e.status || 500).json({ error: e.message || "Server error" });
    }
  }

  const auth = await requireUser(req);
  await checkAndCount(auth, "gen");
  const { unitName, notes, topics, difficulty, count, weakTopics, examMode, subjectType } =
    await readBody(req);
  if (!notes) return res.status(400).json({ error: "No unit notes provided." });

  const n = Math.min(Math.max(Number(count) || 3, 1), examMode ? 10 : 5);
  const compressedNotes =
    weakTopics && weakTopics.length ? focusOnWeakTopics(notes, weakTopics) : truncateNotes(notes);

  const prompt = `You are an experienced university examiner writing practice questions for the unit "${unitName}".

COURSE NOTES (generate questions strictly from this content):
${compressedNotes}

REQUIREMENTS:
- Generate exactly ${n} exam-style questions.
- Topics to draw from: ${topics && topics.length ? topics.join(", ") : "any topic in the notes"}.
${weakTopics && weakTopics.length ? `- The student is weak on: ${weakTopics.join(", ")}. Bias at least half the questions toward these.` : ""}
- Difficulty: ${difficulty || "medium"} (easy = single concept, medium = multi-step, hard = multi-concept exam finisher).
- Each question must be fully self-contained and solvable without external resources.
- Write a complete worked solution with every step shown, in the style of a model answer.
- Assign realistic marks (2–10 per question based on difficulty).
${getSubjectInstructions(subjectType || "stem")}

Respond with ONLY a JSON object, no markdown fences:
{"questions": [{"topic": "topic name", "marks": number, "text": "the full question", "solution": "complete worked solution with steps"}]}`;

  const out = await callClaude([{ type: "text", text: prompt }], 2500, MODEL_FAST);
  return res.status(200).json(parseJson(out));
}

async function opGrade(req, res) {
  const auth = await requireUser(req);
  await checkAndCount(auth, "grade");
  const { question, solution, marks, attempt } = await readBody(req);
  if (!question || !attempt) {
    return res.status(400).json({ error: "Question and attempt are required." });
  }

  const prompt = `You are a fair but rigorous university examiner marking one student attempt.

QUESTION (worth ${marks} marks):
${question}

MODEL SOLUTION:
${solution}

STUDENT'S ATTEMPT:
${attempt}

Mark the attempt with partial credit:
- Award method marks where the approach is correct even if arithmetic slips.
- Identify the specific point where the attempt diverges from a correct path, if it does.
- Classify the primary error if any: "concept" (wrong method), "algebra" (manipulation slip), "arithmetic" (calculation slip), "incomplete" (right path, didn't finish), or "none" (fully correct).
- Feedback must be specific and actionable, addressed to the student, 2–4 sentences.

Respond with ONLY a JSON object, no markdown fences:
{"score": number, "maxMarks": ${marks}, "errorType": "concept"|"algebra"|"arithmetic"|"incomplete"|"none", "feedback": "specific feedback", "verdict": "correct"|"partial"|"incorrect"}`;

  const out = await callClaude([{ type: "text", text: prompt }], 700, MODEL_FAST);
  return res.status(200).json(parseJson(out));
}

async function opIngest(req, res) {
  const auth = await requireUser(req);
  await checkAndCount(auth, "ingest");
  const { text, pdfBase64, unitName } = await readBody(req);
  if (!text && !pdfBase64) return res.status(400).json({ error: "Provide text or a PDF." });
  if (pdfBase64 && pdfBase64.length > 7_000_000) {
    return res.status(413).json({ error: "PDF too large. Please use files under 5MB, or paste the text instead." });
  }

  const instruction = `You are analysing course material for the university unit "${unitName || "Unknown unit"}" so an exam-practice app can generate questions from it.

From the material provided:
1. Extract a list of distinct, examinable topics (5–20 topics, short names).
2. Write condensed study notes that preserve every formula, method, definition, and worked-example pattern needed to generate exam questions later. Be thorough but compact — these notes are the only thing kept.

Respond with ONLY a JSON object, no markdown fences:
{"topics": ["topic 1", "topic 2", ...], "notes": "condensed notes as a single string", "materialTitle": "short descriptive title for this material"}`;

  const content = [];
  if (pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    });
  }
  content.push({
    type: "text",
    text: pdfBase64 ? instruction : `${instruction}\n\n--- MATERIAL ---\n${text}`,
  });

  const out = await callClaude(content, 3000, MODEL_FAST);
  return res.status(200).json(parseJson(out));
}

async function opQuick(req, res) {
  const auth = await requireUser(req);
  await checkAndCount(auth, "gen");
  const { notes, unitName, topics = [], count = 5 } = await readBody(req);
  if (!notes || !notes.trim()) {
    return res.status(400).json({ error: "No notes provided. Upload some course materials first." });
  }

  const topicHint = topics.length > 0 ? `Prioritise these topics: ${topics.slice(0, 8).join(", ")}.` : "";
  const n = Math.min(10, Math.max(1, Number(count) || 5));

  const prompt = `You are generating a quick ${n}-question multiple-choice quiz for "${unitName || "this subject"}".

${topicHint}

SOURCE MATERIAL:
${notes.slice(0, 4500)}

RULES:
- Generate exactly ${n} questions.
- Each question has exactly 4 options (A–D), only ONE correct.
- Test genuine understanding — not just recall of a single phrase.
- Vary topics across the material. Do not repeat the same concept.
- Distractors should be plausible (not obviously wrong).
- Explanation: one clear sentence explaining WHY the correct answer is right.

Return ONLY valid JSON — no markdown fences, no commentary — in exactly this shape:
{
  "questions": [
    {
      "text": "Full question text?",
      "topic": "Short topic label",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctIndex": 0,
      "explanation": "One sentence explaining the correct answer."
    }
  ]
}`;

  const raw = await callClaude([{ type: "text", text: prompt }], 900, MODEL_FAST);
  const parsed = parseJson(raw);

  if (!Array.isArray(parsed?.questions) || !parsed.questions.length) {
    throw new Error("Model returned unexpected format — please try again.");
  }

  const questions = parsed.questions.slice(0, n).map((q, i) => {
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      throw new Error(`Question ${i + 1} has wrong number of options.`);
    }
    const ci = Number(q.correctIndex);
    if (ci < 0 || ci > 3 || !Number.isInteger(ci)) {
      throw new Error(`Question ${i + 1} has invalid correctIndex.`);
    }
    return {
      text: String(q.text || "").trim(),
      topic: String(q.topic || "General").trim(),
      options: q.options.map((o) => String(o || "").trim()),
      correctIndex: ci,
      explanation: String(q.explanation || "").trim(),
    };
  });

  return res.status(200).json({ questions });
}

async function opExplain(req, res) {
  const auth = await requireUser(req);
  if (auth.profile.plan !== "pro") {
    throw httpErr(402, "The Explain feature is available to Pro users — upgrade in the Account tab to unlock deep concept explanations.");
  }
  await checkAndCount(auth, "grade"); // same cost tier as grading

  const { question, attempt, solution, topic } = await readBody(req);
  if (!question) return res.status(400).json({ error: "Question is required." });

  const prompt = `You are an expert university tutor helping a student who got this question wrong or partially wrong.

QUESTION:
${question}

STUDENT'S ATTEMPT:
${attempt || "(no attempt provided)"}

MODEL SOLUTION:
${solution || "(no solution provided)"}

${topic ? `TOPIC: ${topic}` : ""}

Your job is NOT to just repeat the answer. Write a deep conceptual explanation that:

1. **What went wrong** (1–2 sentences): Identify the specific misconception or gap in the student's attempt. Be precise — "algebra error on line 3" or "confused the definition of X with Y".

2. **The core concept** (3–4 sentences): Explain the underlying principle from first principles, as if the student has never encountered it before. Build up from basics.

3. **Why it matters / how to think about it** (2–3 sentences): Give 1–2 real-world examples or intuitive analogies that make the concept stick. The goal is for the student to truly understand, not just memorise.

4. **Exam technique** (1–2 sentences): Give a specific tip for approaching this type of question in an exam — a mental checklist, a common pitfall to avoid, or a pattern to recognise.

Write in warm, direct prose. Use plain text (no markdown). Aim for ~280–320 words. Be encouraging but accurate — don't soften errors that need to be understood clearly.`;

  const text = await callClaude([{ type: "text", text: prompt }], 900, MODEL_SMART);
  return res.status(200).json({ explanation: text.trim() });
}

// ── Router ───────────────────────────────────────────────────────────────────
const OPS = {
  generate: opGenerate,
  grade: opGrade,
  ingest: opIngest,
  quick: opQuick,
  explain: opExplain,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

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
