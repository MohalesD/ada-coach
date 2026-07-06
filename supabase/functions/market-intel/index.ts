// Ada Coach /market-intel Edge Function (Run 5)
// Addendum endpoint 9: on demand for a product, profile the market —
// size signals, trends, demand evidence, adjacent players — every claim
// source-cited, stored as a standing, refreshable, dated snapshot.
//
// Two Sonnet 4.6 calls: a cheap no-search PLAN call that turns product
// context into bounded search angles, then one RESEARCH call that
// executes the angles through the Run 2 web-search wrapper (whose
// budget ledger enforces the config-driven cap) and synthesizes the
// sourced brief. Only URLs the search tool actually returned become
// evidence rows; the DB CHECK refuses anything without a real URL.
//
// Honesty rules (PRD): zero grounded evidence forces confidence "none",
// thin evidence caps it at "thin"/"moderate" — the model can claim
// strength, but the stored label never exceeds what the citations
// support. Hitting the search cap marks the brief partial.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import {
  callClaude,
  callClaudeWithWebSearch,
  extractFirstJson,
} from "../_shared/anthropic.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import {
  CONFIDENCE_LABELS,
  getIntelSearchBudget,
  honestConfidence,
} from "../_shared/intel-config.ts";
import type { ConfidenceLabel } from "../_shared/intel-config.ts";

const MAX_EVIDENCE_ROWS = 12;
const CLAIM_MAX = 500;

const PLAN_SYSTEM = `You are Ada, an AI customer discovery coach, planning bounded market research for a PM's product.

Given the product context, produce 3 to 5 focused web-search queries that together cover: market size signals, market trends, demand/behavioral evidence, and adjacent or substitute players. Make each query specific enough to return useful results.

Respond with ONLY a JSON object, no prose outside it:
{"angles": ["query one", "query two", ...]}`;

const RESEARCH_SYSTEM = `You are Ada, an AI customer discovery coach, compiling a source-cited market brief for a PM's product.

Search the web along the given angles. Prefer primary sources and recent data. Report what the evidence actually shows — never inflate a market to be encouraging, and NEVER invent a number, source, or player. If the evidence is thin or a search returns nothing useful, say so plainly in the brief and rate your confidence honestly.

After searching, respond with ONLY a JSON object, no prose outside it, in exactly this shape:
{"summary": {"market_size": "what the evidence shows about market size, with the numbers you actually found (or a plain statement that none were found)", "trends": "the clearest trends in evidence", "demand_signals": "behavioral/demand evidence", "adjacent_players": "adjacent or substitute players worth knowing", "narrative": "3-5 plain sentences: the honest headline read on this market"}, "confidence": "strong|moderate|thin|none", "evidence": [{"claim": "one specific claim a source supports", "url": "...", "title": "..."}]}

Rules for "evidence": include only sources you actually found in your search results; up to ${MAX_EVIDENCE_ROWS} items; an empty array when nothing relevant was found. Every number or named player in the summary should trace to an evidence item.`;

type IntelBody = { product_id?: unknown };

interface EvidenceCandidate {
  claim: string;
  url: string;
  title: string | null;
}

interface ValidatedBrief {
  summary: Record<string, string>;
  confidence: ConfidenceLabel;
  evidence: EvidenceCandidate[];
}

const SUMMARY_KEYS = [
  "market_size",
  "trends",
  "demand_signals",
  "adjacent_players",
  "narrative",
] as const;

function validateBrief(parsed: unknown): ValidatedBrief | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const { summary, confidence, evidence } = parsed as Record<string, unknown>;
  if (typeof summary !== "object" || summary === null) return null;
  if (!Array.isArray(evidence)) return null;

  const cleanSummary: Record<string, string> = {};
  for (const key of SUMMARY_KEYS) {
    const v = (summary as Record<string, unknown>)[key];
    if (typeof v !== "string" || !v.trim()) return null;
    cleanSummary[key] = v.trim();
  }

  const out: EvidenceCandidate[] = [];
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
    summary: cleanSummary,
    confidence: CONFIDENCE_LABELS.includes(confidence as ConfidenceLabel)
      ? (confidence as ConfidenceLabel)
      : "thin",
    evidence: out,
  };
}

