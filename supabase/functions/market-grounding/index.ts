// Ada Coach /market-grounding Edge Function (Run 2)
// PRD Technical Flow step 7: for a high-risk assumption, query the web
// (Sonnet 4.6 + Anthropic web search server tool) for competitor moves,
// market data, and behavioral research, and attach source-cited evidence
// to the assumption record.
//
// ONE assumption per call, on purpose: web search is the slowest step in
// the sprint, Edge Functions have wall-clock limits, and the PRD requires
// per-step retry — the frontend fans out per assumption and shows
// progress on each card. Re-running replaces that assumption's evidence.
//
// Anti-hallucination rule: only URLs the search tool actually returned
// are stored as evidence. A model-invented URL is dropped, never saved.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { callClaudeWithWebSearch, extractFirstJson } from "../_shared/anthropic.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";

const MAX_SEARCHES = 5;
const MAX_EVIDENCE_ROWS = 8;
const SNIPPET_MAX = 500;
const STANCES = new Set(["supports", "challenges", "neutral"]);

const GROUNDING_SYSTEM = `You are Ada, an AI customer discovery coach. Your task: pressure-test ONE product assumption against live market evidence.

Search the web for competitor moves, market data, pricing signals, and behavioral research relevant to the assumption. Prefer primary sources and recent data. Never validate the assumption to be agreeable — report what the evidence actually shows. If the search returns nothing genuinely relevant, say so plainly; never manufacture a citation.

After searching, respond with ONLY a JSON object, no prose outside it, in exactly this shape:
{"summary": "2-4 plain sentences on what the evidence shows about this assumption", "evidence": [{"url": "...", "title": "...", "stance": "supports|challenges|neutral", "note": "one sentence on what this source shows"}]}

Rules for "evidence": include only sources you actually found in your search results; 2 to ${MAX_EVIDENCE_ROWS} items when relevant sources exist; an empty array when nothing relevant was found. "stance" is about the ASSUMPTION: does the source support it being true, challenge it, or neither.`;

type GroundingBody = { assumption_id?: unknown };

interface EvidenceCandidate {
  url: string;
  title: string | null;
  stance: string;
  note: string | null;
}

