// Ada Coach /competitive-gap Edge Function (Run 5)
// Addendum endpoint 13: positioning-gap analysis — where the landscape
// is unserved — synthesized by Sonnet 4.6 over the ALREADY-STORED,
// source-cited competitor profiles. No web search here: the analysis
// reasons over evidence that was grounded when it was retrieved, and
// asking the model to re-search would let ungrounded claims sneak in.
//
// The "intel feeds the risk map" seam: threats may reference the
// product's real assumptions (ids are server-validated; unknown ids are
// dropped), so the report's risk map can badge assumptions a competitive
// threat backs. Competitor attributions are matched against stored
// names; an unmatched name is nulled, never invented.
//
// Output persists on products.competitive_gap (service-role-only
// column), and the report function folds it into every snapshot it
// compiles — which is how the gap lands in the product's report.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { callClaude, extractFirstJson } from "../_shared/anthropic.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import { CONFIDENCE_LABELS } from "../_shared/intel-config.ts";
import type { ConfidenceLabel } from "../_shared/intel-config.ts";

const GAP_SYSTEM = `You are Ada, an AI customer discovery coach, mapping where a competitive landscape is UNSERVED for a PM's product.

You are given source-cited competitor profiles (already researched) and the PM's own discovery assumptions. Reason ONLY over what is given — do not invent competitors, features, or numbers that are not in the material.

Respond with ONLY a JSON object, no prose outside it:
{"summary": "3-5 plain sentences: the honest headline read on this landscape and where the openings are", "gaps": [{"gap": "an unserved or underserved space", "rationale": "why the profiled landscape leaves it open, citing which competitors fall short and how", "opportunity": "one sentence: how the PM's product could take it"}], "threats": [{"threat": "a specific competitive threat to this product", "competitor": "the profiled competitor it comes from", "related_assumption_ids": ["id of any given assumption this threat pressures"]}], "confidence": "strong|moderate|thin|none"}

Rules: 2-5 gaps, 1-5 threats. "competitor" must be one of the profiled competitor names exactly. "related_assumption_ids" may be empty; include an id ONLY when the threat genuinely pressures that assumption. If the profiles are too thin to see real gaps, say so in the summary and rate confidence honestly.`;

type Body = { product_id?: unknown };

interface GapOut {
  gap: string;
  rationale: string;
  opportunity: string | null;
}

interface ThreatOut {
  threat: string;
  competitor: string | null;
  related_assumption_ids: string[];
}

