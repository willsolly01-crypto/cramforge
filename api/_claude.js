// Shared helper for calling the Anthropic API from serverless functions.
// The API key lives in the ANTHROPIC_API_KEY environment variable on Vercel —
// it is never exposed to the browser.

// Model constants — choose based on task complexity vs cost
export const MODEL_FAST = "claude-haiku-4-5-20251001";  // ~20x cheaper, great for generate/grade
export const MODEL_SMART = "claude-sonnet-4-6";          // more capable, keep for ingest/complex tasks

export async function callClaude(content, maxTokens = 4000, model = MODEL_SMART) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    // Log full details server-side but don't expose Anthropic internals to the client
    console.error(`Anthropic API error ${response.status}:`, errText);
    const err = new Error("AI service error — please try again in a moment.");
    err.status = response.status === 529 ? 503 : 502;
    throw err;
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text;
}

export function parseJson(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  // Tolerate stray text before/after the JSON object or array
  const start = Math.min(
    ...[clean.indexOf("{"), clean.indexOf("[")].filter((i) => i >= 0)
  );
  const end = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  return JSON.parse(clean.slice(start, end + 1));
}

export function readBody(req) {
  // Vercel parses JSON bodies automatically; this is a fallback for raw bodies.
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
