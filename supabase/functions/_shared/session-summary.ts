// Haiku session summarizer (Run 1, PRD Technical Flow step 13).
// Runs when a Discovery Sprint completes: condenses the session's
// conversation into the summary that seeds the next session's context
// bundle. Summarization is a Haiku task per the PRD's model routing.

import { callClaude } from "./anthropic.ts";

const SUMMARY_SYSTEM = `You are Ada, an AI customer discovery coach. A PM has just completed a Discovery Sprint session. Summarize it for the product's running discovery ledger in this exact format:

**Product/Idea Explored:** [one sentence]

**Key Assumptions Surfaced:** [3-5 bullets]

**Open Questions:** [2-4 bullets]

**Suggested Next Steps:** [2-3 bullets]

Be concise and concrete. This summary is loaded as context when the PM's next sprint starts, so favor facts and decisions over narration.`;

export interface SessionSummary {
  summary: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export async function summarizeSession(opts: {
  apiKey: string;
  model: string;
  transcript: string;
}): Promise<SessionSummary> {
  const result = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: SUMMARY_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here is the session transcript:\n\n${opts.transcript}\n\nSummarize this discovery session using the format in your instructions.`,
      },
    ],
    maxTokens: 1000,
  });

  return {
    summary: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
