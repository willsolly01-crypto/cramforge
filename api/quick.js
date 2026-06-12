// api/quick.js — Rapid MCQ generation for Quick Study mode
// Generates 5 multiple-choice questions from unit notes.
// Uses MODEL_FAST for speed. Standard gen rate-limiting applies.

import { requireUser, sendErr, checkAndCount } from "./_auth.js";
import { readBody, callClaude, parseJson, MODEL_FAST } from "./_claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const auth  = await requireUser(req);
    await checkAndCount(auth, "gen");

    const { notes, unitName, topics = [], count = 5 } = await readBody(req);
    if (!notes || !notes.trim()) {
      return res.status(400).json({ error: "No notes provided. Upload some course materials first." });
    }

    const topicHint = topics.length > 0
      ? `Prioritise these topics: ${topics.slice(0, 8).join(", ")}.`
      : "";

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

    const raw = await callClaude(
      [{ type: "text", text: prompt }],
      900,
      MODEL_FAST
    );

    const parsed = parseJson(raw);

    if (!Array.isArray(parsed?.questions) || !parsed.questions.length) {
      throw new Error("Model returned unexpected format — please try again.");
    }

    // Validate + sanitise each question
    const questions = parsed.questions.slice(0, n).map((q, i) => {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        throw new Error(`Question ${i + 1} has wrong number of options.`);
      }
      const ci = Number(q.correctIndex);
      if (ci < 0 || ci > 3 || !Number.isInteger(ci)) {
        throw new Error(`Question ${i + 1} has invalid correctIndex.`);
      }
      return {
        text:         String(q.text        || "").trim(),
        topic:        String(q.topic       || "General").trim(),
        options:      q.options.map((o) => String(o || "").trim()),
        correctIndex: ci,
        explanation:  String(q.explanation || "").trim(),
      };
    });

    return res.status(200).json({ questions });
  } catch (e) {
    return sendErr(res, e);
  }
}
