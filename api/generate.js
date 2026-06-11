import { callClaude, parseJson, readBody } from "./_claude.js";
import { requireUser, checkAndCount, sendErr } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const auth = await requireUser(req);
    await checkAndCount(auth, "gen");
    const { unitName, notes, topics, difficulty, count, weakTopics, examMode } =
      await readBody(req);

    if (!notes) return res.status(400).json({ error: "No unit notes provided." });

    const n = Math.min(Math.max(Number(count) || 3, 1), examMode ? 10 : 5);

    const prompt = `You are an experienced university examiner writing practice questions for the unit "${unitName}".

COURSE NOTES (generate questions strictly from this content):
${notes}

REQUIREMENTS:
- Generate exactly ${n} exam-style questions.
- Topics to draw from: ${topics && topics.length ? topics.join(", ") : "any topic in the notes"}.
${weakTopics && weakTopics.length ? `- The student is weak on: ${weakTopics.join(", ")}. Bias at least half the questions toward these.` : ""}
- Difficulty: ${difficulty || "medium"} (easy = single concept, medium = multi-step, hard = multi-concept exam finisher).
- Each question must be fully self-contained and answerable with pen and paper.
- Write a complete worked solution with every step shown, in the style of a model answer.
- Assign realistic marks (2–10 per question based on difficulty).
- Use plain text math notation (e.g. x^2, integral of, sqrt(), matrices as rows) — no LaTeX.

Respond with ONLY a JSON object, no markdown fences:
{"questions": [{"topic": "topic name", "marks": number, "text": "the full question", "solution": "complete worked solution with steps"}]}`;

    const out = await callClaude([{ type: "text", text: prompt }], 6000);
    const parsed = parseJson(out);
    return res.status(200).json(parsed);
  } catch (e) {
    return sendErr(res, e);
  }
}
