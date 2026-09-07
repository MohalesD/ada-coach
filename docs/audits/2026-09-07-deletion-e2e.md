# Spec 1 Account-Deletion E2E — Audit Attempt, 2026-09-07

**Status: NOT EXECUTED.** This audit could not run. Both external accesses the
task requires are blocked at the environment/infrastructure level, not by
missing tooling or a fixable configuration choice available from inside this
session. This report documents exactly what was tried, the evidence for each
blocker, and what needs to change before the E2E can run.

Per the task's own instruction ("report database outcomes, not just absence
of errors"), no pass/fail claim is made anywhere below that wasn't backed by
an actual command run and its output. Nothing in this report should be read
as "the deletion flow works" or "the deletion flow is broken" — no attempt
reached the point where that could be observed.

## What was read first

- `docs/superpowers/specs/2026-08-22-account-deletion-design.md` §§1–13 (the
  full spec, not just §10) — reviewed for the retention matrix, the
  `delete-account` Edge Function contract, and the exact §10/§13 acceptance
  criteria this audit was meant to check.
- `CLAUDE.md` — no "Account deletion" section exists in the current file (the
  spec above is the closest source; grepped for "deletion"/"delete-account",
  no matches in `CLAUDE.md`).

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

1. **Network egress**: allowlist `ada-coach.vercel.app` (and the preview host,
   if testing a preview build — remember to also add it to `ALLOWED_ORIGINS`
   in Supabase secrets per `CLAUDE.md`'s CORS note) in this environment's
   outbound network policy, or run the E2E from an environment whose policy
   already permits it.
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
