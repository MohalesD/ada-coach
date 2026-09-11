// Thin raw-fetch wrapper for the Anthropic Messages API.
// Raw fetch (not the SDK) on purpose — it matches the existing chat
// function and the repo's documented stack. Callers pass the resolved
// model from _shared/models.ts; this module never chooses a model.
//
// callClaude bounds every request and retries once on a fault that a second
// attempt can plausibly fix. Before that it did neither, and on 2026-09-11 a
// single hung request cost a user their whole arrival experience:
//
//   04:19:03  bridge-intake starts Ada's first read on a new sprint
//   04:19:56  kickoff coach turn failed: Anthropic API 500
//   04:19:57  201 returned, sprint created, no first read
//
// 53 seconds inside one fetch, then a 500 carrying
// {"type":"timeout_error","message":"Request timeout"}. The same fault hit the
// user's next turn 100 seconds later. Their third attempt succeeded in 6
// seconds, which is the number that matters: the fault was transient, and a
// retry would have cleared it invisibly. Nothing was retried because nothing
// could be — there was no timeout to trip and no retry to trip it.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * How long one attempt may run before it is abandoned.
 *
 * 20s is above the p99 of a normal coaching turn (measured 5-7s for Haiku on
 * a sprint intake) and well under the edge gateway's own idle limit, so a hung
 * request fails while there is still budget left to try again.
 */
export const REQUEST_TIMEOUT_MS = 20_000;

/** Total attempts, not retries. 2 means one retry. */
export const MAX_ATTEMPTS = 2;

/** Wait before the second attempt. Short: the caller is usually blocking. */
export const RETRY_DELAY_MS = 600;

/**
 * Whether a failed attempt is worth repeating.
 *
 * Retry a timeout (ours or theirs), a rate limit, and any 5xx: all of those
 * are the server or the network having a bad moment. Never retry another 4xx
 * — a malformed request, a bad key or a blocked model is not going to
 * succeed on the second try, and repeating it just doubles the latency before
 * the caller finds out.
 *
 * `status` is null when the attempt never got a response at all (aborted by
 * our own timeout, or the socket failed), which is the exact case that
 * produced the 53-second hang.
 */
export function isRetryableFailure(status: number | null): boolean {
  if (status === null) return true;
  return status === 408 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  /** Per-attempt budget. Defaults to REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Total attempts including the first. Defaults to MAX_ATTEMPTS. */
  maxAttempts?: number;
}

export interface ClaudeCallResult {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** One bounded attempt. Throws with `status` attached when there was one. */
async function attemptClaude(
  opts: ClaudeCallOptions,
  timeoutMs: number,
): Promise<ClaudeCallResult> {
  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
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
      // The whole point: a request that never answers now ends on our clock
      // rather than theirs.
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // No response at all: our abort, or the socket died. Both are retryable,
    // which `status: null` signals to the loop below.
    const wrapped = new Error(
      `Anthropic API request failed after ${timeoutMs}ms: ${
        err instanceof Error ? err.message : String(err)
      }`,
    ) as Error & { status: number | null };
    wrapped.status = null;
    throw wrapped;
  }

  if (!res.ok) {
    const errBody = await res.text();
    const wrapped = new Error(
      `Anthropic API ${res.status}: ${errBody}`,
    ) as Error & { status: number | null };
    wrapped.status = res.status;
    throw wrapped;
  }

  const data = await res.json();
  const text: string =
    data?.content?.[0]?.type === "text" ? data.content[0].text : "";
  if (!text) {
    // An empty reply is a successful HTTP call with nothing in it. Retrying is
    // reasonable (it is usually a truncation or a content filter), so it is
    // marked retryable the same way a dropped socket is.
    const wrapped = new Error("Anthropic API returned an empty reply") as Error & {
      status: number | null;
    };
    wrapped.status = null;
    throw wrapped;
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

/**
 * Call Claude, bounded and retried once on a transient fault.
 *
 * The error thrown on final failure keeps the old shape (`Anthropic API 500:
 * …`), so every existing catch site, and the non-fatal kickoff path that reads
 * it, behaves exactly as before. What changed is how long it takes to get
 * there and how often it happens at all.
 */
export async function callClaude(
  opts: ClaudeCallOptions,
): Promise<ClaudeCallResult> {
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? MAX_ATTEMPTS);

  let lastError: Error = new Error("Anthropic API call never ran");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await attemptClaude(opts, timeoutMs);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (lastError as Error & { status?: number | null }).status ?? null;
      const isLast = attempt === maxAttempts;
      if (isLast || !isRetryableFailure(status)) throw lastError;
      console.warn(
        `Anthropic API attempt ${attempt}/${maxAttempts} failed (status ${
          status ?? "none"
        }); retrying in ${RETRY_DELAY_MS}ms:`,
        lastError.message,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw lastError;
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
  // Each pause_turn continuation is a full extra model turn (60–120s).
  // Latency-sensitive callers (Run 5 intel, behind the edge gateway's
  // 150s idle timeout) bound this below the default of 3.
  maxContinuations?: number;
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
  const maxContinuations = Math.min(
    opts.maxContinuations ?? MAX_PAUSE_TURN_CONTINUATIONS,
    MAX_PAUSE_TURN_CONTINUATIONS,
  );

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

  for (let turn = 0; turn <= maxContinuations; turn++) {
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
