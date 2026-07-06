// The discovery loop's pure domain model (Agent-Loop Redesign).
// Types + pure logic only — no model calls, no DB, no Deno APIs (Vitest can
// exercise it directly). The controller (discovery-turn) owns orchestration;
// the coach/evaluator own their model calls; this module owns the *rules*:
// the enumerable action space, which actions are direction-changing (gated),
// and the deterministic completion-readiness computation.

import type { DiscoveryGoal, FrameworkSlot } from "./frameworks.ts";

export const DISCOVERY_GOALS: DiscoveryGoal[] = [
  "frame",
  "surface_assumptions",
  "gather_evidence",
  "prioritize",
  "define_success",
  "prepare_to_learn",
  "conclude",
];

// The fixed action space. The evaluator may only recommend one of these, and
// the controller may only dispatch one of these — that is what keeps dispatch
// deterministic and testable.
export type ActionType =
  | "ask_next" // continue coaching within the current phase
  | "dig_deeper" // probe a specific assumption/answer harder
  | "map_assumptions"
  | "ground_assumption"
  | "run_blind_spots"
  | "propose_prioritization"
  | "define_success_metric"
  | "prepare_interviews"
  | "revisit_phase"
  | "conclude";

export const ACTION_TYPES: ActionType[] = [
  "ask_next",
  "dig_deeper",
  "map_assumptions",
  "ground_assumption",
  "run_blind_spots",
  "propose_prioritization",
  "define_success_metric",
  "prepare_interviews",
  "revisit_phase",
  "conclude",
];

// Within-phase actions ARE the coach reply — they never surface a proposal
// card. Everything else changes direction and is PM-gated ("gate direction
// changes only", confirmed with Mo).
const WITHIN_PHASE: ReadonlySet<ActionType> = new Set<ActionType>([
  "ask_next",
  "dig_deeper",
]);

export function isWithinPhaseAction(a: ActionType): boolean {
  return WITHIN_PHASE.has(a);
}

export function isDirectionChanging(a: ActionType): boolean {
  return !WITHIN_PHASE.has(a);
}

// One-line action descriptions the evaluator prompt lists so the model picks
// from the real set (not free text).
export const ACTION_CATALOG: Record<ActionType, string> = {
  ask_next: "Ask the next coaching question within the current phase.",
  dig_deeper: "Probe a specific assumption or answer that needs more depth.",
  map_assumptions: "Extract/refresh the assumption set from the conversation.",
  ground_assumption: "Gather market evidence on a specific risky assumption.",
  run_blind_spots: "Run a Socratic blind-spot pass over the assumptions.",
  propose_prioritization:
    "Offer a prioritization framework and rank what to test first.",
  define_success_metric:
    "Define a North Star + proxy metric (only once real validated substance exists).",
  prepare_interviews: "Build a Mom Test interview guide for the riskiest assumptions.",
  revisit_phase: "Go back to an earlier goal because new information changed it.",
  conclude: "Wrap up: synthesize, summarize, and close the sprint.",
};

// Which loop goal a direction-changing action advances (used to update the
// coverage map deterministically when a capability completes).
export const ACTION_GOAL: Partial<Record<ActionType, DiscoveryGoal>> = {
  map_assumptions: "surface_assumptions",
  ground_assumption: "gather_evidence",
  run_blind_spots: "gather_evidence",
  propose_prioritization: "prioritize",
  define_success_metric: "define_success",
  prepare_interviews: "prepare_to_learn",
  conclude: "conclude",
};

export type GoalStatus = "untouched" | "in_progress" | "covered" | "deferred";

// Persisted on sessions.coverage. Holds goal statuses plus the two decision
// flags that are NOT derivable from any table (a "declined" leaves no row).
export interface Coverage {
  goals?: Partial<Record<DiscoveryGoal, GoalStatus>>;
  success_metric?: "defined" | "declined";
  interviews?: "prepared" | "declined";
}

// Persisted on sessions.pending_action and returned to the browser. At most
// one outstanding at a time (matches "one question at a time"). NULL when
// nothing is awaiting the PM.
export interface PendingAction {
  action: ActionType;
  rationale: string;
  // For framework-slot actions: the suggested framework id + all options for
  // the slot (each carrying its teaching text). The frontend renders the
  // confirm/override card + "when & why" expander from this.
  framework?: {
    slot: FrameworkSlot;
    suggested: string;
    options: unknown[]; // PublicFramework[] — kept opaque to avoid a cycle
  };
  // For assumption-targeted actions.
  target?: { assumption_id?: string; label?: string };
  // For revisit_phase / phase moves.
  goal?: DiscoveryGoal;
  // Action-specific extras rendered by the frontend — e.g. the generated
  // North Star candidates for define_success_metric.
  data?: Record<string, unknown>;
}

// A prioritized assumption reduced to what readiness needs: is it resolved?
// "tested" = has evidence or a validated/challenged verdict; "deferred" =
// abandoned (the PM's "won't test now"). Neither → still open.
export interface PrioritizedAssumptionState {
  id: string;
  resolution: "tested" | "deferred" | "open";
}

export interface Readiness {
  ready: boolean;
  blockers: string[];
}

// Deterministic completion criteria (confirmed: prioritized-assumption
// coverage). Computed by the controller from the DB, NOT trusted to the
// model. Ready when: at least one assumption is prioritized; every prioritized
// assumption is tested or deferred; interviews are prepared or declined; a
// success metric is defined or declined. The PM can still conclude early —
// this only decides whether Ada *recommends* concluding.
export function computeReadiness(
  coverage: Coverage,
  prioritized: PrioritizedAssumptionState[],
): Readiness {
  const blockers: string[] = [];

  if (prioritized.length === 0) {
    blockers.push("No assumptions are prioritized yet — pick your riskiest to test.");
  }
  const open = prioritized.filter((a) => a.resolution === "open");
  if (open.length > 0) {
    blockers.push(
      `${open.length} prioritized assumption${open.length === 1 ? "" : "s"} still untested — gather evidence or defer.`,
    );
  }
  if (coverage.interviews !== "prepared" && coverage.interviews !== "declined") {
    blockers.push("No interview guide for the riskiest assumptions — prepare one or decline interviews.");
  }
  if (coverage.success_metric !== "defined" && coverage.success_metric !== "declined") {
    blockers.push("No success metric yet — define a North Star/proxy or decline.");
  }

  return { ready: blockers.length === 0, blockers };
}

// Merge coverage updates immutably (controller writes the result to
// sessions.coverage). Goal statuses merge shallowly; decision flags overwrite.
export function mergeCoverage(base: Coverage, patch: Partial<Coverage>): Coverage {
  return {
    ...base,
    ...patch,
    goals: { ...(base.goals ?? {}), ...(patch.goals ?? {}) },
  };
}
