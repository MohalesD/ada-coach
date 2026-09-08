# Spec 4 — Builder Journal → Ada bridge (receiving side)

**Date:** 2026-09-07
**Status:** Milestone 1 (this document's scope) shipped and merged 2026-09-07 — [PR #14](https://github.com/MohalesD/ada-coach/pull/14), `cf2bb1a`, tracked as DEU-114. `bridge-intake` is deployed but dark (`BRIDGE_SHARED_SECRET`/`APP_URL` unset) pending the launch gate in §8/§15. Builder Journal's Milestone 2 (the sending side) is separately merged against this contract. See `tasks/todo.md` for the live checklist; this document is the design record, not the status board — don't re-date this line per commit, update it only when the milestone boundary itself changes.
**Author:** Claude Code, from Mo's concept walk-through of 2026-09-01 and read-only traces of both repos on 2026-09-07
**Related:** the sending side and every product decision live in the Builder Journal PRD: `davincibuilderjournal001/docs/prds/claude_prds_idea-inbox_addendum-B_validate-with-ada_v1_2026-09-07.md`. Read that first; this document only says what Ada builds.

**Gate status, checked against `main` on 2026-09-07 (updated from the first draft, which was written before DEU-89 landed):**

| Gate | State | Effect on this spec |
|---|---|---|
| **Spec 1 / DEU-89, account deletion** | ✅ **Shipped.** Migration `20260907040404_account_deletion` is on `main` and matches Spec 1 exactly: `deleted_users` tombstone with `UNIQUE (original_user_id)`, `user_feedback.deleted_user_id`, and `ON DELETE SET NULL` on `conversations.user_id`, `user_feedback.user_id`, `sessions.user_id`, `assumptions.user_id`, `sessions.product_id`, `assumptions.product_id`. `delete-account` enforces the owner 403, upserts the tombstone, relinks feedback, purges `documents/{uid}/`, deletes the auth row last, and sends a best-effort email. | **Cleared to build.** The mechanism this spec depends on — `ON DELETE CASCADE` to `auth.users` scrubbing a new table for free — is live and proven by the shipped migration. Both bridge tables inherit it. |
| **Mo's manual dry run** (throwaway account → feedback → delete → check admin views) | ✅ **Passed, 2026-09-08.** Playwright E2E still not run — that piece of this gate is separate and unchanged. | **Gated launch, not build**, and the manual half is now cleared. Still do not set `BRIDGE_SHARED_SECRET` in production until the Playwright E2E also passes and the delta audit (OQ-C) runs. |
| **Spec 3 / DEU-91, Privacy & Terms** | 🟡 **Substantially shipped, not closed.** `/privacy` is a live public route carrying a combined **Demo Privacy Notice & Terms** (`src/pages/Privacy.tsx`, exports `PRIVACY_LAST_UPDATED`), linked from Login and the Settings danger zone, with a retention section that already names what deletion keeps and destroys. There is no separate `/terms` route; Terms is a section inside that page. DEU-91 stays open in `tasks/todo.md` for expansion. | **No longer a build gate.** The original gate was "Ada has no policy at all," and that is resolved. What remains is **one paragraph** naming Builder Journal as a source of arrivals and ideas, which ships **with Milestone 1** (§9) rather than before it. Builder Journal links to `/privacy`, not `/terms`. |
| **DEU-96, migration regime** | ✅ **Closed 2026-09-07.** All 48 local filenames verified identical to the live ledger. | **Path is now known precisely** — see §6, which names it instead of deferring to "whichever path Spec 1 proves out." |

---

## 1. Why

AI Builder Journal (`aibuilderjournal.com`, Mo's other app) captures ideas. Ada pressure-tests them. There is no door between the two: a Builder Journal user who wants Ada's read makes a second account and retypes the idea. Mo's concept: a "Validate with Ada…" item on the idea, a dialog that says what is sent, then a new tab that lands on a Discovery Sprint, already signed in, with Ada's first read waiting.

Ada is the receiving side. It has to accept a signed handoff from Builder Journal's server, find or create the person, create the sprint, write the first read, and hand back a one-time sign-in. Everything it creates has to be deletable through Spec 1, and disclosed through Spec 3.

## 2. Goals

1. A signed server-to-server request from Builder Journal creates (or reuses) an Ada account keyed on the user's verified email, a product, and a sprint whose intake is the idea.
2. The sprint opens with an assistant message already in it: Ada's first read, produced by the existing coach, on the `discovery_coach` route (Haiku), costing one credit.
3. The user lands signed in via a one-time magic-link token hash, never via a password or a copied JWT.
4. Every bridge-created row cascades away under the shipped Spec 1 delete, and the arrival is disclosed in the header, in Settings, and in one added paragraph on the existing `/privacy` notice.

## 3. Non-goals

- A guest mode. Every table is own-rows RLS on `auth.uid()`; a session without an `auth.users` row cannot exist. "Just this once" is a Builder Journal preference about asking again, not an Ada account type.
- A caller-supplied system prompt. The persona and the per-turn context stay in `_shared/coach.ts`. The idea is intake; the welcome is a directive this function adds and does not persist.
- OAuth between the apps. Verified email is the join key in v1 (Decision D2).
- Any browser-to-Ada cross-origin call. `ALLOWED_ORIGINS` does not change.
- A separate `/terms` route. Terms already live as a section of `/privacy`; the bridge adds a paragraph there, it does not create a second page.
- The return path to Builder Journal (report or verdict flowing back). v2.

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Server-to-server, HMAC-signed, no JWT** | Builder Journal's edge function calls `bridge-intake` with `X-Bridge-Timestamp`, `X-Bridge-Request-Id`, `X-Bridge-Signature` (HMAC-SHA256 over `timestamp.request_id.body` with `BRIDGE_SHARED_SECRET`). No `Origin` header, so CORS is untouched; no secret reaches a browser. `verify_jwt = false` for this function only because it has no JWT to verify; it must never fall through to `requireUser()`. |
| D2 | **Verified email is the join key** | Builder Journal requires a confirmed email (or Google). Trusting it equals trusting Ada's own magic link, which also proves only email ownership. Consequence, stated plainly: a handoff can sign a user into an Ada account they made natively with the same email. The header banner and Settings say so; Unlink exists on both sides. |
| D3 | **Shadow account = `auth.admin.createUser`, confirmed, no password** | `handle_new_user` fires on the insert and creates the profile (role `user`, default credits, `display_name` from `user_metadata`). Nothing special-cased; a bridge user is a user. |
| D4 | **Find-or-create, idempotent per (Builder Journal user, idea)** | `bridge_handoffs` has `UNIQUE (bj_user_id, bj_idea_id)` and `UNIQUE (request_id)`. Re-sending an idea returns the existing sprint (`resumed: true`), same as `sessions` already does for an open sprint on a product. A replayed request fails on the unique index, not on a cache. |
| D5 | **Identity record always written; mode recorded** | `bridge_identities` maps `bj_user_id → user_id` on every handoff, with `mode` (`permanent` \| `session`) copied from the request. Needed for deletion cleanup, the daily cap and Unlink; the consent prompt itself lives in Builder Journal. |
| D6 | **First read is `sessions` with `kickoff: true`, not a bridge special** | The "zero-click auto-kickoff" Sprint.tsx already names as a backend item. `sessions` grows an optional `kickoff` flag that runs one `coachTurn` with a non-persisted arrival directive and persists only the assistant reply. `bridge-intake` calls the shared helper; a native sprint can flip the same flag later. |
| D7 | **One-time sign-in via `generateLink({ type: 'magiclink' })` → `hashed_token` → `verifyOtp` on `/bridge`** | Documented in `CLAUDE.md` (the retired smoke script), implemented nowhere. `/bridge` is a public route that exchanges the hash and navigates to `/sprint/:id`; `ProtectedRoute` is untouched (it drops query strings on redirect, which is why `/bridge` cannot sit behind it). OTP expiry is the project's `otp_expiry` (3600 s); the link is single-use. |
| D8 | **Everything cascades under the shipped Spec 1 delete** | Both new tables carry `user_id → auth.users ON DELETE CASCADE`, so the live `delete-account` scrubs them with **zero changes to that function** — the detach-and-cascade design's whole point, now verifiable against merged code rather than a plan. A later handoff from the same person creates a fresh account; the tombstone is unaffected. Re-check this claim if a future table needs *retaining* rather than destroying: that is the exception the migration handles explicitly. |
| D9 | **Service-role-only tables** | `bridge_identities` and `bridge_handoffs` get RLS enabled and **no policies** for `authenticated` or `anon`, like `deleted_users`. The sprint page learns "arrived from Builder Journal" from `products.source`, which the user can already read under the own-rows policy. |
| D10 | **Caps, fail closed** | If `BRIDGE_SHARED_SECRET` is unset the function returns 503 and does nothing. Per `bj_user_id`: 20 handoffs per UTC day (count on `bridge_handoffs`); over that, 429. Timestamp window ±300 s. Credits for the first read come from the account's normal daily allowance (OQ-04 in the PRD: default is the same 10). |

## 5. Retention and deletion check (against Spec 1)

| Table | FK to `auth.users` | Under Spec 1 delete | Notes |
|---|---|---|---|
| `bridge_identities` | `user_id` CASCADE | Destroyed | Nothing to retain; the tombstone holds the email. |
| `bridge_handoffs` | `user_id` CASCADE | Destroyed | `product_id` also cascades from `products`, which Spec 1 destroys. |
| `products` (new columns) | existing | Destroyed | `source` and `external_ref` go with the row. |
| `sessions`, `conversations`, `messages` | existing | Retained, de-linked (Spec 1 D3/D5, live in the shipped migration) | The idea text is in the intake message and is retained de-identified, exactly as a native sprint's intake is. **The `/privacy` paragraph added in Milestone 1 must say this covers ideas that arrived from Builder Journal**, since the existing copy describes only ideas typed into Ada. |

Storage: the bridge uploads nothing.

## 6. Schema changes

One migration, written after the shipped `20260907040404_account_deletion` and applied by the regime DEU-96 closed on 2026-09-07 (`CLAUDE.md`, Migration workflow). Two sanctioned paths; **pick by where the session is running**:

- **Terminal with the Supabase CLI:** write the file, `supabase db push`. The CLI registers the filename's version; nothing else needed.
- **Agentic or browser session (Claude Code on the web, no CLI)** — the likely case for this build: write the file, apply with MCP `apply_migration`, then read the version it registered via MCP `list_migrations` and **rename the local file to that version in the same commit**. Skipping the rename is precisely what caused the original drift. It is not optional.

```
supabase/migrations/<timestamp>_builder_journal_bridge.sql
```

1. **`bridge_identities`** — `id uuid pk default gen_random_uuid()`, `bj_user_id uuid not null unique`, `user_id uuid not null references auth.users(id) on delete cascade`, `mode text not null check (mode in ('permanent','session'))`, `created_at timestamptz not null default now()`, `last_used_at timestamptz not null default now()`. RLS enabled, no `authenticated`/`anon` policies, no grants.
2. **`bridge_handoffs`** — `id uuid pk`, `request_id text not null unique`, `bj_user_id uuid not null`, `bj_idea_id uuid not null`, `user_id uuid not null references auth.users(id) on delete cascade`, `product_id uuid references products(id) on delete cascade`, `session_id uuid references sessions(id) on delete set null`, `created_at timestamptz not null default now()`; `unique (bj_user_id, bj_idea_id)`; index on `(bj_user_id, created_at)` for the daily cap. Same RLS posture.
3. **`products.source text not null default 'ada' check (source in ('ada','builder_journal'))`** and **`products.external_ref jsonb`** (`{ "app": "builder_journal", "idea_id": "...", "url": "https://aibuilderjournal.com/..." }`). Readable under the existing own-rows policy; **not** added to any `authenticated` UPDATE grant (service-role writes only).
4. **`sessions`**: no schema change. The kickoff is behavior, not a column.

Grant discipline per `CLAUDE.md`: nothing new for `authenticated`; do not loosen the column-level UPDATE grants on `user_profiles` or `messages`.

## 7. Edge Function: `bridge-intake`

`verify_jwt = false` (config.toml entry, with a comment saying why: HMAC, not JWT).

```
POST /functions/v1/bridge-intake
headers: X-Bridge-Timestamp, X-Bridge-Request-Id, X-Bridge-Signature
body: { action: 'handoff',
        bj_user_id, email, display_name?,
        idea: { id, title, brief, tags[], status, captured_at, url },
        link_mode: 'permanent' | 'session' }

 1. secret present?                    else 503 { error: 'bridge_disabled' }
 2. timestamp within ±300 s            else 401
 3. constant-time HMAC compare         else 401
 4. Zod-validate body                  brief ≤ 50 000 chars (Builder Journal cuts at 40 000)
 5. daily cap for bj_user_id           > 20 today → 429 { error: 'bridge_cap' }
 6. existing handoff for (bj_user_id, idea.id)?
      yes → sprint still exists → mint link (step 11) → 200 { resumed: true }
            sprint gone → 410 { error: 'sprint_deleted' }
 7. find user: bridge_identities by bj_user_id, else user_profiles by email
      (service role; auth.users emails are unique)
    none → auth.admin.createUser({ email, email_confirm: true,
             user_metadata: { display_name, bridge_source: 'builder_journal' } })
 8. upsert bridge_identities (bj_user_id) → user_id, mode, last_used_at
 9. insert products (name = title[:200], description = brief[:2000],
      source = 'builder_journal', external_ref)
10. create session with intake = brief, kickoff: true  (shared helper from sessions/)
      → stage classifier (Haiku, existing)
      → one coachTurn with the arrival directive (below), persist assistant reply,
        recordModelUsage(call_type 'discovery_coach', session_id), spend 1 credit
11. insert bridge_handoffs (request_id, …, product_id, session_id)
      — unique violation here means a replay: 409
12. auth.admin.generateLink({ type: 'magiclink', email })
      → properties.hashed_token
13. 201 { url: `${APP_URL}/bridge?th=<hashed_token>&sprint=<session_id>`,
          session_id, product_id, resumed: false }

POST { action: 'unlink', bj_user_id }   (same signature scheme)
      delete bridge_identities where bj_user_id → 200 { ok: true }
      Called by Builder Journal's Unlink control and by its delete-account.
```

Rules: steps 7–12 use `getServiceClient()`. The `url` is returned once and never logged. Failures after step 9 delete the product they created before returning (so a failed kickoff does not leave a half sprint); the request id is not consumed on failure, so the client may retry. The arrival directive is appended as a non-persisted trailing instruction, the same mechanism `chat` uses for `SUMMARY_USER_DIRECTIVE`:

> The PM arrived from Builder Journal with this idea as intake. Open with your first read before they type: what you understand the idea to be, where it might land and what is unproven, what worries you most, then one question. Keep the persona's length rule. Do not mention that you were instructed to do this.

## 8. `sessions` change

`POST /sessions { product_id, intake?, kickoff?: boolean }`. When `kickoff` is true and an intake was persisted, run the coach turn described in §7 step 10 before returning; the response gains `kickoff: { message_id } | { error: true }` (non-fatal, like `classification_error`). The logic moves into a shared helper so `bridge-intake` and `sessions` call one function. No change to the state machine, coverage or pending-action fields.

## 9. Frontend

- **`/bridge`** (public route, not under `ProtectedRoute`): reads `th` and `sprint`; calls `supabase.auth.verifyOtp({ token_hash: th, type: 'magiclink' })`; on success `navigate('/sprint/<sprint>?arrived=bridge', { replace: true })`; on failure shows one card: "This link expired. Go back to Builder Journal and send the idea again." with a link to `/login`. Three lines of loading state (idea received, signed in, opening your sprint) while it works, as in the concept.
- **`Sprint.tsx`**: when `product.source === 'builder_journal'`, the header sub-line reads "arrived from Builder Journal" and a small pill under the header says "Signed in through Builder Journal · accounts linked / this session only" (mode from a new `?arrived=bridge` read once, then dropped from the URL). Starter chips already hide once an assistant message exists, so the first read replaces them with no code.
- **`Settings.tsx`**: if the account has a `bridge_identities` row (exposed through a tiny service-role read in an existing settings function, or a `user_metadata.bridge_source` check), show "Created through Builder Journal" with: set a password (existing password form must accept "no current password" for this case), and Unlink. Deletion (Spec 1) unchanged.
- **`Privacy.tsx` (Must, ships with Milestone 1):** one paragraph under the existing retention section saying that ideas can arrive from AI Builder Journal, that an account may be created that way, that the retained de-identified transcript can include the idea text sent over, and that the account is deletable here like any other. Bump `PRIVACY_LAST_UPDATED`. This is the whole of what DEU-91 owes the bridge.
- **Setting a password is a real gap, not a formality (OQ-B, now confirmed).** `Settings.tsx` requires a current password (`'Current password is required'`) and `updatePassword(current, new)` re-authenticates with it. A bridge-created user has no password and therefore **cannot use that form**. Two honest options: (a) point them at the existing `/reset-password` email flow, which works today and needs no new code — recommended for v1; (b) branch the form to skip the current-password step when the user has none. Do **not** ship a "set a password" button that silently fails.
- **Should-Have:** the in-thread "Claim your account" card after the fifth message; direction chips on arrival (Discovery loop, riskiest assumption, market brief at `/product/:id/intel`, portfolio at `/portfolio`).

## 10. Secrets and config

- `BRIDGE_SHARED_SECRET` (32 random bytes, base64; the same value in Builder Journal's secrets).
- `APP_URL` (`https://ada-coach.vercel.app`) for the launch URL; do not derive it from the request.
- `supabase/config.toml`: `[functions.bridge-intake] verify_jwt = false` with the comment.
- `ALLOWED_ORIGINS`: unchanged.

## 11. Testing

Unit (Deno test, in `_shared`): signature verify (good, bad, expired, replayed), cap counting, brief validation. Function-level: a signed `curl` from a shell with a throwaway email creates a user, product, session, one assistant message, one `model_usage` row, and returns a URL that signs in exactly once. Isolation: two Builder Journal ids with different emails cannot see each other's sprint; the same email from two Builder Journal ids resolves to one Ada user (D2, documented). Deletion: run Spec 1's manual test on a bridge-created account; confirm both bridge tables are empty for that user and the conversation is retained de-linked.

## 12. Risks

- **~~Spec 1 not shipped~~ → resolved 2026-09-07.** Deletion is on `main` and this spec's tables cascade under it with no change to `delete-account`. The residual risk is that the *deployed* behavior differs from the merged code; Mo's manual dry run covers that, and it gates turning the bridge on, not building it.
- **~~Spec 3 not shipped~~ → mostly resolved.** `/privacy` exists and covers deletion retention. The residual risk is a disclosure that does not mention arrivals from another app; closed by the paragraph in §9, which is a Must inside Milestone 1.
- **~~Migration path unverified~~ → resolved.** DEU-96 closed; §6 names both paths. The live risk moved: an agentic session that applies via MCP and **forgets the rename** re-creates the original drift. §6 states it; the reviewer should check for it in the diff.
- **Email-join surprise (D2)** → disclosed, unlinkable, equivalent to magic link.
- **Kickoff cost creep** → one Haiku turn per new handoff, capped 20/day/user, idempotent per idea.

## 13. Open items

- **OQ-A — answered (Mo, 2026-09-07, from the Supabase dashboard).** `enable_confirmations` is **off** in production, deliberately, for demo mode: new users don't need to confirm their email to sign up. Admin-created bridge users are confirmed either way (`email_confirm: true` in `auth.admin.createUser`), so this doesn't change anything about the bridge path itself; it only means a native signup with an email a bridge already claimed proceeds without a confirmation-email round trip.
- **OQ-B — answered, and the answer is "no."** The Settings form requires a current password, so a bridge user cannot set one there. §9 records the two options; v1 recommendation is to point them at `/reset-password`. Owner: Mo to pick, at Milestone 1.
- **OQ-C** — the delta audit (PRD Milestone 4) runs against this surface with the 2026-08-23 audit's method before `BRIDGE_SHARED_SECRET` is set in production. Unchanged.
- **OQ-D — new.** `RESEND_API_KEY` / `EMAIL_FROM` now exist for the deletion email. Should a bridge arrival send a "your Ada account was created from Builder Journal" email? Default: **no** for v1 — the arrival is visible on screen and the account is reachable by magic link, so an extra email is noise. Owner: Mo. Due: Milestone 3.

## 14. Verification (how Mo tests it by hand)

1. With Spec 1 shipped, create a throwaway Builder Journal account (verified email) and an idea.
2. Share menu → Validate with Ada… → Open in Ada.
3. A new tab opens on `ada-coach.vercel.app/sprint/…` without a login screen; the header says "arrived from Builder Journal"; Ada's first read is already in the thread; the credits pill shows one fewer.
4. Send one message; Ada replies as usual.
5. Close the tab. On Ada's login page use "Email me a sign-in link" with the throwaway email; you land on the same sprint.
6. Back in Builder Journal, the idea shows "Sent to Ada · open sprint"; pressing it opens the sprint (no login).
7. Send the same idea again: the same sprint opens; no second product in `/discovery`.
8. In Ada, Settings → delete the account (Spec 1). Confirm in SQL: no `bridge_identities` or `bridge_handoffs` rows for that user; the conversation is retained with `user_id` null.
9. Press "open sprint" in Builder Journal: it says the sprint no longer exists and offers to send again.

## 15. How an Ada session should pick this up

Start the session with the `session-start` skill as usual. When it asks what to ship, answer: **"Spec 4, the Builder Journal bridge, Milestone 1 only."** The deletion gate is cleared (see the table at the top), so no confirmation step is needed first; the only thing still owed to launch is Mo's dry run and the delta audit, both of which gate switching the bridge on, not writing it.

Read this file and the PRD it points to, then enter Plan Mode and write the plan to `tasks/todo.md` before any code, per `CLAUDE.md`.

Hard boundaries: do not touch `ALLOWED_ORIGINS`, `requireUser`, the coach persona, or any `authenticated` grant; do not modify `delete-account` (this spec deliberately requires no change to it, and needing one means a table was designed wrong). If applying the migration through MCP, rename the local file to the registered version in the same commit (§6).

The one judgment call worth the most care is **D2**, trusting Builder Journal's verified email as the join key. If the session disagrees with it, say so before building rather than routing around it.
