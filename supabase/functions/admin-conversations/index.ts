// Admin endpoint for managing coaching conversations.
// Requires x-admin-key header matching ADMIN_KEY secret.
//
// GET                  → list all conversations with counts + previews
// GET  ?id=<uuid>      → full conversation with messages ordered asc
// PATCH ?id=<uuid>     → update status (active/archived/deleted)

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assertAdmin, corsHeaders, jsonResponse } from "../_shared/admin.ts";

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  token_count: number | null;
};

type ConversationRow = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  messages?: MessageRow[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authErr = assertAdmin(req);
  if (authErr) return authErr;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET" && id) {
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("id, title, status, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();

      if (convErr) {
        console.error("conversation fetch error:", convErr);
        return jsonResponse({ error: "Failed to load conversation" }, 500);
      }
      if (!conv) return jsonResponse({ error: "Not found" }, 404);

      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, role, content, created_at, token_count")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

      if (msgErr) {
        console.error("messages fetch error:", msgErr);
        return jsonResponse({ error: "Failed to load messages" }, 500);
      }

      return jsonResponse({
        conversation: { ...conv, messages: messages ?? [] },
      });
    }

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("conversations")
        .select(
          "id, title, status, created_at, updated_at, messages(id, role, content, created_at)",
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("list conversations error:", error);
        return jsonResponse({ error: "Failed to list conversations" }, 500);
      }

      const list = ((data ?? []) as ConversationRow[]).map((c) => {
        const msgs = (c.messages ?? [])
          .slice()
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
        const firstUser = msgs.find((m) => m.role === "user");
        return {
          id: c.id,
          title: c.title,
          status: c.status,
          created_at: c.created_at,
          updated_at: c.updated_at,
          message_count: msgs.length,
          first_message: firstUser?.content ?? null,
        };
      });

      return jsonResponse({ conversations: list });
    }

    if (req.method === "PATCH") {
      if (!id) return jsonResponse({ error: "id query param required" }, 400);

      const body = await req.json().catch(() => null);
      const status = body?.status;
      if (
        typeof status !== "string" ||
        !["active", "archived", "deleted"].includes(status)
      ) {
        return jsonResponse(
          { error: "status must be one of: active, archived, deleted" },
          400,
        );
      }

      const { data, error } = await supabase
        .from("conversations")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) {
        console.error("patch conversation error:", error);
        return jsonResponse({ error: "Update failed" }, 500);
      }
      if (!data) return jsonResponse({ error: "Not found" }, 404);

      return jsonResponse({ conversation: data });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("admin-conversations error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
});