function validateGap(parsed: unknown): {
  summary: string;
  gaps: GapOut[];
  threats: ThreatOut[];
  confidence: ConfidenceLabel;
} | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const { summary, gaps, threats, confidence } = parsed as Record<
    string,
    unknown
  >;
  if (typeof summary !== "string" || !summary.trim()) return null;
  if (!Array.isArray(gaps) || !Array.isArray(threats)) return null;

  const cleanGaps: GapOut[] = [];
  for (const item of gaps.slice(0, 5)) {
    if (typeof item !== "object" || item === null) continue;
    const { gap, rationale, opportunity } = item as Record<string, unknown>;
    if (typeof gap !== "string" || !gap.trim()) continue;
    if (typeof rationale !== "string" || !rationale.trim()) continue;
    cleanGaps.push({
      gap: gap.trim().slice(0, 500),
      rationale: rationale.trim().slice(0, 1000),
      opportunity:
        typeof opportunity === "string" ? opportunity.trim().slice(0, 500) : null,
    });
  }
  if (cleanGaps.length === 0) return null;

  const cleanThreats: ThreatOut[] = [];
  for (const item of threats.slice(0, 5)) {
    if (typeof item !== "object" || item === null) continue;
    const { threat, competitor, related_assumption_ids } = item as Record<
      string,
      unknown
    >;
    if (typeof threat !== "string" || !threat.trim()) continue;
    cleanThreats.push({
      threat: threat.trim().slice(0, 500),
      competitor: typeof competitor === "string" ? competitor.trim() : null,
      related_assumption_ids: Array.isArray(related_assumption_ids)
        ? related_assumption_ids.filter(
            (v): v is string => typeof v === "string",
          )
        : [],
    });
  }

  return {
    summary: summary.trim(),
    gaps: cleanGaps,
    threats: cleanThreats,
    confidence: CONFIDENCE_LABELS.includes(confidence as ConfidenceLabel)
      ? (confidence as ConfidenceLabel)
      : "thin",
  };
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

    const service = getServiceClient();

    const { data: competitors } = await service
      .from("competitors")
      .select(
        "id, name, positioning, pricing_signal, feature_notes, recent_moves, confidence_label",
      )
      .eq("product_id", product.id)
      .eq("confirmed", true)
      .not("profiled_at", "is", null)
      .order("created_at", { ascending: true });

    if (!competitors || competitors.length === 0) {
      return jsonResponse(
        {
          error: "nothing_profiled",
          detail: "Profile at least one confirmed competitor before the gap analysis.",
        },
        400,
        req,
      );
    }

    const { data: evidence } = await service
      .from("competitor_evidence")
      .select("competitor_id, claim, source_url")
      .in(
        "competitor_id",
        competitors.map((c) => c.id as string),
      );

    // The product's assumptions (across its sessions) — the linkage
    // candidates for "this threat pressures that assumption".
    const { data: assumptions } = await service
      .from("assumptions")
      .select("id, statement, category, confidence, impact")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true });

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("Missing ANTHROPIC_API_KEY");
      return jsonResponse(
        { error: "Ada is not configured correctly. Please try again later." },
        500,
        req,
      );
    }

    const profileBlocks = competitors.map((c) => {
      const rows = (evidence ?? []).filter(
        (e) => e.competitor_id === c.id,
      );
      const features = (c.feature_notes as { features?: string[] } | null)
        ?.features;
      return [
        `### ${c.name} (evidence confidence: ${c.confidence_label ?? "unrated"})`,
        `Positioning: ${c.positioning ?? "unknown"}`,
        `Pricing: ${c.pricing_signal ?? "unknown"}`,
        features && features.length > 0
          ? `Features: ${features.join("; ")}`
          : null,
        `Recent moves: ${c.recent_moves ?? "unknown"}`,
        rows.length > 0
          ? `Cited claims:\n${rows.map((e) => `- ${e.claim}`).join("\n")}`
          : null,
      ]
        .filter((l) => l !== null)
        .join("\n");
    });

    const assumptionBlock =
      assumptions && assumptions.length > 0
        ? assumptions
            .map(
              (a) =>
                `- [${a.id}] (${a.category}, confidence ${a.confidence}/5, impact ${a.impact}/5) ${a.statement}`,
            )
            .join("\n")
        : "(none mapped yet)";

    const model = await getModelFor(service, "competitive_gap_analysis");
    const result = await callClaude({
      apiKey: anthropicKey,
      model,
      system: GAP_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `Product: ${product.name}`,
            product.description ? `Description: ${product.description}` : null,
            "",
            "## Profiled competitors",
            ...profileBlocks,
            "",
            "## The PM's discovery assumptions",
            assumptionBlock,
            "",
            "Map the gaps and threats.",
          ]
            .filter((l) => l !== null)
            .join("\n"),
        },
      ],
      maxTokens: 4000,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: null,
      callType: "competitive_gap_analysis",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const validated = validateGap(extractFirstJson(result.text));
    if (!validated) {
      console.error("competitive-gap malformed output:", result.text);
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    // Server-side validation of every linkage: unknown assumption ids
    // are dropped; a competitor attribution that matches no stored
    // profile is nulled — nothing invented survives into storage.
    const realAssumptionIds = new Set(
      (assumptions ?? []).map((a) => a.id as string),
    );
    const nameMap = new Map(
      competitors.map((c) => [(c.name as string).toLowerCase(), c.name as string]),
    );
    const threats = validated.threats.map((t) => ({
      threat: t.threat,
      competitor: t.competitor
        ? nameMap.get(t.competitor.toLowerCase()) ?? null
        : null,
      related_assumption_ids: t.related_assumption_ids.filter((id) =>
        realAssumptionIds.has(id),
      ),
    }));

    const generatedAt = new Date().toISOString();
    const gap = {
      summary: validated.summary,
      gaps: validated.gaps,
      threats,
      confidence_label: validated.confidence,
      competitor_count: competitors.length,
      generated_at: generatedAt,
    };

    const { error: upErr } = await service
      .from("products")
      .update({ competitive_gap: gap, gap_generated_at: generatedAt })
      .eq("id", product.id);
    if (upErr) {
      console.error("gap store failed:", upErr);
      return jsonResponse({ error: "Could not save the analysis." }, 500, req);
    }

    return jsonResponse({ gap, model }, 201, req);
  } catch (err) {
    console.error("competitive-gap unhandled error:", err);
    return jsonResponse(
      { error: "gap_analysis_failed", retryable: true },
      502,
      req,
    );
  }
});
