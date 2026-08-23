# Diagnostic Build Log — 2026-08-23

Read-only diagnostic run per `/goal`. Two tracks, zero writes to code, schema, or remote.
Sonnet throughout, no escalation.

## Read first

- `CLAUDE.md` — already in context from earlier in the session, current on disk.
- `docs/superpowers/specs/2026-08-22-account-deletion-design.md` — already read/authored
  earlier in the session.
- `supabase/migrations/` — directory listing (47 files) + one file body read in full
  (`20260705100000_storage_session_uploads.sql`, needed to resolve a live contradiction, see
  below).
- `tasks/todo.md` — read in full (838 lines). Notable: it already carries a
  "Reconciled against Linear 2026-08-23" backlog table from earlier in this session, plus a
  standalone "🔒 Standing rule for this window" section restating the RLS hard-gate verbatim.

## Track 1 — RLS/auth/isolation audit

1. `get_advisors(security)` + `list_tables` across `public`/`auth`/`storage` — 7 WARN lints, 0
   ERROR, 24 public tables all RLS-enabled.
2. Full `pg_policies` dump for `public` + `storage` (one query, ~40 rows) — every table's
   command/role/USING/WITH CHECK reviewed. One real gap found (`documents` owner-insert policy
   doesn't scope `user_id`). Zero anon-accessible policies anywhere.
3. Mapped every DEU-89-touched table to a verdict — all sound. One trigger cross-check
   (`enforce_session_transition`) re-confirmed safe against the cascade `SET NULL`.
4. Read `market-intel/index.ts` in full, grepped `competitive-intel`/`competitor-profile`
   index.ts for cap logic, read `20260710100000_competitive_intel_run_caps.sql`, grepped
   `chat/index.ts` for the credit-gate lines. Confirmed fully independent enforcement paths,
   opposite fail-open/fail-closed postures. Repo-wide grep for cap/credit markers across
   `supabase/functions/` returned exactly 6 files — confirms `discovery-turn` and
   `assumption-mapping` have zero gating, as DEU-52 claims.
5. Joined `storage.objects` to `public.documents` on `file_path` directly — 1 object, 1
   matching document row, zero orphans. Corrected an earlier claim made in this same
   conversation (before this diagnostic) that called this an orphan — that claim came from two
   ungathered observations, never actually joined, and `list_tables`' row-count estimate for
   `documents` (`0`) turned out to be stale versus a live `COUNT(*)` (`1`).

Extra checks run beyond the goal's literal 5 steps, because they were one query away and
directly load-bearing for the "gap needing human review" classification the goal asked for:

- `pg_get_functiondef` on `rls_auto_enable`, `handle_new_user`, `fn_reset_credits_if_due`,
  `match_document_chunks`, `match_session_chunks`, `set_updated_at` — resolved all three
  advisor-flagged `SECURITY DEFINER` RPC-exposure warnings as non-exploitable-but-should-fix,
  and surfaced `rls_auto_enable` as a genuinely good existing pattern (event trigger,
  auto-enables RLS on every new table, not callable via RPC by construction).
- `information_schema.column_privileges` for `user_profiles` + `messages` — this is the
  diagnostic's most significant finding: both `anon` and `authenticated` carry far broader
  column grants than the "column-level GRANT defense-in-depth" framing in the original
  2026-04-18 audit implies. RLS is sound and is the only thing currently blocking exploitation
  (no INSERT policy exists on `user_profiles` for either role). Flagged medium severity —
  RLS holding is good, but the second line of defense described in the docs is much thinner
  than documented.

## Track 2 — DEU-96 migration drift diagnostic

1. Attempted `supabase migration list --linked` via the CLI, as the goal explicitly asked for —
   **failed**, CLI returns 401 unauthorized in this environment (not linked/logged in). Used
   the MCP `list_migrations` tool as the documented equivalent (reads the same
   `supabase_migrations.schema_migrations` table).
2. First diff attempt used a Python script via a Bash heredoc — failed with `FileNotFoundError`
   because Git Bash's `/tmp` and the Windows Python interpreter don't share a path mapping in
   this environment. Redid it entirely in pure bash (`comm`, `join`, `awk`) writing to the
   session scratchpad directory instead. That version also had a bug on the first pass: `awk
   -F_` field-splitting and reconstructing with default OFS silently turned every underscore in
   a migration name into a space, which would have produced a false "zero names match" result.
   Caught before drawing any conclusion from it, fixed with `sed`-based extraction instead of
   field-rebuild.
3. Final diff: 47 local files, 47 remote entries, **zero** names-only-local, **zero**
   names-only-remote, 11 exact version matches (everything before MCP remapping started), 36
   version-string mismatches. Every mismatch traced to a specific pre/post pair in the report.
4. Wrote the recommendation (formalize MCP-only, retire `db push`, add periodic `db dump`
   snapshots) with concrete steps for DEU-89/94/95's pending migrations, and an explicit
   definition of what "committed .sql file" means once `db push` is retired (a labeled
   historical record, not a push source).

## Scope boundary — honored

No migration applied. No policy or grant changed. No code edited. No git writes except the
three files this diagnostic produces (this log + the two audit reports). `tasks/todo.md` was
read but not edited, even though it contains one now-stale claim (storage uploads
"still owner-only") — corrections to that file are explicitly out of scope for this session
per the plan of record ("repo-local until the docs-system overhaul"); the correction is
recorded in the RLS audit report instead.

## Turns used

Well inside the 40-turn cap — this diagnostic completed in roughly 20 tool-call turns across
both tracks combined, including the two self-corrected script bugs above.

## What blocked and how it was handled

- Supabase CLI 401 → logged verbatim in the migration-drift report, used the MCP equivalent,
  did not attempt to work around the auth failure (would have required credential changes,
  outside read-only scope).
- Nothing else hit a write-required wall. Both tracks completed fully within the read-only
  boundary.
