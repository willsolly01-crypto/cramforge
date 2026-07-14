// lib/_claude.js — Anthropic API helper + request utilities.
// Reconstructed to match every call site across the API routes.
//
// Exports:
//   callClaude(content, maxTokens, model) → string   (the model's text reply)
//   readBody(req)                          → parsed JSON body (object)
//   parseJson(text)                        → object   (tolerant JSON parse)
//   MODEL_FAST, MODEL_SMART                → model id strings

export const MODEL_FAST = "claude-sonnet-4-6";
export const MODEL_SMART = "claude-opus-4-8";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Read and JSON-parse a request body, whether or not Vercel already parsed it.
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  // Fall back to reading the raw stream.
  const raw = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Call the Anthropic Messages API and return the concatenated text output.
// `content` is a message content array (text and/or document/image blocks).
export async function callClaude(content, maxTokens = 1500, model = MODEL_FAST) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    // Surface rate limits / overload as a retryable-ish message.
    if (resp.status === 429) {
      const e = new Error("The AI is busy right now — please try again in a moment.");
      e.status = 429;
      throw e;
    }
    throw new Error(`AI request failed (${resp.status}): ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  // Concatenate all text blocks in the response.
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  if (!text) throw new Error("The AI returned an empty response — please try again.");
  return text;
}

// Tolerant JSON parser for model output: strips markdown fences and grabs the
// outermost {...} if the model wrapped it in prose.
export function parseJson(text) {
  if (!text) throw new Error("Empty response from AI.");
  let s = String(text).trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  try {
    return JSON.parse(s);
  } catch {
    // Fall back to the first balanced-looking object.
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = s.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        /* fall through */
      }
    }
    throw new Error("The AI response wasn't valid JSON — please try again.");
  }
}
