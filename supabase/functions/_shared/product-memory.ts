// Product memory (Run 2) — the "session ten builds on session one" story.
// Run 1 stored the raw material (session summaries on `sessions`, the
// validated/challenged/abandoned ledger on `assumptions`); this module
// turns it into a compact text bundle the Sonnet calls (assumption
// mapping, blind spots, interview guide) prepend to their prompts, so
// coaching on a product with history is different from a first sprint.
//
// formatProductMemory is pure (Vitest-tested); loadProductMemory wraps
// the two service-client queries. No Deno APIs here.

const MAX_SUMMARIES = 3;
const MAX_SUMMARY_CHARS = 1500;
const MAX_LEDGER_ITEMS = 30;

export interface LedgerAssumption {
  statement: string;
  status: string; // validated | challenged | abandoned
}

export function formatProductMemory(
  summaries: string[],
  ledger: LedgerAssumption[],
): string {
  if (summaries.length === 0 && ledger.length === 0) return "";

  const parts: string[] = [
    "=== PRODUCT MEMORY (from prior Discovery Sprints on this product) ===",
  ];

  if (ledger.length > 0) {
    parts.push("Assumption ledger — do not re-test what is already settled:");
    for (const status of ["validated", "challenged", "abandoned"] as const) {
      const items = ledger.filter((a) => a.status === status);
      if (items.length > 0) {
        parts.push(`${status.toUpperCase()}:`);
        for (const a of items) parts.push(`- ${a.statement}`);
      }
    }
  }

  if (summaries.length > 0) {
    parts.push("Prior session summaries (most recent first):");
    summaries.slice(0, MAX_SUMMARIES).forEach((s, i) => {
      const clipped =
        s.length > MAX_SUMMARY_CHARS ? `${s.slice(0, MAX_SUMMARY_CHARS)}…` : s;
      parts.push(`[${i + 1}] ${clipped}`);
    });
  }

  parts.push("=== END PRODUCT MEMORY ===");
  return parts.join("\n");
}

// Minimal structural slice of the Supabase query builder used below —
// callers pass the service client (cast), keeping this module import-free
// and unit-testable.
export interface MemoryQuery {
  eq(column: string, value: string): MemoryQuery;
  in(column: string, values: string[]): MemoryQuery;
  not(column: string, operator: string, value: unknown): MemoryQuery;
  order(
    column: string,
    opts: { ascending: boolean },
  ): MemoryQuery;
  limit(
    n: number,
  ): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
}

export interface MemoryClient {
  from(table: string): { select(columns: string): MemoryQuery };
}

export async function loadProductMemory(
  client: MemoryClient,
  opts: { productId: string; excludeSessionId?: string },
): Promise<string> {
  const [sessionsResult, ledgerResult] = await Promise.all([
    client
      .from("sessions")
      .select("id, summary, completed_at")
      .eq("product_id", opts.productId)
      .eq("status", "completed")
      .not("summary", "is", null)
      .order("completed_at", { ascending: false })
      .limit(MAX_SUMMARIES + 1),
    client
      .from("assumptions")
      .select("statement, status")
      .eq("product_id", opts.productId)
      .in("status", ["validated", "challenged", "abandoned"])
      .order("updated_at", { ascending: false })
      .limit(MAX_LEDGER_ITEMS),
  ]);

  if (sessionsResult.error) {
    console.error("product memory sessions query failed:", sessionsResult.error);
  }
  if (ledgerResult.error) {
    console.error("product memory ledger query failed:", ledgerResult.error);
  }

  const summaries = ((sessionsResult.data ?? []) as Array<
    { id: string; summary: string | null }
  >)
    .filter((s) => s.id !== opts.excludeSessionId && s.summary)
    .slice(0, MAX_SUMMARIES)
    .map((s) => s.summary as string);

  const ledger = ((ledgerResult.data ?? []) as LedgerAssumption[]).filter(
    (a) => typeof a.statement === "string" && typeof a.status === "string",
  );

  return formatProductMemory(summaries, ledger);
}
