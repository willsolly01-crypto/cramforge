import { callClaude, parseJson, readBody, MODEL_FAST } from "./_claude.js";
import { requireUser, checkAndCount, sendErr } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const auth = await requireUser(req);
    await checkAndCount(auth, "ingest");
    const { text, pdfBase64, unitName } = await readBody(req);
    if (!text && !pdfBase64) {
      return res.status(400).json({ error: "Provide text or a PDF." });
    }
    // Reject oversized PDFs before touching the AI — ~7MB base64 ≈ 5MB file
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
    const parsed = parseJson(out);
    return res.status(200).json(parsed);
  } catch (e) {
    return sendErr(res, e);
  }
}
