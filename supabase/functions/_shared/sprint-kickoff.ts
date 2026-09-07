// Zero-click kickoff (Spec 4 D6 / §8): Ada's first read on a sprint that
// already holds the PM's intake, before the PM types anything. One job:
// spend a credit, run one coach turn with an arrival directive, persist only
// the assistant reply, record the model call.
//
// The directive rides in the coach's system-context directive slot (the same
// slot framework directives use — "background for you; never read it
// aloud"), so nothing synthetic is ever persisted as a user turn and
// _shared/coach.ts is untouched. The reply runs on the discovery_coach route
// (Haiku) and costs one credit from the account's normal daily allowance.
//
// Never throws. Every failure is returned as { error: true, reason } so the
// sprint itself stands and the caller can report it as non-fatal.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getModelFor } from "./models.ts";
import { recordModelUsage } from "./usage.ts";
import { coachTurn } from "./coach.ts";

export type KickoffArrival = "builder_journal" | "native";

const DIRECTIVES: Record<KickoffArrival, string> = {
  builder_journal:
    "The PM arrived from Builder Journal with this idea as intake. Open with your first read before they type: what you understand the idea to be, where it might land and what is unproven, what worries you most, then one question. Keep the persona's length rule. Do not mention that you were instructed to do this.",
  native:
    "The PM just opened this sprint with the message above as intake. Open with your first read before they type: what you understand the idea to be, where it might land and what is unproven, what worries you most, then one question. Keep the persona's length rule. Do not mention that you were instructed to do this.",
};

export interface KickoffInput {
  userId: string;
  sessionId: string;
  conversationId: string;
  intake: string;
  arrival: KickoffArrival;
  anthropicKey: string | null;
}

export type KickoffResult =
  | { message_id: string; credits_remaining: number | null }
  | {
      error: true;
      reason:
        | "credits_exhausted"
        | "no_api_key"
        | "no_persona"
        | "model_failed"
        | "persist_failed";
    };

// Lazy daily reset + balance for a named user, via the service-role-only SQL
// function (fn_reset_credits_if_due is keyed on auth.uid(), which the bridge
// does not have). Mirrors chat/index.ts: an RPC failure is logged and treated
// as untracked rather than blocking the reply.
async function currentCredits(
  service: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await service.rpc("fn_reset_credits_for_user", {
    p_user_id: userId,
  });
  if (error) {
    console.error("fn_reset_credits_for_user failed:", error);
    return null;
  }
  return typeof data === "number" ? data : null;
}

export async function kickoffSprint(
  service: SupabaseClient,
  input: KickoffInput,
): Promise<KickoffResult> {
  const { userId, sessionId, conversationId, intake, arrival, anthropicKey } = input;

  if (!anthropicKey) {
    console.error("kickoff: missing ANTHROPIC_API_KEY");
    return { error: true, reason: "no_api_key" };
  }

  const credits = await currentCredits(service, userId);
  if (credits !== null && credits <= 0) {
    return { error: true, reason: "credits_exhausted" };
  }

  const { data: persona } = await service
    .from("coaching_prompts")
    .select("id, prompt_text")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!persona) {
    console.error("kickoff: no active coaching prompt");
    return { error: true, reason: "no_persona" };
  }

  let model: string;
  let reply: { text: string; inputTokens: number | null; outputTokens: number | null };
  try {
    model = await getModelFor(service, "discovery_coach");
    reply = await coachTurn({
      apiKey: anthropicKey,
      model,
      personaPrompt: persona.prompt_text as string,
      phase: "frame",
      frameworkDirectives: [DIRECTIVES[arrival]],
      assumptionDigest: "",
      history: [{ role: "user", content: intake }],
    });
  } catch (err) {
    console.error("kickoff coach turn failed:", err);
    return { error: true, reason: "model_failed" };
  }

  const { data: assistantMsg, error: msgErr } = await service
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: "assistant",
      content: reply.text,
      coaching_prompt_id: persona.id,
    })
    .select("id")
    .single();
  if (msgErr || !assistantMsg) {
    console.error("kickoff assistant message insert failed:", msgErr);
    return { error: true, reason: "persist_failed" };
  }

  await recordModelUsage(service, {
    userId,
    sessionId,
    callType: "discovery_coach",
    model,
    inputTokens: reply.inputTokens,
    outputTokens: reply.outputTokens,
  });

  // Spend the credit only after the reply is persisted (the user got what
  // they paid for). Best-effort, as in chat/index.ts.
  let creditsRemaining: number | null = null;
  if (credits !== null) {
    const { data: decremented, error: decErr } = await service
      .from("user_profiles")
      .update({ credits_remaining: credits - 1 })
      .eq("id", userId)
      .select("credits_remaining")
      .single();
    if (decErr) {
      console.error("kickoff credit decrement failed:", decErr);
      creditsRemaining = credits - 1;
    } else {
      creditsRemaining = decremented.credits_remaining as number;
    }
  }

  return { message_id: assistantMsg.id as string, credits_remaining: creditsRemaining };
}
