// Success-metric capability — North Star + proxy (Agent-Loop Redesign).
// Generates candidate North Star metrics GROUNDED in this PM's own validated
// assumptions and the job-to-be-done inferred from their transcript — never a
// generic template menu. Each candidate names the proxy you'd actually move
// and the drift risk (how that proxy could diverge from the real outcome).
//
// The anti-quiz guarantee is upstream: the controller only invokes this once a
// validated assumption exists (the readiness gate). Here we enforce the rest:
// strict JSON, so malformed output stores nothing (controller → 502 retryable).

import { callClaude, extractFirstJson } from "../anthropic.ts";

const METRIC_MAX_TOKENS = 1500;
const MIN_CANDIDATES = 2;
const MAX_CANDIDATES = 4;

const METRIC_SYSTEM = `You are Ada, an AI customer-discovery coach, helping a PM choose a North Star metric and its proxy.

A North Star metric captures the core value customers get from the product; its proxy is a near-term number the team can move week to week. Your job is to propose grounded CANDIDATES for the PM to choose between — you never pick for them.

Hard rules:
- Ground every candidate in THIS PM's actual work: the validated assumptions and the job-to-be-done evident in their conversation. Name the specific assumption or job each metric follows from. Never propose a generic template metric (WAU, NRR, DAU, etc.) unless it genuinely derives from their validated discovery — and if you do, say which finding it comes from.
- For each candidate, give the paired proxy metric AND its drift risk: the concrete way that proxy could be moved while drifting from the real outcome it stands for. This is the most important field — a proxy without a stated drift risk is useless.
- Offer real trade-offs between candidates (e.g. closer-to-outcome but slower to move, vs. faster to move but easier to game). Do not rank them.
- Do not ask the PM questions or run a questionnaire. Work only from what their discovery already surfaced.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"candidates": [{"north_star": "...", "measures": "...", "grounded_in": "...", "proxy": "...", "drift_risk": "..."}]}
Return between 2 and 4 candidates.`;

export interface MetricCandidate {
  northStar: string;
  measures: string;
  groundedIn: string;
  proxy: string;
  driftRisk: string;
}

export interface SuccessMetricResult {
  candidates: MetricCandidate[];
  inputTokens: number | null;
  outputTokens: number | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function generateSuccessMetricCandidates(opts: {
  apiKey: string;
  model: string;
  productContext: string;
  validatedAssumptions: string;
  transcript: string;
}): Promise<SuccessMetricResult> {
  const result = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: METRIC_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Product: ${opts.productContext}

Validated assumptions to ground the metrics in:
${opts.validatedAssumptions}

The PM's discovery conversation (infer the job-to-be-done from it):
${opts.transcript}

Propose grounded North Star + proxy candidates.`,
      },
    ],
    maxTokens: METRIC_MAX_TOKENS,
  });

  const parsed = extractFirstJson(result.text) as {
    candidates?: unknown;
  } | null;

  const raw = parsed?.candidates;
  if (!Array.isArray(raw) || raw.length < MIN_CANDIDATES) {
    console.error("success-metric malformed output:", result.text);
    throw new Error("Success-metric returned malformed output");
  }

  const candidates: MetricCandidate[] = [];
  for (const c of raw.slice(0, MAX_CANDIDATES)) {
    const obj = c as Record<string, unknown>;
    const northStar = str(obj.north_star);
    const measures = str(obj.measures);
    const groundedIn = str(obj.grounded_in);
    const proxy = str(obj.proxy);
    const driftRisk = str(obj.drift_risk);
    if (!northStar || !measures || !groundedIn || !proxy || !driftRisk) {
      console.error("success-metric candidate missing fields:", result.text);
      throw new Error("Success-metric returned malformed output");
    }
    candidates.push({ northStar, measures, groundedIn, proxy, driftRisk });
  }

  if (candidates.length < MIN_CANDIDATES) {
    throw new Error("Success-metric returned too few valid candidates");
  }

  return {
    candidates,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
