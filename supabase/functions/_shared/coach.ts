// Session-aware coach (Agent-Loop Redesign).
// Produces Ada's coaching reply for one loop turn: the active persona prompt
// (from coaching_prompts) + injected loop context (current phase focus, any
// active-framework coaching directive, a compact assumption digest) + the
// conversation history. One job: turn state + history into Ada's next reply.
//
// Deliberately narrow: the coach coaches WITHIN the current phase. It does not
// announce phase moves, offer frameworks, or say "let's move on" — those are
// the controller's PM-gated proposal cards. Keeping talk (coach) and structure
// (evaluator + card) separate is what preserves "Ada suggests, never silently
// acts".

import { callClaude, type ClaudeCallResult, type ClaudeMessage } from "./anthropic.ts";
import type { DiscoveryGoal } from "./frameworks.ts";

const COACH_MAX_TOKENS = 1000;

// What Ada focuses the conversation on in each phase.
const PHASE_FOCUS: Record<DiscoveryGoal, string> = {
  frame:
    "Understand the idea, the customer, and the job they're trying to get done. Find out where the PM already is in their discovery and what prompted this sprint.",
  surface_assumptions:
    "Help the PM name the beliefs their idea depends on — surface the unspoken assumptions across desirability, viability, feasibility, and usability.",
  gather_evidence:
    "Focus on what evidence actually exists for the riskiest beliefs and where it's thin. Separate real signal from a wishful reading of it.",
  prioritize:
    "Help the PM reason about which assumptions are riskiest to test first — least evidence, biggest consequence if wrong.",
  define_success:
    "Explore what real success looks like for the customer's job — the outcome that matters, not a vanity output.",
  prepare_to_learn:
    "Focus on what the PM needs to learn from real customers, and how to ask about it without leading them.",
  conclude:
    "Help the PM consolidate what they learned this sprint and what they'll do next.",
};

export interface CoachTurnOptions {
  apiKey: string;
  model: string;
  personaPrompt: string; // active coaching_prompts.prompt_text
  phase: DiscoveryGoal | null;
  // coachDirective strings from any active frameworks (e.g. Mom Test while
  // in prepare_to_learn). Empty when no framework shapes the current turn.
  frameworkDirectives: string[];
  // Compact, pre-formatted assumption digest from the controller (statements +
  // status + prioritized flag), or empty string when none exist yet.
  assumptionDigest: string;
  // Conversation turns, oldest→newest, ending on the PM's latest message.
  history: ClaudeMessage[];
}

function buildSystemPrompt(opts: CoachTurnOptions): string {
  const parts: string[] = [opts.personaPrompt];

  const context: string[] = [];
  if (opts.phase) {
    context.push(`Current phase: ${opts.phase}. ${PHASE_FOCUS[opts.phase]}`);
  }
  for (const d of opts.frameworkDirectives) {
    if (d.trim()) context.push(d.trim());
  }
  if (opts.assumptionDigest.trim()) {
    context.push(`Assumptions so far:\n${opts.assumptionDigest.trim()}`);
  }

  if (context.length > 0) {
    parts.push(
      [
        "--- Discovery Sprint context (background for you; never read it aloud) ---",
        ...context,
      ].join("\n\n"),
    );
  }

  parts.push(
    [
      "How to coach this turn:",
      "- Ask ONE focused question. Keep it to 2–4 sentences plus that single question.",
      "- Pressure-test; never validate an assumption for the PM.",
      "- Coach only within the current phase. Do NOT announce steps, propose moving on, or pick a framework — the sprint offers the PM those choices separately. Stay in the conversation.",
    ].join("\n"),
  );

  return parts.join("\n\n");
}

export async function coachTurn(
  opts: CoachTurnOptions,
): Promise<ClaudeCallResult> {
  return await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: buildSystemPrompt(opts),
    messages: opts.history,
    maxTokens: COACH_MAX_TOKENS,
  });
}
