// Ada Coach /discovery-turn Edge Function (Agent-Loop Redesign)
// The loop controller. Replaces the client-driven fixed-step script with a
// server-owned, PM-gated agent loop.
//
//   GET  ?resource=frameworks         -> the framework library (teaching text)
//   POST { session_id, message }      -> a PM turn: persist → coach reply →
//                                        evaluate → gate. Direction-changing
//                                        recommendations become a pending_action
//                                        (proposal card); within-phase ones just
//                                        return the coach reply.
//   POST { session_id, resolve: { decision, action, params? } }
//                                     -> confirm / override / dismiss the
//                                        outstanding proposal.
//   POST { session_id, initiate: { action, params? } }
//                                     -> a PM-initiated action, out of turn
//                                        (bypasses the evaluator).
//   POST { session_id, score_assumption: { assumption_id, framework_scores } }
//                                     -> write a per-assumption RICE/MoSCoW
//                                        score. Not a loop action (no gate, no
//                                        phase/coverage change) — plain data
//                                        entry that happens to need the
//                                        service role, since framework_scores
//                                        is service-only (mirrors sessions'
//                                        loop-state lockdown).
//
// Loop state (current_phase, coverage, active_framework, pending_action) is
// service-owned — written here, never by the browser. The model only proposes;
// this code enforces the gates ("gate direction changes only") and dispatches.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import type { ClaudeMessage } from "../_shared/anthropic.ts";
import { coachTurn } from "../_shared/coach.ts";
import { evaluateNextAction } from "../_shared/evaluator.ts";
import { generateSuccessMetricCandidates } from "../_shared/capabilities/success-metric.ts";
import {
  computeReadiness,
  type Coverage,
  isDirectionChanging,
  mergeCoverage,
  type PendingAction,
  type PrioritizedAssumptionState,
  ACTION_GOAL,
  ACTION_TYPES,
  type ActionType,
} from "../_shared/loop.ts";
import type { DiscoveryGoal } from "../_shared/frameworks.ts";
import {
  defaultFrameworkForSlot,
  getFramework,
  publicFrameworks,
  publicFrameworksForSlot,
  validateFrameworkScores,
} from "../_shared/frameworks.ts";

const MESSAGE_MAX = 8000;
const HISTORY_LIMIT = 24; // turns handed to the coach
const TRANSCRIPT_LIMIT = 16; // recent turns summarized for the evaluator
const ASSUMPTION_DIGEST_LIMIT = 20;

type AssumptionRow = {
  id: string;
  statement: string;
  category: string;
  confidence: number;
  impact: number;
  status: string;
  is_prioritized: boolean;
};

type SessionRow = {
  id: string;
  user_id: string;
  product_id: string;
  conversation_id: string;
  status: string;
  stage: string | null;
  current_phase: DiscoveryGoal | null;
  coverage: Coverage | null;
  active_framework: Record<string, string> | null;
  pending_action: PendingAction | null;
  updated_at: string;
};

