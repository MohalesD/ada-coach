// Run 5 — intel background-run status (products.intel_status).
// Web-search calls routinely exceed the edge gateway's 150s idle window,
// so the search endpoints answer 202 and finish in a background worker.
// This cell is the worker's report line and the client's poll target,
// and it serializes runs: one intel run per product at a time.

export const INTEL_RUN_STALE_MS = 10 * 60 * 1000;

export type IntelRunKind =
  | "market_brief"
  | "competitor_identification"
  | "competitor_profile";

export interface IntelStatus {
  kind: IntelRunKind;
  state: "running" | "done" | "error";
  started_at: string;
  finished_at?: string;
  competitor_id?: string;
  // user-safe outcome fields (state 'done')
  searches?: number;
  partial?: boolean;
  unmapped?: boolean;
  note?: string | null;
  // user-safe failure copy (state 'error')
  message?: string;
}

type ProductClient = {
  from(table: string): {
    update(row: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: unknown }>;
    };
  };
};

export async function setIntelStatus(
  service: ProductClient,
  productId: string,
  status: IntelStatus,
): Promise<void> {
  const { error } = await service
    .from("products")
    .update({ intel_status: status })
    .eq("id", productId);
  if (error) console.error("intel_status write failed:", error);
}

// True when a run is genuinely still in flight (a crashed worker's stale
// 'running' cell is reclaimable after INTEL_RUN_STALE_MS).
export function isRunActive(
  status: IntelStatus | null | undefined,
  nowMs: number,
): boolean {
  if (!status || status.state !== "running") return false;
  const started = Date.parse(status.started_at);
  return Number.isFinite(started) && nowMs - started < INTEL_RUN_STALE_MS;
}
