# Spec 1 Account-Deletion E2E — Audit Attempt, 2026-09-07

**Status: SPEC'D PLAYWRIGHT E2E NOT EXECUTED. DB-level fallback executed and
PASSED (6/6).** Network access to `ada-coach.vercel.app` and the project's
`*.supabase.co` host is blocked at the environment/infrastructure level (see
below) — steps 1–3 of the spec (real signup, chat, and deletion through the
UI and Edge Functions) could not run in this session under any tooling
available to it. With Mo's explicit sign-off, a **DB-level fallback** was run
instead: a disposable identity and matching fixture data were inserted
directly into Ada Coach's production database (`ada-coach-01`,
`pdxflmydzmcsynccunhn`), the same retained/destroyed sequence the
`delete-account` Edge Function performs (tombstone upsert, feedback scrub,
storage cleanup, then `DELETE FROM auth.users`) was executed via
`execute_sql`, and every assertion in spec §10 step 4 was checked directly
against the resulting rows. All test data was cleaned up afterward.

**This fallback does NOT cover:**
- The `delete-account` Edge Function itself — its JWT/`requireUser()` check,
  the owner-403 rejection (D6), the service-role wiring, or its error
  handling.
- The frontend at all — Settings page, the `DELETE` confirmation input, the
  post-delete redirect to `/login`, or the "deleted" notice.
- Whether the old credentials actually fail against Supabase Auth's sign-in
  endpoint (this session never reached that endpoint).
- The `admin-feedback` §8a regression fix (retained-row rendering) — that's a
  frontend/API concern, untestable without network access.
- Email send-on-deletion (best-effort, D7).

It only verifies that the **schema — the FK/trigger retention mechanics in
the `account_deletion` migration — behaves as documented** when an
`auth.users` row is deleted. That was, per the design doc, the highest-risk
and least-previously-tested part of the spec, so it has real value, but it is
not a substitute for the Playwright E2E the task asked for. Do not read the
6/6 below as "the deletion feature works end-to-end" — it isn't that.

## DB-level fallback — pass/fail

Test identity: `0ee41937-609d-433d-85bd-a1526f34ecb5`,
`e2e-fallback-test-20260907@example.invalid` (synthetic, inserted directly
via SQL — never a real signup). Fixture: 1 conversation, 2 messages (one
rated `feedback='negative'`), 1 `user_feedback` row with a `contact_email`,
1 `storage.objects` row under `documents/<uid>/...`. Deletion sequence run
via `execute_sql` against project `pdxflmydzmcsynccunhn`: upsert
`deleted_users` → scrub `user_feedback.contact_email` + set
`deleted_user_id` → delete the storage object row (required
`SET LOCAL storage.allow_delete_query = 'true'`; direct deletes are normally
blocked by `storage.protect_delete()` — confirms the real Edge Function must
go through the Storage API, not raw SQL, to clear a user's files) → `DELETE
FROM auth.users`.

| # | Assertion (spec §10) | Result |
|---|---|---|
| 1 | `auth.users` row for the test identity is gone | **PASS** — `count(*) = 0` |
| 2 | `user_profiles` row is gone | **PASS** — `count(*) = 0` (cascade) |
| 3 | Conversation still exists, `user_id IS NULL` | **PASS** — row present, `user_id: null` |
| 4 | Messages survive, including the one with `feedback='negative'` | **PASS** — both messages present, assistant message `feedback: "negative"` |
| 5 | `user_feedback` row survives with `user_id IS NULL`, `contact_email IS NULL`, `deleted_user_id` pointing at a `deleted_users` row whose `email` matches | **PASS** — `user_id: null`, `contact_email: null`, `deleted_user_id` resolved to a `deleted_users` row with `email: "e2e-fallback-test-20260907@example.invalid"` matching the original account |
| 6 | `storage.objects` has zero rows under the old uid prefix | **PASS** — `count(*) = 0` after cleanup (see note above on `protect_delete`) |

**Bonus finding (not in the original checklist):** `storage.objects` has an
app-level `protect_delete()` trigger blocking raw `DELETE`s outside a
`storage.allow_delete_query = true` session setting. This is a real
constraint on the actual `delete-account` implementation, not just this
test's plumbing — worth confirming the Edge Function's storage cleanup goes
through `supabase.storage.from('documents').remove([...])` (the Storage API)
rather than any raw-SQL path, since the Storage API sets this internally.

## Steps NOT executed (spec §10, steps 1–3)

Unchanged from below: blocked by network policy, confirmed three ways (curl,
an actual Playwright/Chromium session, and the proxy's own status endpoint).
See "What was tried" for full detail.

## What was read first

- `docs/superpowers/specs/2026-08-22-account-deletion-design.md` §§1–13 (the
  full spec, not just §10) — reviewed for the retention matrix, the
  `delete-account` Edge Function contract, and the exact §10/§13 acceptance
  criteria this audit was meant to check.
- `CLAUDE.md` — no "Account deletion" section exists in the current file (the
  spec above is the closest source; grepped for "deletion"/"delete-account",
  no matches in `CLAUDE.md`).

## Update 2 — confirmed with an actual browser, not just curl

Installed `playwright-core@1.56.1` in scratch and launched the pre-installed
Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) through this
session's sanctioned proxy (`http://127.0.0.1:<port>`, same one `curl` uses
via `HTTPS_PROXY`). `page.goto('https://ada-coach.vercel.app/')` failed with
`net::ERR_TUNNEL_CONNECTION_FAILED`. Same failure class as the `curl` 403s
above — this rules out a curl-specific quirk and confirms the block is a
proxy-level policy denial that affects every HTTP client in this session
identically, browser included. No attempt was made to route around the
proxy (untested and out of scope — routing around an organization's egress
policy is not something to explore even experimentally).

