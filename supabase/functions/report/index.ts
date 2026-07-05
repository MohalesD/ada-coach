// Ada Coach /report Edge Function (Run 2)
// PRD Technical Flow step 11: compile the Discovery Report — problem
// framing, assumption map, evidence summary, blind spots, interview
// guide, risk-map data — into a jsonb snapshot with a shareable token.
//
// Pure compilation, no model call: everything in the report was already
// produced (and paid for) by earlier steps. POST compiles or explicitly
// REgenerates (PRD: post-close score edits change the report only on
// request); the share_token survives regeneration so shared links keep
// working. GET returns the owner's existing report.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";

const DISCLAIMER =
  "AI-generated market research and interview questions are a starting point to verify, not settled fact. Every citation links to its source — read them before you rely on them.";

type ReportBody = { session_id?: unknown };

function mintShareToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  try {
    if (req.method === "GET") {
      const sessionId = new URL(req.url).searchParams.get("session_id");
      if (!sessionId) {
        return jsonResponse({ error: "session_id is required" }, 400, req);
      }
      const { data, error } = await userClient
        .from("reports")
        .select("id, session_id, share_token, snapshot, generated_at")
        .eq("session_id", sessionId)
        .maybeSingle();
      if (error) {
        console.error("report fetch failed:", error);
        return jsonResponse({ error: "Could not load report." }, 500, req);
      }
      if (!data) return jsonResponse({ error: "Report not found" }, 404, req);
      return jsonResponse({ report: data }, 200, req);
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, req);
    }

    const body = (await req.json()) as ReportBody;
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : "";
    if (!sessionId) {
      return jsonResponse({ error: "session_id is required" }, 400, req);
    }

    // RLS: visible only if the caller owns the session.
    const { data: session, error: sErr } = await userClient
      .from("sessions")
      .select(
        "id, product_id, conversation_id, status, stage, stage_confidence, summary, created_at, completed_at",
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr) {
      console.error("session lookup failed:", sErr);
      return jsonResponse({ error: "Could not load session." }, 500, req);
    }
    if (!session) return jsonResponse({ error: "Session not found" }, 404, req);

    const service = getServiceClient();

    const [
      { data: product },
      { data: assumptions },
      { data: evidence },
      { data: blindSpots },
      { data: guide },
      { data: intake },
    ] = await Promise.all([
      service
        .from("products")
        .select("name, description")
        .eq("id", session.product_id)
        .maybeSingle(),
      service
        .from("assumptions")
        .select(
          "id, statement, category, confidence, impact, status, is_prioritized",
        )
        .eq("session_id", session.id)
        .order("created_at", { ascending: true }),
      service
        .from("assumption_evidence")
        .select(
          "assumption_id, source_url, title, snippet, stance, query, retrieved_at",
        )
        .eq("session_id", session.id)
        .order("retrieved_at", { ascending: true }),
      service
        .from("blind_spots")
        .select(
          "assumption_id, statement, socratic_question, evidence_backed, source_urls",
        )
        .eq("session_id", session.id)
        .order("created_at", { ascending: true }),
      service
        .from("interview_guides")
        .select("version, content_md, question_count, created_at")
        .eq("session_id", session.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      service
        .from("messages")
        .select("content")
        .eq("conversation_id", session.conversation_id)
        .eq("role", "user")
        .eq("kind", "message")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!assumptions || assumptions.length === 0) {
      return jsonResponse(
        {
          error: "nothing_to_report",
          detail: "Map assumptions before compiling a report.",
        },
        400,
        req,
      );
    }

    const snapshot = {
      version: 1,
      generated_at: new Date().toISOString(),
      product: {
        name: (product as { name: string } | null)?.name ?? "Unnamed product",
        description:
          (product as { description: string | null } | null)?.description ??
          null,
      },
      session: {
        id: session.id,
        status: session.status,
        stage: session.stage,
        stage_confidence: session.stage_confidence,
        summary: session.summary,
        created_at: session.created_at,
        completed_at: session.completed_at,
      },
      problem_framing: (intake as { content: string } | null)?.content ?? null,
      assumptions,
      evidence: evidence ?? [],
      blind_spots: blindSpots ?? [],
      interview_guide: guide ?? null,
      disclaimer: DISCLAIMER,
    };

    // Upsert keeping the token stable across regenerations.
    const { data: existing } = await service
      .from("reports")
      .select("id, share_token")
      .eq("session_id", session.id)
      .maybeSingle();

    let report;
    if (existing) {
      const { data, error } = await service
        .from("reports")
        .update({ snapshot, generated_at: snapshot.generated_at })
        .eq("id", (existing as { id: string }).id)
        .select("id, session_id, share_token, snapshot, generated_at")
        .single();
      if (error || !data) {
        console.error("report update failed:", error);
        return jsonResponse({ error: "Could not save report." }, 500, req);
      }
      report = data;
    } else {
      const { data, error } = await service
        .from("reports")
        .insert({
          user_id: user.id,
          session_id: session.id,
          share_token: mintShareToken(),
          snapshot,
          generated_at: snapshot.generated_at,
        })
        .select("id, session_id, share_token, snapshot, generated_at")
        .single();
      if (error || !data) {
        console.error("report insert failed:", error);
        return jsonResponse({ error: "Could not save report." }, 500, req);
      }
      report = data;
    }

    return jsonResponse({ report }, existing ? 200 : 201, req);
  } catch (err) {
    console.error("report unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
