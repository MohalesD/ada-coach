// Ada Coach /bridge-intake Edge Function (Spec 4, Milestone 1)
// The receiving side of the Builder Journal → Ada bridge. Server-to-server
// only: Builder Journal's validate-with-ada function calls this; a browser
// never does. There is NO JWT here — authentication is an HMAC signature
// over the request with the shared secret — so this function never calls
// requireUser() and config.toml pins verify_jwt = false for it.
//
// ── Wire contract (what Builder Journal must send) ──────────────────────────
//   POST /functions/v1/bridge-intake
//   X-Bridge-Timestamp:  unix seconds (decimal string); accepted within ±300 s
//   X-Bridge-Request-Id: caller-generated, unique per attempt (≤ 200 chars)
//   X-Bridge-Signature:  hex HMAC-SHA256(BRIDGE_SHARED_SECRET,
//                          `${timestamp}.${request_id}.${raw_body}`)
//   body (handoff):
//     { action: 'handoff', bj_user_id, email, display_name?,
//       link_mode: 'permanent' | 'session',
//       idea: { id, title, brief, tags?, status?, captured_at?, url? } }
//   body (unlink): { action: 'unlink', bj_user_id }
//
// ── Responses ───────────────────────────────────────────────────────────────
//   201 { url, session_id, product_id, resumed: false, kickoff }   new sprint
//   200 { url, session_id, product_id, resumed: true }             same idea again
//   200 { ok: true }                                               unlink
//   400 { error: 'invalid_body', errors[] }
//   401 { error: 'unauthorized' }           bad/expired/missing signature
//   403 { error: 'privileged_account' }     email resolves to an admin/owner
//   409 { error: 'replay' }                 request_id or (user, idea) already in flight
//   410 { error: 'sprint_deleted' }         idea was sent before; its sprint is gone
//   429 { error: 'bridge_cap' }             > DAILY_HANDOFF_CAP today for this user
//   503 { error: 'bridge_disabled' }        BRIDGE_SHARED_SECRET or APP_URL unset
//   500 { error: 'bridge_failed' }          anything else; nothing half-created remains
//
// The `url` is a one-time magic-link exchange (`/bridge?th=…`), single-use,
// expiring with the project's OTP window. It is returned once and never
// logged. Nothing in the idea text is logged either.
//
// Order of operations (Spec 4 §7, with the handoff row inserted early so a
// replay is rejected by the unique index BEFORE any model spend):
//   secret + APP_URL → timestamp + signature → validate → cap → existing
//   handoff (resume/410) → resolve user (identity → email → createUser) →
//   privileged guard → upsert identity → insert handoff → insert product →
//   createSprint → kickoffSprint → fill handoff → generateLink → 201.
// Any failure after the handoff insert deletes the handoff, the conversation
// (the session cascades from it; sessions.product_id is SET NULL so deleting
// the product alone would orphan it) and the product, so the request id is
// not consumed and the caller may retry.

import "@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, getServiceClient, jsonResponse } from "../_shared/auth.ts";
import { verifyBridgeRequest } from "../_shared/bridge-signature.ts";
import {
  DAILY_HANDOFF_CAP,
  type HandoffBody,
  parseBridgeBody,
  utcDayStart,
} from "../_shared/bridge-payload.ts";
import { createSprint } from "../_shared/sprint-create.ts";
import { kickoffSprint, type KickoffResult } from "../_shared/sprint-kickoff.ts";

const PRODUCT_NAME_MAX = 200;
const PRODUCT_DESCRIPTION_MAX = 2000;
const UNIQUE_VIOLATION = "23505";

type Profile = { id: string; email: string; role: string };

// ── Small helpers ────────────────────────────────────────────────────────────

async function loadProfile(
  service: SupabaseClient,
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await service
    .from("user_profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("bridge-intake profile lookup failed:", error);
    return null;
  }
  return (data as Profile | null) ?? null;
}

async function mintLaunchUrl(
  service: SupabaseClient,
  appUrl: string,
  email: string,
  sessionId: string,
  mode: string,
): Promise<string | null> {
  const { data, error } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error("bridge-intake generateLink failed:", error?.message ?? "no hashed_token");
    return null;
  }
  const url = new URL("/bridge", appUrl);
  url.searchParams.set("th", tokenHash);
  url.searchParams.set("sprint", sessionId);
  url.searchParams.set("mode", mode);
  return url.toString();
}

