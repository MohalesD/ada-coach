// Shared account-retirement core (Spec 1 / DEU-89, extracted for the
// owner-initiated delete path). One job: given a resolved target identity,
// retire that auth.users row with the same retention contract regardless of
// who triggered it — self-delete (delete-account) and admin-delete
// (admin-users ?action=delete) both call this.
//
// Ordering is deliberate, unchanged from the original self-delete flow: the
// irreversible step (auth.users delete) is last, so any earlier failure
// leaves at most a harmless tombstone and the call is safe to retry.
//
//   1. upsert deleted_users          tombstone (idempotent on original_user_id)
//   2. update user_feedback          deleted_user_id = tombstone, contact_email = NULL
//   3. purge storage                 documents/{uid}/..., paginated until empty
//   4. auth.admin.deleteUser(uid)    IRREVERSIBLE; cascade scrubs, SET NULL retains
//   5. send confirmation email       best-effort, never fails the caller
//
// Retention is decided by the schema (migration account_deletion), not here:
// conversations, messages (incl. thumbs), sessions, assumptions, and
// user_feedback survive de-linked; everything else cascades. That contract
// holds no matter which caller invokes auth.admin.deleteUser.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { purgeUserStorage } from "./storage-purge.ts";
import { sendEmail } from "./email.ts";

const STORAGE_BUCKET = "documents";

export interface DeleteAccountTarget {
  uid: string;
  email: string;
  displayName: string | null;
  signedUpAt: string;
}

export type DeleteAccountCoreResult =
  | { ok: true; email_sent: boolean }
  | { ok: false; error: string };

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

export async function deleteAccountCore(
  service: SupabaseClient,
  target: DeleteAccountTarget,
): Promise<DeleteAccountCoreResult> {
  const { uid, email, displayName, signedUpAt } = target;

  // 1. Tombstone. UNIQUE(original_user_id) makes this retry-safe.
  const { data: tombstone, error: tombErr } = await service
    .from("deleted_users")
    .upsert(
      {
        original_user_id: uid,
        display_name: displayName,
        email,
        signed_up_at: signedUpAt,
      },
      { onConflict: "original_user_id" },
    )
    .select("id")
    .single();
  if (tombErr || !tombstone) {
    console.error("deleteAccountCore tombstone upsert failed:", tombErr);
    return { ok: false, error: "Server error" };
  }

  // 2. Keep feedback attributable to the tombstone; drop the reply address.
  const { error: fbErr } = await service
    .from("user_feedback")
    .update({ deleted_user_id: tombstone.id, contact_email: null })
    .eq("user_id", uid);
  if (fbErr) {
    console.error("deleteAccountCore feedback relink failed:", fbErr);
    return { ok: false, error: "Server error" };
  }

  // 3. Storage is outside Postgres cascades; purge explicitly.
  try {
    const { removed } = await purgeUserStorage(
      service.storage.from(STORAGE_BUCKET),
      uid,
    );
    if (removed > 0) console.log(`deleteAccountCore: removed ${removed} storage objects for ${uid}`);
  } catch (err) {
    console.error("deleteAccountCore storage purge failed:", err);
    return { ok: false, error: "Server error" };
  }

  // 4. Irreversible.
  const { error: delErr } = await service.auth.admin.deleteUser(uid);
  if (delErr) {
    console.error("deleteAccountCore auth delete failed:", delErr);
    return { ok: false, error: "Server error" };
  }

  // 5. Best-effort confirmation. Deletion already succeeded; a failed send
  //    is logged, never surfaced as an error.
  const mail = accountDeletedEmail(displayName);
  const sent = await sendEmail({ to: email, ...mail });
  if (!sent.ok) {
    console.warn("deleteAccountCore confirmation email not sent:", sent.error);
  }

  return { ok: true, email_sent: sent.ok };
}
