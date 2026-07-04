// Haiku stage classifier (Run 1, PRD Technical Flow step 4).
// Classifies the PM's intake as a fresh idea vs. mid-discovery-and-stuck so
// Ada picks the right entry point. Short input, short structured output —
// the intern-tier task the PRD routes to Haiku.

import { callClaude, extractFirstJson } from "./anthropic.ts";

const CLASSIFIER_SYSTEM = `You are a classifier for Ada, an AI customer discovery coach for product managers.

Given a PM's opening message for a Discovery Sprint, decide their stage:
- "fresh_idea": they are starting discovery on a new idea and have not yet run real customer conversations for it.
- "stuck": they have already been doing discovery (interviews, experiments, launches) and are blocked, confused, or getting mixed signals.

Respond with ONLY a JSON object, no prose:
{"stage": "fresh_idea" | "stuck", "confidence": <number between 0 and 1>}`;

export interface StageClassification {
  stage: "fresh_idea" | "stuck";
  confidence: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function classifyStage(opts: {
  apiKey: string;
  model: string;
  intake: string;
}): Promise<StageClassification> {
  const result = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: CLASSIFIER_SYSTEM,
    messages: [{ role: "user", content: opts.intake }],
    maxTokens: 100,
  });

  const parsed = extractFirstJson(result.text) as {
    stage?: unknown;
    confidence?: unknown;
  } | null;

  const stage = parsed?.stage;
  const confidence = parsed?.confidence;
  if (
    (stage !== "fresh_idea" && stage !== "stuck") ||
    typeof confidence !== "number" ||
    confidence < 0 ||
    confidence > 1
  ) {
    console.error("stage classifier malformed output:", result.text);
    throw new Error("Stage classifier returned malformed output");
  }

  return {
    stage,
    confidence,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
