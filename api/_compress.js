/**
 * _compress.js — Token cost reduction utilities for CramForge API routes.
 *
 * The main cost driver is sending full accumulated notes on every generate call.
 * These helpers trim and focus that context before it reaches Claude, cutting
 * input tokens per request without losing the content that matters.
 *
 * Typical savings vs sending raw notes:
 *   - Short notes (<8 000 chars): no change
 *   - Medium notes (8–30 000 chars): ~50–70% token reduction
 *   - Large notes (30 000+ chars): ~80–90% token reduction
 */

// Max characters to send as notes context on a generate call (~1 500 tokens).
// Increase if question quality drops for note-heavy units.
const MAX_NOTES_CHARS = 6000;

// When focusing on a specific topic, how much context to include.
const MAX_TOPIC_CHARS = 4000;

/**
 * Truncate notes to maxChars, breaking at the last sentence or paragraph
 * boundary so Claude doesn't receive a mid-sentence cut.
 */
export function truncateNotes(notes, maxChars = MAX_NOTES_CHARS) {
  if (!notes || notes.length <= maxChars) return notes;
  const slice = notes.slice(0, maxChars);
  // Prefer breaking at a paragraph, then sentence, then word
  const breakpoints = [
    slice.lastIndexOf("\n\n"),
    slice.lastIndexOf(".\n"),
    slice.lastIndexOf(". "),
    slice.lastIndexOf(" "),
  ];
  const best = breakpoints.find((i) => i > maxChars * 0.75);
  const trimmed = best !== undefined ? slice.slice(0, best + 1) : slice;
  return trimmed + "\n\n[Notes truncated — full content processed at ingest]";
}

/**
 * Build a focused context block for a specific topic by surfacing paragraphs
 * that mention it, then filling remaining space with other content.
 * Falls back to truncateNotes if no topic is provided.
 */
export function focusOnTopic(notes, topic, maxChars = MAX_TOPIC_CHARS) {
  if (!notes) return "";
  if (!topic) return truncateNotes(notes, maxChars);

  const topicLower = topic.toLowerCase();
  const paras = notes.split(/\n\n+/);
  const relevant = paras.filter((p) => p.toLowerCase().includes(topicLower));
  const other = paras.filter((p) => !p.toLowerCase().includes(topicLower));

  let context = relevant.join("\n\n");
  // Fill remaining budget with other paragraphs
  for (const para of other) {
    const next = context + "\n\n" + para;
    if (next.length > maxChars) break;
    context = next;
  }

  if (!context.trim()) return truncateNotes(notes, maxChars);
  return truncateNotes(context, maxChars);
}

/**
 * Focus on multiple weak topics at once. Useful in generate.js when
 * weakTopics is set — surfaces the most relevant paragraphs for each.
 */
export function focusOnWeakTopics(notes, weakTopics, maxChars = MAX_NOTES_CHARS) {
  if (!notes || !weakTopics || weakTopics.length === 0) {
    return truncateNotes(notes, maxChars);
  }

  const lowerTopics = weakTopics.map((t) => t.toLowerCase());
  const paras = notes.split(/\n\n+/);

  // Score each paragraph: +1 for each weak topic it mentions
  const scored = paras.map((p) => {
    const pl = p.toLowerCase();
    const score = lowerTopics.reduce((n, t) => n + (pl.includes(t) ? 1 : 0), 0);
    return { p, score };
  });

  // Sort: relevant paragraphs first
  scored.sort((a, b) => b.score - a.score);

  let context = "";
  for (const { p } of scored) {
    const next = context ? context + "\n\n" + p : p;
    if (next.length > maxChars) break;
    context = next;
  }

  return context || truncateNotes(notes, maxChars);
}

/**
 * Rough token estimate (English text ~4 chars/token).
 * Useful for logging or deciding whether to compress.
 */
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}
