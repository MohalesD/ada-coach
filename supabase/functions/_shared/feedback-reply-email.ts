// Builds the email an admin sends when replying to a piece of user feedback.
// One job: turn the admin's typed reply into the subject + HTML body that
// goes to Resend.
//
// Shape mirrors the `mailto:` draft in src/lib/feedback-reply.ts, so a reply
// sent from inside the app reads the same as one sent from Mo's own mail
// client: greeting, the admin's words, then the original feedback quoted
// underneath so the recipient knows what this is answering.
//
// The admin types only their reply. The greeting and the quote are added
// here rather than pre-filled into the composer, so there is one source of
// truth for what the email looks like and no boilerplate for the admin to
// edit around.
//
// Deliberately free of Deno APIs: this module is unit-tested under Vitest
// alongside the frontend suite, the same way _shared/redact.ts is.

// Matches the `user_feedback_reply_body_len` CHECK and the feedback form's
// own 4,000-character cap on `comment`.
export const REPLY_BODY_MAX = 4000;

// Kept in step with REPLY_SUBJECT in src/lib/feedback-reply.ts. The two
// cannot share a module — Edge Functions run on Deno and cannot import from
// src/ — so a reply sent in-app and one sent via the mailto fallback land in
// the same thread only as long as these two strings stay identical.
export const REPLY_SUBJECT = "Re: your Ada Coach feedback";

// Long feedback is quoted in full here, unlike the mailto path which has to
// trim at 1,200 characters to survive the OS URL handoff. An HTML email has
// no such limit, and `comment` is capped at 4,000 in the database anyway.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function firstName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || "there";
}

// Escaped text to HTML paragraphs. Blank lines separate paragraphs; single
// newlines become <br>. Without this a multi-paragraph reply arrives as one
// unbroken run of text.
export function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export type ReplyEmailInput = {
  displayName: string | null;
  originalComment: string | null;
  replyBody: string;
};

export type ReplyEmail = { subject: string; html: string };

export function buildReplyEmail(input: ReplyEmailInput): ReplyEmail {
  const greeting = `<p>Hi ${escapeHtml(firstName(input.displayName))},</p>`;
  const body = paragraphs(input.replyBody);

  const quoted = input.originalComment?.trim()
    ? `
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
      <p style="color:#666;font-size:13px">You wrote:</p>
      <blockquote style="color:#666;font-size:13px;border-left:3px solid #e5e5e5;margin:0;padding-left:12px">
${paragraphs(input.originalComment)}
      </blockquote>
    `
    : "";

  return {
    subject: REPLY_SUBJECT,
    html: `${greeting}\n${body}\n${quoted}`,
  };
}

// Validates the admin's typed reply before anything is sent or written.
// Returns the trimmed body, or the error code the Edge Function surfaces.
export type ValidatedReply =
  | { ok: true; body: string }
  | { ok: false; error: "reply_body_required" | "reply_body_too_long" };

export function validateReplyBody(raw: unknown): ValidatedReply {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "reply_body_required" };
  }
  const body = raw.trim();
  if (body.length > REPLY_BODY_MAX) {
    return { ok: false, error: "reply_body_too_long" };
  }
  return { ok: true, body };
}
