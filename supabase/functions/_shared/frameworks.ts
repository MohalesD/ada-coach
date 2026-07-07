// Framework registry (Agent-Loop Redesign).
// The single source of truth for the discovery frameworks Ada can teach and
// a PM can choose: the Mom Test, confidence×impact (Ada's default risk read),
// MoSCoW, RICE, and North Star + proxy. Static config on purpose — frameworks
// are code-coupled to the loop's goals and scoring, so they change with a
// deploy, not a settings edit.
//
// Behavior (which goal a framework attaches to, its scoring schema, the line
// Ada follows when it's active) lives here. The teaching text lives here too
// but is surfaced to the browser through the controller's `frameworks`
// resource, so there is exactly one source — the frontend never re-declares a
// framework. No Deno APIs here → unit-testable by Vitest.

export type DiscoveryGoal =
  | "frame"
  | "surface_assumptions"
  | "gather_evidence"
  | "prioritize"
  | "define_success"
  | "prepare_to_learn"
  | "conclude";

// The three decisions a framework can fill. A session holds at most one
// chosen framework per slot (sessions.active_framework).
export type FrameworkSlot = "prioritization" | "success_metric" | "interview";

// Scoring schema for prioritization frameworks — drives assumptions.
// framework_scores and the AssumptionCard render. Null when the framework
// has no per-item numeric/categorical score (Mom Test, North Star).
export type FrameworkScoring =
  | {
      kind: "numeric";
      // formula 'rice' → (reach*impact*confidence)/effort; absent → no
      // derived score, the fields stand alone.
      formula?: "rice";
      fields: { key: string; label: string; min: number; max: number }[];
    }
  | { kind: "categorical"; buckets: { key: string; label: string }[] };

export interface Framework {
  id: string;
  name: string;
  slot: FrameworkSlot;
  goal: DiscoveryGoal;
  isDefault: boolean; // Ada's default technique for this slot
  oneLiner: string; // one sentence, shown on the proposal card
  // Plain-language "when & why to use it" — the lightweight teaching area.
  // No quiz, no course; a paragraph a PM can read in ten seconds.
  whenWhy: string;
  // Appended to the coach system prompt while this framework is active, so
  // Ada actually coaches in its idiom. Empty when the framework's behavior
  // is a capability call rather than a coaching style (North Star).
  coachDirective: string;
  // Whether per-item scores live in the existing confidence/impact columns
  // (the default risk read) rather than assumptions.framework_scores.
  usesLegacyScoreColumns: boolean;
  scoring: FrameworkScoring | null;
}

export const FRAMEWORKS: Framework[] = [
  {
    id: "mom_test",
    name: "The Mom Test",
    slot: "interview",
    goal: "prepare_to_learn",
    isDefault: true,
    oneLiner:
      "Ask about real past behavior, never hypotheticals — the surest test of what customers actually do.",
    whenWhy:
      "Use it whenever you're about to talk to customers. People are unreliable at predicting what they'd do but reliable at reporting what they've already done, so questions about the past cut through politeness and wishful thinking. Reach for it before every round of discovery conversations.",
    coachDirective:
      "Coach the PM toward Mom Test questions: anchor on the customer's specific past behavior and real spending, never hypotheticals or pitches. If they draft a 'would you' question, reframe it to 'when did you last…'.",
    usesLegacyScoreColumns: false,
    scoring: null,
  },
  {
    id: "confidence_impact",
    name: "Confidence × Impact",
    slot: "prioritization",
    goal: "prioritize",
    isDefault: true,
    oneLiner:
      "Rank assumptions by risk: weak evidence × big consequence means test it first.",
    whenWhy:
      "Ada's default for deciding what to test first. Best when the things you're ranking are assumptions and you want the riskiest — low confidence, high impact — at the top. Simple and fast, no extra inputs. Its blind spot is that it says nothing about effort, so a cheap test and an expensive one look the same.",
    coachDirective:
      "Help the PM rank assumptions by risk: the ones with the least evidence (low confidence) and the worst consequences if wrong (high impact) come first.",
    usesLegacyScoreColumns: true,
    scoring: {
      kind: "numeric",
      fields: [
        { key: "confidence", label: "Confidence", min: 1, max: 5 },
        { key: "impact", label: "Impact", min: 1, max: 5 },
      ],
    },
  },
  {
    id: "moscow",
    name: "MoSCoW",
    slot: "prioritization",
    goal: "prioritize",
    isDefault: false,
    oneLiner:
      "Sort into Must / Should / Could / Won't-have-now — a shared language for scope.",
    whenWhy:
      "Use when you need to align people on scope quickly, especially around an MVP or release boundary. It's categorical rather than numeric, so it's fast to agree on and easy to communicate — but it hides why something is a Must, so pair it with your risk read rather than replacing it.",
    coachDirective:
      "Guide the PM to place each item in Must / Should / Could / Won't-have-now, and press them to justify every 'Must' — a list where everything is a Must has not been prioritized.",
    usesLegacyScoreColumns: false,
    scoring: {
      kind: "categorical",
      buckets: [
        { key: "must", label: "Must have" },
        { key: "should", label: "Should have" },
        { key: "could", label: "Could have" },
        { key: "wont", label: "Won't have (now)" },
      ],
    },
  },
  {
    id: "rice",
    name: "RICE",
    slot: "prioritization",
    goal: "prioritize",
    isDefault: false,
    oneLiner:
      "Score Reach × Impact × Confidence ÷ Effort to compare very different bets on one scale.",
    whenWhy:
      "Use when you're weighing initiatives that differ wildly in size and audience and you want a single defensible, comparable number. Its weakness is false precision: the score is only as honest as your Reach and Effort estimates, so treat near-ties as ties and don't let a decimal make the decision for you.",
    coachDirective:
      "Help the PM estimate Reach, Impact, Confidence and Effort for each item honestly, and remind them the resulting score is a conversation starter, not a verdict — near-ties are ties.",
    usesLegacyScoreColumns: false,
    scoring: {
      kind: "numeric",
      formula: "rice",
      fields: [
        { key: "reach", label: "Reach", min: 1, max: 5 },
        { key: "impact", label: "Impact", min: 1, max: 5 },
        { key: "confidence", label: "Confidence", min: 1, max: 5 },
        { key: "effort", label: "Effort", min: 1, max: 5 },
      ],
    },
  },
  {
    id: "north_star",
    name: "North Star + proxy",
    slot: "success_metric",
    goal: "define_success",
    isDefault: true,
    oneLiner:
      "One metric that captures the core value customers get — plus a proxy you can move week to week.",
    whenWhy:
      "Use once you've validated what value you're actually delivering. A North Star aligns the team on the outcome that matters, not on output; its paired proxy is the near-term number you can influence. The real risk is drift — a proxy that's easy to move but slowly diverges from the outcome it's meant to stand for — so choose proxies that can't be gamed away from the real thing.",
    coachDirective: "",
    usesLegacyScoreColumns: false,
    scoring: null,
  },
];

