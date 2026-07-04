// Ada Coach /sessions Edge Function (Run 1)
// Discovery Sprint session lifecycle:
//   POST                  { product_id, intake? } -> create session + linked
//                         conversation; classify PM stage (Haiku) when an
//                         intake message is provided. If the product already
//                         has an in_progress session, returns it instead
//                         (PRD: a second concurrent sprint routes to resume).
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
import { classifyStage } from "../_shared/stage-classifier.ts";
import { summarizeSession } from "../_shared/session-summary.ts";

const INTAKE_MAX = 50_000; // PRD: pasted text fields cap at 50k characters
const CURRENT_STEP_MAX = 200;
const TRANSCRIPT_MESSAGE_LIMIT = 40;

type CreateBody = { product_id?: unknown; intake?: unknown };
type PatchBody = { action?: unknown; current_step?: unknown };

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

      // 1. Linked conversation — the sprint reuses the existing
      //    conversation engine rather than a parallel message store.
      const { data: conversation, error: convErr } = await service
        .from("conversations")
        .insert({
          title: `${product.name} — Discovery Sprint`,
          user_id: user.id,
        })
        .select("id")
        .single();
      if (convErr || !conversation) {
        console.error("sprint conversation create failed:", convErr);
        return jsonResponse({ error: "Could not start session." }, 500, req);
      }

      // 2. Session row.
      const { data: session, error: sessErr } = await service
        .from("sessions")
        .insert({
          user_id: user.id,
          product_id: productId,
          conversation_id: conversation.id,
        })
        .select("*")
        .single();
      if (sessErr || !session) {
        console.error("session create failed:", sessErr);
        await service.from("conversations").delete().eq("id", conversation.id);
        return jsonResponse({ error: "Could not start session." }, 500, req);
      }

      // 3. Intake message becomes the first turn of the conversation, and
      //    drives the Haiku stage classifier. Classification failure is
      //    non-fatal: the session exists; the client may retry the step.
      let finalSession = session;
      let classificationError = false;
      if (intake) {
        const { error: msgErr } = await service.from("messages").insert({
          conversation_id: conversation.id,
          role: "user",
          content: intake,
        });
        if (msgErr) console.error("intake message insert failed:", msgErr);

        const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!anthropicKey) {
          console.error("Missing ANTHROPIC_API_KEY");
          classificationError = true;
        } else {
          try {
            const model = await getModelFor(service, "stage_classification");
            const classification = await classifyStage({
              apiKey: anthropicKey,
              model,
              intake,
            });

            const { data: updated, error: updErr } = await service
              .from("sessions")
              .update({
                stage: classification.stage,
                stage_confidence: classification.confidence,
              })
              .eq("id", session.id)
              .select("*")
              .single();
            if (updErr || !updated) {
              console.error("stage update failed:", updErr);
              classificationError = true;
            } else {
              finalSession = updated;
            }

            await recordModelUsage(service, {
              userId: user.id,
              sessionId: session.id,
              callType: "stage_classification",
              model,
              inputTokens: classification.inputTokens,
              outputTokens: classification.outputTokens,
            });
          } catch (err) {
            console.error("stage classification failed:", err);
            classificationError = true;
          }
        }
      }

      return jsonResponse(
        {
          session: finalSession,
          resumed: false,
          ...(classificationError ? { classification_error: true } : {}),
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

      // Resume-position bookmark; independent of any state transition.
      if (body.current_step !== undefined) {
        const step =
          typeof body.current_step === "string"
            ? body.current_step.trim().slice(0, CURRENT_STEP_MAX)
            : null;
        const { error: stepErr } = await userClient
          .from("sessions")
          .update({ current_step: step })
          .eq("id", id);
        if (stepErr) {
          console.error("current_step update failed:", stepErr);
          return jsonResponse({ error: "Could not update session." }, 500, req);
        }
        session.current_step = step;
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
