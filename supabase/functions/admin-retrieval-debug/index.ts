// Ada Coach /admin-retrieval-debug Edge Function — owner-only.
// GET  ?limit=            → recent user messages, for picking a "test message"
// POST { message, threshold?, match_count? } → embeds the message (OpenAI)
//   and runs the same global match_document_chunks RPC the (currently
//   disabled) chat retrieval block would use, returning the chunks and
//   their cosine similarity scores. This is a read-only debug path — it
//   does not touch or re-enable the retrieval logic in chat/index.ts.
//
// Owner-only, not just admin: document_chunks RLS requires role = 'owner'
// (see CLAUDE.md), so this mirrors that restriction in code.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_MATCH_COUNT = 3;
const RECENT_MESSAGES_LIMIT = 20;

type DebugRequest = {
  message?: unknown;
  threshold?: unknown;
  match_count?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;
  const { profile } = authResult;
  if (profile.role !== "owner") {
    return jsonResponse({ error: "Forbidden" }, 403, req);
  }

  const service = getServiceClient();

  if (req.method === "GET") {
    const { data, error } = await service
      .from("messages")
      .select("id, conversation_id, content, created_at")
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(RECENT_MESSAGES_LIMIT);

    if (error) {
      console.error("admin-retrieval-debug: recent messages failed:", error);
      return jsonResponse({ error: "Could not load recent messages." }, 500, req);
    }
    return jsonResponse({ messages: data ?? [] }, 200, req);
  }

  if (req.method === "POST") {
    let body: DebugRequest;
    try {
      body = (await req.json()) as DebugRequest;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400, req);
    }

    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return jsonResponse({ error: "message is required" }, 400, req);
    }

    const threshold =
      typeof body.threshold === "number" && body.threshold >= 0 && body.threshold <= 1
        ? body.threshold
        : DEFAULT_THRESHOLD;
    const matchCount =
      typeof body.match_count === "number" &&
      Number.isInteger(body.match_count) &&
      body.match_count > 0 &&
      body.match_count <= 20
        ? body.match_count
        : DEFAULT_MATCH_COUNT;

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      console.error("Missing OPENAI_API_KEY");
      return jsonResponse({ error: "Embedding is not configured." }, 500, req);
    }

    const embedRes = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: message }),
    });

    if (!embedRes.ok) {
      const errBody = await embedRes.text();
      console.error("admin-retrieval-debug: embedding failed:", embedRes.status, errBody);
      return jsonResponse({ error: "Embedding request failed." }, 502, req);
    }

    const embedData = await embedRes.json();
    const queryEmbedding: number[] | undefined = embedData?.data?.[0]?.embedding;
    if (!Array.isArray(queryEmbedding)) {
      return jsonResponse({ error: "Embedding response was malformed." }, 502, req);
    }

    const { data: chunks, error: rpcErr } = await service.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: matchCount,
    });

    if (rpcErr) {
      console.error("admin-retrieval-debug: match_document_chunks failed:", rpcErr);
      return jsonResponse({ error: "Retrieval query failed." }, 500, req);
    }

    return jsonResponse(
      {
        message,
        embedding_model: EMBEDDING_MODEL,
        threshold,
        match_count: matchCount,
        chunks: (chunks ?? []) as Array<{ content: string; similarity: number }>,
      },
      200,
      req,
    );
  }

  return jsonResponse({ error: "Method not allowed" }, 405, req);
});
