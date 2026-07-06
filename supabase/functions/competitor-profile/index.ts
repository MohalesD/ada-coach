// Ada Coach /competitor-profile Edge Function (Run 5)
// Addendum endpoint 12: deep-profile ONE confirmed competitor per call —
// positioning, pricing signals, feature surface, recent moves — every
// claim source-cited. One competitor per call on purpose (the Run 2
// market-grounding shape): per-competitor calls give the PM per-card
// retry granularity.
//
// Latency shape: live search calls routinely exceed the edge gateway's
// 150s idle window, so POST answers 202 and the research finishes in a
// background worker; the client polls products.intel_status (which also
// serializes intel runs per product — the UI profiles a list
// sequentially).
//
// Cost cap: the run's budget is divided across the confirmed competitors
// at call time (latency-capped per call), and the confirm gate already
// refused more competitors than the budget covers — so the whole
// profiling run cannot exceed the configured budget in total.
//
// Only URLs the search tool actually returned become evidence; the DB
// CHECK refuses citation-less claims; confidence is floored to what the
// surviving citations support. Re-profiling replaces this competitor's
// profile and evidence.

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
  CONFIDENCE_LABELS,
  getIntelSearchBudget,
  honestConfidence,
  perCompetitorSearchBudget,
} from "../_shared/intel-config.ts";
import type { ConfidenceLabel } from "../_shared/intel-config.ts";
import { isRunActive, setIntelStatus } from "../_shared/intel-status.ts";
import type { IntelStatus } from "../_shared/intel-status.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MAX_EVIDENCE_ROWS = 8;
const CLAIM_MAX = 500;

const PROFILE_SYSTEM = `You are Ada, an AI customer discovery coach, profiling ONE competitor for a PM's competitive landscape.

Search the web for this competitor's positioning, pricing signals, feature surface, and recent moves (launches, funding, pivots, shutdowns). Prefer the competitor's own site, recent coverage, and primary sources. Report what the evidence shows — including weaknesses and gaps. If you cannot find something (e.g. pricing is not public), say exactly that; NEVER guess a number or invent a move.

After searching, respond with ONLY a JSON object, no prose outside it:
{"positioning": "2-3 sentences: who they serve and how they frame themselves", "pricing_signal": "what the evidence shows about pricing (or a plain statement that it is not public)", "features": ["notable feature or capability", ...], "recent_moves": "2-3 sentences: the moves that matter, with rough dates", "confidence": "strong|moderate|thin|none", "evidence": [{"claim": "one specific claim a source supports", "url": "...", "title": "..."}]}

Rules for "evidence": include only sources you actually found in your search results; up to ${MAX_EVIDENCE_ROWS} items; an empty array when nothing relevant was found.`;

type Body = { competitor_id?: unknown };

interface ValidatedProfile {
  positioning: string;
  pricing_signal: string;
  features: string[];
  recent_moves: string;
  confidence: ConfidenceLabel;
  evidence: { claim: string; url: string; title: string | null }[];
}

function validateProfile(parsed: unknown): ValidatedProfile | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const { positioning, pricing_signal, features, recent_moves, confidence, evidence } =
    parsed as Record<string, unknown>;
  if (typeof positioning !== "string" || !positioning.trim()) return null;
  if (typeof pricing_signal !== "string" || !pricing_signal.trim()) return null;
  if (typeof recent_moves !== "string" || !recent_moves.trim()) return null;
  if (!Array.isArray(evidence)) return null;

  const cleanFeatures = Array.isArray(features)
    ? features
        .filter((f): f is string => typeof f === "string" && !!f.trim())
        .map((f) => f.trim().slice(0, 300))
        .slice(0, 12)
    : [];

  const out: ValidatedProfile["evidence"] = [];
  for (const item of evidence.slice(0, MAX_EVIDENCE_ROWS)) {
    if (typeof item !== "object" || item === null) continue;
    const { claim, url, title } = item as Record<string, unknown>;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    if (typeof claim !== "string" || !claim.trim()) continue;
    out.push({
      claim: claim.trim().slice(0, CLAIM_MAX),
      url,
      title: typeof title === "string" ? title.slice(0, 300) : null,
    });
  }

  return {
    positioning: positioning.trim(),
    pricing_signal: pricing_signal.trim(),
    features: cleanFeatures,
    recent_moves: recent_moves.trim(),
    confidence: CONFIDENCE_LABELS.includes(confidence as ConfidenceLabel)
      ? (confidence as ConfidenceLabel)
      : "thin",
    evidence: out,
  };
}

