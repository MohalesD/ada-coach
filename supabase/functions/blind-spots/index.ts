// Ada Coach /blind-spots Edge Function (Run 2)
// PRD Technical Flow step 8: Socratic blind spot analysis (Sonnet 4.6)
// grounded in the retrieved market evidence, the PM's own session
// documents, and the product's prior-sprint memory. Each blind spot is
// logged against its source assumption.
//
// Works with zero web evidence (search down, rate-limited, or skipped):
// the analysis proceeds on documents + history alone, and every claim is
// labeled evidence_backed only when it cites a URL that market grounding
// actually stored — the report renders evidence-backed and Socratic-only
// claims differently.

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
import { loadProductMemory, type MemoryClient } from "../_shared/product-memory.ts";

const MAX_BLIND_SPOTS = 7;
const STATEMENT_MAX = 600;
const DOC_CONTEXT_MAX = 8000;

const BLIND_SPOT_SYSTEM = `You are Ada, an AI customer discovery coach. Your task: surface the blind spots in a PM's thinking about their product idea — the questions they are not asking, the risks they have not priced in, the contradictions between what they believe and what the evidence shows.

You will receive the PM's scored assumptions, market evidence gathered per assumption (possibly none), excerpts from the PM's own documents (possibly none), and memory from prior sprints (possibly none).

Rules:
- Be Socratic and direct, never validating. A blind spot names something specific the PM has not confronted, then asks ONE sharp question about it.
- Mark "evidence_backed" true ONLY when the blind spot rests on one of the provided evidence sources, and list those exact source URLs. If it rests on reasoning alone, evidence_backed is false and source_urls is empty. Never invent a URL.
- Link each blind spot to the assumption it most undermines via its number from the list, or null if it cuts across all of them.
- 3 to ${MAX_BLIND_SPOTS} blind spots. Quality over quantity.

Respond with ONLY a JSON object, no prose outside it:
{"blind_spots": [{"statement": "...", "socratic_question": "...", "assumption_number": 1, "evidence_backed": false, "source_urls": []}]}`;

type BlindSpotsBody = { session_id?: unknown };

interface BlindSpotCandidate {
  statement: string;
  socratic_question: string | null;
  assumption_number: number | null;
  evidence_backed: boolean;
  source_urls: string[];
}

