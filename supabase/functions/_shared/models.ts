// Config-driven model routing (Run 1, PRD Business Rules → Model routing).
// The route table lives in app_settings under the key 'model_routing'
// (JSON text), so the Haiku/Sonnet split can change without a redeploy.
// Hardcoded defaults below are the fallback when the setting is absent or
// malformed.
//
// Hard rule from the PRD: Fable 5 / Mythos-tier models are build-time only.
// assertAllowedModel throws before any such call could be made, and the
// model_usage table's CHECK constraint refuses to record one.
//
// No Deno APIs here — resolveModelRoutes/assertAllowedModel are unit-tested
// by Vitest.

export type CallType =
  | "stage_classification"
  | "session_summary"
  | "assumption_mapping"
  | "market_grounding"
  | "blind_spot_analysis"
  | "interview_guide"
  | "portfolio_route"
  | "portfolio_profile_extraction"
  | "portfolio_idea_generation"
  | "portfolio_artifact_coaching"
  | "portfolio_plan_generation"
  | "market_intel_plan"
  | "market_intel_research"
  | "competitor_identification"
  | "competitor_profiling"
  | "competitive_gap_analysis"
  // Agent-Loop Redesign — the discovery coaching loop.
  | "discovery_coach"
  | "discovery_evaluation"
  | "success_metric_candidates";

export const DEFAULT_MODEL_ROUTES: Record<CallType, string> = {
  stage_classification: "claude-haiku-4-5",
  session_summary: "claude-haiku-4-5",
  assumption_mapping: "claude-sonnet-4-6",
  market_grounding: "claude-sonnet-4-6",
  blind_spot_analysis: "claude-sonnet-4-6",
  interview_guide: "claude-sonnet-4-6",
  // Run 4 — portfolio coaching track. Haiku: intake classification and
  // resume field extraction (cheap, mechanical). Sonnet 4.6: idea
  // generation, artifact coaching, tool/effort recommendations
  // (reasoning-heavy synthesis) — matches the PRD's model-routing rule.
  portfolio_route: "claude-haiku-4-5",
  portfolio_profile_extraction: "claude-haiku-4-5",
  portfolio_idea_generation: "claude-sonnet-4-6",
  portfolio_artifact_coaching: "claude-sonnet-4-6",
  portfolio_plan_generation: "claude-sonnet-4-6",
  // Run 5 — market + competitive intelligence. ALL Sonnet 4.6 per the
  // PRD's routing rule: intel planning, search execution, and synthesis
  // are reasoning-heavy, and web_search always pairs with Sonnet 4.6,
  // never Haiku.
  market_intel_plan: "claude-sonnet-4-6",
  market_intel_research: "claude-sonnet-4-6",
  competitor_identification: "claude-sonnet-4-6",
  competitor_profiling: "claude-sonnet-4-6",
  competitive_gap_analysis: "claude-sonnet-4-6",
  // Agent-Loop Redesign. Haiku: the coaching reply (parity with the chat
  // surface) and the per-turn next-action evaluator (cheap, structured).
  // Sonnet 4.6: grounded North Star / proxy synthesis (reasoning-heavy).
  discovery_coach: "claude-haiku-4-5",
  discovery_evaluation: "claude-haiku-4-5",
  success_metric_candidates: "claude-sonnet-4-6",
};

// USD per million tokens. Source: Anthropic pricing via the claude-api
// reference (cached 2026-06-24). Unknown models cost out as null.
export const MODEL_PRICING: Record<
  string,
  { inputPerMTok: number; outputPerMTok: number }
> = {
  "claude-haiku-4-5": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  "claude-sonnet-4-6": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
};

// Anthropic web search server tool: $10 per 1,000 searches (verified
// against the web search tool docs 2026-07-04). Errored searches are not
// billed by Anthropic; we only count what the API reports in
// usage.server_tool_use.web_search_requests.
export const WEB_SEARCH_COST_PER_REQUEST_USD = 0.01;

const MYTHOS_TIER_RE = /fable|mythos/i;

export function assertAllowedModel(model: string): string {
  if (MYTHOS_TIER_RE.test(model)) {
    throw new Error(
      `Blocked model route "${model}": Fable/Mythos-tier models are build-time only and never run in production.`,
    );
  }
  return model;
}

// Merge the stored routing config (if any) over the defaults. Malformed
// JSON falls back to defaults — bad config must not take Ada down. A route
// pointing at a Mythos-tier model throws: that is a misconfiguration we
// refuse to serve.
export function resolveModelRoutes(
  rawSetting: string | null | undefined,
): Record<CallType, string> {
  const routes = { ...DEFAULT_MODEL_ROUTES };
  if (rawSetting) {
    try {
      const parsed = JSON.parse(rawSetting) as Record<string, unknown>;
      for (const key of Object.keys(DEFAULT_MODEL_ROUTES) as CallType[]) {
        const value = parsed[key];
        if (typeof value === "string" && value.trim()) {
          routes[key] = value.trim();
        }
      }
    } catch {
      console.error("model_routing setting is not valid JSON; using defaults");
    }
  }
  for (const model of Object.values(routes)) assertAllowedModel(model);
  return routes;
}

// Minimal structural type so this module stays importable outside Deno.
type SettingsClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        maybeSingle(): Promise<{ data: { value: string } | null }>;
      };
    };
  };
};

export async function getModelFor(
  service: SettingsClient,
  callType: CallType,
): Promise<string> {
  const { data } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "model_routing")
    .maybeSingle();
  return resolveModelRoutes(data?.value ?? null)[callType];
}
