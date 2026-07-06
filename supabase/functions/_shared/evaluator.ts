// Next-action evaluator (Agent-Loop Redesign).
// The model-driven "decide" step of the loop: given the current loop state and
// the recent transcript, recommend exactly ONE action from the fixed action
// space, plus which phase the loop is in. Cheap Haiku, short structured output,
// runs every PM turn. It only *recommends* — the controller enforces gates and
// dispatches. One job: read state → propose the next best action.
//
// It is told, explicitly, that it may recommend going back, digging in, or
// concluding early — that non-linearity is what makes this a loop rather than
// a renamed script.

import { callClaude, extractFirstJson } from "./anthropic.ts";
import {
  ACTION_CATALOG,
  ACTION_TYPES,
  type ActionType,
  DISCOVERY_GOALS,
} from "./loop.ts";
import type { DiscoveryGoal } from "./frameworks.ts";

const EVAL_MAX_TOKENS = 400;

const ACTION_LIST = ACTION_TYPES.map(
  (a) => `- "${a}": ${ACTION_CATALOG[a]}`,
).join("\n");

const PHASE_LIST = DISCOVERY_GOALS.map((g) => `"${g}"`).join(", ");

const EVALUATOR_SYSTEM = `You are the planner behind Ada, an AI customer-discovery coach for product managers. You do NOT talk to the PM. You read where a Discovery Sprint stands and decide the single best next action.

The sprint moves between these phases (not in a fixed order): ${PHASE_LIST}.

You may recommend exactly ONE action, from this fixed set only:
${ACTION_LIST}

Rules:
- Pick the action that most advances the PM's discovery given the current state — not the next one in sequence. It is often right to stay and "dig_deeper", to "revisit_phase" when new information undermines earlier work, or to "conclude" early when enough is settled.
- "define_success_metric" is only appropriate once at least one assumption is validated (there must be real substance to ground a metric in). If that substance is missing, do NOT recommend it.
- Prefer "ask_next" or "dig_deeper" while a phase's conversation is still productive. Only recommend a direction-changing action when the current phase has yielded what it can.
- On the very first turn, let the PM's stage seed your choice: a fresh idea usually starts by framing and surfacing assumptions; someone already stuck mid-discovery may need to gather evidence or revisit what they thought they knew.
- For prioritization, interview, and success-metric actions, you may name a framework to suggest in "framework_suggestion" (e.g. "rice", "moscow", "mom_test", "north_star"); leave it null to let Ada offer the default.
- If the action targets one specific assumption, put a short label for it in "target_label"; otherwise null.

Respond with ONLY a JSON object, no prose:
{"phase": <one phase>, "recommended_action": <one action>, "rationale": "<one sentence, plain>", "target_label": <string or null>, "framework_suggestion": <string or null>}`;

export interface EvaluatorResult {
  phase: DiscoveryGoal;
  recommendedAction: ActionType;
  rationale: string;
  targetLabel: string | null;
  frameworkSuggestion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

const ACTION_SET = new Set<string>(ACTION_TYPES);
const GOAL_SET = new Set<string>(DISCOVERY_GOALS);

export async function evaluateNextAction(opts: {
  apiKey: string;
  model: string;
  // Controller-formatted snapshot: current phase, coverage flags, whether
  // validated/prioritized assumptions exist, and a compact assumption digest.
  stateDigest: string;
  // Recent PM/Ada turns, oldest→newest.
  transcript: string;
}): Promise<EvaluatorResult> {
  const result = await callClaude({
    apiKey: opts.apiKey,
    model: opts.model,
    system: EVALUATOR_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Current state:\n${opts.stateDigest}\n\nRecent conversation:\n${opts.transcript}\n\nDecide the single best next action.`,
      },
    ],
    maxTokens: EVAL_MAX_TOKENS,
  });

  const parsed = extractFirstJson(result.text) as {
    phase?: unknown;
    recommended_action?: unknown;
    rationale?: unknown;
    target_label?: unknown;
    framework_suggestion?: unknown;
  } | null;

  const phase = parsed?.phase;
  const action = parsed?.recommended_action;
  const rationale = parsed?.rationale;
  if (
    typeof phase !== "string" ||
    !GOAL_SET.has(phase) ||
    typeof action !== "string" ||
    !ACTION_SET.has(action) ||
    typeof rationale !== "string" ||
    !rationale.trim()
  ) {
    console.error("evaluator malformed output:", result.text);
    throw new Error("Evaluator returned malformed output");
  }

  return {
    phase: phase as DiscoveryGoal,
    recommendedAction: action as ActionType,
    rationale: rationale.trim(),
    targetLabel:
      typeof parsed?.target_label === "string" && parsed.target_label.trim()
        ? parsed.target_label.trim()
        : null,
    frameworkSuggestion:
      typeof parsed?.framework_suggestion === "string" &&
      parsed.framework_suggestion.trim()
        ? parsed.framework_suggestion.trim()
        : null,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
