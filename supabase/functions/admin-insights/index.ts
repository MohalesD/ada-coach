// Admin endpoint for feedback analytics.
// Requires the caller's Supabase Auth JWT (Authorization: Bearer ...);
// access is gated to user_profiles.role in ('admin','owner').
//
// GET → aggregated insights payload (totals, rates, per-conversation,
//        per-prompt, top 5 positive/negative, recent 10 feedback events)
//
// Strategy: fetch the raw rows with the service client and aggregate in
// memory. The dataset is small for the Maven course project; if it grows
// significantly, swap to Postgres aggregations or a materialized view.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";

type Feedback = "positive" | "negative" | null;

type AssistantMessageRow = {
  id: string;
  conversation_id: string;
  coaching_prompt_id: string | null;
  feedback: Feedback;
  content: string;
  created_at: string;
};

type ConversationRow = { id: string; title: string | null };
type PromptRow = { id: string; name: string; version: number };

type ConversationStat = {
  conversation_id: string;
  title: string | null;
  message_count: number;
  positive: number;
  negative: number;
};

type PromptStat = {
  prompt_id: string | null;
  name: string;
  version: number | null;
  responses: number;
  positive: number;
  negative: number;
  positive_rate: number;
};

type RecentFeedbackEvent = {
  message_id: string;
  conversation_id: string;
  conversation_title: string | null;
  excerpt: string;
  feedback: "positive" | "negative";
  created_at: string;
};

const EXCERPT_LEN = 120;
const RECENT_LIMIT = 10;
const TOP_LIMIT = 5;
const FETCH_LIMIT = 5000; // safety cap; default Supabase row limit is 1000

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;

  const supabase = getServiceClient();

  try {
    const [conversationsRes, promptsRes, assistantRes, totalMessagesRes] =
      await Promise.all([
        supabase.from("conversations").select("id, title").limit(FETCH_LIMIT),
        supabase.from("coaching_prompts").select("id, name, version"),
        supabase
          .from("messages")
          .select("id, conversation_id, coaching_prompt_id, feedback, content, created_at")
          .eq("role", "assistant")
          .limit(FETCH_LIMIT),
        supabase.from("messages").select("id", { count: "exact", head: true }),
      ]);

    if (conversationsRes.error) {
      console.error("conversations fetch error:", conversationsRes.error);
      return jsonResponse({ error: "Failed to load conversations" }, 500);
    }
    if (promptsRes.error) {
      console.error("prompts fetch error:", promptsRes.error);
      return jsonResponse({ error: "Failed to load prompts" }, 500);
    }
    if (assistantRes.error) {
      console.error("assistant messages fetch error:", assistantRes.error);
      return jsonResponse({ error: "Failed to load messages" }, 500);
    }
    if (totalMessagesRes.error) {
      console.error("messages count error:", totalMessagesRes.error);
      return jsonResponse({ error: "Failed to count messages" }, 500);
    }

    const conversations = (conversationsRes.data ?? []) as ConversationRow[];
    const prompts = (promptsRes.data ?? []) as PromptRow[];
    const assistantMessages = (assistantRes.data ?? []) as AssistantMessageRow[];
    const totalMessages = totalMessagesRes.count ?? 0;

    const convoMap = new Map(conversations.map((c) => [c.id, c]));
    const promptMap = new Map(prompts.map((p) => [p.id, p]));

    // ── Totals ────────────────────────────────────────────────────
    const positive = assistantMessages.filter((m) => m.feedback === "positive").length;
    const negative = assistantMessages.filter((m) => m.feedback === "negative").length;
    const feedbackCount = positive + negative;
    const assistantCount = assistantMessages.length;

    const feedbackRate = assistantCount > 0 ? feedbackCount / assistantCount : 0;
    const positiveRate = feedbackCount > 0 ? positive / feedbackCount : 0;

    // ── Per-conversation ──────────────────────────────────────────
    const perConvoMap = new Map<string, ConversationStat>();
    for (const m of assistantMessages) {
      let stat = perConvoMap.get(m.conversation_id);
      if (!stat) {
        const convo = convoMap.get(m.conversation_id);
        stat = {
          conversation_id: m.conversation_id,
          title: convo?.title ?? null,
          message_count: 0,
          positive: 0,
          negative: 0,
        };
        perConvoMap.set(m.conversation_id, stat);
      }
      stat.message_count += 1;
      if (m.feedback === "positive") stat.positive += 1;
      else if (m.feedback === "negative") stat.negative += 1;
    }
    const perConversation = Array.from(perConvoMap.values());

    // ── Per-prompt ────────────────────────────────────────────────
    const perPromptMap = new Map<string, PromptStat>();
    for (const m of assistantMessages) {
      const key = m.coaching_prompt_id ?? "__untagged__";
      let stat = perPromptMap.get(key);
      if (!stat) {
        const prompt = m.coaching_prompt_id ? promptMap.get(m.coaching_prompt_id) : null;
        stat = {
          prompt_id: m.coaching_prompt_id,
          name: prompt?.name ?? "(Untagged)",
          version: prompt?.version ?? null,
          responses: 0,
          positive: 0,
          negative: 0,
          positive_rate: 0,
        };
        perPromptMap.set(key, stat);
      }
      stat.responses += 1;
      if (m.feedback === "positive") stat.positive += 1;
      else if (m.feedback === "negative") stat.negative += 1;
    }
    for (const s of perPromptMap.values()) {
      const total = s.positive + s.negative;
      s.positive_rate = total > 0 ? s.positive / total : 0;
    }
    const perPrompt = Array.from(perPromptMap.values()).sort(
      (a, b) => b.responses - a.responses,
    );

    // ── Top 5 positive / negative (filter out zeros so we don't pad) ──
    const topPositive = perConversation
      .filter((c) => c.positive > 0)
      .sort((a, b) => b.positive - a.positive || b.message_count - a.message_count)
      .slice(0, TOP_LIMIT);
    const topNegative = perConversation
      .filter((c) => c.negative > 0)
      .sort((a, b) => b.negative - a.negative || b.message_count - a.message_count)
      .slice(0, TOP_LIMIT);

    // ── Recent feedback (approximate: ordered by message created_at) ──
    const recentFeedback: RecentFeedbackEvent[] = assistantMessages
      .filter((m) => m.feedback === "positive" || m.feedback === "negative")
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, RECENT_LIMIT)
      .map((m) => ({
        message_id: m.id,
        conversation_id: m.conversation_id,
        conversation_title: convoMap.get(m.conversation_id)?.title ?? null,
        excerpt:
          m.content.length > EXCERPT_LEN
            ? `${m.content.slice(0, EXCERPT_LEN)}…`
            : m.content,
        feedback: m.feedback as "positive" | "negative",
        created_at: m.created_at,
      }));

    return jsonResponse({
      totals: {
        conversations: conversations.length,
        messages: totalMessages,
        assistant_messages: assistantCount,
        feedback_count: feedbackCount,
        positive,
        negative,
      },
      rates: {
        feedback_rate: feedbackRate,
        positive_rate: positiveRate,
      },
      per_conversation: perConversation,
      per_prompt: perPrompt,
      top_positive: topPositive,
      top_negative: topNegative,
      recent_feedback: recentFeedback,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("admin-insights error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
});
