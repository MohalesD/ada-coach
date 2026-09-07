// Sends one transactional email via Resend. One job: deliver a message.
//
// Configuration (Supabase secrets):
//   RESEND_API_KEY  - Resend API key
//   EMAIL_FROM      - verified sender, e.g. "Ada Coach <ada@mail.example.com>"
//
// Contract: never throws. Returns { ok: false, error } when the provider is
// unconfigured or rejects the send, so callers whose main job has already
// succeeded (account deletion) can log and move on rather than lie to the
// client with a 500.

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = { ok: true } | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) {
    return { ok: false, error: "email_not_configured" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `resend_${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `resend_fetch_failed: ${String(err)}` };
  }
}