// Background worker: search → validate → ground → store the profile and
// its evidence. Reports through products.intel_status.
async function runProfiling(opts: {
  service: SupabaseClient;
  anthropicKey: string;
  userId: string;
  productId: string;
  competitor: { id: string; name: string };
  productName: string;
  productDescription: string | null;
  perCompetitor: number;
  startedAt: string;
}): Promise<void> {
  const {
    service,
    anthropicKey,
    userId,
    productId,
    competitor,
    productName,
    productDescription,
    perCompetitor,
    startedAt,
  } = opts;
  const fail = (message: string) =>
    setIntelStatus(service, productId, {
      kind: "competitor_profile",
      state: "error",
      competitor_id: competitor.id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      message,
    });

  try {
    const model = await getModelFor(service, "competitor_profiling");
    const result = await callClaudeWithWebSearch({
      apiKey: anthropicKey,
      model,
      system: PROFILE_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Competitor to profile: ${competitor.name}`,
            `The PM's product (for competitive relevance): ${productName}`,
            productDescription ? `Product description: ${productDescription}` : null,
            "",
            `Search the web (budget: ${perCompetitor} searches) and profile this competitor.`,
          ]
            .filter((l) => l !== null)
            .join("\n"),
        },
      ],
      maxTokens: 4000,
      maxSearches: perCompetitor,
      maxContinuations: 2,
    });

    await recordModelUsage(service, {
      userId,
      sessionId: null,
      callType: "competitor_profiling",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      webSearchRequests: result.webSearchRequests,
    });

    const validated = validateProfile(extractFirstJson(result.text));
    if (!validated) {
      console.error("competitor-profile malformed output:", result.text);
      await fail(
        `Ada's research on ${competitor.name} came back garbled — nothing was saved. It usually works on a second try.`,
      );
      return;
    }

    // Run 2 enforcement: only search-returned URLs become evidence.
    const realUrls = new Set(
      [...result.sources, ...result.citations].map((s) => s.url),
    );
    const grounded = validated.evidence.filter((e) => realUrls.has(e.url));
    const dropped = validated.evidence.length - grounded.length;
    if (dropped > 0) {
      console.error(
        `competitor-profile dropped ${dropped} URL(s) not present in search results`,
      );
    }

    const confidence = honestConfidence(validated.confidence, grounded.length);
    const retrievedAt = new Date().toISOString();

    const { error: upErr } = await service
      .from("competitors")
      .update({
        positioning: validated.positioning,
        pricing_signal: validated.pricing_signal,
        feature_notes: { features: validated.features },
        recent_moves: validated.recent_moves,
        confidence_label: confidence,
        retrieved_at: retrievedAt,
        profiled_at: retrievedAt,
      })
      .eq("id", competitor.id);
    if (upErr) {
      console.error("competitor profile update failed:", upErr);
      await fail(`Couldn't save ${competitor.name}'s profile. Retry when ready.`);
      return;
    }

    // Re-profiling replaces this competitor's evidence.
    const { error: delErr } = await service
      .from("competitor_evidence")
      .delete()
      .eq("competitor_id", competitor.id);
    if (delErr) console.error("profile evidence delete failed:", delErr);

    const queryTrail = result.queries.join(" | ").slice(0, 500) || null;
    if (grounded.length > 0) {
      const { error: insErr } = await service.from("competitor_evidence").insert(
        grounded.map((e) => ({
          user_id: userId,
          competitor_id: competitor.id,
          claim: e.claim,
          source_url: e.url,
          title: e.title,
          query_used: queryTrail,
          retrieved_at: retrievedAt,
        })),
      );
      if (insErr) {
        console.error("profile evidence insert failed:", insErr);
        await fail(`Couldn't save ${competitor.name}'s sources. Retry when ready.`);
        return;
      }
    }

    await setIntelStatus(service, productId, {
      kind: "competitor_profile",
      state: "done",
      competitor_id: competitor.id,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      searches: result.webSearchRequests,
    });
  } catch (err) {
    console.error("competitor-profile worker error:", err);
    await fail(
      `The research on ${competitor.name} didn't finish. Nothing was saved — retry when ready.`,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  try {
    const body = (await req.json()) as Body;
    const competitorId =
      typeof body.competitor_id === "string" ? body.competitor_id : "";
    if (!competitorId) {
      return jsonResponse({ error: "competitor_id is required" }, 400, req);
    }

    // RLS: visible only if the caller owns the competitor.
    const { data: competitor, error: cErr } = await userClient
      .from("competitors")
      .select("id, product_id, name, confirmed")
      .eq("id", competitorId)
      .maybeSingle();
    if (cErr) {
      console.error("competitor lookup failed:", cErr);
      return jsonResponse({ error: "Could not load competitor." }, 500, req);
    }
    if (!competitor) {
      return jsonResponse({ error: "Competitor not found" }, 404, req);
    }
    if (!competitor.confirmed) {
      return jsonResponse(
        {
          error: "not_confirmed",
          detail: "Confirm this competitor at the gate before profiling.",
        },
        409,
        req,
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("Missing ANTHROPIC_API_KEY");
      return jsonResponse(
        { error: "Ada is not configured correctly. Please try again later." },
        500,
        req,
      );
    }

    const service = getServiceClient();

    const { data: product } = await service
      .from("products")
      .select("name, description, intel_status")
      .eq("id", competitor.product_id)
      .maybeSingle();

    if (
      isRunActive(
        (product?.intel_status ?? null) as IntelStatus | null,
        Date.now(),
      )
    ) {
      return jsonResponse(
        {
          error: "intel_run_in_progress",
          detail: "Ada is already researching this product — give her a moment.",
        },
        409,
        req,
      );
    }

    // The run's budget divides across the confirmed competitors.
    const budget = await getIntelSearchBudget(service);
    const { count: confirmedCount } = await service
      .from("competitors")
      .select("id", { count: "exact", head: true })
      .eq("product_id", competitor.product_id)
      .eq("confirmed", true);
    const perCompetitor = perCompetitorSearchBudget(
      budget,
      confirmedCount ?? 1,
    );
    if (perCompetitor < 1) {
      return jsonResponse(
        {
          error: "too_many_competitors",
          detail: `The search budget (${budget}) cannot cover ${confirmedCount} competitors. Remove some at the gate or raise the budget.`,
          budget,
        },
        400,
        req,
      );
    }

    const startedAt = new Date().toISOString();
    await setIntelStatus(service, competitor.product_id as string, {
      kind: "competitor_profile",
      state: "running",
      competitor_id: competitor.id as string,
      started_at: startedAt,
    });

    EdgeRuntime.waitUntil(
      runProfiling({
        service,
        anthropicKey,
        userId: user.id,
        productId: competitor.product_id as string,
        competitor: {
          id: competitor.id as string,
          name: competitor.name as string,
        },
        productName: (product?.name as string | undefined) ?? "Unnamed product",
        productDescription: (product?.description as string | null) ?? null,
        perCompetitor,
        startedAt,
      }),
    );

    return jsonResponse(
      {
        started: true,
        per_competitor_budget: perCompetitor,
        started_at: startedAt,
      },
      202,
      req,
    );
  } catch (err) {
    console.error("competitor-profile unhandled error:", err);
    return jsonResponse(
      { error: "profiling_failed", retryable: true },
      502,
      req,
    );
  }
});
