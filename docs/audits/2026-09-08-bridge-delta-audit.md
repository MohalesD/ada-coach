# Builder Journal Bridge — Delta RLS Audit (Spec 4, Milestone 4, read-only half)

**Date:** 2026-09-08
**Method:** `get_advisors(security)`, `information_schema.role_table_grants`,
`information_schema.column_privileges`, `pg_policies`, and `pg_constraint`
against `ada-coach-01` (`pdxflmydzmcsynccunhn`), live. Direct reads of
`_shared/bridge-signature.ts`, `src/pages/Bridge.tsx`, and the `sessions`
Edge Function's `GET` handler. No policy, grant, or schema change was made.
No code was edited. Same method as `2026-08-23-rls-audit.md`, scoped to the
new surface named in the PRD's Milestone 4 (`bridge_identities`,
`bridge_handoffs`, `bridge-intake`, `/bridge`, the `sessions` change).
**Run from the Builder Journal orchestrator session**, which has the same
Supabase account access as this project — Ada's database did not need to
wait on a session in this repo to be audited.

**Scope note:** this is the *read-only* half of Milestone 4. The PRD's other
half — an end-to-end test with two real Builder Journal accounts confirming
neither reaches the other's sprint, with the bridge secrets live — is not
covered here and needs `BRIDGE_SHARED_SECRET`/`ADA_BRIDGE_URL` reachable
somewhere, which is Mo's call per the standing launch gate. Everything below
is: with the schema and code as merged, is the mechanism sound.

---

## 1. RLS and grants on the two new tables

Both `bridge_identities` and `bridge_handoffs` carry **exactly one policy
each**: `{service_role}`, `ALL`, `qual = true`. Zero policies target `anon`
or `authenticated` on either table, and `information_schema.role_table_grants`
confirms **zero grants** to `anon`, `authenticated`, or `PUBLIC` on either —
not even a residual `SELECT`. This matches the "no anon/authenticated
policies, no grants" posture CLAUDE.md describes, verified live rather than
taken on the doc's word.

## 2. Constraints — identity and idempotency

```
bridge_identities:  UNIQUE (bj_user_id)
bridge_handoffs:     UNIQUE (request_id)
                      UNIQUE (bj_user_id, bj_idea_id)
                      product_id -> products(id)  ON DELETE CASCADE
                      session_id -> sessions(id)  ON DELETE SET NULL
                      user_id    -> auth.users(id) ON DELETE CASCADE
```

`bj_user_id` unique means a Builder Journal user id can never resolve to more
than one Ada identity — no collision path. `UNIQUE(request_id)` is the replay
guard the header comment claims; `UNIQUE(bj_user_id, bj_idea_id)` is the
idempotency guard. Both exist as real constraints, not just as a comment.

## 3. `products.source` / `products.external_ref` — service-write-only, checked

`authenticated`'s column grants for `INSERT` on `products` are exactly
`description, name, user_id`. `source` and `external_ref` are absent from
that list — confirmed live, not just documented. A browser cannot set either
column directly.

## 4. Signing and the isolation chain — read directly, not assumed

- `_shared/bridge-signature.ts`: `TIMESTAMP_WINDOW_S = 300`; `timingSafeEqual`
  XORs over the full length of the longer input with no short-circuit, so a
  length mismatch still costs a full pass; `verifyBridgeRequest` returns
  distinct `malformed` / `expired` / `bad_signature` outcomes rather than one
  generic failure. Sound.
- `src/pages/Bridge.tsx` only ever calls `navigate('/sprint/:id', ...)` after
  `verifyOtp` succeeds — it does not itself decide who may see the sprint.
- The `sessions` Edge Function's `GET` handler (which `Sprint.tsx` calls to
  load that sprint) reads through the **RLS-bound `userClient`**, not the
  service client.
- Live policy check: `sessions` carries `"users read own sessions"` on
  `{authenticated}` `SELECT` with `qual = (user_id = auth.uid())`.

Chained together: a guessed or borrowed sprint id in the `/bridge` URL cannot
return another user's session, because the read it triggers is scoped to
`auth.uid()` at the database, not to whatever id sits in the query string.
This is the property the two-account live test would confirm empirically;
this pass confirms the mechanism it would be testing is real.

## 5. One finding — pre-existing, not a bridge defect, not blocking

`anon` holds full table-and-column `INSERT`/`UPDATE`/`SELECT` grants on
`products`, `sessions`, `assumptions`, and `model_usage`. None of these carry
an RLS policy targeting `anon`, so with RLS enabled the Postgres default is
deny and the grants are inert today. This predates Spec 4 — it is not on
either new bridge table (`bridge_identities`/`bridge_handoffs` have **zero**
`anon` grants, cleaner than the tables around them) — so it is not something
Milestone 2 or 3 introduced. Recommend a `REVOKE ... FROM anon` pass on the
four tables above as its own hygiene item, separate from this spec.

## 6. Advisor lints — unchanged since 2026-08-23, plus one new one

`function_search_path_mutable` (×4) and the `SECURITY DEFINER`
callable-by-anon/authenticated warnings for `fn_reset_credits_if_due`,
`handle_new_user`, and `log_assumption_status` are unchanged from the
2026-08-23 audit and unrelated to the bridge. **New since then:**
`rls_auto_enable` now shows the same anon/authenticated-executable warning.
It reads as a platform-level event-trigger safety net (auto-enables RLS on a
newly created table) rather than a function that touches bridge or user
data — naming it here because the audit method calls for every flagged
`SECURITY DEFINER` function to be named, not silently dropped. Worth a
five-minute look to confirm it is what it appears to be; not urgent, and not
gating Milestone 4.

## 7. What remains

The live two-account isolation test. Everything above is the mechanism that
test would exercise, confirmed sound by direct inspection; it is not a
substitute for running it once the bridge secrets are live. That is the one
thing left in the entire Validate-with-Ada sprint after this.