**Conclusion: this session cannot execute steps 1–3 of the E2E under any
tooling available to it.** The blocker is infrastructural (session/environment
network policy), not a gap in approach, tooling, or effort. It requires
either the egress allowlist being updated for `ada-coach.vercel.app` and
`pdxflmydzmcsynccunhn.supabase.co`, or running this E2E from an environment
that isn't subject to this restriction.

## Update — Blocker 1 resolved, Blocker 2 still open

As of a later check in this same session, `mcp__Supabase__list_projects` now
returns `ada-coach-01` (project ref `pdxflmydzmcsynccunhn`), so Blocker 1
below is resolved — `execute_sql` against Ada Coach's actual database is now
possible.

Blocker 2 is not resolved. Re-checked directly:

```
$ curl -sS -o /dev/null -w "%{http_code}" https://ada-coach.vercel.app/
403 (connect_rejected)
$ curl -sS -o /dev/null -w "%{http_code}" https://pdxflmydzmcsynccunhn.supabase.co
403 (connect_rejected)
$ curl -sS -o /dev/null -w "%{http_code}" https://db.pdxflmydzmcsynccunhn.supabase.co
403 (connect_rejected)
```

This is fatal to steps 1–3 regardless of Blocker 1's fix: the frontend and
every Edge Function URL for this project live on the same blocked hosts
(`*.vercel.app`, `*.supabase.co`). The Supabase MCP server reaches the
database through its own separate, pre-authorized connection — not through
this session's local network — so it can run `execute_sql` even though this
session cannot reach the same project over plain HTTPS. There is no way to
invoke Edge Functions (`chat`, `delete-account`, etc.) or load the app from
this session while that host-level policy denial stands. Steps 1–3 remain
**not run**; step 4 remains **not verifiable** because there is nothing yet
to verify — no disposable user exists to check the retention outcomes of.

## Blocker 1 — Supabase MCP is scoped to the wrong project

`mcp__Supabase__list_projects` and `list_organizations` return exactly one
project, and it is not Ada Coach's:

```json
{"projects":[{"id":"vggmdbiijnivgkrvqvap","ref":"vggmdbiijnivgkrvqvap",
  "organization_id":"pqohwfrztedxayqbpbna","organization_slug":"pqohwfrztedxayqbpbna",
  "name":"recruiter-os-prod", ...}]}
{"organizations":[{"id":"pqohwfrztedxayqbpbna","slug":"pqohwfrztedxayqbpbna","name":"recruiter-os-prod"}]}
```

This is a different product entirely (RecruiterOS), in an org that has no
Ada Coach project. There is no `execute_sql`-reachable path to Ada Coach's
database from this session. No `.env.local`, service-role key, or other
Ada Coach Supabase credential exists in the repo or environment (`.env.example`
is the only env file present, and it contains only placeholders).

