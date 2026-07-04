// Thin raw-fetch wrapper for the Anthropic Messages API.
// Raw fetch (not the SDK) on purpose — it matches the existing chat
// function and the repo's documented stack. Callers pass the resolved
// model from _shared/models.ts; this module never chooses a model.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeCallOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: ClaudeMessage[];
  maxTokens: number;
}

export interface ClaudeCallResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function callClaude(
  opts: ClaudeCallOptions,
): Promise<ClaudeCallResult> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: opts.messages,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const text: string =
    data?.content?.[0]?.type === "text" ? data.content[0].text : "";
  if (!text) {
    throw new Error("Anthropic API returned an empty reply");
  }

  return {
    text,
    inputTokens:
      typeof data?.usage?.input_tokens === "number"
        ? data.usage.input_tokens
        : null,
    outputTokens:
      typeof data?.usage?.output_tokens === "number"
        ? data.usage.output_tokens
        : null,
  };
}

// Pull the first JSON object out of a model reply, tolerating markdown
// fences and prose around it. Returns null when nothing parses — callers
// own the malformed-output handling (log raw, return a retryable error).
export function extractFirstJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  for (const candidate of [unfenced, trimmed]) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      continue;
    }
  }
  return null;
}
