import { callClaude, parseJson, readBody } from "./_claude.js";
import { requireUser, checkAndCount, sendErr } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
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

    const out = await callClaude([{ type: "text", text: prompt }], 1500);
    const parsed = parseJson(out);
    return res.status(200).json(parsed);
  } catch (e) {
    return sendErr(res, e);
  }
}
