// Haiku intake router classifier (Run 4, PRD "RUN 4: User routing").
// Classifies free-text answers to 2-4 fixed intake questions into a
// persona + recommended track. Stateless — no table backs this; the
// caller returns the decision, the client owns navigation. Business
// rule: contradictory or thin answers never get silently guessed —
// they resolve to recommendedTrack "both".

import { callClaude, extractFirstJson } from "./anthropic.ts";

const ROUTER_SYSTEM = `You are a routing classifier for Ada, an AI product coach. Ada serves two kinds of people:
- "aspiring_pm": no PM title yet, working toward one, wants to build a portfolio artifact (a PRD, product brief, or prototype spec) that proves they can think like a PM.
- "early_stage_pm": already doing PM work on a live product, feature, or idea and needs discovery coaching (pressure-testing assumptions, planning customer interviews).

Given short answers to a few intake questions, decide which track fits:
- "portfolio": clearly an aspiring PM building toward a role.
- "discovery": clearly an early-stage PM with a real product/feature/idea to pressure-test.
- "both": the answers are contradictory, too thin to place confidently, or genuinely describe someone who fits both. Never guess silently when unsure — recommend both tracks instead.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"persona": "aspiring_pm" | "early_stage_pm" | "unclear", "recommended_track": "portfolio" | "discovery" | "both", "confidence": <number between 0 and 1>, "reason": "<one short, plain-language sentence for the user>"}`;

export interface PortfolioRouteResult {
  persona: "aspiring_pm" | "early_stage_pm" | "unclear";
  recommendedTrack: "portfolio" | "discovery" | "both";
  confidence: number;
  reason: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function classifyPortfolioRoute(opts: {
  apiKey: string;
  model: string;
  answers: string;
}): Promise<PortfolioRouteResult> {
  const result = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: ROUTER_SYSTEM,
    messages: [{ role: "user", content: opts.answers }],
    maxTokens: 200,
  });

  const parsed = extractFirstJson(result.text) as {
    persona?: unknown;
    recommended_track?: unknown;
    confidence?: unknown;
    reason?: unknown;
  } | null;

  const persona = parsed?.persona;
  const track = parsed?.recommended_track;
  const confidence = parsed?.confidence;
  const reason = parsed?.reason;

  if (
    (persona !== "aspiring_pm" &&
      persona !== "early_stage_pm" &&
      persona !== "unclear") ||
    (track !== "portfolio" && track !== "discovery" && track !== "both") ||
    typeof confidence !== "number" ||
    confidence < 0 ||
    confidence > 1 ||
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    console.error("portfolio router malformed output:", result.text);
    throw new Error("Portfolio router returned malformed output");
  }

  return {
    persona,
    recommendedTrack: track,
    confidence,
    reason: reason.trim().slice(0, 300),
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
