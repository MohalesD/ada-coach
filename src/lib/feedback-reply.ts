// Builds the `mailto:` link for replying to a piece of user feedback.
// One job: hand the admin a draft that already has the context in it, so
// replying is writing a response rather than re-finding what was said.
//
// Why the quote is capped: a mailto: URL goes through the OS and the mail
// client, and several clients silently drop or mangle very long ones.
// Feedback can run to 4,000 characters, so the quote is trimmed with a
// visible marker rather than risking a link that opens an empty compose
// window.

const QUOTE_MAX = 1200;

export const REPLY_SUBJECT = 'Re: your Ada Coach feedback';

export function firstName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0];
  return first || 'there';
}

function quoteBlock(comment: string): string {
  const trimmed =
    comment.length > QUOTE_MAX ? `${comment.slice(0, QUOTE_MAX)}… [trimmed]` : comment;
  return trimmed
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export function replyBody(displayName: string | null | undefined, comment: string | null): string {
  const greeting = `Hi ${firstName(displayName)},`;
  if (!comment?.trim()) {
    return `${greeting}\n\nThanks for the feedback on Ada.\n\n`;
  }
  return `${greeting}\n\nThanks for the feedback on Ada. You wrote:\n\n${quoteBlock(comment.trim())}\n\n`;
}

export function buildReplyMailto(
  to: string,
  displayName: string | null | undefined,
  comment: string | null
): string {
  const subject = encodeURIComponent(REPLY_SUBJECT);
  const body = encodeURIComponent(replyBody(displayName, comment));
  return `mailto:${to}?subject=${subject}&body=${body}`;
}
