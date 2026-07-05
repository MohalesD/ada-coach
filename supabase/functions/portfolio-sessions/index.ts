// Ada Coach /portfolio-sessions Edge Function (Run 4)
// Portfolio track entry point (addendum endpoint 2):
//   POST -> create a portfolio_profiles row (empty shell) + a linked
//           conversation (reuses the existing conversation engine — the
//           same conversation carries ideation output and, later, the
//           artifact-coaching thread; see the Run 4 build decision on
//           single-conversation-per-profile in tasks/todo.md).
//   GET ?id= | (none) -> fetch one / list own profiles.
//
// Auth: requires a valid Supabase Auth JWT.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";

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
          .from("portfolio_profiles")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (error) {
          console.error("portfolio profile fetch failed:", error);
          return jsonResponse({ error: "Could not load your profile." }, 500, req);
        }
        if (!data) return jsonResponse({ error: "Profile not found" }, 404, req);
        return jsonResponse({ profile: data }, 200, req);
      }

      const { data, error } = await userClient
        .from("portfolio_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("portfolio profiles list failed:", error);
        return jsonResponse({ error: "Could not load your profiles." }, 500, req);
      }
      return jsonResponse({ profiles: data ?? [] }, 200, req);
    }

    if (req.method === "POST") {
      const service = getServiceClient();

      const { data: conversation, error: convErr } = await service
        .from("conversations")
        .insert({ title: "Portfolio Coaching", user_id: user.id })
        .select("id")
        .single();
      if (convErr || !conversation) {
        console.error("portfolio conversation create failed:", convErr);
        return jsonResponse(
          { error: "Could not start your portfolio session." },
          500,
          req,
        );
      }

      const { data: profile, error: profErr } = await service
        .from("portfolio_profiles")
        .insert({ user_id: user.id, conversation_id: conversation.id })
        .select("*")
        .single();
      if (profErr || !profile) {
        console.error("portfolio profile create failed:", profErr);
        await service.from("conversations").delete().eq("id", conversation.id);
        return jsonResponse(
          { error: "Could not start your portfolio session." },
          500,
          req,
        );
      }

      return jsonResponse({ profile }, 201, req);
    }

    return jsonResponse({ error: "Method not allowed" }, 405, req);
  } catch (err) {
    console.error("portfolio-sessions unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
