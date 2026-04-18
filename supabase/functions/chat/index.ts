// Ada Coach /chat Edge Function
// Accepts a PM's message, calls Claude with the active coaching prompt,
// persists the exchange, returns the reply.
//
// Auth: requires a valid Supabase Auth JWT in the Authorization header.
// - userClient (anon + JWT) enforces RLS for ownership checks.
// - serviceClient (service_role) writes messages and touches conversations.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 500;
const SUMMARY_MAX_TOKENS = 800;
const HISTORY_LIMIT = 20;

const SUMMARY_SENTINEL = "__SUMMARY__";

const SUMMARY_SYSTEM_PROMPT = `You are Ada, an AI Customer Discovery Coach. The user has asked for a session summary. Review the conversation history and provide a structured summary in this format:

**Product/Idea Explored:** [one sentence]

**Key Assumptions Identified:** [bullet list of 3-5 assumptions the PM made or that were surfaced]

**Discovery Questions Raised:** [bullet list of 2-4 questions that need answering]

**Suggested Next Steps:** [bullet list of 2-3 concrete actions]

Be concise and actionable. This summary is a PM artifact the user will take away from the session.`;

const SUMMARY_USER_DIRECTIVE =
  "Please summarize this discovery session using the format in your instructions.";

type ChatRequest = {
  message?: unknown;
  conversation_id?: unknown;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const { user, userClient } = authResult;

  try {
    const body = (await req.json()) as ChatRequest;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationIdInput =
      typeof body.conversation_id === "string" ? body.conversation_id : null;

    if (!message) {
      return jsonResponse({ error: "message is required" }, 400);
    }

    const isSummary = message === SUMMARY_SENTINEL;

    // Summary requests must target an existing conversation — we have
    // nothing to summarize without prior history.
    if (isSummary && !conversationIdInput) {
      return jsonResponse(
        { error: "Cannot summarize without an existing conversation." },
        400,
      );
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("Missing ANTHROPIC_API_KEY");
      return jsonResponse(
        { error: "Ada is not configured correctly. Please try again later." },
        500,
      );
    }

    const service = getServiceClient();

    // 1. Resolve or create the conversation (ownership enforced by RLS)
    let conversationId = conversationIdInput;
    if (conversationId) {
      // RLS: returns the row only if user_id = auth.uid()
      const { data: existing, error: ownErr } = await userClient
        .from("conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();

      if (ownErr) {
        console.error("ownership check failed:", ownErr);
        return jsonResponse({ error: "Could not load conversation." }, 500);
      }
      if (!existing) {
        return jsonResponse({ error: "Conversation not found" }, 404);
      }
    } else {
      const { data: newConv, error: convErr } = await service
        .from("conversations")
        .insert({
          title: message.slice(0, 50),
          user_id: user.id,
        })
        .select("id")
        .single();

      if (convErr || !newConv) {
        console.error("Failed to create conversation:", convErr);
        return jsonResponse(
          { error: "Could not start a new conversation." },
          500,
        );
      }
      conversationId = newConv.id;
    }

    // 2. Fetch last N messages for context (service role; conversation
    //    already verified to belong to this user above).
    const { data: history, error: historyErr } = await service
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(HISTORY_LIMIT);

    if (historyErr) {
      console.error("Failed to fetch history:", historyErr);
      return jsonResponse({ error: "Could not load conversation history." }, 500);
    }

    // 3. Resolve the system prompt
    let systemPrompt: string;
    let activePromptId: string | null = null;
    if (isSummary) {
      systemPrompt = SUMMARY_SYSTEM_PROMPT;
    } else {
      const { data: activePrompt, error: promptErr } = await service
        .from("coaching_prompts")
        .select("id, prompt_text")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (promptErr) {
        console.error("Failed to fetch active prompt:", promptErr);
        return jsonResponse({ error: "Could not load coaching prompt." }, 500);
      }

      if (!activePrompt?.prompt_text) {
        console.error("No active coaching prompt found");
        return jsonResponse(
          { error: "Ada is not configured correctly. Please try again later." },
          500,
        );
      }
      systemPrompt = activePrompt.prompt_text;
      activePromptId = activePrompt.id;
    }

    // 4. Build Anthropic request. For summary requests we append a
    // synthetic user directive (not persisted) since Anthropic requires
    // the conversation to end on a user turn.
    const trailingUser: ChatMessage = isSummary
      ? { role: "user", content: SUMMARY_USER_DIRECTIVE }
      : { role: "user", content: message };

    const chatMessages: ChatMessage[] = [
      ...((history ?? []) as ChatMessage[]),
      trailingUser,
    ];

    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: isSummary ? SUMMARY_MAX_TOKENS : MAX_TOKENS,
        system: systemPrompt,
        messages: chatMessages,
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errBody);
      return jsonResponse(
        { error: "Ada is having trouble responding right now. Please try again." },
        500,
      );
    }

    const anthropicData = await anthropicRes.json();
    const replyText: string =
      anthropicData?.content?.[0]?.type === "text"
        ? anthropicData.content[0].text
        : "";

    if (!replyText) {
      console.error("Empty reply from Anthropic:", anthropicData);
      return jsonResponse(
        { error: "Ada didn't produce a response. Please try again." },
        500,
      );
    }

    const outputTokens: number | null =
      typeof anthropicData?.usage?.output_tokens === "number"
        ? anthropicData.usage.output_tokens
        : null;
    const inputTokens: number | null =
      typeof anthropicData?.usage?.input_tokens === "number"
        ? anthropicData.usage.input_tokens
        : null;

    // 5. Persist user message (skipped for summary requests — the
    //    summary is an action, not a chat turn)
    if (!isSummary) {
      const { error: userMsgErr } = await service.from("messages").insert({
        conversation_id: conversationId,
        role: "user",
        content: message,
        token_count: inputTokens,
      });

      if (userMsgErr) {
        console.error("Failed to save user message:", userMsgErr);
        return jsonResponse({ error: "Could not save your message." }, 500);
      }
    }

    // 6. Persist assistant message (tagged 'summary' when applicable)
    const { data: assistantMsg, error: assistantMsgErr } = await service
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: replyText,
        token_count: outputTokens,
        kind: isSummary ? "summary" : "message",
        coaching_prompt_id: activePromptId,
      })
      .select("id")
      .single();

    if (assistantMsgErr || !assistantMsg) {
      console.error("Failed to save assistant message:", assistantMsgErr);
      return jsonResponse({ error: "Could not save Ada's reply." }, 500);
    }

    // 7. Touch conversation updated_at so it sorts to the top
    await service
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return jsonResponse({
      reply: replyText,
      conversation_id: conversationId,
      message_id: assistantMsg.id,
      kind: isSummary ? "summary" : "message",
    });
  } catch (err) {
    console.error("chat function unhandled error:", err);
    return jsonResponse(
      { error: "Something went wrong. Please try again." },
      500,
    );
  }
});