function validateEvidence(parsed: unknown): {
  summary: string;
  evidence: EvidenceCandidate[];
} | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const { summary, evidence } = parsed as Record<string, unknown>;
  if (typeof summary !== "string" || !summary.trim()) return null;
  if (!Array.isArray(evidence)) return null;

  const out: EvidenceCandidate[] = [];
  for (const item of evidence.slice(0, MAX_EVIDENCE_ROWS)) {
    if (typeof item !== "object" || item === null) continue;
    const { url, title, stance, note } = item as Record<string, unknown>;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    out.push({
      url,
      title: typeof title === "string" ? title.slice(0, 300) : null,
      stance:
        typeof stance === "string" && STANCES.has(stance) ? stance : "neutral",
      note: typeof note === "string" ? note.slice(0, SNIPPET_MAX) : null,
    });
  }
  return { summary: summary.trim(), evidence: out };
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
    const body = (await req.json()) as GroundingBody;
    const assumptionId =
      typeof body.assumption_id === "string" ? body.assumption_id : "";
    if (!assumptionId) {
      return jsonResponse({ error: "assumption_id is required" }, 400, req);
    }

    // RLS: visible only if the caller owns the assumption.
    const { data: assumption, error: aErr } = await userClient
      .from("assumptions")
      .select("id, session_id, product_id, statement, category, confidence, impact")
      .eq("id", assumptionId)
      .maybeSingle();
    if (aErr) {
      console.error("assumption lookup failed:", aErr);
      return jsonResponse({ error: "Could not load assumption." }, 500, req);
    }
    if (!assumption) {
      return jsonResponse({ error: "Assumption not found" }, 404, req);
    }

    const { data: session, error: sErr } = await userClient
      .from("sessions")
      .select("id, status, conversation_id")
      .eq("id", assumption.session_id)
      .maybeSingle();
    if (sErr || !session) {
      console.error("session lookup failed:", sErr);
      return jsonResponse({ error: "Could not load session." }, 500, req);
    }
    if (session.status !== "in_progress") {
      return jsonResponse(
        { error: "invalid_state", detail: "Session is not in progress." },
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
      .select("name, description")
      .eq("id", assumption.product_id)
      .maybeSingle();

    const model = await getModelFor(service, "market_grounding");
    const userPrompt = [
      `Product: ${product?.name ?? "Unnamed product"}`,
      product?.description ? `Product description: ${product.description}` : null,
      `Assumption category: ${assumption.category}`,
      `Assumption (confidence ${assumption.confidence}/5, impact ${assumption.impact}/5):`,
      `"${assumption.statement}"`,
      "",
      "Search the web and pressure-test this assumption.",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const result = await callClaudeWithWebSearch({
      apiKey: anthropicKey,
      model,
      system: GROUNDING_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 3000,
      maxSearches: MAX_SEARCHES,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: session.id,
      callType: "market_grounding",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      webSearchRequests: result.webSearchRequests,
    });

    const validated = validateEvidence(extractFirstJson(result.text));
    if (!validated) {
      console.error("market-grounding malformed output:", result.text);
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    // Keep only URLs the search tool actually returned (exact or same-host
    // prefix match) — a model-invented URL never becomes stored evidence.
    const realUrls = new Set(
      [...result.sources, ...result.citations].map((s) => s.url),
    );
    const grounded = validated.evidence.filter((e) => realUrls.has(e.url));
    const dropped = validated.evidence.length - grounded.length;
    if (dropped > 0) {
      console.error(
        `market-grounding dropped ${dropped} URL(s) not present in search results`,
      );
    }

    const queryTrail = result.queries.join(" | ").slice(0, 500) || null;
    const rows = grounded.map((e) => ({
      user_id: user.id,
      assumption_id: assumption.id,
      session_id: session.id,
      source_url: e.url,
      title: e.title,
      snippet: e.note,
      query: queryTrail,
      stance: e.stance,
    }));

    // Re-running grounding replaces this assumption's evidence.
    const { error: delErr } = await service
      .from("assumption_evidence")
      .delete()
      .eq("assumption_id", assumption.id);
    if (delErr) console.error("evidence delete failed:", delErr);

    let inserted: unknown[] = [];
    if (rows.length > 0) {
      const { data, error: insErr } = await service
        .from("assumption_evidence")
        .insert(rows)
        .select("*");
      if (insErr || !data) {
        console.error("evidence insert failed:", insErr);
        return jsonResponse({ error: "Could not save evidence." }, 500, req);
      }
      inserted = data;
    }

    // Thread message so the sprint conversation reads coherently (and the
    // existing export/summary paths pick it up for free).
    const sourceLines = grounded
      .map((e) => `- [${e.title ?? e.url}](${e.url}) — ${e.stance}`)
      .join("\n");
    const messageContent = [
      `**Market check — "${assumption.statement}"**`,
      "",
      validated.summary,
      sourceLines ? `\nSources:\n${sourceLines}` : "\n_No relevant sources found — treat this one as Socratic-only for now._",
    ].join("\n");
    const { error: msgErr } = await service.from("messages").insert({
      conversation_id: session.conversation_id,
      role: "assistant",
      content: messageContent,
    });
    if (msgErr) console.error("grounding message insert failed:", msgErr);

    return jsonResponse(
      {
        assumption_id: assumption.id,
        summary: validated.summary,
        evidence: inserted,
        searches: result.webSearchRequests,
        model,
      },
      201,
      req,
    );
  } catch (err) {
    console.error("market-grounding unhandled error:", err);
    return jsonResponse(
      { error: "grounding_failed", retryable: true },
      502,
      req,
    );
  }
});