const BY_ID = new Map(FRAMEWORKS.map((f) => [f.id, f]));

export function getFramework(id: string | null | undefined): Framework | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function frameworksForSlot(slot: FrameworkSlot): Framework[] {
  return FRAMEWORKS.filter((f) => f.slot === slot);
}

export function defaultFrameworkForSlot(slot: FrameworkSlot): Framework {
  const found = FRAMEWORKS.find((f) => f.slot === slot && f.isDefault);
  if (!found) throw new Error(`No default framework for slot ${slot}`);
  return found;
}

// The display-safe registry the frontend renders (library + proposal cards).
// Everything a browser needs, nothing it doesn't (coachDirective stays server
// side). Shape kept flat so it serializes straight to JSON.
export interface PublicFramework {
  id: string;
  name: string;
  slot: FrameworkSlot;
  goal: DiscoveryGoal;
  isDefault: boolean;
  oneLiner: string;
  whenWhy: string;
  scoring: FrameworkScoring | null;
}

export function publicFrameworks(): PublicFramework[] {
  return FRAMEWORKS.map(({ coachDirective: _c, usesLegacyScoreColumns: _l, ...pub }) => pub);
}

export function publicFrameworksForSlot(slot: FrameworkSlot): PublicFramework[] {
  return publicFrameworks().filter((f) => f.slot === slot);
}

// (reach*impact*confidence)/effort, rounded to one decimal. Effort <= 0 is
// coerced to 1 so a bad input can't divide by zero.
export function computeRiceScore(s: {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
}): number {
  const effort = s.effort > 0 ? s.effort : 1;
  return Math.round(((s.reach * s.impact * s.confidence) / effort) * 10) / 10;
}

export type FrameworkScoreValidation =
  | { ok: true; scores: Record<string, number | string> }
  | { ok: false; error: string };

// Validates a client-submitted assumptions.framework_scores payload against
// the active framework's scoring schema (RICE fields + derived score, or a
// MoSCoW bucket). Pure so it's unit-testable without a DB or Deno APIs.
export function validateFrameworkScores(
  framework: Framework,
  raw: unknown,
): FrameworkScoreValidation {
  if (!framework.scoring) {
    return { ok: false, error: "This framework has no per-item score." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "framework_scores must be an object" };
  }
  const record = raw as Record<string, unknown>;

  if (framework.scoring.kind === "numeric") {
    const scores: Record<string, number> = {};
    for (const field of framework.scoring.fields) {
      const v = record[field.key];
      if (typeof v !== "number" || !Number.isInteger(v) || v < field.min || v > field.max) {
        return {
          ok: false,
          error: `${field.key} must be an integer from ${field.min} to ${field.max}`,
        };
      }
      scores[field.key] = v;
    }
    if (framework.scoring.formula === "rice") {
      scores.score = computeRiceScore({
        reach: scores.reach,
        impact: scores.impact,
        confidence: scores.confidence,
        effort: scores.effort,
      });
    }
    return { ok: true, scores };
  }

  const bucket = record.bucket;
  const valid = framework.scoring.buckets.some((b) => b.key === bucket);
  if (typeof bucket !== "string" || !valid) {
    return {
      ok: false,
      error: `bucket must be one of ${framework.scoring.buckets.map((b) => b.key).join(", ")}`,
    };
  }
  return { ok: true, scores: { bucket } };
}