function validateBlindSpots(
  parsed: unknown,
  allowedUrls: Set<string>,
  assumptionCount: number,
): BlindSpotCandidate[] | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const list = (parsed as { blind_spots?: unknown }).blind_spots;
  if (!Array.isArray(list) || list.length === 0) return null;

  const out: BlindSpotCandidate[] = [];
  for (const item of list.slice(0, MAX_BLIND_SPOTS)) {
    if (typeof item !== "object" || item === null) return null;
    const { statement, socratic_question, assumption_number, evidence_backed, source_urls } =
      item as Record<string, unknown>;
    if (typeof statement !== "string" || !statement.trim()) return null;

    // Only URLs that market grounding actually stored count as evidence.
    const urls = Array.isArray(source_urls)
      ? (source_urls.filter(
          (u) => typeof u === "string" && allowedUrls.has(u),
        ) as string[])
      : [];
    const backed = evidence_backed === true && urls.length > 0;

    const num =
      typeof assumption_number === "number" &&
      Number.isInteger(assumption_number) &&
      assumption_number >= 1 &&
      assumption_number <= assumptionCount
        ? assumption_number
        : null;

    out.push({
      statement: statement.trim().slice(0, STATEMENT_MAX),
      socratic_question:
        typeof socratic_question === "string" && socratic_question.trim()
          ? socratic_question.trim().slice(0, STATEMENT_MAX)
          : null,
      assumption_number: num,
      evidence_backed: backed,
      source_urls: backed ? urls : [],
    });
  }
  return out.length > 0 ? out : null;
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
    const body = (await req.json()) as BlindSpotsBody;
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) {
      return jsonResponse({ error: "session_id is required" }, 400, req);
    }

    const { data: session, error: sErr } = await userClient
      .from("sessions")
      .select("id, product_id, conversation_id, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr) {
      console.error("session lookup failed:", sErr);
      return jsonResponse({ error: "Could not load session." }, 500, req);
    }
    if (!session) return jsonResponse({ error: "Session not found" }, 404, req);
    if (session.status !== "in_progress") {
      return jsonResponse(
        { error: "invalid_state", detail: "Session is not in progress." },
        409,
        req,
      );
    }

    const { data: assumptions, error: aErr } = await userClient
      .from("assumptions")
      .select("id, statement, category, confidence, impact")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (aErr) {
      console.error("assumptions lookup failed:", aErr);
      return jsonResponse({ error: "Could not load assumptions." }, 500, req);
    }
    if (!assumptions || assumptions.length === 0) {
      return jsonResponse(
        {
          error: "no_assumptions",
          detail: "Run assumption mapping before blind spot analysis.",
        },
        400,
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

    const [{ data: evidence }, { data: docs }, memory, { data: product }] =
      await Promise.all([
        service
          .from("assumption_evidence")
          .select("assumption_id, source_url, title, snippet, stance")
          .eq("session_id", sessionId),
        service
          .from("documents")
          .select("filename, content_text")
          .eq("session_id", sessionId)
          .eq("status", "ready"),
        loadProductMemory(service as unknown as MemoryClient, {
          productId: session.product_id,
          excludeSessionId: session.id,
        }),
        service
          .from("products")
          .select("name, description")
          .eq("id", session.product_id)
          .maybeSingle(),
      ]);

    const numbered = assumptions
      .map(
        (a: { statement: string; category: string; confidence: number; impact: number }, i: number) =>
          `${i + 1}. [${a.category}, confidence ${a.confidence}/5, impact ${a.impact}/5] ${a.statement}`,
      )
      .join("\n");

    const evidenceById = new Map<string, string[]>();
    const allowedUrls = new Set<string>();
    for (const e of (evidence ?? []) as Array<{
      assumption_id: string;
      source_url: string;
      title: string | null;
      snippet: string | null;
      stance: string;
    }>) {
      allowedUrls.add(e.source_url);
      const idx = assumptions.findIndex(
        (a: { id: string }) => a.id === e.assumption_id,
      );
      const key = idx >= 0 ? String(idx + 1) : "general";
      const lines = evidenceById.get(key) ?? [];
      lines.push(
        `- (${e.stance}) ${e.title ?? e.source_url} — ${e.snippet ?? ""} [${e.source_url}]`,
      );
      evidenceById.set(key, lines);
    }
    const evidenceBlock = [...evidenceById.entries()]
      .map(([num, lines]) => `Evidence for assumption ${num}:\n${lines.join("\n")}`)
      .join("\n\n");

    let docBlock = "";
    let budget = DOC_CONTEXT_MAX;
    for (const d of (docs ?? []) as Array<{ filename: string; content_text: string | null }>) {
      if (budget <= 0 || !d.content_text) continue;
      const clip = d.content_text.slice(0, Math.min(budget, 4000));
      docBlock += `--- From "${d.filename}" ---\n${clip}\n`;
      budget -= clip.length;
    }

    const userPrompt = [
      `Product: ${product?.name ?? "Unnamed product"}`,
      product?.description ? `Description: ${product.description}` : null,
      "",
      "Scored assumptions:",
      numbered,
      evidenceBlock ? `\nMarket evidence gathered:\n${evidenceBlock}` : "\nNo web evidence is available for this session — reason from the documents and assumptions alone, and mark everything evidence_backed: false.",
      docBlock ? `\nExcerpts from the PM's own documents:\n${docBlock}` : null,
      memory ? `\n${memory}` : null,
      "",
      "Surface the blind spots.",
    ]
      .filter((line) => line !== null)
      .join("\n");

    const model = await getModelFor(service, "blind_spot_analysis");
    const result = await callClaude({
      apiKey: anthropicKey,
      model,
      system: BLIND_SPOT_SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 2500,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: session.id,
      callType: "blind_spot_analysis",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const candidates = validateBlindSpots(
      extractFirstJson(result.text),
      allowedUrls,
      assumptions.length,
    );
    if (!candidates) {
      console.error("blind-spots malformed output:", result.text);
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    const rows = candidates.map((c) => ({
      user_id: user.id,
      session_id: session.id,
      assumption_id:
        c.assumption_number !== null
          ? (assumptions[c.assumption_number - 1] as { id: string }).id
          : null,
      statement: c.statement,
      socratic_question: c.socratic_question,
      evidence_backed: c.evidence_backed,
      source_urls: c.source_urls,
    }));

    // Re-running the step replaces this session's blind spots.
    const { error: delErr } = await service
      .from("blind_spots")
      .delete()
      .eq("session_id", session.id);
    if (delErr) console.error("blind spots delete failed:", delErr);

    const { data: inserted, error: insErr } = await service
      .from("blind_spots")
      .insert(rows)
      .select("*");
    if (insErr || !inserted) {
      console.error("blind spots insert failed:", insErr);
      return jsonResponse({ error: "Could not save blind spots." }, 500, req);
    }

    // Thread message for conversational coherence + free export coverage.
    const messageContent = [
      "**Blind spot analysis**",
      "",
      ...candidates.map((c, i) =>
        [
          `${i + 1}. ${c.statement}${c.evidence_backed ? " _(evidence-backed)_" : ""}`,
          c.socratic_question ? `   → ${c.socratic_question}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      ),
    ].join("\n");
    const { error: msgErr } = await service.from("messages").insert({
      conversation_id: session.conversation_id,
      role: "assistant",
      content: messageContent,
    });
    if (msgErr) console.error("blind spots message insert failed:", msgErr);

    return jsonResponse({ blind_spots: inserted, model }, 201, req);
  } catch (err) {
    console.error("blind-spots unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
