// Ada Coach /competitive-intel Edge Function (Run 5)
// Addendum endpoints 10 + 11 — the two sides of the confirm gate:
//   POST  { product_id }  → identify candidate competitors (Sonnet 4.6 +
//         bounded web search). Live search calls routinely exceed the
//         edge gateway's 150s idle window, so identification runs as a
//         background worker (EdgeRuntime.waitUntil) behind a 202; the
//         client polls products.intel_status. Candidates land with
//         confirmed = false and are NEVER profiled automatically.
//   PATCH { product_id, confirm, add, remove } → the PM confirms/adds/
//         removes BEFORE deep profiling spends the search budget. Fast,
//         synchronous; the response carries the profiling cost math the
//         UI must surface.
//
// Honesty rules: if search finds nothing, the space is reported as
// unmapped and the PM is asked for known competitors — Ada never invents
// one. Re-identifying replaces only unconfirmed, unprofiled candidates;
// competitors the PM confirmed (or already paid to profile) survive.

import "@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import {
  callClaudeWithWebSearch,
  extractFirstJson,
} from "../_shared/anthropic.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import {
  getIntelSearchBudget,
  identifySearchBudget,
  perCompetitorSearchBudget,
} from "../_shared/intel-config.ts";
import { isRunActive, setIntelStatus } from "../_shared/intel-status.ts";
import type { IntelStatus } from "../_shared/intel-status.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MAX_CANDIDATES = 8;
const NAME_MAX = 120;

const IDENTIFY_SYSTEM = `You are Ada, an AI customer discovery coach, identifying the real competitive landscape for a PM's product.

Search the web for named products or companies that solve the same problem for the same kind of customer — direct competitors first, then close substitutes. Only name competitors you actually found evidence of in your search results. If the searches return nothing genuinely relevant, say the space looks unmapped — NEVER invent a competitor to seem thorough.

After searching, respond with ONLY a JSON object, no prose outside it:
{"competitors": [{"name": "Product or company name", "why": "one sentence: what it is and why it competes", "url": "the search-result URL that evidences it"}], "unmapped": false, "note": "one plain sentence on how mapped this space looks"}

Rules: 3 to ${MAX_CANDIDATES} competitors when the space is mapped; an empty array with "unmapped": true when it is not. Each "url" must be a URL from your actual search results.`;

interface CandidateOut {
  name: string;
  why: string | null;
  url: string | null;
}

function validateCandidates(parsed: unknown): {
  competitors: CandidateOut[];
  unmapped: boolean;
  note: string | null;
} | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const { competitors, unmapped, note } = parsed as Record<string, unknown>;
  if (!Array.isArray(competitors)) return null;

  const out: CandidateOut[] = [];
  const seen = new Set<string>();
  for (const item of competitors.slice(0, MAX_CANDIDATES)) {
    if (typeof item !== "object" || item === null) continue;
    const { name, why, url } = item as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) continue;
    const clean = name.trim().slice(0, NAME_MAX);
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: clean,
      why: typeof why === "string" ? why.slice(0, 500) : null,
      url: typeof url === "string" && /^https?:\/\//i.test(url) ? url : null,
    });
  }
  return {
    competitors: out,
    unmapped: unmapped === true || out.length === 0,
    note: typeof note === "string" ? note.slice(0, 500) : null,
  };
}

