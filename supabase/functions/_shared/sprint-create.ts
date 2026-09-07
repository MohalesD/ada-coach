// Bring a Discovery Sprint into existence (extracted from sessions/index.ts
// for Spec 4 so the bridge and the native POST /sessions share one path).
// One job: conversation → session → intake message → Haiku stage classifier.
//
// Ownership and resume-existing checks are the caller's (they need the
// RLS-bound client or the bridge ledger); this helper only writes through the
// service client. Classification failure is non-fatal, exactly as before: the
// session exists and the client may retry the step.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getModelFor } from "./models.ts";
import { recordModelUsage } from "./usage.ts";
import { classifyStage } from "./stage-classifier.ts";

export interface CreateSprintInput {
  userId: string;
  product: { id: string; name: string };
  intake: string; // already trimmed; may be empty
  anthropicKey: string | null;
}

export type SessionRow = Record<string, unknown> & {
  id: string;
  conversation_id: string;
};

export type CreateSprintResult =
  | {
      ok: true;
      session: SessionRow;
      conversationId: string;
      classificationError: boolean;
    }
  | { ok: false };

export async function createSprint(
  service: SupabaseClient,
  input: CreateSprintInput,
): Promise<CreateSprintResult> {
  const { userId, product, intake, anthropicKey } = input;

  // 1. Linked conversation — the sprint reuses the existing conversation
  //    engine rather than a parallel message store.
  const { data: conversation, error: convErr } = await service
    .from("conversations")
    .insert({
      title: `${product.name} — Discovery Sprint`,
      user_id: userId,
    })
    .select("id")
    .single();
  if (convErr || !conversation) {
    console.error("sprint conversation create failed:", convErr);
    return { ok: false };
  }

  // 2. Session row.
  const { data: session, error: sessErr } = await service
    .from("sessions")
    .insert({
      user_id: userId,
      product_id: product.id,
      conversation_id: conversation.id,
    })
    .select("*")
    .single();
  if (sessErr || !session) {
    console.error("session create failed:", sessErr);
    await service.from("conversations").delete().eq("id", conversation.id);
    return { ok: false };
  }

  // 3. Intake message becomes the first turn of the conversation, and
  //    drives the Haiku stage classifier.
  let finalSession = session as SessionRow;
  let classificationError = false;
  if (intake) {
    const { error: msgErr } = await service.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: intake,
    });
    if (msgErr) console.error("intake message insert failed:", msgErr);

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
          finalSession = updated as SessionRow;
        }

        await recordModelUsage(service, {
          userId,
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

  return {
    ok: true,
    session: finalSession,
    conversationId: conversation.id as string,
    classificationError,
  };
}
