// Run 5 — intel search-budget configuration and allocation.
// The per-run web-search cap lives in app_settings under
// 'intel_search_budget' (text int, default 15), owner-editable without a
// redeploy. Allocation rules keep the cap provably holding across
// multi-call runs:
//   - a market brief run spends the whole budget in its single research
//     call (max_uses enforced by the wrapper's ledger),
//   - competitor identification spends at most min(5, budget),
//   - a profiling run divides the budget across the confirmed
//     competitors: floor(budget / count) each, and the confirm gate
//     refuses more competitors than the budget can cover, so
//     count × per-competitor ≤ budget always.
//
// No Deno APIs here — the pure helpers are unit-tested by Vitest.

export const DEFAULT_INTEL_SEARCH_BUDGET = 15;

// Identification is cheap discovery, not deep research — it never needs
// the whole budget. 5 mirrors Run 2's market-grounding search cap.
export const IDENTIFY_SEARCH_CAP = 5;

export function parseIntelSearchBudget(
  raw: string | null | undefined,
): number {
  if (raw && /^[0-9]+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10);
    if (n >= 1) return n;
  }
  return DEFAULT_INTEL_SEARCH_BUDGET;
}

export function identifySearchBudget(totalBudget: number): number {
  return Math.max(1, Math.min(IDENTIFY_SEARCH_CAP, totalBudget));
}

// Per-competitor allocation for a profiling run. Returns 0 when the
// confirmed count exceeds the budget (the confirm endpoint rejects that
// case up front with too_many_competitors, so profiling never sees it).
export function perCompetitorSearchBudget(
  totalBudget: number,
  confirmedCount: number,
): number {
  if (confirmedCount < 1 || confirmedCount > totalBudget) return 0;
  return Math.floor(totalBudget / confirmedCount);
}

// ── Honest confidence labeling ─────────────────────────────────────────
// PRD: "if evidence is thin or search returns nothing, label confidence
// honestly, never fabricate." The stored label never exceeds what the
// surviving (search-returned) citations support: zero grounded evidence
// forces "none", 1–2 caps at "thin", 3–5 at "moderate".

export const CONFIDENCE_LABELS = [
  "strong",
  "moderate",
  "thin",
  "none",
] as const;
export type ConfidenceLabel = (typeof CONFIDENCE_LABELS)[number];

export function honestConfidence(
  claimed: ConfidenceLabel,
  groundedCount: number,
): ConfidenceLabel {
  if (groundedCount === 0) return "none";
  const cap: ConfidenceLabel =
    groundedCount <= 2 ? "thin" : groundedCount <= 5 ? "moderate" : "strong";
  const order: ConfidenceLabel[] = ["none", "thin", "moderate", "strong"];
  return order[Math.min(order.indexOf(claimed), order.indexOf(cap))];
}

// Minimal structural type so this module stays importable outside Deno
// (same shape models.ts uses).
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

export async function getIntelSearchBudget(
  service: SettingsClient,
): Promise<number> {
  const { data } = await service
    .from("app_settings")
    .select("value")
    .eq("key", "intel_search_budget")
    .maybeSingle();
  return parseIntelSearchBudget(data?.value ?? null);
}
