// Ada Coach /sessions Edge Function (Run 1)
// Discovery Sprint session lifecycle:
//   POST                  { product_id, intake?, kickoff? } -> create session
//                         + linked conversation; classify PM stage (Haiku)
//                         when an intake message is provided. If the product
//                         already has an in_progress session, returns it
//                         instead (PRD: a second concurrent sprint routes to
//                         resume). kickoff: true (Spec 4 §8) additionally runs
//                         Ada's first read on the intake before returning;
//                         the response gains kickoff: { message_id } |
//                         { error: true } (non-fatal, like
//                         classification_error).
//   GET ?id= | ?product_id= | (none) -> fetch one / by product / all own.
//   PATCH ?id=            { action: 'complete' | 'abandon', current_step? }
//                         -> state transition; completion generates the
//                         session summary (Haiku) and stores it on the
//                         session and as a kind='summary' message.
//
// Auth: requires a valid Supabase Auth JWT. Ownership checks run through
// the RLS-bound userClient; trusted writes use the service client.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { getModelFor } from "../_shared/models.ts";
import { recordModelUsage } from "../_shared/usage.ts";
import { summarizeSession } from "../_shared/session-summary.ts";
import { createSprint } from "../_shared/sprint-create.ts";
import { kickoffSprint } from "../_shared/sprint-kickoff.ts";

const INTAKE_MAX = 50_000; // PRD: pasted text fields cap at 50k characters
const CURRENT_STEP_MAX = 200;
const TRANSCRIPT_MESSAGE_LIMIT = 40;