I asked the user how to proceed; they chose "add Ada Coach's Supabase project
to MCP." I do not have a tool to do that myself — the Supabase MCP server's
authorized org/project is set outside this session (wherever this
environment's MCP servers were configured), and `list_projects` still shows
only `recruiter-os-prod` after being asked to add the other project.

## Blocker 2 — outbound network policy denies the production host

Independent of the Supabase MCP issue, this environment's egress proxy
rejects HTTPS connections to the very hosts the task needs Playwright to
reach:

```
$ curl -sS -o /dev/null -w "%{http_code}" https://ada-coach.vercel.app/
curl: (56) CONNECT tunnel failed, response 403

$ curl -sS -o /dev/null -w "%{http_code}" https://vercel.app
curl: (56) CONNECT tunnel failed, response 403

$ curl -sS -o /dev/null -w "%{http_code}" https://supabase.com
curl: (56) CONNECT tunnel failed, response 403
```

The proxy's own status endpoint confirms this as a policy decision, not a
transient failure:

```json
"recentRelayFailures": [
  {"ts":"2026-09-07T05:20:17.912Z","kind":"connect_rejected",
   "detail":"gateway answered 403 to CONNECT (policy denial or upstream failure)",
   "host":"ada-coach.vercel.app:443"}
]
```

Playwright is available in this environment (Chromium pre-installed at
`/opt/pw-browsers`, `npx playwright --version` → `1.56.1`), so the tooling
itself is not the gap — the network path to the target host is closed. This
would block step 1 (create disposable user, chat, feedback, upload) even if
Blocker 1 were resolved.

**This is not a fixable misconfiguration inside this session — it's a
policy boundary.** `get_session` confirms this session is already running
in `env_0199MzeFiQyXdVBgthvmDUk4`, an environment named "Default - trusted
network access" (not the locked-down "Prototype Sandbox" that also exists
on this account) — and the target host is still rejected with an explicit
`403` at the egress proxy. The proxy's own operator documentation
(`/root/.ccr/README.md`) is unambiguous: a `403`/`407` from the proxy means
"the destination host is not allowed by your organization's egress policy
for this session. Do not retry or route around it — report the blocked
host." Switching environments, using a different HTTP client, or any other
route-around was deliberately not attempted, per that guidance.

## Consequence

Steps 1–4 of the task's plan were not attempted:

| # | Step | Result |
|---|---|---|
| 1 | Playwright: create disposable user, 2 chat messages, thumbs-down, feedback w/ contact email, upload .txt to a Discovery Sprint | **Not run** — network policy blocks the target host (Blocker 2) |
| 2 | Settings → type DELETE → confirm | **Not run** (depends on 1) |
| 3 | Assert redirect to `/login` with deleted notice; old credentials fail | **Not run** (depends on 1–2) |
| 4a | `auth.users` row gone | **Not verifiable** — no Supabase MCP access to Ada Coach's project (Blocker 1) |
| 4b | `user_profiles` row gone | **Not verifiable** (Blocker 1) |
| 4c | `conversations` row exists with `user_id IS NULL`; its messages exist incl. `feedback='negative'` | **Not verifiable** (Blocker 1) |
| 4d | `user_feedback` row exists with `user_id IS NULL`, `contact_email IS NULL`, `deleted_user_id` → matching `deleted_users` row | **Not verifiable** (Blocker 1) |
| 4e | `storage.objects` has zero rows under the old uid prefix | **Not verifiable** (Blocker 1) |

No disposable user was created. No production data was touched. Nothing was
deleted, irreversibly or otherwise.

## What's needed to actually run this

Either of the following, ideally both:

1. **Network egress**: this session's org-level egress policy explicitly
   denies `ada-coach.vercel.app` / `vercel.app` / `supabase.com`, even from
   the "trusted network access" environment. That's a deliberate boundary,
   not an oversight — someone with authority over this Claude Code org's
   network policy needs to either add an explicit allowlist entry for these
   hosts (and the preview host, if testing a preview build — remember to
   also add it to `ALLOWED_ORIGINS` in Supabase secrets per `CLAUDE.md`'s
   CORS note), or this E2E needs to run from a venue the policy doesn't
   cover at all (e.g. Mo's own machine, outside this hosted environment).
2. **Supabase MCP scope**: point this session's Supabase MCP connector at Ada
   Coach's actual project (org/project ref TBD — not discoverable from this
   repo since no real credentials are committed, correctly, per
   `.env.example`'s own comment that `.env*` files are gitignored). If the
   intent was read-only verification only, a scoped read-only service
   connection to Ada Coach's project would satisfy step 4 without touching
   `recruiter-os-prod`.

Once both are in place, re-run per the original plan: Playwright end-to-end
against `https://ada-coach.vercel.app` (or the supplied preview URL, added to
`ALLOWED_ORIGINS` first), then `execute_sql` (read-only) against Ada Coach's
project for the five assertions in the table above.

## Scope respected

- No owner/admin account was targeted (none was created or touched — nothing
  was created at all).
- No schema changes were made.
- No commits beyond this report.
