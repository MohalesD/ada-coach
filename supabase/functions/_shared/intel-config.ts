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

// ── Per-CALL latency ceilings ──────────────────────────────────────────
// The Supabase edge gateway kills a response after 150s idle, and each
// pause_turn continuation is a full extra model turn — verified live on
// 2026-07-05 when a 3-search identify call breached 150s and was cut.
// So beyond the per-RUN budget (cost), every single HTTP call also gets
// a small search ceiling (latency): a call that wants more coverage ends
// partial and the PM continues with a refresh/retry, which is the PRD's
// own hit-the-cap-mid-run behavior. Run 2/3 data: 5-search calls landed
// in 60–90s.
export const BRIEF_CALL_SEARCH_CAP = 6;
export const IDENTIFY_SEARCH_CAP = 3;
export const PROFILE_CALL_SEARCH_CAP = 5;

export function parseIntelSearchBudget(
  raw: string | null | undefined,
): number {
  if (raw && /^[0-9]+$/.test(raw.trim())) {
    const n = parseInt(raw.trim(), 10);
    if (n >= 1) return n;
  }
  return DEFAULT_INTEL_SEARCH_BUDGET;
}

// What one brief-research run may actually spend: the config budget,
// latency-capped per call.
export function briefSearchBudget(totalBudget: number): number {
  return Math.max(1, Math.min(BRIEF_CALL_SEARCH_CAP, totalBudget));
}

export function identifySearchBudget(totalBudget: number): number {
  return Math.max(1, Math.min(IDENTIFY_SEARCH_CAP, totalBudget));
}

// Per-competitor allocation for a profiling run. Returns 0 when the
// confirmed count exceeds the budget (the confirm endpoint rejects that
// case up front with too_many_competitors, so profiling never sees it).
// The run total stays within the budget (count × allocation ≤ budget);
// the per-call ceiling only ever lowers a slice, never raises it.
export function perCompetitorSearchBudget(
  totalBudget: number,
  confirmedCount: number,
): number {
  if (confirmedCount < 1 || confirmedCount > totalBudget) return 0;
  return Math.min(
    PROFILE_CALL_SEARCH_CAP,
    Math.floor(totalBudget / confirmedCount),
  );
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
