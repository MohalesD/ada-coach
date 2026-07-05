// Cost and usage tracking middleware (Run 1, PRD Backend task).
// Every production model call is recorded in model_usage with tier, token
// counts, and computed cost, keyed to the session. Writes are best-effort:
// a logging failure is console.error'd but never fails the user's request,
// since they already paid the AI cost.

import {
  assertAllowedModel,
  MODEL_PRICING,
  WEB_SEARCH_COST_PER_REQUEST_USD,
} from "./models.ts";
import type { CallType } from "./models.ts";

export interface ModelUsageEntry {
  userId: string;
  sessionId: string | null;
  callType: CallType;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  // Web-search server tool requests made during the call (market
  // grounding). Folded into cost_usd at $10/1k.
  webSearchRequests?: number | null;
}

export function computeCostUsd(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
  webSearchRequests: number | null = null,
): number | null {
  const pricing = MODEL_PRICING[model];
  const searchCost = (webSearchRequests ?? 0) * WEB_SEARCH_COST_PER_REQUEST_USD;
  if (!pricing) {
    return searchCost > 0 ? Math.round(searchCost * 1_000_000) / 1_000_000 : null;
  }
  if (inputTokens === null && outputTokens === null && searchCost === 0) {
    return null;
  }
  const cost =
    ((inputTokens ?? 0) * pricing.inputPerMTok +
      (outputTokens ?? 0) * pricing.outputPerMTok) /
      1_000_000 +
    searchCost;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

type InsertClient = {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
};

export async function recordModelUsage(
  service: InsertClient,
  entry: ModelUsageEntry,
): Promise<void> {
  // Belt and suspenders with the model_usage CHECK constraint: a
  // Mythos-tier model can neither be called (models.ts) nor recorded.
  assertAllowedModel(entry.model);

  const { error } = await service.from("model_usage").insert({
    user_id: entry.userId,
    session_id: entry.sessionId,
    call_type: entry.callType,
    model: entry.model,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    // Stored separately (Run 3) so the spend view can split search cost
    // out of the all-in cost_usd; null = no search component.
    web_search_requests: entry.webSearchRequests ?? null,
    cost_usd: computeCostUsd(
      entry.model,
      entry.inputTokens,
      entry.outputTokens,
      entry.webSearchRequests ?? null,
    ),
  });

  if (error) {
    console.error("recordModelUsage insert failed:", error.message);
  }
}
