# Builder Journal Bridge — Delta Audit (Spec 4, PRD Milestone 4, OQ-C)

**Date:** 2026-09-08
**Method:** Read-only verification directly against the live database (project
`ada-coach-01`, `pdxflmydzmcsynccunhn`) plus a direct read of the relevant
source files, following the 2026-08-23 RLS audit's method (query actual
policies/constraints/grants, don't trust the schema's own comments).
**Scope:** the new surface added by Spec 4 Milestone 1 — `bridge_identities`,
`bridge_handoffs`, `products.source`/`products.external_ref`,
`bridge-signature.ts`'s HMAC verification, and the `/bridge` → `/sprint/:id`
isolation path.

## Provenance

The Builder Journal orchestrator session ran this same check first, independently — it
turns out to have its own direct Supabase MCP connection to this project (Ada
doesn't route through Lovable, so its database is reachable straight from that
session too), so the read-only half of Milestone 4 didn't have to wait on an
Ada session at all. Everything below was **re-run independently from this
session** rather than copied from that report, specifically so this file
reflects primary sources this session actually queried, not a relayed claim.
Both runs agree.

## Findings

| # | Claim | Verified | Evidence |
|---|---|---|---|
| 1 | `bridge_identities` and `bridge_handoffs` have RLS **enabled** | ✅ | `pg_class.relrowsecurity = true` for both |
| 2 | Each table has exactly **one** policy, scoped to `service_role`, covering `ALL` | ✅ | `pg_policies`: `service_role full access bridge_identities` / `..._bridge_handoffs`, `roles={service_role}`, `cmd=ALL`, `qual=true` — no `anon`/`authenticated` policy exists on either table |
| 3 | `anon`/`authenticated` hold **zero column-level grants** on either table | ✅ | `information_schema.column_privileges` returns an empty set for both roles on both tables |
| 4 | `bridge_identities.bj_user_id` is `UNIQUE` (no identity collision across handoffs) | ✅ | `bridge_identities_bj_user_id_key`: `UNIQUE (bj_user_id)` |
| 5 | `bridge_handoffs` has `UNIQUE(request_id)` (replay protection) | ✅ | `bridge_handoffs_request_id_key`: `UNIQUE (request_id)` |
| 6 | `bridge_handoffs` has `UNIQUE(bj_user_id, bj_idea_id)` (idempotent re-send) | ✅ | `bridge_handoffs_bj_user_id_bj_idea_id_key`: `UNIQUE (bj_user_id, bj_idea_id)` |
| 7 | `products.source` / `products.external_ref` are excluded from `authenticated`'s `INSERT`/`UPDATE` column grants (service-write-only) | ✅ | `authenticated` INSERT grant on `products`: `description, name, user_id` only. `authenticated` UPDATE grant: `description, name` only. Both columns are readable (`SELECT` includes them, as documented — the sprint page shows the arrival banner) but not writable by a browser |
| 8 | HMAC verification: ±300s window, constant-time compare, distinct `malformed`/`expired`/`bad_signature` outcomes | ✅ | Read `supabase/functions/_shared/bridge-signature.ts` directly: `TIMESTAMP_WINDOW_S = 300`; `timingSafeEqual` XORs every byte with no early return, length mismatch included; `verifyBridgeRequest` returns the three distinct reasons in that order (malformed → expired → bad_signature) |
| 9 | Opening `/bridge?sprint=<id>` cannot leak another user's sprint | ✅ | Read `Bridge.tsx`: it never inspects the `sprint` param beyond a UUID-shape regex before navigating to `/sprint/:id`; the `sessions` GET handler (`sessions/index.ts` L61-65) queries by id through `userClient` (RLS-bound to the caller's JWT), not the service client; `sessions`' own `SELECT` policy is `user_id = auth.uid()`. A guessed or borrowed sprint id resolves to zero rows → 404 `Session not found`, structurally, not by an application-level check that could be forgotten |

## What this does and doesn't cover

**Covered:** every claim above is a direct read of live Postgres catalog state
(`pg_class`, `pg_policies`, `pg_constraint`, `information_schema.column_privileges`)
or the actual shipped source, not the migration file's own comments or a
description of intended behavior.

**Not covered, deliberately left for a live run:** a real two-account probe
(the 2026-08-23 audit's own gold standard — two throwaway users, SQL and the
live API in both directions) exercising the bridge's actual entry points
(`bridge-intake` `handoff`/`unlink`, a real magic-link exchange through
`/bridge`). Findings #1-9 make a live cross-user leak structurally
implausible (no policy exists that could permit it), but they are not a
substitute for actually doing it. That live probe is the one remaining item
before `BRIDGE_SHARED_SECRET` goes live in production — see the gate table in
`docs/superpowers/specs/2026-09-07-builder-journal-bridge-design.md`.

## Net effect on Milestone 4 / the launch gate

The read-only delta audit passes clean, 9/9. Combined with the dry run
(`2026-09-07-deletion-e2e.md`) also passing, the remaining launch-gate items
are: the live two-account isolation probe above, and then flipping
`BRIDGE_SHARED_SECRET` + `APP_URL` in production. Both are sequencing, not
build work — nothing found here changes what Milestone 1 shipped.
