// Ada Coach /chat Edge Function
// Accepts a PM's message, calls Claude with the active coaching prompt,
// persists the exchange, returns the reply.

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, authorization, apikey, x-client-info",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 500;
const HISTORY_LIMIT = 20;

type ChatRequest = {
  message?: unknown;
  conversation_id?: unknown;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as ChatRequest;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const conversationIdInput =
      typeof body.conversation_id === "string" ? body.conversation_id : null;

    if (!message) {
      return jsonResponse({ error: "message is required" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anthropicKey) {
      console.error("Missing required environment variables");
      return jsonResponse(
        { error: "Ada is not configured correctly. Please try again later." },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1. Resolve or create the conversation
    let conversationId = conversationIdInput;
    if (!conversationId) {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({ title: message.slice(0, 50) })
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

    // 2. Fetch last N messages for context
    const { data: history, error: historyErr } = await supabase
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

    // 3. Fetch the active coaching prompt
    const { data: activePrompt, error: promptErr } = await supabase
      .from("coaching_prompts")
      .select("prompt_text")
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

    // 4. Build Anthropic request
    const chatMessages: ChatMessage[] = [
      ...((history ?? []) as ChatMessage[]),
      { role: "user", content: message },
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
        max_tokens: MAX_TOKENS,
        system: activePrompt.prompt_text,
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

    // 5. Persist user message
    const { error: userMsgErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
      token_count: inputTokens,
    });

    if (userMsgErr) {
      console.error("Failed to save user message:", userMsgErr);
      return jsonResponse({ error: "Could not save your message." }, 500);
    }

    // 6. Persist assistant message
    const { data: assistantMsg, error: assistantMsgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: replyText,
        token_count: outputTokens,
      })
      .select("id")
      .single();

    if (assistantMsgErr || !assistantMsg) {
      console.error("Failed to save assistant message:", assistantMsgErr);
      return jsonResponse({ error: "Could not save Ada's reply." }, 500);
    }

    // 7. Touch conversation updated_at so it sorts to the top in admin lists
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return jsonResponse({
      reply: replyText,
      conversation_id: conversationId,
      message_id: assistantMsg.id,
    });
  } catch (err) {
    console.error("chat function unhandled error:", err);
    return jsonResponse(
      { error: "Something went wrong. Please try again." },
      500,
    );
  }
});
