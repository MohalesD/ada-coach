// Ada Coach /admin-spend Edge Function (Run 3)
// The Should-Have spend story: model spend by day and by call type,
// read from model_usage (no new tables). Admin/owner only.
//
// GET ?days=30 (1..90). Aggregation is in-memory over a bounded window
// via the service client — same precedent as admin-insights; move to a
// SQL aggregate if the dataset ever grows past the page cap below.
//
// Honesty note on web search: cost_usd is the all-in number per call
// (tokens + $10/1k searches). web_search_requests (Run 3 column) makes
// the search component separable going forward; market_grounding rows
// written before the column exist with a NULL count and are reported as
// "blended" — their search cost cannot be split retroactively.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";
import { WEB_SEARCH_COST_PER_REQUEST_USD } from "../_shared/models.ts";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const PAGE_SIZE = 1000; // PostgREST max_rows for this project
const MAX_PAGES = 10;

interface UsageRow {
  created_at: string;
  call_type: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  web_search_requests: number | null;
  cost_usd: number | null;
}

interface DayRowAggregate {
  call_type: string;
  model: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  web_search_requests: number;
  cost_usd: number;
}

const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;

  try {
    const daysParam = Number(
      new URL(req.url).searchParams.get("days") ?? DEFAULT_DAYS,
    );
    const days = Number.isInteger(daysParam)
      ? Math.min(Math.max(daysParam, 1), MAX_DAYS)
      : DEFAULT_DAYS;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();

    const service = getServiceClient();

    // Bounded pagination — max_rows caps a single select at 1000.
    const rows: UsageRow[] = [];
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await service
        .from("model_usage")
        .select(
          "created_at, call_type, model, input_tokens, output_tokens, web_search_requests, cost_usd",
        )
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) {
        console.error("model_usage read failed:", error);
        return jsonResponse({ error: "Could not load spend data." }, 500, req);
      }
      rows.push(...((data ?? []) as UsageRow[]));
      if (!data || data.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    // Aggregate: per UTC day per (call_type, model), plus overall totals.
    const dayMap = new Map<string, Map<string, DayRowAggregate>>();
    const modelTotals = new Map<string, { calls: number; cost_usd: number }>();
    let totalCost = 0;
    let searchRequests = 0;
    let blendedRows = 0;

    for (const r of rows) {
      const date = r.created_at.slice(0, 10);
      const key = `${r.call_type}|${r.model}`;
      const byKey = dayMap.get(date) ?? new Map<string, DayRowAggregate>();
      const agg = byKey.get(key) ?? {
        call_type: r.call_type,
        model: r.model,
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        web_search_requests: 0,
        cost_usd: 0,
      };
      agg.calls += 1;
      agg.input_tokens += r.input_tokens ?? 0;
      agg.output_tokens += r.output_tokens ?? 0;
      agg.web_search_requests += r.web_search_requests ?? 0;
      agg.cost_usd = round6(agg.cost_usd + (r.cost_usd ?? 0));
      byKey.set(key, agg);
      dayMap.set(date, byKey);

      const mt = modelTotals.get(r.model) ?? { calls: 0, cost_usd: 0 };
      mt.calls += 1;
      mt.cost_usd = round6(mt.cost_usd + (r.cost_usd ?? 0));
      modelTotals.set(r.model, mt);

      totalCost = round6(totalCost + (r.cost_usd ?? 0));
      searchRequests += r.web_search_requests ?? 0;
      if (r.call_type === "market_grounding" && r.web_search_requests === null) {
        blendedRows += 1;
      }
    }

    const daysOut = [...dayMap.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, byKey]) => ({
        date,
        rows: [...byKey.values()].sort((a, b) =>
          a.call_type.localeCompare(b.call_type)
        ),
      }));

    return jsonResponse(
      {
        window_days: days,
        since: sinceIso,
        truncated,
        totals: {
          calls: rows.length,
          cost_usd: totalCost,
          by_model: [...modelTotals.entries()]
            .map(([model, t]) => ({ model, ...t }))
            .sort((a, b) => b.cost_usd - a.cost_usd),
          web_search: {
            requests: searchRequests,
            // Separable component only — already included in cost_usd.
            cost_usd: round6(searchRequests * WEB_SEARCH_COST_PER_REQUEST_USD),
            blended_rows: blendedRows,
          },
        },
        days: daysOut,
      },
      200,
      req,
    );
  } catch (err) {
    console.error("admin-spend unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
