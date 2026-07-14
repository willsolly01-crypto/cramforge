// lib/_compress.js — note-compression utilities used before sending to the AI.
// Reconstructed to match call sites in generate.js.
//
// Exports:
//   truncateNotes(notes, maxChars?)          → string
//   focusOnWeakTopics(notes, weakTopics)     → string

const DEFAULT_MAX = 6000;

// Cap notes at a character budget without cutting mid-sentence where possible.
// This is the single biggest lever on token cost, so it runs on every gen.
export function truncateNotes(notes, maxChars = DEFAULT_MAX) {
  const text = String(notes || "").trim();
  if (text.length <= maxChars) return text;

  const slice = text.slice(0, maxChars);
  // Prefer to end on a sentence or paragraph boundary near the cut.
  const lastStop = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf(".\n"),
    slice.lastIndexOf("\n\n")
  );
  const cut = lastStop > maxChars * 0.6 ? slice.slice(0, lastStop + 1) : slice;
  return cut.trim() + "\n\n[...notes truncated for length...]";
}

// When the student has weak topics, surface paragraphs that mention them first,
// then backfill with the rest, all within the character budget. Keeps question
// generation biased toward what the student actually needs to practise.
export function focusOnWeakTopics(notes, weakTopics = [], maxChars = DEFAULT_MAX) {
  const text = String(notes || "").trim();
  if (!weakTopics.length || text.length <= maxChars) {
    return truncateNotes(text, maxChars);
  }

  // Split into paragraphs.
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const needles = weakTopics.map((t) => String(t).toLowerCase());
  const scored = paras.map((p) => {
    const lower = p.toLowerCase();
    const hits = needles.reduce((n, kw) => (kw && lower.includes(kw) ? n + 1 : n), 0);
    return { p, hits };
  });

  // Weak-topic paragraphs first (preserve original order within each group).
  const weak = scored.filter((s) => s.hits > 0).map((s) => s.p);
  const rest = scored.filter((s) => s.hits === 0).map((s) => s.p);

  let out = "";
  for (const para of [...weak, ...rest]) {
    if ((out + "\n\n" + para).length > maxChars) break;
    out += (out ? "\n\n" : "") + para;
  }

  return (out || truncateNotes(text, maxChars)).trim();
}
