// Ada Coach /send-welcome-email Edge Function.
// One job: send the one email a new signup gets, confirming the account
// exists and welcoming them in. Best-effort and fire-and-forget from the
// frontend — the demo has never gated usage on email confirmation
// (`enable_confirmations = false` in supabase/config.toml), and this
// function does not change that. It is a notification, not a gate: it is
// called once, right after a successful signUp(), and its result is never
// awaited by anything the user is blocked on.
//
// Combines what the backlog listed as two separate emails ("signup
// confirmation" and "welcome") into one send. Two near-identical emails
// landing seconds apart reads as spam, not care, and a signup confirmation
// with nothing else to say has no reason to exist as its own message.

import "@supabase/functions-js/edge-runtime.d.ts";
import {
  corsHeaders,
  getServiceClient,
  jsonResponse,
  requireUser,
} from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email.ts";

function welcomeEmail(displayName: string | null) {
  const name = displayName?.trim() ? displayName.trim() : "there";
  return {
    subject: "Welcome to Ada Coach",
    html: `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your Ada Coach account is set up and ready. This is the only email
      you'll get just for signing up.</p>
      <p>Ada is a discovery coach: she pressure-tests your product ideas
      instead of cheering for them, working through frameworks like
      Jobs-to-be-Done, the Five Whys, and assumption mapping to help you find
      what you don't yet know about your users.</p>
      <p>You can read what we keep and what we don't in the
      <a href="${APP_URL}/privacy">Demo Privacy Notice</a>, and delete your
      account at any time from Settings.</p>
      <p>Glad you're here.</p>
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

const APP_URL = Deno.env.get("APP_URL") ?? "https://ada-coach.vercel.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const authResult = await requireUser(req);
  if (authResult.error) return authResult.error;
  const uid = authResult.user.id;

  const service = getServiceClient();

  try {
    const { data: profile, error: profileErr } = await service
      .from("user_profiles")
      .select("email, display_name")
      .eq("id", uid)
      .maybeSingle();
    if (profileErr) {
      console.error("send-welcome-email profile lookup failed:", profileErr);
      return jsonResponse({ error: "Server error" }, 500, req);
    }

    const email = profile?.email ?? authResult.user.email ?? null;
    if (!email) {
      console.error("send-welcome-email: no email on record for", uid);
      return jsonResponse({ ok: true, email_sent: false }, 200, req);
    }

    const mail = welcomeEmail((profile?.display_name as string | null) ?? null);
    const sent = await sendEmail({ to: email, ...mail });
    if (!sent.ok) {
      console.warn("send-welcome-email not sent:", sent.error);
    }

    return jsonResponse({ ok: true, email_sent: sent.ok }, 200, req);
  } catch (err) {
    console.error("send-welcome-email unhandled error:", err);
    // Best-effort: an unhandled failure here should never look like the
    // signup itself failed, so this still returns 200.
    return jsonResponse({ ok: true, email_sent: false }, 200, req);
  }
});
