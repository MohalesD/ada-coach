// Sends an admin's reply to one piece of user feedback.
// One job: deliver a reply to the address the user asked to be reached at,
// and record that it happened.
//
// Requires the caller's Supabase Auth JWT (Authorization: Bearer ...);
// access is gated to user_profiles.role in ('admin','owner'), the same gate
// admin-feedback uses to read the log.
//
// POST { feedback_id, reply_body } → { feedback: <updated row> }
//
// Ordering (claim → send → roll back on failure):
//   The row is claimed with a conditional UPDATE ... WHERE replied_at IS NULL
//   *before* the send. A plain read-then-send-then-write would let two
//   admins, or one admin double-clicking through a slow Resend call, both
//   pass the "already replied?" check and both send. The conditional update
//   is atomic, so exactly one caller wins and the loser gets the 409.
//
//   If the send then fails, the claim is rolled back to NULL so the row is
//   retryable. Unlike the deletion and welcome emails — best-effort sends
//   attached to work that already succeeded — this send *is* the work, so a
//   provider failure is a real error response, not a quiet 200.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireAdmin,
} from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";
import { buildReplyEmail, validateReplyBody } from "../_shared/feedback-reply-email.ts";

// Runs once per cold start. EMAIL_FROM isn't a credential (it's the visible
// sender address on every outgoing email), so logging it plainly here is
// safe and exactly the point: this function only works for real users once
// EMAIL_FROM has moved off Resend's shared, unverified sender, and the
// prior confusion about whether that had actually happened cost real time.
// A misconfigured value will still 502 to real users, but at least it will
// say why instead of leaving it to be re-derived from a Resend error string.
const emailFrom = Deno.env.get("EMAIL_FROM") ?? null;
if (!emailFrom) {
  console.warn("admin-feedback-reply: EMAIL_FROM is not set. Every send will fail.");
} else if (/resend\.dev/i.test(emailFrom)) {
  console.warn(
    `admin-feedback-reply: EMAIL_FROM is still on Resend's shared sender (${emailFrom}). ` +
      "Sends to anyone but the Resend account's own address will 403.",
  );
} else {
  console.log(`admin-feedback-reply: EMAIL_FROM is ${emailFrom}.`);
}

const SELECT_COLUMNS =
  "id, user_id, deleted_user_id, feedback_type, rating, message_id, source_surface, comment, contact_email, created_at, replied_at, reply_body";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireAdmin(req);
  if (authResult.error) return authResult.error;

  try {
    const payload = await req.json().catch(() => null);
    const feedbackId = payload?.feedback_id;
    if (typeof feedbackId !== "string" || !feedbackId.trim()) {
      return jsonResponse({ error: "feedback_id is required." }, 400, req);
    }

    const validated = validateReplyBody(payload?.reply_body);
    if (!validated.ok) {
      const message =
        validated.error === "reply_body_required"
          ? "Write a reply before sending."
          : "That reply is too long to send.";
      return jsonResponse({ error: message }, 400, req);
    }
    const replyBody = validated.body;

    const service = getServiceClient();

    const { data: row, error: rowErr } = await service
      .from("user_feedback")
      .select(SELECT_COLUMNS)
      .eq("id", feedbackId)
      .maybeSingle();
    if (rowErr) {
      console.error("user_feedback fetch failed:", rowErr);
      return jsonResponse({ error: "Could not load that feedback." }, 500, req);
    }
    if (!row) {
      return jsonResponse({ error: "That feedback no longer exists." }, 404, req);
    }

    // No contact_email means the user never asked to be reached — and it is
    // also what account deletion leaves behind, since delete-account nulls
    // this column on retained rows. Either way there is no address to use.
    const contactEmail = row.contact_email as string | null;
    if (!contactEmail) {
      return jsonResponse(
        { error: "That feedback has no reply address." },
        400,
        req,
      );
    }

    if (row.replied_at) {
      return jsonResponse({ error: "That feedback was already answered." }, 409, req);
    }

    // Atomic claim. Losing the race here is the real double-send guard; the
    // check above just gives the common case a clearer error.
    const claimedAt = new Date().toISOString();
    const { data: claimed, error: claimErr } = await service
      .from("user_feedback")
      .update({ replied_at: claimedAt, reply_body: replyBody })
      .eq("id", feedbackId)
      .is("replied_at", null)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (claimErr) {
      console.error("user_feedback claim failed:", claimErr);
      return jsonResponse({ error: "Could not send that reply." }, 500, req);
    }
    if (!claimed) {
      return jsonResponse({ error: "That feedback was already answered." }, 409, req);
    }

    // Look up the submitter's display name for the greeting. Non-fatal: a
    // missing name falls back to "Hi there," rather than blocking the send.
    let displayName: string | null = null;
    if (row.user_id) {
      const { data: profile, error: profErr } = await service
        .from("user_profiles")
        .select("display_name")
        .eq("id", row.user_id)
        .maybeSingle();
      if (profErr) {
        console.error("user_profiles fetch failed:", profErr);
      }
      displayName = (profile?.display_name as string | null) ?? null;
    }

    const mail = buildReplyEmail({
      displayName,
      originalComment: (row.comment as string | null) ?? null,
      replyBody,
    });

    const sent = await sendEmail({ to: contactEmail, ...mail });
    if (!sent.ok) {
      // Release the claim so the admin can fix the problem and retry.
      const { error: rollbackErr } = await service
        .from("user_feedback")
        .update({ replied_at: null, reply_body: null })
        .eq("id", feedbackId)
        .eq("replied_at", claimedAt);
      if (rollbackErr) {
        // The row stays marked replied when it was not. Loud, because the
        // only fix is a manual one.
        console.error(
          "admin-feedback-reply rollback failed, row marked replied without a send:",
          feedbackId,
          rollbackErr,
        );
      }
      console.error("admin-feedback-reply send failed:", sent.error);
      const message =
        sent.error === "email_not_configured"
          ? "Email isn't configured on the server, so nothing was sent."
          : "The email provider rejected that reply. Nothing was sent.";
      return jsonResponse({ error: message }, 502, req);
    }

    return jsonResponse({ feedback: claimed }, 200, req);
  } catch (err) {
    console.error("admin-feedback-reply unhandled error:", err);
    return jsonResponse({ error: "Something went wrong." }, 500, req);
  }
});
