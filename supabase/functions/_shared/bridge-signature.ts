// Bridge request signing (Spec 4, D1). Pure Web Crypto, no Deno APIs, so
// Vitest can exercise it.
//
// Wire contract (Builder Journal's validate-with-ada function is the caller):
//   X-Bridge-Timestamp:  unix seconds, decimal string
//   X-Bridge-Request-Id: caller-generated id, unique per attempt
//   X-Bridge-Signature:  lowercase hex HMAC-SHA256 with BRIDGE_SHARED_SECRET
//                        over `${timestamp}.${request_id}.${raw_body}`
// A request is accepted only when the timestamp is within ±TIMESTAMP_WINDOW_S
// of the server clock AND the signature matches (constant-time compare).

export const TIMESTAMP_WINDOW_S = 300;

const encoder = new TextEncoder();

export function signatureBase(
  timestamp: string,
  requestId: string,
  body: string,
): string {
  return `${timestamp}.${requestId}.${body}`;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Used by tests and by any Ada-side tooling that needs to call the bridge
// (e.g. a signed smoke test). Builder Journal implements the same thing.
export async function signBridgeRequest(
  secret: string,
  timestamp: string,
  requestId: string,
  body: string,
): Promise<string> {
  return await hmacHex(secret, signatureBase(timestamp, requestId, body));
}

// Constant-time string equality: XOR every byte, never short-circuit on the
// first mismatch. Length mismatch still returns false but only after a full
// pass over the longer input.
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" };

export async function verifyBridgeRequest(input: {
  secret: string;
  timestamp: string | null;
  requestId: string | null;
  signature: string | null;
  body: string;
  nowSeconds?: number;
}): Promise<VerifyResult> {
  const { secret, timestamp, requestId, signature, body } = input;
  if (!timestamp || !requestId || !signature) {
    return { ok: false, reason: "malformed" };
  }
  if (!/^\d{1,12}$/.test(timestamp) || requestId.length > 200) {
    return { ok: false, reason: "malformed" };
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (Math.abs(now - ts) > TIMESTAMP_WINDOW_S) {
    return { ok: false, reason: "expired" };
  }
  const expected = await hmacHex(secret, signatureBase(timestamp, requestId, body));
  if (!timingSafeEqual(expected, signature.toLowerCase())) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