type CreateBody = { product_id?: unknown; intake?: unknown; kickoff?: unknown };
type PatchBody = {
  action?: unknown;
  current_step?: unknown;
  if_unmodified_since?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      if (id) {
        const { data, error } = await userClient
          .from("sessions")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.error("session fetch failed:", error);
          return jsonResponse({ error: "Could not load session." }, 500, req);
        }
        if (!data) return jsonResponse({ error: "Session not found" }, 404, req);
        return jsonResponse({ session: data }, 200, req);
      }

      const productId = url.searchParams.get("product_id");
      let query = userClient
        .from("sessions")
        .select("*")
        .order("updated_at", { ascending: false });
      if (productId) query = query.eq("product_id", productId);
      const { data, error } = await query;
      if (error) {
        console.error("sessions list failed:", error);
        return jsonResponse({ error: "Could not load sessions." }, 500, req);
      }
      return jsonResponse({ sessions: data ?? [] }, 200, req);
    }

    if (req.method === "POST") {
      const body = (await req.json()) as CreateBody;
      const productId =
        typeof body.product_id === "string" ? body.product_id : "";
      const intake =
        typeof body.intake === "string" ? body.intake.trim() : "";
      const kickoff = body.kickoff === true;

      if (!productId) {
        return jsonResponse({ error: "product_id is required" }, 400, req);
      }
      if (intake.length > INTAKE_MAX) {
        return jsonResponse(
          { error: `intake must be at most ${INTAKE_MAX} characters` },
          400,
          req,
        );
      }

      // RLS: visible only if the caller owns the product.
      const { data: product, error: prodErr } = await userClient
        .from("products")
        .select("id, name")
        .eq("id", productId)
        .maybeSingle();
      if (prodErr) {
        console.error("product lookup failed:", prodErr);
        return jsonResponse({ error: "Could not start session." }, 500, req);
      }
      if (!product) return jsonResponse({ error: "Product not found" }, 404, req);

      // A second concurrent sprint on the same product resumes the
      // existing one instead of forking state.
      const { data: existing, error: existErr } = await userClient
        .from("sessions")
        .select("*")
        .eq("product_id", productId)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existErr) {
        console.error("existing-session lookup failed:", existErr);
        return jsonResponse({ error: "Could not start session." }, 500, req);
      }
      if (existing) {
        return jsonResponse({ session: existing, resumed: true }, 200, req);
      }

      const service = getServiceClient();
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? null;

      // Conversation → session → intake message → stage classifier, shared
      // with the Builder Journal bridge (_shared/sprint-create.ts).
      const created = await createSprint(service, {
        userId: user.id,
        product: { id: product.id, name: product.name },
        intake,
        anthropicKey,
      });
      if (!created.ok) {
        return jsonResponse({ error: "Could not start session." }, 500, req);
      }

      // Optional zero-click first read. Non-fatal: the sprint stands either
      // way and the client can fall back to the starter chips.
      let kickoffResult: { message_id: string } | { error: true } | null = null;
      if (kickoff && intake) {
        const k = await kickoffSprint(service, {
          userId: user.id,
          sessionId: created.session.id,
          conversationId: created.conversationId,
          intake,
          arrival: "native",
          anthropicKey,
        });
        kickoffResult = "error" in k ? { error: true } : { message_id: k.message_id };
      }

      return jsonResponse(
        {
          session: created.session,
          resumed: false,
          ...(created.classificationError ? { classification_error: true } : {}),
          ...(kickoffResult ? { kickoff: kickoffResult } : {}),
        },
        201,
        req,
      );
    }

    if (req.method === "PATCH") {
      if (!id) return jsonResponse({ error: "id is required" }, 400, req);
      const body = (await req.json()) as PatchBody;
      const action = typeof body.action === "string" ? body.action : null;

      const { data: session, error: sessErr } = await userClient
        .from("sessions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (sessErr) {
        console.error("session fetch failed:", sessErr);
        return jsonResponse({ error: "Could not load session." }, 500, req);
      }
      if (!session) return jsonResponse({ error: "Session not found" }, 404, req);

      // Two-tab guard (Run 3, PRD async edge case): callers may send the
      // updated_at they last loaded; a mismatch means another tab moved
      // the sprint since — reject instead of silently overwriting. Opt-in
      // field, so non-sprint callers are unaffected.
      if (body.if_unmodified_since !== undefined) {
        const expected =
          typeof body.if_unmodified_since === "string"
            ? body.if_unmodified_since
            : null;
        if (!expected || expected !== session.updated_at) {
          return jsonResponse(
            {
              error: "stale_session",
              detail:
                "This sprint moved ahead in another tab. Refresh to continue.",
              current_updated_at: session.updated_at,
            },
            409,
            req,
          );
        }
      }

      // Resume-position bookmark; independent of any state transition.
      if (body.current_step !== undefined) {
        const step =
          typeof body.current_step === "string"
            ? body.current_step.trim().slice(0, CURRENT_STEP_MAX)
            : null;
        // Return the freshly-updated row: clients hold updated_at as
        // their concurrency token, so a stale post-update value would
        // make the guard above misfire on their next write.
        const { data: updated, error: stepErr } = await userClient
          .from("sessions")
          .update({ current_step: step })
          .eq("id", id)
          .select("*")
          .single();
        if (stepErr || !updated) {
          console.error("current_step update failed:", stepErr);
          return jsonResponse({ error: "Could not update session." }, 500, req);
        }
        Object.assign(session, updated);
      }

      if (!action) return jsonResponse({ session }, 200, req);

      if (action !== "complete" && action !== "abandon") {
        return jsonResponse(
          { error: "action must be 'complete' or 'abandon'" },
          400,
          req,
        );
      }
      if (session.status !== "in_progress") {
        return jsonResponse(
          {
            error: "invalid_transition",
            detail: `Session is already ${session.status}.`,
          },
          409,
          req,
        );
      }

      if (action === "abandon") {
        const { data: updated, error: abErr } = await userClient
          .from("sessions")
          .update({ status: "abandoned" })
          .eq("id", id)
          .select("*")
          .single();
        if (abErr || !updated) {
          console.error("session abandon failed:", abErr);
          return jsonResponse({ error: "Could not update session." }, 500, req);
        }
        return jsonResponse({ session: updated }, 200, req);
      }

      // action === 'complete': close the sprint, then generate the ledger
      // summary (Haiku). Summary failure never blocks completion — the PM
      // asked to finish; the summary can be regenerated later.
      const service = getServiceClient();
      let summary: string | null = null;
      let summaryError = false;

      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        console.error("Missing ANTHROPIC_API_KEY");
        summaryError = true;
      } else {
        try {
          const { data: history } = await service
            .from("messages")
            .select("role, content")
            .eq("conversation_id", session.conversation_id)
            .eq("kind", "message")
            .in("role", ["user", "assistant"])
            .order("created_at", { ascending: true })
            .limit(TRANSCRIPT_MESSAGE_LIMIT);

          if (history && history.length > 0) {
            const transcript = history
              .map(
                (m: { role: string; content: string }) =>
                  `${m.role === "user" ? "PM" : "Ada"}: ${m.content}`,
              )
              .join("\n\n");

            const model = await getModelFor(service, "session_summary");
            const result = await summarizeSession({
              apiKey: anthropicKey,
              model,
              transcript,
            });
            summary = result.summary;

            await recordModelUsage(service, {
              userId: user.id,
              sessionId: session.id,
              callType: "session_summary",
              model,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
            });
          }
        } catch (err) {
          console.error("session summary failed:", err);
          summaryError = true;
        }
      }

      const { data: completed, error: compErr } = await service
        .from("sessions")
        .update({ status: "completed", summary })
        .eq("id", id)
        .select("*")
        .single();
      if (compErr || !completed) {
        console.error("session complete failed:", compErr);
        return jsonResponse({ error: "Could not complete session." }, 500, req);
      }

      // Also store the summary as a kind='summary' message so the existing
      // chat UI and markdown export render it with no new code.
      if (summary) {
        const { error: sumMsgErr } = await service.from("messages").insert({
          conversation_id: session.conversation_id,
          role: "assistant",
          content: summary,
          kind: "summary",
        });
        if (sumMsgErr) console.error("summary message insert failed:", sumMsgErr);
      }

      return jsonResponse(
        {
          session: completed,
          ...(summaryError ? { summary_error: true } : {}),
        },
        200,
        req,
      );
    }

    return jsonResponse({ error: "Method not allowed" }, 405, req);
  } catch (err) {
    console.error("sessions function unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
