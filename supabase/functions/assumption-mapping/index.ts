// Ada Coach /assumption-mapping Edge Function (Run 1)
// The Sonnet 4.6 integration wrapper (PRD Technical Flow step 6): takes the
// PM's intake (or the sprint conversation so far), extracts structured
// assumptions across desirability / viability / feasibility / usability
// with confidence and impact scores, and writes them to the assumptions
// table.
//
// Malformed model output is the PRD's named failure mode: the raw response
// is logged server-side and the client gets 502 malformed_model_output with
// retryable: true — never a partial insert, never a crash.

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

const INTAKE_MAX = 50_000;
const HISTORY_LIMIT = 20;
const STATEMENT_MAX = 500;
const MAX_ASSUMPTIONS = 20;
const CATEGORIES = new Set([
  "desirability",
  "viability",
  "feasibility",
  "usability",
]);

const MAPPING_SYSTEM = `You are Ada, an AI customer discovery coach. Your task: map a PM's product idea into a list of testable assumptions.

Extract 5 to 12 assumptions the PM is implicitly or explicitly making, across these categories:
- "desirability": customers actually have this problem and want this solution
- "viability": the business model works (pricing, market size, acquisition)
- "feasibility": it can be built and operated with realistic effort
- "usability": target users can successfully adopt and use it

Score each assumption:
- "confidence": 1-5 integer. How strong the PM's current evidence is that the assumption is TRUE. 1 = pure guess, 5 = validated with strong real-world evidence.
- "impact": 1-5 integer. How badly the idea breaks if the assumption is FALSE. 1 = minor inconvenience, 5 = the product is dead.

Assumptions should be specific, falsifiable statements — not vague themes. Never validate the PM's idea; surface what must be true for it to work.

Respond with ONLY a JSON object, no prose, in exactly this shape:
{"assumptions": [{"statement": "...", "category": "desirability", "confidence": 2, "impact": 5}]}`;

type MappingBody = { session_id?: unknown; intake?: unknown };

interface CandidateAssumption {
  statement: string;
  category: string;
  confidence: number;
  impact: number;
}

// Strictly validate the model's JSON into insertable rows; null = malformed.
function validateCandidates(parsed: unknown): CandidateAssumption[] | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const list = (parsed as { assumptions?: unknown }).assumptions;
  if (!Array.isArray(list) || list.length === 0) return null;

  const out: CandidateAssumption[] = [];
  for (const item of list.slice(0, MAX_ASSUMPTIONS)) {
    if (typeof item !== "object" || item === null) return null;
    const { statement, category, confidence, impact } = item as Record<
      string,
      unknown
    >;
    if (typeof statement !== "string" || !statement.trim()) return null;
    if (typeof category !== "string" || !CATEGORIES.has(category)) return null;
    if (typeof confidence !== "number" || typeof impact !== "number") {
      return null;
    }
    const conf = Math.round(confidence);
    const imp = Math.round(impact);
    if (conf < 1 || conf > 5 || imp < 1 || imp > 5) return null;

    out.push({
      statement: statement.trim().slice(0, STATEMENT_MAX),
      category,
      confidence: conf,
      impact: imp,
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
    const body = (await req.json()) as MappingBody;
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : "";
    const intake = typeof body.intake === "string" ? body.intake.trim() : "";

    if (!sessionId) {
      return jsonResponse({ error: "session_id is required" }, 400, req);
    }
    if (intake.length > INTAKE_MAX) {
      return jsonResponse(
        { error: `intake must be at most ${INTAKE_MAX} characters` },
        400,
        req,
      );
    }

    // RLS: visible only if the caller owns the session.
    const { data: session, error: sessErr } = await userClient
      .from("sessions")
      .select("id, product_id, conversation_id, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessErr) {
      console.error("session lookup failed:", sessErr);
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

    // Input: explicit intake wins; otherwise the sprint conversation so far.
    let mappingInput = intake;
    if (!mappingInput) {
      const { data: history } = await service
        .from("messages")
        .select("role, content")
        .eq("conversation_id", session.conversation_id)
        .eq("kind", "message")
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
        .limit(HISTORY_LIMIT);
      if (history && history.length > 0) {
        mappingInput = history
          .map(
            (m: { role: string; content: string }) =>
              `${m.role === "user" ? "PM" : "Ada"}: ${m.content}`,
          )
          .join("\n\n");
      }
    }
    if (!mappingInput) {
      return jsonResponse(
        {
          error: "no_intake",
          detail:
            "Provide an intake message or add messages to the sprint conversation first.",
        },
        400,
        req,
      );
    }

    // Product memory (Run 2): prior sprints on this product change how
    // this sprint is coached — settled assumptions are not re-proposed.
    const memory = await loadProductMemory(
      service as unknown as MemoryClient,
      { productId: session.product_id, excludeSessionId: session.id },
    );
    const system = memory
      ? `${MAPPING_SYSTEM}\n\n${memory}\nUse this memory: do not re-propose assumptions already validated or abandoned; focus on what is still untested, newly implied, or contradicted by what happened since.`
      : MAPPING_SYSTEM;

    const model = await getModelFor(service, "assumption_mapping");
    const result = await callClaude({
      apiKey: anthropicKey,
      model,
      system,
      messages: [
        {
          role: "user",
          content: `Map the assumptions in this discovery intake:\n\n${mappingInput}`,
        },
      ],
      maxTokens: 2000,
    });

    await recordModelUsage(service, {
      userId: user.id,
      sessionId: session.id,
      callType: "assumption_mapping",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    const candidates = validateCandidates(extractFirstJson(result.text));
    if (!candidates) {
      // PRD: log the raw response, show a retry option, never a broken
      // partial render. Nothing has been inserted at this point.
      console.error("assumption-mapping malformed output:", result.text);
      return jsonResponse(
        { error: "malformed_model_output", retryable: true },
        502,
        req,
      );
    }

    const rows = candidates.map((c) => ({
      user_id: user.id,
      product_id: session.product_id,
      session_id: session.id,
      statement: c.statement,
      category: c.category,
      confidence: c.confidence,
      impact: c.impact,
    }));

    const { data: inserted, error: insErr } = await service
      .from("assumptions")
      .insert(rows)
      .select("*");
    if (insErr || !inserted) {
      console.error("assumptions insert failed:", insErr);
      return jsonResponse({ error: "Could not save assumptions." }, 500, req);
    }

    return jsonResponse({ assumptions: inserted, model }, 201, req);
  } catch (err) {
    console.error("assumption-mapping unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
