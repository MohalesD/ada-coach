// Ada Coach /delete-account Edge Function (Spec 1 / DEU-89)
// One job: retire the calling user's own account.
//
// Identity comes only from the JWT; the request body is ignored entirely so
// a caller can never name someone else. The retention/retirement mechanics
// themselves (tombstone, feedback relink, storage purge, auth delete, best-
// effort email) live in _shared/account-deletion-core.ts, shared with the
// owner-initiated admin-users ?action=delete path — this function's whole
// job is resolving "who is the caller" and gating the owner-role check
// before handing off to that shared core.
//
//   1. requireUser()                 identity from JWT
//   2. reject owners                 403 owner_cannot_delete
//   3. read profile + auth user      display_name, email, signed_up_at
//   4. deleteAccountCore(...)        tombstone → feedback relink → storage
//                                    purge → auth.admin.deleteUser → email
//   5. 200 { ok: true }

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { deleteAccountCore } from "../_shared/account-deletion-core.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  // 1. Identity from the JWT only.
  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const uid = authResult.user.id;

  const service = getServiceClient();

  try {
    // 2 + 3. Profile (role gate) and auth record (authoritative signup time).
    const { data: profile, error: profileErr } = await service
      .from("user_profiles")
      .select("id, email, display_name, role")
      .eq("id", uid)
      .maybeSingle();
    if (profileErr) {
      console.error("delete-account profile lookup failed:", profileErr);
      return jsonResponse({ error: "Server error" }, 500, req);
    }
    if (profile?.role === "owner") {
      return jsonResponse({ error: "owner_cannot_delete" }, 403, req);
    }

    const { data: authUser, error: authErr } = await service.auth.admin.getUserById(uid);
    if (authErr || !authUser?.user) {
      console.error("delete-account auth lookup failed:", authErr);
      return jsonResponse({ error: "Server error" }, 500, req);
    }

    const email = profile?.email ?? authUser.user.email ?? null;
    if (!email) {
      console.error("delete-account: no email on record for", uid);
      return jsonResponse({ error: "Server error" }, 500, req);
    }
    const displayName = (profile?.display_name as string | null) ?? null;

    // 4. Shared retirement core.
    const result = await deleteAccountCore(service, {
      uid,
      email,
      displayName,
      signedUpAt: authUser.user.created_at,
    });
    if (!result.ok) {
      return jsonResponse({ error: result.error }, 500, req);
    }

    // 5.
    return jsonResponse({ ok: true, email_sent: result.email_sent }, 200, req);
  } catch (err) {
    console.error("delete-account unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