// Identity link by Builder Journal id → email lookup → create. Returns the
// resolved profile, or null when creation failed.
async function resolveUser(
  service: SupabaseClient,
  body: HandoffBody,
): Promise<Profile | null> {
  const { data: identity } = await service
    .from("bridge_identities")
    .select("user_id")
    .eq("bj_user_id", body.bj_user_id)
    .maybeSingle();
  if (identity?.user_id) {
    const profile = await loadProfile(service, identity.user_id as string);
    if (profile) return profile;
    // The identity row outlived its user (should not happen: it cascades),
    // fall through to the email path.
  }

  const { data: byEmail, error: emailErr } = await service
    .from("user_profiles")
    .select("id, email, role")
    .eq("email", body.email)
    .maybeSingle();
  if (emailErr) {
    console.error("bridge-intake email lookup failed:", emailErr);
    return null;
  }
  if (byEmail) return byEmail as Profile;

  // Shadow account (D3): confirmed, no password. handle_new_user builds the
  // profile (role user, default credits, display_name from metadata).
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: body.email,
    email_confirm: true,
    user_metadata: {
      ...(body.display_name ? { display_name: body.display_name } : {}),
      bridge_source: "builder_journal",
    },
  });
  if (createErr || !created?.user) {
    // A concurrent handoff for the same email may have won the race.
    const { data: retry } = await service
      .from("user_profiles")
      .select("id, email, role")
      .eq("email", body.email)
      .maybeSingle();
    if (retry) return retry as Profile;
    console.error("bridge-intake createUser failed:", createErr?.message);
    return null;
  }
  // The trigger fires synchronously on the auth.users insert.
  const profile = await loadProfile(service, created.user.id);
  if (profile) return profile;
  console.error("bridge-intake: profile missing after createUser");
  return null;
}

async function rollback(
  service: SupabaseClient,
  ids: { handoffId: string | null; conversationId: string | null; productId: string | null },
): Promise<void> {
  if (ids.handoffId) {
    await service.from("bridge_handoffs").delete().eq("id", ids.handoffId);
  }
  if (ids.conversationId) {
    await service.from("conversations").delete().eq("id", ids.conversationId);
  }
  if (ids.productId) {
    await service.from("products").delete().eq("id", ids.productId);
  }
}

