// Ada Coach /delete-account Edge Function (Spec 1 / DEU-89)
// One job: retire the calling user's account.
//
// Ordering is deliberate. The irreversible step (auth.users delete) is last,
// so any earlier failure leaves at most a harmless tombstone and the request
// is safe to retry. Identity comes only from the JWT; the request body is
// ignored entirely so a caller can never name someone else.
//
//   1. requireUser()                 identity from JWT
//   2. reject owners                 403 owner_cannot_delete
//   3. read profile + auth user      display_name, email, signed_up_at
//   4. upsert deleted_users          tombstone (idempotent on original_user_id)
//   5. update user_feedback          deleted_user_id = tombstone, contact_email = NULL
//   6. purge storage                 documents/{uid}/..., paginated until empty
//   7. auth.admin.deleteUser(uid)    IRREVERSIBLE; cascade scrubs, SET NULL retains
//   8. send confirmation email       best-effort, never fails the request
//   9. 200 { ok: true }
//
// Retention is decided by the schema (see migration account_deletion), not
// by this function: conversations, messages (incl. thumbs), sessions,
// assumptions, and user_feedback survive de-linked; everything else cascades.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { purgeUserStorage } from "../_shared/storage-purge.ts";
import { sendEmail } from "../_shared/email.ts";

const STORAGE_BUCKET = "documents";

function accountDeletedEmail(displayName: string | null) {
  const name = displayName?.trim() ? displayName.trim() : "there";
  return {
    subject: "Your Ada Coach account has been deleted",
    html: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your Ada Coach account and the data tied to your identity have been deleted.
      This is the only email you'll receive about it.</p>
      <p>As described in the Demo Privacy Notice, de-identified coaching transcripts,
      message ratings, and feedback you chose to send are kept to improve Ada.
      None of it is linked to your name or login any more.</p>
      <p>Thank you for helping shape Ada. Every piece of feedback made it better.</p>
    `,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

    // 4. Tombstone. UNIQUE(original_user_id) makes this retry-safe.
    const { data: tombstone, error: tombErr } = await service
      .from("deleted_users")
      .upsert(
        {
          original_user_id: uid,
          display_name: displayName,
          email,
          signed_up_at: authUser.user.created_at,
        },
        { onConflict: "original_user_id" },
      )
      .select("id")
      .single();
    if (tombErr || !tombstone) {
      console.error("delete-account tombstone upsert failed:", tombErr);
      return jsonResponse({ error: "Server error" }, 500, req);
    }

    // 5. Keep feedback attributable to the tombstone; drop the reply address.
    const { error: fbErr } = await service
      .from("user_feedback")
      .update({ deleted_user_id: tombstone.id, contact_email: null })
      .eq("user_id", uid);
    if (fbErr) {
      console.error("delete-account feedback relink failed:", fbErr);
      return jsonResponse({ error: "Server error" }, 500, req);
    }

    // 6. Storage is outside Postgres cascades; purge explicitly.
    try {
      const { removed } = await purgeUserStorage(
        service.storage.from(STORAGE_BUCKET),
        uid,
      );
      if (removed > 0) console.log(`delete-account: removed ${removed} storage objects for ${uid}`);
    } catch (err) {
      console.error("delete-account storage purge failed:", err);
      return jsonResponse({ error: "Server error" }, 500, req);
    }

    // 7. Irreversible.
    const { error: delErr } = await service.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("delete-account auth delete failed:", delErr);
      return jsonResponse({ error: "Server error" }, 500, req);
    }

    // 8. Best-effort confirmation. Deletion already succeeded; a failed send
    //    is logged, never surfaced as an error.
    const mail = accountDeletedEmail(displayName);
    const sent = await sendEmail({ to: email, ...mail });
    if (!sent.ok) {
      console.warn("delete-account confirmation email not sent:", sent.error);
    }

    // 9.
    return jsonResponse({ ok: true, email_sent: sent.ok }, 200, req);
  } catch (err) {
    console.error("delete-account unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
