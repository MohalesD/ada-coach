// Where a Builder Journal handoff sends the browser, and whether Ada signs
// the person in on the way (Spec 4 addendum, 2026-11-15).
// Pure: no Deno or Supabase imports, so Vitest can run it.
//
// The bridge does two separable things: it writes a sprint into an Ada
// account, and it mints a one-time sign-in to that account. The second is the
// dangerous one. Until this addendum a handoff that resolved to an admin or
// owner was refused whole (403 privileged_account), which kept a leaked
// BRIDGE_SHARED_SECRET from minting an owner session but also meant Ada's own
// owner could not use the feature. Now the two halves are decided apart:
//
//   role 'user'      → sprint written, magic link minted   (signin: magiclink)
//   anything else    → sprint written, NO credential minted (signin: self)
//
// A 'self' launch URL holds a sprint id and two flags, nothing else. Whoever
// opens it must already hold an Ada session for the sprint's owner, or sign in
// with their own password; RLS on the sprint decides the rest.

import type { LinkMode } from "./bridge-payload.ts";

export type LaunchSignIn = "magiclink" | "self";

/**
 * Ceiling on handoffs landing in ONE Ada account per UTC day, across every
 * Builder Journal id. DAILY_HANDOFF_CAP limits a sender; a holder of the
 * secret can invent senders, so that cap alone does not limit what one
 * account can be made to receive. This one does.
 */
export const TARGET_DAILY_HANDOFF_CAP = 20;

/**
 * An allowlist on purpose. Only the plain `user` role gets a minted sign-in;
 * admin, owner, a role added later, and a value that should not exist all
 * fall to 'self'. The failure mode of a denylist here is an account takeover.
 */
export function launchSignIn(role: string | null | undefined): LaunchSignIn {
  return role === "user" ? "magiclink" : "self";
}

/**
 * The URL the new tab opens. Returns null when asked for a magic-link launch
 * without a token, so a caller cannot ship a link that silently fails.
 * A token handed to a 'self' launch is dropped, never emitted.
 */
export function buildLaunchUrl(
  appUrl: string,
  opts: { sessionId: string; mode: LinkMode; signIn: LaunchSignIn; tokenHash: string | null },
): string | null {
  const url = new URL("/bridge", appUrl);
  url.search = "";
  url.hash = "";
  if (opts.signIn === "magiclink") {
    if (!opts.tokenHash) return null;
    url.searchParams.set("th", opts.tokenHash);
  } else {
    url.searchParams.set("signin", "self");
  }
  url.searchParams.set("sprint", opts.sessionId);
  url.searchParams.set("mode", opts.mode);
  return url.toString();
}