// ── Server entry ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  // 1. Fail closed. Nothing is read, written or logged until both exist.
  const secret = Deno.env.get("BRIDGE_SHARED_SECRET");
  const appUrl = Deno.env.get("APP_URL");
  if (!secret || !appUrl) {
    return jsonResponse({ error: "bridge_disabled" }, 503, req);
  }

  // 2 + 3. Timestamp window, then constant-time signature check over the
  //        raw body — parse only after both pass.
  const rawBody = await req.text();
  const verdict = await verifyBridgeRequest({
    secret,
    timestamp: req.headers.get("X-Bridge-Timestamp"),
    requestId: req.headers.get("X-Bridge-Request-Id"),
    signature: req.headers.get("X-Bridge-Signature"),
    body: rawBody,
  });
  if (!verdict.ok) {
    console.warn("bridge-intake rejected:", verdict.reason);
    return jsonResponse({ error: "unauthorized" }, 401, req);
  }
  const requestId = req.headers.get("X-Bridge-Request-Id")!;

  // 4. Validate.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_body", errors: ["body must be JSON"] }, 400, req);
  }
  const parsed = parseBridgeBody(parsedJson);
  if (!parsed.ok) {
    return jsonResponse({ error: "invalid_body", errors: parsed.errors }, 400, req);
  }
  const body = parsed.body;
  const service = getServiceClient();

  try {
    if (body.action === "unlink") {
      const { error } = await service
        .from("bridge_identities")
        .delete()
        .eq("bj_user_id", body.bj_user_id);
      if (error) {
        console.error("bridge-intake unlink failed:", error);
        return jsonResponse({ error: "bridge_failed" }, 500, req);
      }
      return jsonResponse({ ok: true }, 200, req);
    }

    // 5. Daily cap per Builder Journal user (UTC day).
    const { count, error: capErr } = await service
      .from("bridge_handoffs")
      .select("id", { count: "exact", head: true })
      .eq("bj_user_id", body.bj_user_id)
      .gte("created_at", utcDayStart());
    if (capErr) {
      console.error("bridge-intake cap count failed:", capErr);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }
    if ((count ?? 0) >= DAILY_HANDOFF_CAP) {
      return jsonResponse({ error: "bridge_cap" }, 429, req);
    }

    // 6. Same idea again → the same sprint (D4), or 410 if it is gone.
    const { data: existing, error: existErr } = await service
      .from("bridge_handoffs")
      .select("id, user_id, product_id, session_id")
      .eq("bj_user_id", body.bj_user_id)
      .eq("bj_idea_id", body.idea.id)
      .maybeSingle();
    if (existErr) {
      console.error("bridge-intake existing-handoff lookup failed:", existErr);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }
    if (existing) {
      if (!existing.session_id) {
        return jsonResponse({ error: "sprint_deleted" }, 410, req);
      }
      const { data: session } = await service
        .from("sessions")
        .select("id")
        .eq("id", existing.session_id)
        .maybeSingle();
      if (!session) return jsonResponse({ error: "sprint_deleted" }, 410, req);

      const profile = await loadProfile(service, existing.user_id as string);
      if (!profile) return jsonResponse({ error: "sprint_deleted" }, 410, req);
      if (profile.role === "admin" || profile.role === "owner") {
        return jsonResponse({ error: "privileged_account" }, 403, req);
      }

      await service
        .from("bridge_identities")
        .upsert(
          {
            bj_user_id: body.bj_user_id,
            user_id: profile.id,
            mode: body.link_mode,
            last_used_at: new Date().toISOString(),
          },
          { onConflict: "bj_user_id" },
        );

      const url = await mintLaunchUrl(service, appUrl, profile.email, session.id, body.link_mode);
      if (!url) return jsonResponse({ error: "bridge_failed" }, 500, req);
      return jsonResponse(
        { url, session_id: session.id, product_id: existing.product_id, resumed: true },
        200,
        req,
      );
    }

    // 7. Find or create the Ada user (D2: verified email is the join key).
    const profile = await resolveUser(service, body);
    if (!profile) return jsonResponse({ error: "bridge_failed" }, 500, req);

    // Guard on D2's one non-equivalent failure mode: a leaked secret must
    // not be able to mint a sign-in to a privileged Ada account.
    if (profile.role === "admin" || profile.role === "owner") {
      console.warn("bridge-intake refused a privileged account for request", requestId);
      return jsonResponse({ error: "privileged_account" }, 403, req);
    }

    // 8. Identity record, always written; mode recorded (D5).
    const { error: idErr } = await service
      .from("bridge_identities")
      .upsert(
        {
          bj_user_id: body.bj_user_id,
          user_id: profile.id,
          mode: body.link_mode,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "bj_user_id" },
      );
    if (idErr) {
      console.error("bridge-intake identity upsert failed:", idErr);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }

    // 9. Handoff row first: a replay (same request_id) or a concurrent send
    //    of the same idea fails here, before any model spend.
    const ids = {
      handoffId: null as string | null,
      conversationId: null as string | null,
      productId: null as string | null,
    };
    const { data: handoff, error: handoffErr } = await service
      .from("bridge_handoffs")
      .insert({
        request_id: requestId,
        bj_user_id: body.bj_user_id,
        bj_idea_id: body.idea.id,
        user_id: profile.id,
      })
      .select("id")
      .single();
    if (handoffErr || !handoff) {
      if (handoffErr?.code === UNIQUE_VIOLATION) {
        return jsonResponse({ error: "replay" }, 409, req);
      }
      console.error("bridge-intake handoff insert failed:", handoffErr);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }
    ids.handoffId = handoff.id as string;

    // 10. Product, marked as a bridge arrival (service-write-only columns).
    const { data: product, error: prodErr } = await service
      .from("products")
      .insert({
        user_id: profile.id,
        name: body.idea.title.slice(0, PRODUCT_NAME_MAX),
        description: body.idea.brief.slice(0, PRODUCT_DESCRIPTION_MAX),
        source: "builder_journal",
        external_ref: {
          app: "builder_journal",
          idea_id: body.idea.id,
          url: body.idea.url,
        },
      })
      .select("id, name")
      .single();
    if (prodErr || !product) {
      console.error("bridge-intake product insert failed:", prodErr);
      await rollback(service, ids);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }
    ids.productId = product.id as string;

    // 11. Sprint (conversation + session + intake + stage classifier), then
    //     Ada's first read. Kickoff failure is non-fatal (the sprint stands
    //     with the intake and the starter chips), matching POST /sessions.
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? null;
    const created = await createSprint(service, {
      userId: profile.id,
      product: { id: product.id as string, name: product.name as string },
      intake: body.idea.brief,
      anthropicKey,
    });
    if (!created.ok) {
      await rollback(service, ids);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }
    ids.conversationId = created.conversationId;

    const kick: KickoffResult = await kickoffSprint(service, {
      userId: profile.id,
      sessionId: created.session.id,
      conversationId: created.conversationId,
      intake: body.idea.brief,
      arrival: "builder_journal",
      anthropicKey,
    });
    if ("error" in kick) {
      console.warn("bridge-intake kickoff skipped:", kick.reason);
    }

    // 12. Fill in the ledger.
    const { error: fillErr } = await service
      .from("bridge_handoffs")
      .update({ product_id: product.id, session_id: created.session.id })
      .eq("id", ids.handoffId);
    if (fillErr) {
      console.error("bridge-intake handoff update failed:", fillErr);
      await rollback(service, ids);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }

    // 13. One-time sign-in (D7).
    const url = await mintLaunchUrl(
      service,
      appUrl,
      profile.email,
      created.session.id,
      body.link_mode,
    );
    if (!url) {
      await rollback(service, ids);
      return jsonResponse({ error: "bridge_failed" }, 500, req);
    }

    // 14.
    return jsonResponse(
      {
        url,
        session_id: created.session.id,
        product_id: product.id,
        resumed: false,
        ...(created.classificationError ? { classification_error: true } : {}),
        kickoff: "error" in kick
          ? { error: true, reason: kick.reason }
          : { message_id: kick.message_id },
      },
      201,
      req,
    );
  } catch (err) {
    console.error("bridge-intake unhandled error:", err);
    return jsonResponse({ error: "bridge_failed" }, 500, req);
  }
});
