// Ada Coach /admin-users Edge Function — owner-only.
// GET                            → list all user_profiles with credit fields,
//                                  signup date, and last message sent.
// POST ?id=<uuid>&action=reset   → reset that user's credits_remaining to the
//                                  current daily_message_limit; stamp last_credit_reset.
// POST ?action=reset_all         → same reset for every user in one call.
// POST ?id=<uuid>&action=delete  → permanently retire that user's account,
//                                  same retention contract as self-delete
//                                  (_shared/account-deletion-core.ts). 403 if
//                                  the target is an owner — this mirrors
//                                  self-delete's own-role check, just against
//                                  the target's row instead of the caller's.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";
import { deleteAccountCore } from "../_shared/account-deletion-core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  // Owner-only — admin alone is not sufficient for managing or deleting users.
  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;
  const { profile } = authResult;
  if (profile.role !== "owner") {
    return jsonResponse({ error: "Forbidden" }, 403, req);
  }

  const service = getServiceClient();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const { data: profiles, error } = await service
      .from("user_profiles")
      .select(
        "id, email, display_name, role, credits_remaining, last_credit_reset, created_at",
      )
      .order("email", { ascending: true });
    if (error) {
      console.error("admin-users list failed:", error);
      return jsonResponse({ error: "Could not load users." }, 500, req);
    }

    // Last message sent, approximated by the most recent conversation touch
    // (chat/index.ts step 7 bumps conversations.updated_at on every turn) —
    // no new column or per-message aggregate needed. Own query, JS-merged,
    // so a failure here degrades gracefully instead of breaking the list.
    let lastMessageByUser = new Map<string, string>();
    const { data: convRows, error: convErr } = await service
      .from("conversations")
      .select("user_id, updated_at")
      .not("user_id", "is", null)
      .order("updated_at", { ascending: false });
    if (convErr) {
      console.error("admin-users last-message lookup failed:", convErr);
    } else {
      for (const row of (convRows ?? []) as { user_id: string; updated_at: string }[]) {
        if (!lastMessageByUser.has(row.user_id)) {
          lastMessageByUser.set(row.user_id, row.updated_at);
        }
      }
    }

    const users = (profiles ?? []).map((p) => ({
      ...p,
      last_message_at: lastMessageByUser.get(p.id as string) ?? null,
    }));
    return jsonResponse({ users }, 200, req);
  }

  if (req.method === "POST") {
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action");
    const isSingleReset = action === "reset" && !!id;
    const isAll = action === "reset_all";
    const isDelete = action === "delete" && !!id;
    if (!isSingleReset && !isAll && !isDelete) {
      return jsonResponse({ error: "Invalid request" }, 400, req);
    }

    if (isDelete) {
      const { data: target, error: targetErr } = await service
        .from("user_profiles")
        .select("id, email, display_name, role, created_at")
        .eq("id", id)
        .maybeSingle();
      if (targetErr) {
        console.error("admin-users delete: target lookup failed:", targetErr);
        return jsonResponse({ error: "Could not load user." }, 500, req);
      }
      if (!target) return jsonResponse({ error: "User not found" }, 404, req);
      if (target.role === "owner") {
        return jsonResponse({ error: "owner_cannot_be_deleted" }, 403, req);
      }

      const { data: authUser, error: authErr } = await service.auth.admin.getUserById(
        target.id as string,
      );
      if (authErr || !authUser?.user) {
        console.error("admin-users delete: auth lookup failed:", authErr);
        return jsonResponse({ error: "Could not load user." }, 500, req);
      }

      const email = (target.email as string | null) ?? authUser.user.email ?? null;
      if (!email) {
        console.error("admin-users delete: no email on record for", target.id);
        return jsonResponse({ error: "Server error" }, 500, req);
      }

      const result = await deleteAccountCore(service, {
        uid: target.id as string,
        email,
        displayName: (target.display_name as string | null) ?? null,
        signedUpAt: (target.created_at as string) ?? authUser.user.created_at,
      });
      if (!result.ok) {
        return jsonResponse({ error: result.error }, 500, req);
      }
      return jsonResponse({ ok: true, email_sent: result.email_sent }, 200, req);
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

    if (isAll) {
      // PostgREST requires a filter on UPDATE; match every row by id.
      const { data: updatedRows, error: allErr } = await service
        .from("user_profiles")
        .update({ credits_remaining: limit, last_credit_reset: today })
        .not("id", "is", null)
        .select("id");
      if (allErr) {
        console.error("admin-users reset_all failed:", allErr);
        return jsonResponse({ error: "Could not reset credits." }, 500, req);
      }
      return jsonResponse({ reset_count: updatedRows?.length ?? 0 }, 200, req);
    }

    const { data: updated, error: updErr } = await service
      .from("user_profiles")
      .update({ credits_remaining: limit, last_credit_reset: today })
      .eq("id", id)
      .select(
        "id, email, display_name, role, credits_remaining, last_credit_reset, created_at",
      )
      .single();
    if (updErr || !updated) {
      console.error("admin-users reset failed:", updErr);
      return jsonResponse({ error: "Could not reset credits." }, 500, req);
    }

    // Real value, not a stub — the frontend replaces the whole row with this
    // response, so a fake null here would clobber an accurate value already
    // on screen.
    const { data: lastConv } = await service
      .from("conversations")
      .select("updated_at")
      .eq("user_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonResponse(
      { user: { ...updated, last_message_at: lastConv?.updated_at ?? null } },
      200,
      req,
    );
  }

  return jsonResponse({ error: "Method not allowed" }, 405, req);
});