function fallbackAngles(name: string, description: string | null): string[] {
  const base = description ? `${name} ${description.slice(0, 80)}` : name;
  return [
    `${base} market size`,
    `${base} market trends 2026`,
    `${name} alternatives competitors`,
    `${base} customer demand adoption`,
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  // GET: the current search budget, so the UI can surface the cost of a
  // run BEFORE the PM starts it (app_settings itself is owner-only).
  if (req.method === "GET") {
    const budget = await getIntelSearchBudget(getServiceClient());
    return jsonResponse({ budget }, 200, req);
  }

  try {
    const body = (await req.json()) as IntelBody;
    const productId =
      typeof body.product_id === "string" ? body.product_id : "";
    if (!productId) {
      return jsonResponse({ error: "product_id is required" }, 400, req);
    }

    // RLS: visible only if the caller owns the product.
    const { data: product, error: pErr } = await userClient
      .from("products")
      .select("id, name, description")
      .eq("id", productId)
      .maybeSingle();
    if (pErr) {
      console.error("product lookup failed:", pErr);
      return jsonResponse({ error: "Could not load product." }, 500, req);
    }
    if (!product) {
      return jsonResponse({ error: "Product not found" }, 404, req);
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
    const budget = await getIntelSearchBudget(service);

    const productContext = [
      `Product: ${product.name}`,
      product.description ? `Description: ${product.description}` : null,
    ]
      .filter((l) => l !== null)
      .join("\n");

    // ── Step 1: plan bounded search angles (Sonnet 4.6, no search) ────────
    const planModel = await getModelFor(service, "market_intel_plan");
    let angles: string[] = [];
    try {
      const plan = await callClaude({
        apiKey: anthropicKey,
        model: planModel,
        system: PLAN_SYSTEM,
        messages: [{ role: "user", content: productContext }],
        maxTokens: 1000,
      });
      await recordModelUsage(service, {
        userId: user.id,
        sessionId: null,
        callType: "market_intel_plan",
        model: planModel,
        inputTokens: plan.inputTokens,
        outputTokens: plan.outputTokens,
      });
      const parsed = extractFirstJson(plan.text) as { angles?: unknown } | null;
      if (Array.isArray(parsed?.angles)) {
        angles = parsed.angles
          .filter((a): a is string => typeof a === "string" && !!a.trim())
          .slice(0, 5);
      }
    } catch (err) {
      console.error("market-intel plan call failed (using fallback angles):", err);
    }
    if (angles.length === 0) {
      angles = fallbackAngles(product.name, product.description);
    }

    // ── Step 2: bounded research + synthesis (Sonnet 4.6 + web search) ────
    const researchModel = await getModelFor(service, "market_intel_research");
    const result = await callClaudeWithWebSearch({
      apiKey: anthropicKey,
      model: researchModel,
      system: RESEARCH_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            productContext,
            "",
            `Research angles (you have a budget of ${budget} searches total — stay within it):`,
            ...angles.map((a, i) => `${i + 1}. ${a}`),
            "",
            "Search the web along these angles, then compile the market brief.",
          ].join("\n"),
        },
      ],
      maxTokens: 5000,
      maxSearches: budget,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: null,
      callType: "market_intel_research",
      model: researchModel,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      webSearchRequests: result.webSearchRequests,
    });

    const validated = validateBrief(extractFirstJson(result.text));
    if (!validated) {
      console.error("market-intel malformed output:", result.text);
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    // Run 2 enforcement: only URLs the search tool actually returned
    // become stored evidence — a model-invented URL is dropped here.
    const realUrls = new Set(
      [...result.sources, ...result.citations].map((s) => s.url),
    );
    const grounded = validated.evidence.filter((e) => realUrls.has(e.url));
    const dropped = validated.evidence.length - grounded.length;
    if (dropped > 0) {
      console.error(
        `market-intel dropped ${dropped} URL(s) not present in search results`,
      );
    }

    const confidence = honestConfidence(validated.confidence, grounded.length);
    const partial = result.webSearchRequests >= budget;
    const searchUnavailable = result.webSearchRequests === 0;
    const retrievedAt = new Date().toISOString();

    const summaryJson = {
      ...validated.summary,
      // Explicit honesty flags the UI renders as labeled states, never
      // silently absorbed into prose.
      partial,
      search_unavailable: searchUnavailable,
    };

    // Upsert the standing brief (row id stable across refreshes).
    const { data: existing } = await service
      .from("market_briefs")
      .select("id")
      .eq("product_id", product.id)
      .maybeSingle();

    let brief;
    if (existing) {
      const { data, error } = await service
        .from("market_briefs")
        .update({
          summary: summaryJson,
          confidence_label: confidence,
          partial,
          search_count: result.webSearchRequests,
          retrieved_at: retrievedAt,
        })
        .eq("id", (existing as { id: string }).id)
        .select("*")
        .single();
      if (error || !data) {
        console.error("brief update failed:", error);
        return jsonResponse({ error: "Could not save the brief." }, 500, req);
      }
      brief = data;
    } else {
      const { data, error } = await service
        .from("market_briefs")
        .insert({
          user_id: user.id,
          product_id: product.id,
          summary: summaryJson,
          confidence_label: confidence,
          partial,
          search_count: result.webSearchRequests,
          retrieved_at: retrievedAt,
        })
        .select("*")
        .single();
      if (error || !data) {
        console.error("brief insert failed:", error);
        return jsonResponse({ error: "Could not save the brief." }, 500, req);
      }
      brief = data;
    }

    // Refresh replaces the evidence set.
    const briefId = (brief as { id: string }).id;
    const { error: delErr } = await service
      .from("market_evidence")
      .delete()
      .eq("market_brief_id", briefId);
    if (delErr) console.error("market evidence delete failed:", delErr);

    const queryTrail = result.queries.join(" | ").slice(0, 500) || null;
    let inserted: unknown[] = [];
    if (grounded.length > 0) {
      const { data, error: insErr } = await service
        .from("market_evidence")
        .insert(
          grounded.map((e) => ({
            user_id: user.id,
            market_brief_id: briefId,
            claim: e.claim,
            source_url: e.url,
            title: e.title,
            query_used: queryTrail,
            retrieved_at: retrievedAt,
          })),
        )
        .select("*");
      if (insErr || !data) {
        console.error("market evidence insert failed:", insErr);
        return jsonResponse({ error: "Could not save evidence." }, 500, req);
      }
      inserted = data;
    }

    return jsonResponse(
      {
        brief,
        evidence: inserted,
        searches: result.webSearchRequests,
        budget,
        model: researchModel,
      },
      existing ? 200 : 201,
      req,
    );
  } catch (err) {
    console.error("market-intel unhandled error:", err);
    return jsonResponse(
      { error: "market_intel_failed", retryable: true },
      502,
      req,
    );
  }
});
