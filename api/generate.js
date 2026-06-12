import { callClaude, parseJson, readBody, MODEL_FAST } from "./_claude.js";
import { requireUser, checkAndCount, sendErr } from "./_auth.js";
import { focusOnWeakTopics, truncateNotes } from "./_compress.js";

// Simple in-memory rate limiter for anonymous trial calls.
// Per-instance on Vercel (not shared across cold starts), but provides
// basic protection against unsophisticated scripted abuse.
// Limit: 3 anon questions per IP per hour.
const ANON_RATE = new Map();
const ANON_LIMIT = 3;
const ANON_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Subject-specific prompt additions — sharply reduces token waste from
// generic questions that don't match the discipline's exam format.
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

function getSubjectInstructions(subjectType) {
  return SUBJECT_PROMPTS[subjectType] || SUBJECT_PROMPTS.stem;
}

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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  // Anonymous trial: allow a few questions with no account (no token = anon path)
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    try {
      checkAnonRate(req);
      const { notes, unitName = "Your unit", topics, difficulty } = await readBody(req);
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

  try {
    const auth = await requireUser(req);
    await checkAndCount(auth, "gen");
    const { unitName, notes, topics, difficulty, count, weakTopics, examMode, subjectType } =
      await readBody(req);

    if (!notes) return res.status(400).json({ error: "No unit notes provided." });

    const n = Math.min(Math.max(Number(count) || 3, 1), examMode ? 10 : 5);

    // Compress notes before sending — biggest single lever for token cost reduction.
    // If the student has weak topics, surface those paragraphs first.
    const compressedNotes = weakTopics && weakTopics.length
      ? focusOnWeakTopics(notes, weakTopics)
      : truncateNotes(notes);

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
    const parsed = parseJson(out);
    return res.status(200).json(parsed);
  } catch (e) {
    return sendErr(res, e);
  }
}