// Background worker: search → validate → replace unconfirmed candidates
// → store identification evidence. Reports through products.intel_status.
async function runIdentification(opts: {
  service: SupabaseClient;
  anthropicKey: string;
  userId: string;
  product: { id: string; name: string; description: string | null };
  identifyBudget: number;
  startedAt: string;
}): Promise<void> {
  const { service, anthropicKey, userId, product, identifyBudget, startedAt } =
    opts;
  const fail = (message: string) =>
    setIntelStatus(service, product.id, {
      kind: "competitor_identification",
      state: "error",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      message,
    });

  try {
    const model = await getModelFor(service, "competitor_identification");
    const result = await callClaudeWithWebSearch({
      apiKey: anthropicKey,
      model,
      system: IDENTIFY_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Product: ${product.name}`,
            product.description
              ? `Description: ${product.description}`
              : null,
            "",
            "Search the web and identify the named competitors for this product.",
          ]
            .filter((l) => l !== null)
            .join("\n"),
        },
      ],
      maxTokens: 2000,
      maxSearches: identifyBudget,
      maxContinuations: 1,
    });

    await recordModelUsage(service, {
      userId,
      sessionId: null,
      callType: "competitor_identification",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      webSearchRequests: result.webSearchRequests,
    });

    const validated = validateCandidates(extractFirstJson(result.text));
    if (!validated) {
      console.error("competitive-intel malformed output:", result.text);
      await fail(
        "Ada's search came back garbled — nothing was saved. It usually works on a second try.",
      );
      return;
    }

    // Re-identifying replaces only unconfirmed, unprofiled candidates.
    const { error: delErr } = await service
      .from("competitors")
      .delete()
      .eq("product_id", product.id)
      .eq("confirmed", false)
      .is("profiled_at", null);
    if (delErr) console.error("candidate replace failed:", delErr);

    // Survivors (confirmed/profiled) keep their names off the new list.
    const { data: survivors } = await service
      .from("competitors")
      .select("id, name")
      .eq("product_id", product.id);
    const survivorNames = new Set(
      (survivors ?? []).map((c) => (c.name as string).toLowerCase()),
    );
    const fresh = validated.competitors.filter(
      (c) => !survivorNames.has(c.name.toLowerCase()),
    );

    const realUrls = new Set(
      [...result.sources, ...result.citations].map((s) => s.url),
    );
    const queryTrail = result.queries.join(" | ").slice(0, 500) || null;
    const retrievedAt = new Date().toISOString();

    if (fresh.length > 0) {
      const { data: inserted, error: insErr } = await service
        .from("competitors")
        .insert(
          fresh.map((c) => ({
            user_id: userId,
            product_id: product.id,
            name: c.name,
            added_by: "ada",
            confirmed: false,
            retrieved_at: retrievedAt,
          })),
        )
        .select("id, name");
      if (insErr || !inserted) {
        console.error("candidate insert failed:", insErr);
        await fail("Couldn't save the candidates. Try the search again.");
        return;
      }

      // Identification evidence: only search-returned URLs are stored
      // (the DB CHECK refuses anything without a real URL anyway).
      const evidenceRows = inserted.flatMap((row) => {
        const cand = fresh.find(
          (c) => c.name.toLowerCase() === (row.name as string).toLowerCase(),
        );
        if (!cand?.url || !realUrls.has(cand.url)) return [];
        return [
          {
            user_id: userId,
            competitor_id: row.id,
            claim: cand.why ?? `Identified as a competitor of ${product.name}.`,
            source_url: cand.url,
            title: null,
            query_used: queryTrail,
            retrieved_at: retrievedAt,
          },
        ];
      });
      if (evidenceRows.length > 0) {
        const { error } = await service
          .from("competitor_evidence")
          .insert(evidenceRows);
        if (error) console.error("identify evidence insert failed:", error);
      }
    }

    await setIntelStatus(service, product.id, {
      kind: "competitor_identification",
      state: "done",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      searches: result.webSearchRequests,
      unmapped: validated.unmapped,
      note: validated.note,
    });
  } catch (err) {
    console.error("competitive-intel worker error:", err);
    await fail("The competitor search didn't finish. Try again.");
  }
}

type Body = {
  product_id?: unknown;
  confirm?: unknown;
  add?: unknown;
  remove?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST" && req.method !== "PATCH") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  try {
    const body = (await req.json()) as Body;
    const productId =
      typeof body.product_id === "string" ? body.product_id : "";
    if (!productId) {
      return jsonResponse({ error: "product_id is required" }, 400, req);
    }

    // RLS: visible only if the caller owns the product.
    const { data: product, error: pErr } = await userClient
      .from("products")
      .select("id, name, description, intel_status")
      .eq("id", productId)
      .maybeSingle();
    if (pErr) {
      console.error("product lookup failed:", pErr);
      return jsonResponse({ error: "Could not load product." }, 500, req);
    }
    if (!product) {
      return jsonResponse({ error: "Product not found" }, 404, req);
    }

    const service = getServiceClient();
    const budget = await getIntelSearchBudget(service);

    // ── PATCH: the confirm gate (fast, synchronous) ────────────────────
    if (req.method === "PATCH") {
      const confirmIds = Array.isArray(body.confirm)
        ? body.confirm.filter((v): v is string => typeof v === "string")
        : [];
      const addNames = Array.isArray(body.add)
        ? body.add
            .filter((v): v is string => typeof v === "string" && !!v.trim())
            .map((v) => v.trim().slice(0, NAME_MAX))
        : [];
      const removeIds = Array.isArray(body.remove)
        ? body.remove.filter((v): v is string => typeof v === "string")
        : [];

      // Existing rows for this product (service read; ownership was
      // already proven by the RLS product lookup above).
      const { data: existing, error: exErr } = await service
        .from("competitors")
        .select("id, name, confirmed, profiled_at")
        .eq("product_id", product.id);
      if (exErr || !existing) {
        console.error("competitors lookup failed:", exErr);
        return jsonResponse({ error: "Could not load competitors." }, 500, req);
      }
      const byId = new Map(existing.map((c) => [c.id as string, c]));

      for (const id of [...confirmIds, ...removeIds]) {
        if (!byId.has(id)) {
          return jsonResponse({ error: "Unknown competitor id" }, 400, req);
        }
      }

      const removeSet = new Set(removeIds);
      const confirmSet = new Set(
        confirmIds.filter((id) => !removeSet.has(id)),
      );
      const existingNames = new Set(
        existing
          .filter((c) => !removeSet.has(c.id as string))
          .map((c) => (c.name as string).toLowerCase()),
      );
      const newNames = addNames.filter(
        (n) => !existingNames.has(n.toLowerCase()),
      );

      const finalCount = confirmSet.size + newNames.length;
      if (finalCount === 0) {
        return jsonResponse(
          {
            error: "nothing_confirmed",
            detail: "Confirm or add at least one competitor to profile.",
          },
          400,
          req,
        );
      }
      // The cap must hold across the whole profiling run: every
      // confirmed competitor needs at least one search inside the
      // budget, so more competitors than budget is refused up front.
      if (finalCount > budget) {
        return jsonResponse(
          {
            error: "too_many_competitors",
            detail: `The search budget (${budget}) allows at most ${budget} competitors per profiling run. Remove ${finalCount - budget} or raise the budget.`,
            budget,
          },
          400,
          req,
        );
      }

      if (removeIds.length > 0) {
        const { error } = await service
          .from("competitors")
          .delete()
          .in("id", removeIds)
          .eq("product_id", product.id);
        if (error) {
          console.error("competitor remove failed:", error);
          return jsonResponse({ error: "Could not update the list." }, 500, req);
        }
      }

      // Confirm the kept set; un-confirm anything left out so the gate's
      // outcome is exactly what the PM sees on screen.
      const keepIds = [...confirmSet];
      if (keepIds.length > 0) {
        const { error: confErr } = await service
          .from("competitors")
          .update({ confirmed: true })
          .in("id", keepIds)
          .eq("product_id", product.id);
        if (confErr) {
          console.error("competitor confirm failed:", confErr);
          return jsonResponse({ error: "Could not update the list." }, 500, req);
        }
      }
      let unconfirmQuery = service
        .from("competitors")
        .update({ confirmed: false })
        .eq("product_id", product.id);
      if (keepIds.length > 0) {
        unconfirmQuery = unconfirmQuery.not(
          "id",
          "in",
          `(${keepIds.join(",")})`,
        );
      }
      const { error: unconfErr } = await unconfirmQuery;
      if (unconfErr) console.error("competitor unconfirm failed:", unconfErr);

      if (newNames.length > 0) {
        const { error } = await service.from("competitors").insert(
          newNames.map((name) => ({
            user_id: user.id,
            product_id: product.id,
            name,
            added_by: "user",
            confirmed: true,
          })),
        );
        if (error) {
          console.error("competitor add failed:", error);
          return jsonResponse({ error: "Could not add competitors." }, 500, req);
        }
      }

      const { data: updated } = await service
        .from("competitors")
        .select("*")
        .eq("product_id", product.id)
        .order("created_at", { ascending: true });

      const perCompetitor = perCompetitorSearchBudget(budget, finalCount);
      return jsonResponse(
        {
          competitors: updated ?? [],
          profiling: {
            confirmed_count: finalCount,
            per_competitor_searches: perCompetitor,
            total_max_searches: perCompetitor * finalCount,
            budget,
          },
        },
        200,
        req,
      );
    }

    // ── POST: identify candidates (202 + background worker) ────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("Missing ANTHROPIC_API_KEY");
      return jsonResponse(
        { error: "Ada is not configured correctly. Please try again later." },
        500,
        req,
      );
    }

    if (isRunActive(product.intel_status as IntelStatus | null, Date.now())) {
      return jsonResponse(
        {
          error: "intel_run_in_progress",
          detail: "Ada is already researching this product — give her a moment.",
        },
        409,
        req,
      );
    }

    const identifyBudget = identifySearchBudget(budget);
    const startedAt = new Date().toISOString();
    await setIntelStatus(service, product.id, {
      kind: "competitor_identification",
      state: "running",
      started_at: startedAt,
    });

    EdgeRuntime.waitUntil(
      runIdentification({
        service,
        anthropicKey,
        userId: user.id,
        product: {
          id: product.id as string,
          name: product.name as string,
          description: (product.description as string | null) ?? null,
        },
        identifyBudget,
        startedAt,
      }),
    );

    return jsonResponse(
      { started: true, budget, started_at: startedAt },
      202,
      req,
    );
  } catch (err) {
    console.error("competitive-intel unhandled error:", err);
    return jsonResponse(
      { error: "competitive_intel_failed", retryable: true },
      502,
      req,
    );
  }
});
