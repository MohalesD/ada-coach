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

// ── Web-search-grounded call (Run 2, market grounding) ────────────────────
// Same raw-fetch discipline as callClaude, plus the Anthropic web search
// server tool (web_search_20260209 — the variant Sonnet 4.6 supports).
// The server runs the search loop; we parse text, citations, the sources
// each search returned, and the queries issued (the PRD's audit trail
// wants the query stored next to each citation). stop_reason "pause_turn"
// means the server-side loop hit its iteration cap — continue by echoing
// the assistant content back, bounded so a wedged loop can't burn money.

const MAX_PAUSE_TURN_CONTINUATIONS = 3;

export interface WebSearchCitation {
  url: string;
  title: string | null;
  citedText: string | null;
}

export interface WebSearchSource {
  url: string;
  title: string | null;
}

export interface ClaudeWebSearchResult {
  text: string;
  citations: WebSearchCitation[];
  sources: WebSearchSource[];
  queries: string[];
  webSearchRequests: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface ClaudeWebSearchOptions {
  apiKey: string;
  model: string;
  system: string;
  messages: ClaudeMessage[];
  maxTokens: number;
  maxSearches?: number;
}

type RawBlock = Record<string, unknown>;

function collectFromContent(
  content: unknown,
  out: {
    textParts: string[];
    citations: WebSearchCitation[];
    sources: WebSearchSource[];
    queries: string[];
  },
): void {
  if (!Array.isArray(content)) return;
  for (const block of content as RawBlock[]) {
    if (block?.type === "text" && typeof block.text === "string") {
      out.textParts.push(block.text);
      if (Array.isArray(block.citations)) {
        for (const c of block.citations as RawBlock[]) {
          if (typeof c?.url === "string") {
            out.citations.push({
              url: c.url,
              title: typeof c.title === "string" ? c.title : null,
              citedText: typeof c.cited_text === "string" ? c.cited_text : null,
            });
          }
        }
      }
    } else if (block?.type === "server_tool_use") {
      const input = block.input as RawBlock | undefined;
      if (typeof input?.query === "string") out.queries.push(input.query);
    } else if (block?.type === "web_search_tool_result") {
      // Success: content is a LIST of web_search_result. Error: content is
      // an OBJECT with error_code — treated as zero results, never fatal.
      if (Array.isArray(block.content)) {
        for (const r of block.content as RawBlock[]) {
          if (r?.type === "web_search_result" && typeof r.url === "string") {
            out.sources.push({
              url: r.url,
              title: typeof r.title === "string" ? r.title : null,
            });
          }
        }
      } else {
        const err = (block.content as RawBlock | undefined)?.error_code;
        if (err) console.error("web_search_tool_result error:", err);
      }
    }
  }
}

export async function callClaudeWithWebSearch(
  opts: ClaudeWebSearchOptions,
): Promise<ClaudeWebSearchResult> {
  const searchBudget = opts.maxSearches ?? 5;

  // Content may be raw block arrays once we echo assistant turns back.
  const messages: Array<{ role: string; content: unknown }> = [
    ...opts.messages,
  ];

  const acc = {
    textParts: [] as string[],
    citations: [] as WebSearchCitation[],
    sources: [] as WebSearchSource[],
    queries: [] as string[],
  };
  let webSearchRequests = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  for (let turn = 0; turn <= MAX_PAUSE_TURN_CONTINUATIONS; turn++) {
    // Run 5 cost-cap ledger: our own count is authoritative. Each
    // continuation gets only the budget that remains after searches
    // already consumed, and a paused turn with nothing left is not
    // continued — the cap must hold even in a pathological pause loop.
    const remainingSearches = searchBudget - webSearchRequests;
    if (turn > 0 && remainingSearches <= 0) break;
    const tools = [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: Math.max(1, remainingSearches),
      },
    ];

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
        tools,
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    collectFromContent(data?.content, acc);

    if (typeof data?.usage?.input_tokens === "number") {
      inputTokens = (inputTokens ?? 0) + data.usage.input_tokens;
    }
    if (typeof data?.usage?.output_tokens === "number") {
      outputTokens = (outputTokens ?? 0) + data.usage.output_tokens;
    }
    if (typeof data?.usage?.server_tool_use?.web_search_requests === "number") {
      webSearchRequests += data.usage.server_tool_use.web_search_requests;
    }

    if (data?.stop_reason !== "pause_turn") break;
    // Server paused mid-loop: echo the assistant content and continue.
    messages.push({ role: "assistant", content: data.content });
  }

  // Dedupe sources by URL, keeping first occurrence order.
  const seen = new Set<string>();
  const sources = acc.sources.filter((s) =>
    seen.has(s.url) ? false : (seen.add(s.url), true)
  );

  return {
    text: acc.textParts.join("\n").trim(),
    citations: acc.citations,
    sources,
    queries: acc.queries,
    webSearchRequests,
    inputTokens,
    outputTokens,
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
