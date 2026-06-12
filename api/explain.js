// api/explain.js — Deep concept explanation after a wrong/partial answer.
// Pro-only. Counts as a "grade" usage (similar complexity).

import { callClaude, readBody, MODEL_FAST, MODEL_SMART } from "./_claude.js";
import { requireUser, checkAndCount, sendErr, httpErr } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const auth = await requireUser(req);

    // Pro-only feature
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

    // Use the smarter model for explanations — the extra quality is worth it
    const text = await callClaude(
      [{ type: "text", text: prompt }],
      900,
      MODEL_SMART
    );

    return res.status(200).json({ explanation: text.trim() });
  } catch (e) {
    return sendErr(res, e);
  }
}
