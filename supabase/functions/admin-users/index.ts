// Ada Coach /admin-users Edge Function — owner-only.
// GET                           → list all user_profiles with credit fields.
// POST ?id=<uuid>&action=reset  → reset that user's credits_remaining to the
//                                 current daily_message_limit; stamp last_credit_reset.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Owner-only — admin alone is not sufficient for managing user credits.
  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;
  const { profile } = authResult;
  if (profile.role !== "owner") {
    return jsonResponse({ error: "Forbidden" }, 403, req);
  }

  const service = getServiceClient();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const { data, error } = await service
      .from("user_profiles")
      .select(
        "id, email, display_name, role, credits_remaining, last_credit_reset",
      )
      .order("email", { ascending: true });
    if (error) {
      console.error("admin-users list failed:", error);
      return jsonResponse({ error: "Could not load users." }, 500, req);
    }
    return jsonResponse({ users: data ?? [] }, 200, req);
  }

  if (req.method === "POST") {
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action");
    if (!id || action !== "reset") {
      return jsonResponse({ error: "Invalid request" }, 400, req);
    }

    const { data: settingRow, error: settingErr } = await service
      .from("app_settings")
      .select("value")
      .eq("key", "daily_message_limit")
      .maybeSingle();
    if (settingErr || !settingRow) {
      console.error("admin-users reset: failed to read limit:", settingErr);
      return jsonResponse(
        { error: "Could not read daily_message_limit." },
        500,
        req,
      );
    }
    const limit = parseInt(settingRow.value, 10);
    if (!Number.isFinite(limit) || limit < 0) {
      return jsonResponse(
        { error: "daily_message_limit is not a valid non-negative integer." },
        500,
        req,
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: updated, error: updErr } = await service
      .from("user_profiles")
      .update({ credits_remaining: limit, last_credit_reset: today })
      .eq("id", id)
      .select(
        "id, email, display_name, role, credits_remaining, last_credit_reset",
      )
      .single();
    if (updErr || !updated) {
      console.error("admin-users reset failed:", updErr);
      return jsonResponse({ error: "Could not reset credits." }, 500, req);
    }
    return jsonResponse({ user: updated }, 200, req);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, req);
});