// ── Internal capability invocation ───────────────────────────────────────────
// Dispatch to the existing per-step Edge Functions by forwarding the PM's JWT.
// (Phase-1 wiring per the plan; the cores can later be extracted to shared
// helpers to drop the internal HTTP hop.)
async function invokeFunction(
  req: Request,
  nameWithQuery: string,
  method: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const base = Deno.env.get("SUPABASE_URL");
  const res = await fetch(`${base}/functions/v1/${nameWithQuery}`, {
    method,
    headers: {
      "content-type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

// ── Loaders / formatters ─────────────────────────────────────────────────────

async function loadAssumptions(
  service: SupabaseClient,
  sessionId: string,
): Promise<AssumptionRow[]> {
  const { data } = await service
    .from("assumptions")
    .select("id, statement, category, confidence, impact, status, is_prioritized")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []) as AssumptionRow[];
}

// Which prioritized assumptions are resolved for completion: "tested" =
// validated/challenged verdict OR has grounding evidence; "deferred" =
// abandoned; else "open".
async function loadPrioritizedState(
  service: SupabaseClient,
  sessionId: string,
  assumptions: AssumptionRow[],
): Promise<PrioritizedAssumptionState[]> {
  const prioritized = assumptions.filter((a) => a.is_prioritized);
  if (prioritized.length === 0) return [];
  const { data: evidence } = await service
    .from("assumption_evidence")
    .select("assumption_id")
    .eq("session_id", sessionId);
  const grounded = new Set(
    (evidence ?? []).map((e: { assumption_id: string }) => e.assumption_id),
  );
  return prioritized.map((a) => ({
    id: a.id,
    resolution:
      a.status === "validated" || a.status === "challenged" || grounded.has(a.id)
        ? "tested"
        : a.status === "abandoned"
          ? "deferred"
          : "open",
  }));
}

function formatAssumptionDigest(rows: AssumptionRow[]): string {
  if (rows.length === 0) return "";
  return rows
    .slice(0, ASSUMPTION_DIGEST_LIMIT)
    .map(
      (a) =>
        `- [${a.category}] "${a.statement}" (conf ${a.confidence}/impact ${a.impact}, ${a.status}${a.is_prioritized ? ", prioritized" : ""})`,
    )
    .join("\n");
}

async function loadHistory(
  service: SupabaseClient,
  conversationId: string,
  limit: number,
): Promise<ClaudeMessage[]> {
  const { data } = await service
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("kind", "message")
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = ((data ?? []) as { role: string; content: string }[]).reverse();
  return rows.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
}

function formatTranscript(history: ClaudeMessage[], limit: number): string {
  return history
    .slice(-limit)
    .map((m) => `${m.role === "user" ? "PM" : "Ada"}: ${m.content}`)
    .join("\n\n");
}

async function loadPersona(
  service: SupabaseClient,
): Promise<{ prompt: string; id: string } | null> {
  const { data } = await service
    .from("coaching_prompts")
    .select("id, prompt_text")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { prompt: data.prompt_text as string, id: data.id as string };
}

// Coaching directives for the current phase: the active framework for that
// phase's slot, or its default (so Ada coaches in the right idiom even before
// the PM has explicitly chosen one).
function frameworkDirectivesForPhase(
  session: SessionRow,
  phase: DiscoveryGoal | null,
): string[] {
  if (!phase) return [];
  const slot =
    phase === "prioritize"
      ? "prioritization"
      : phase === "prepare_to_learn"
        ? "interview"
        : phase === "define_success"
          ? "success_metric"
          : null;
  if (!slot) return [];
  const chosen = session.active_framework?.[slot];
  const fw = getFramework(chosen) ?? defaultFrameworkForSlot(slot);
  return fw.coachDirective ? [fw.coachDirective] : [];
}

function buildStateDigest(
  session: SessionRow,
  coverage: Coverage,
  assumptions: AssumptionRow[],
  prioritized: PrioritizedAssumptionState[],
): string {
  const validated = assumptions.filter((a) => a.status === "validated").length;
  const openPrioritized = prioritized.filter((p) => p.resolution === "open").length;
  const covered = Object.entries(coverage.goals ?? {})
    .filter(([, s]) => s === "covered")
    .map(([g]) => g);
  const lines = [
    `Initial stage read: ${session.stage ?? "unknown"}`,
    `Current phase: ${session.current_phase ?? "not set"}`,
    `Goals covered: ${covered.length ? covered.join(", ") : "none"}`,
    `Success metric: ${coverage.success_metric ?? "undecided"}; interviews: ${coverage.interviews ?? "undecided"}`,
    `Assumptions: ${assumptions.length} total, ${validated} validated, ${prioritized.length} prioritized (${openPrioritized} still untested).`,
    `Has a validated assumption (required before defining a success metric): ${validated > 0 ? "yes" : "no"}`,
  ];
  const digest = formatAssumptionDigest(assumptions);
  if (digest) lines.push(`Assumption list:\n${digest}`);
  return lines.join("\n");
}

// Pick the riskiest not-yet-grounded assumption to ground (prioritized first,
// then any): highest impact, then lowest confidence. Null when nothing fits.
async function pickGroundingTarget(
  service: SupabaseClient,
  sessionId: string,
  assumptions: AssumptionRow[],
): Promise<AssumptionRow | null> {
  const { data: evidence } = await service
    .from("assumption_evidence")
    .select("assumption_id")
    .eq("session_id", sessionId);
  const grounded = new Set(
    (evidence ?? []).map((e: { assumption_id: string }) => e.assumption_id),
  );
  const pool = assumptions.filter((a) => !grounded.has(a.id));
  if (pool.length === 0) return null;
  const prioritizedPool = pool.filter((a) => a.is_prioritized);
  const ranked = (prioritizedPool.length ? prioritizedPool : pool).sort(
    (a, b) => b.impact - a.impact || a.confidence - b.confidence,
  );
  return ranked[0] ?? null;
}

async function persistState(
  service: SupabaseClient,
  sessionId: string,
  patch: Partial<{
    current_phase: DiscoveryGoal | null;
    coverage: Coverage;
    active_framework: Record<string, string>;
    pending_action: PendingAction | null;
  }>,
): Promise<SessionRow | null> {
  const { data, error } = await service
    .from("sessions")
    .update(patch)
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error) {
    console.error("discovery-turn state persist failed:", error);
    return null;
  }
  return data as SessionRow;
}

// ── Server entry ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const url = new URL(req.url);

  // Framework library (no session needed) — still requires auth.
  if (req.method === "GET") {
    const authResult = await requireUser(req);
    if (authResult.error) return authResult.error;
    if (url.searchParams.get("resource") === "frameworks") {
      return jsonResponse({ frameworks: publicFrameworks() }, 200, req);
    }
    return jsonResponse({ error: "Unknown resource" }, 400, req);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;
  const service = getServiceClient();

  try {
    const body = (await req.json()) as {
      session_id?: unknown;
      message?: unknown;
      resolve?: { decision?: unknown; action?: unknown; params?: unknown };
      initiate?: { action?: unknown; params?: unknown };
      score_assumption?: { assumption_id?: unknown; framework_scores?: unknown };
      if_unmodified_since?: unknown;
    };

    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) {
      return jsonResponse({ error: "session_id is required" }, 400, req);
    }

    // Ownership via RLS.
    const { data: sessionData, error: sessErr } = await userClient
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessErr) {
      console.error("session load failed:", sessErr);
      return jsonResponse({ error: "Could not load session." }, 500, req);
    }
    if (!sessionData) return jsonResponse({ error: "Session not found" }, 404, req);
    const session = sessionData as SessionRow;

    if (session.status !== "in_progress") {
      return jsonResponse(
        { error: "invalid_state", detail: `Session is ${session.status}.` },
        409,
        req,
      );
    }

    // Plain data entry, no model call — handle before the ANTHROPIC_API_KEY
    // gate so a missing key can't block saving a score.
    if (body.score_assumption) {
      return await handleScoreAssumption(req, service, session, body.score_assumption);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("Missing ANTHROPIC_API_KEY");
      return jsonResponse({ error: "Coaching is unavailable." }, 500, req);
    }

    if (typeof body.message === "string") {
      return await handleTurn(req, service, session, user.id, body.message, anthropicKey);
    }
    if (body.resolve) {
      return await handleDispatch(req, service, session, user.id, anthropicKey, {
        decision: typeof body.resolve.decision === "string" ? body.resolve.decision : "confirm",
        action: body.resolve.action,
        params: body.resolve.params,
        if_unmodified_since: body.if_unmodified_since,
      });
    }
    if (body.initiate) {
      return await handleDispatch(req, service, session, user.id, anthropicKey, {
        decision: "initiate",
        action: body.initiate.action,
        params: body.initiate.params,
        if_unmodified_since: body.if_unmodified_since,
      });
    }

    return jsonResponse({ error: "Nothing to do: send message, resolve, or initiate." }, 400, req);
  } catch (err) {
    console.error("discovery-turn unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});

// ── Turn mode ────────────────────────────────────────────────────────────────

async function handleTurn(
  req: Request,
  service: SupabaseClient,
  session: SessionRow,
  userId: string,
  rawMessage: string,
  anthropicKey: string,
): Promise<Response> {
  const message = rawMessage.trim();
  if (!message) return jsonResponse({ error: "message is empty" }, 400, req);
  if (message.length > MESSAGE_MAX) {
    return jsonResponse({ error: `message must be at most ${MESSAGE_MAX} characters` }, 400, req);
  }

  // 1. Persist the PM turn.
  await service.from("messages").insert({
    conversation_id: session.conversation_id,
    role: "user",
    content: message,
  });

  const persona = await loadPersona(service);
  if (!persona) {
    console.error("no active coaching prompt");
    return jsonResponse({ error: "Coaching is misconfigured." }, 500, req);
  }

  const assumptions = await loadAssumptions(service, session.id);
  const history = await loadHistory(service, session.conversation_id, HISTORY_LIMIT);
  const phase = session.current_phase ?? "frame";

  // 2. Coach reply (always).
  const coachModel = await getModelFor(service, "discovery_coach");
  const coach = await coachTurn({
    apiKey: anthropicKey,
    model: coachModel,
    personaPrompt: persona.prompt,
    phase,
    frameworkDirectives: frameworkDirectivesForPhase(session, phase),
    assumptionDigest: formatAssumptionDigest(assumptions),
    history,
  });
  const { data: assistantMsg } = await service
    .from("messages")
    .insert({
      conversation_id: session.conversation_id,
      role: "assistant",
      content: coach.text,
      coaching_prompt_id: persona.id,
    })
    .select("id")
    .single();
  await recordModelUsage(service, {
    userId,
    sessionId: session.id,
    callType: "discovery_coach",
    model: coachModel,
    inputTokens: coach.inputTokens,
    outputTokens: coach.outputTokens,
  });

  // 3. One proposal at a time: if one is already outstanding, don't raise
  //    another — just return the coach reply and the existing proposal.
  if (session.pending_action) {
    return jsonResponse(
      {
        reply: coach.text,
        message_id: assistantMsg?.id ?? null,
        pending_action: session.pending_action,
        session_updated_at: session.updated_at,
      },
      200,
      req,
    );
  }

  // 4. Evaluate → gate.
  const coverage: Coverage = session.coverage ?? {};
  const prioritized = await loadPrioritizedState(service, session.id, assumptions);
  let evaluation;
  try {
    const evalModel = await getModelFor(service, "discovery_evaluation");
    evaluation = await evaluateNextAction({
      apiKey: anthropicKey,
      model: evalModel,
      stateDigest: buildStateDigest(session, coverage, assumptions, prioritized),
      transcript: formatTranscript(history, TRANSCRIPT_LIMIT),
    });
    await recordModelUsage(service, {
      userId,
      sessionId: session.id,
      callType: "discovery_evaluation",
      model: evalModel,
      inputTokens: evaluation.inputTokens,
      outputTokens: evaluation.outputTokens,
    });
  } catch (err) {
    // Non-fatal: the coach reply already went out. No proposal this turn.
    console.error("evaluator failed:", err);
    const updated = await persistState(service, session.id, {
      current_phase: phase,
      coverage: mergeCoverage(coverage, { goals: { [phase]: coverage.goals?.[phase] ?? "in_progress" } }),
    });
    return jsonResponse(
      { reply: coach.text, message_id: assistantMsg?.id ?? null, pending_action: null, session_updated_at: updated?.updated_at ?? session.updated_at, evaluation_error: true },
      200,
      req,
    );
  }

  const nextPhase = evaluation.phase;
  const newCoverage = mergeCoverage(coverage, {
    goals: { [nextPhase]: coverage.goals?.[nextPhase] ?? "in_progress" },
  });

  // Gate: within-phase actions raise no card.
  let pending: PendingAction | null = null;
  if (isDirectionChanging(evaluation.recommendedAction)) {
    pending = await buildProposal(
      req,
      service,
      session,
      userId,
      anthropicKey,
      evaluation.recommendedAction,
      evaluation.rationale,
      evaluation.frameworkSuggestion,
      { phase: nextPhase, assumptions, coverage: newCoverage, prioritized },
    );
  }

  const updated = await persistState(service, session.id, {
    current_phase: nextPhase,
    coverage: newCoverage,
    pending_action: pending,
  });

  return jsonResponse(
    {
      reply: coach.text,
      message_id: assistantMsg?.id ?? null,
      pending_action: pending,
      current_phase: nextPhase,
      coverage: newCoverage,
      session_updated_at: updated?.updated_at ?? session.updated_at,
    },
    200,
    req,
  );
}

// Build the proposal card for a direction-changing action, enriching it with
// framework options / a grounding target / generated metric candidates. Some
// actions are gated OUT here (define_success before a validated assumption,
// conclude before readiness) — returning null means "no card this turn".
async function buildProposal(
  req: Request,
  service: SupabaseClient,
  session: SessionRow,
  userId: string,
  anthropicKey: string,
  action: ActionType,
  rationale: string,
  frameworkSuggestion: string | null,
  ctx: {
    phase: DiscoveryGoal;
    assumptions: AssumptionRow[];
    coverage: Coverage;
    prioritized: PrioritizedAssumptionState[];
  },
): Promise<PendingAction | null> {
  switch (action) {
    case "propose_prioritization": {
      const options = publicFrameworksForSlot("prioritization");
      const suggested = getFramework(frameworkSuggestion)?.slot === "prioritization"
        ? frameworkSuggestion!
        : defaultFrameworkForSlot("prioritization").id;
      return { action, rationale, framework: { slot: "prioritization", suggested, options } };
    }
    case "prepare_interviews": {
      const options = publicFrameworksForSlot("interview");
      return {
        action,
        rationale,
        framework: { slot: "interview", suggested: defaultFrameworkForSlot("interview").id, options },
      };
    }
    case "ground_assumption": {
      const target = await pickGroundingTarget(service, session.id, ctx.assumptions);
      if (!target) return null; // nothing left to ground
      return { action, rationale, target: { assumption_id: target.id, label: target.statement } };
    }
    case "define_success_metric": {
      // Readiness gate — the anti-quiz mechanism: no metric flow until there
      // is a validated assumption to ground it in.
      const validated = ctx.assumptions.filter((a) => a.status === "validated");
      if (validated.length === 0) return null;
      try {
        const { data: product } = await service
          .from("products")
          .select("name, description")
          .eq("id", session.product_id)
          .maybeSingle();
        const history = await loadHistory(service, session.conversation_id, HISTORY_LIMIT);
        const model = await getModelFor(service, "success_metric_candidates");
        const result = await generateSuccessMetricCandidates({
          apiKey: anthropicKey,
          model,
          productContext: `${product?.name ?? "the product"}${product?.description ? ` — ${product.description}` : ""}`,
          validatedAssumptions: validated.map((a) => `- ${a.statement}`).join("\n"),
          transcript: formatTranscript(history, TRANSCRIPT_LIMIT),
        });
        await recordModelUsage(service, {
          userId,
          sessionId: session.id,
          callType: "success_metric_candidates",
          model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        return {
          action,
          rationale,
          framework: { slot: "success_metric", suggested: "north_star", options: publicFrameworksForSlot("success_metric") },
          data: { candidates: result.candidates },
        };
      } catch (err) {
        console.error("success-metric generation failed:", err);
        return null;
      }
    }
    case "revisit_phase":
      return { action, rationale, goal: ctx.phase };
    case "conclude": {
      const readiness = computeReadiness(ctx.coverage, ctx.prioritized);
      if (!readiness.ready) return null; // Ada only recommends concluding when ready
      return { action, rationale };
    }
    default:
      // map_assumptions, run_blind_spots
      return { action, rationale };
  }
}

// ── Per-assumption framework scoring (data entry, not a loop action) ────────

// Writes assumptions.framework_scores via the service role (the column is
// locked down to service-only — see the agent_loop_session_state migration).
// Requires an active non-legacy prioritization framework (RICE/MoSCoW): the
// default confidence×impact framework keeps using the existing confidence/
// impact columns via the plain /assumptions PATCH, so there's nothing to
// score here in that case.
async function handleScoreAssumption(
  req: Request,
  service: SupabaseClient,
  session: SessionRow,
  input: { assumption_id?: unknown; framework_scores?: unknown },
): Promise<Response> {
  const assumptionId = typeof input.assumption_id === "string" ? input.assumption_id : "";
  if (!assumptionId) {
    return jsonResponse({ error: "assumption_id is required" }, 400, req);
  }

  const framework = getFramework(session.active_framework?.prioritization);
  if (!framework || framework.slot !== "prioritization" || framework.usesLegacyScoreColumns) {
    return jsonResponse(
      {
        error: "no_framework_scoring_active",
        detail: "Pick a RICE or MoSCoW prioritization framework first.",
      },
      400,
      req,
    );
  }

  const validation = validateFrameworkScores(framework, input.framework_scores);
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400, req);
  }

  const { data, error } = await service
    .from("assumptions")
    .update({ framework_scores: validation.scores })
    .eq("id", assumptionId)
    .eq("session_id", session.id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error("assumption framework score update failed:", error);
    return jsonResponse({ error: "Could not save the score." }, 500, req);
  }
  if (!data) return jsonResponse({ error: "Assumption not found" }, 404, req);
  return jsonResponse({ assumption: data }, 200, req);
}

// ── Resolve / initiate mode ──────────────────────────────────────────────────

async function handleDispatch(
  req: Request,
  service: SupabaseClient,
  session: SessionRow,
  userId: string,
  anthropicKey: string,
  input: {
    decision: string; // confirm | override | dismiss | initiate
    action: unknown;
    params: unknown;
    if_unmodified_since: unknown;
  },
): Promise<Response> {
  // Optimistic concurrency (reuses the sessions pattern): stale proposal → 409.
  if (typeof input.if_unmodified_since === "string" && input.if_unmodified_since !== session.updated_at) {
    return jsonResponse(
      { error: "stale_session", detail: "This sprint moved ahead elsewhere. Refresh to continue.", current_updated_at: session.updated_at },
      409,
      req,
    );
  }

  const pending = session.pending_action;
  const decision = input.decision;

  // The action being acted on: for resolve it's the pending proposal's action
  // (or an override); for initiate it's the PM's chosen action.
  const action =
    (typeof input.action === "string" ? input.action : pending?.action) as ActionType | undefined;
  if (!action || !ACTION_TYPES.includes(action)) {
    return jsonResponse({ error: "unknown_action" }, 400, req);
  }
  const params = (input.params ?? {}) as Record<string, unknown>;

  let coverage: Coverage = session.coverage ?? {};
  const activeFramework = { ...(session.active_framework ?? {}) };
  const result: Record<string, unknown> = {};

  // Dismiss: record the decision, clear the card, do nothing else.
  if (decision === "dismiss") {
    if (action === "define_success_metric") coverage = mergeCoverage(coverage, { success_metric: "declined", goals: { define_success: "covered" } });
    if (action === "prepare_interviews") coverage = mergeCoverage(coverage, { interviews: "declined", goals: { prepare_to_learn: "covered" } });
    const updated = await persistState(service, session.id, { coverage, pending_action: null });
    return jsonResponse({ dismissed: true, coverage, session_updated_at: updated?.updated_at }, 200, req);
  }

  switch (action) {
    case "map_assumptions": {
      const r = await invokeFunction(req, "assumption-mapping", "POST", { session_id: session.id });
      if (!r.ok) return jsonResponse({ error: "capability_failed", detail: r.json }, r.status, req);
      coverage = mergeCoverage(coverage, { goals: { surface_assumptions: "covered" } });
      result.assumptions = r.json;
      break;
    }
    case "ground_assumption": {
      const assumptionId =
        typeof params.assumption_id === "string" ? params.assumption_id : pending?.target?.assumption_id;
      if (!assumptionId) return jsonResponse({ error: "assumption_id required" }, 400, req);
      const r = await invokeFunction(req, "market-grounding", "POST", { assumption_id: assumptionId });
      if (!r.ok) return jsonResponse({ error: "capability_failed", detail: r.json }, r.status, req);
      coverage = mergeCoverage(coverage, { goals: { gather_evidence: "in_progress" } });
      result.evidence = r.json;
      break;
    }
    case "run_blind_spots": {
      const r = await invokeFunction(req, "blind-spots", "POST", { session_id: session.id });
      if (!r.ok) return jsonResponse({ error: "capability_failed", detail: r.json }, r.status, req);
      coverage = mergeCoverage(coverage, { goals: { gather_evidence: "covered" } });
      result.blind_spots = r.json;
      break;
    }
    case "propose_prioritization": {
      const chosen = typeof params.framework === "string" ? params.framework : undefined;
      const fw = getFramework(chosen);
      if (!fw || fw.slot !== "prioritization") {
        return jsonResponse({ error: "invalid_framework" }, 400, req);
      }
      activeFramework.prioritization = fw.id;
      coverage = mergeCoverage(coverage, { goals: { prioritize: "in_progress" } });
      result.framework = fw.id;
      break;
    }
    case "prepare_interviews": {
      const fw = getFramework(typeof params.framework === "string" ? params.framework : null);
      if (fw && fw.slot === "interview") activeFramework.interview = fw.id;
      const r = await invokeFunction(req, "interview-guide", "POST", { session_id: session.id });
      if (!r.ok) return jsonResponse({ error: "capability_failed", detail: r.json }, r.status, req);
      coverage = mergeCoverage(coverage, { interviews: "prepared", goals: { prepare_to_learn: "covered" } });
      result.interview_guide = r.json;
      break;
    }
    case "define_success_metric": {
      // The PM picked a candidate (echoed back as a MetricCandidate, camelCase)
      // → record it as a thread message + mark the metric defined.
      const chosen = params.chosen as
        | { northStar?: string; proxy?: string; driftRisk?: string; measures?: string }
        | undefined;
      if (!chosen || typeof chosen.northStar !== "string" || typeof chosen.proxy !== "string") {
        return jsonResponse({ error: "chosen metric required (northStar + proxy)" }, 400, req);
      }
      activeFramework.success_metric = "north_star";
      const body = [
        "**Success metric chosen**",
        "",
        `**North Star:** ${chosen.northStar}`,
        chosen.measures ? `**Measures:** ${chosen.measures}` : "",
        `**Proxy:** ${chosen.proxy}`,
        chosen.driftRisk ? `**Watch for drift:** ${chosen.driftRisk}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      await service.from("messages").insert({
        conversation_id: session.conversation_id,
        role: "assistant",
        content: body,
      });
      coverage = mergeCoverage(coverage, { success_metric: "defined", goals: { define_success: "covered" } });
      break;
    }
    case "revisit_phase": {
      const goal =
        (typeof params.goal === "string" ? params.goal : pending?.goal) as DiscoveryGoal | undefined;
      const updated = await persistState(service, session.id, {
        current_phase: goal ?? session.current_phase,
        coverage,
        active_framework: activeFramework,
        pending_action: null,
      });
      return jsonResponse({ current_phase: goal, coverage, session_updated_at: updated?.updated_at }, 200, req);
    }
    case "conclude": {
      const r = await invokeFunction(req, `sessions?id=${session.id}`, "PATCH", { action: "complete" });
      if (!r.ok) return jsonResponse({ error: "capability_failed", detail: r.json }, r.status, req);
      await persistState(service, session.id, { pending_action: null });
      return jsonResponse({ concluded: true, session: r.json }, 200, req);
    }
    default: {
      // ask_next / dig_deeper aren't dispatchable actions — they're the coach.
      return jsonResponse({ error: "not_dispatchable", action }, 400, req);
    }
  }

  const nextPhase = ACTION_GOAL[action] ?? session.current_phase;
  const updated = await persistState(service, session.id, {
    current_phase: nextPhase,
    coverage,
    active_framework: activeFramework,
    pending_action: null,
  });

  return jsonResponse(
    { ok: true, current_phase: nextPhase, coverage, active_framework: activeFramework, result, session_updated_at: updated?.updated_at },
    200,
    req,
  );
}
