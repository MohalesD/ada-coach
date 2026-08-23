# DEU-96 Migration Drift Diagnostic — 2026-08-23

**Scope:** read-only. No migration was applied, no history table was touched, no `migration
repair`/`db pull` was run. This is a diagnosis, not a fix.

## 1. The verbatim table

`supabase migration list --linked` could not be run — the CLI is not authenticated in this
environment:

```
$ supabase migration list --linked
Initialising login role...
{"_tag":"Error","error":{"code":"LegacyDbConfigLoginRoleStatusError",
 "message":"unexpected login role status 401: {\"message\":\"Unauthorized\"}"}}
```

Used the Supabase MCP `list_migrations` tool as the equivalent — it reads the same
`supabase_migrations.schema_migrations` table the CLI command reads. Local file list came from
`supabase/migrations/*.sql`. Full local-vs-remote pairing (version, name), diffed with `comm`
and `join` rather than by eye:

```
local count:  47
remote count: 47

names in LOCAL but not REMOTE:  (none)
names in REMOTE but not LOCAL:  (none)

exact matches (same version string, same name): 11
version mismatches (same name, different version): 36
```

The 11 exact matches are every migration from `core_schema` through
`lockdown_user_profiles` — the run before MCP `apply_migration` timestamp remapping started
(2026-04-11 through 2026-04-25). Every migration from `enable_pgvector` onward (2026-04-30
through 2026-08-11) has a version mismatch. Full pairing:

| Name | Local version | Remote version | Match? |
|---|---|---|---|
| core_schema | 20260411154327 | 20260411154327 | ✅ |
| seed_ada_v1_prompt | 20260411154822 | 20260411154822 | ✅ |
| auth_schema | 20260415120000 | 20260415120000 | ✅ |
| grant_owner | 20260415120100 | 20260415120100 | ✅ |
| pin_conversations | 20260416100000 | 20260416100000 | ✅ |
| message_feedback | 20260418100000 | 20260418100000 | ✅ |
| message_kind | 20260418130000 | 20260418130000 | ✅ |
| message_coaching_prompt_id | 20260418140000 | 20260418140000 | ✅ |
| lockdown_user_profiles | 20260418150000 | 20260418150000 | ✅ |
| documents_table | 20260425160000 | 20260425160000 | ✅ |
| fix_documents_insert_policy | 20260425170000 | 20260425170000 | ✅ |
| enable_pgvector | 20260430000000 | 20260430042458 | ❌ |
| document_chunks | 20260430000100 | 20260430043232 | ❌ |
| match_document_chunks | 20260501000000 | 20260501232218 | ❌ |
| user_credits | 20260502000000 | 20260502050044 | ❌ |
| app_settings | 20260502000100 | 20260502050048 | ❌ |
| reset_credits_fn | 20260505000000 | 20260505073341 | ❌ |
| folders | 20260506000000 | 20260507041341 | ❌ |
| products | 20260704100000 | 20260704203335 | ❌ |
| sessions | 20260704100100 | 20260704203349 | ❌ |
| assumptions | 20260704100200 | 20260704203418 | ❌ |
| model_usage | 20260704100300 | 20260704203423 | ❌ |
| session_documents | 20260704100400 | 20260704203439 | ❌ |
| model_routing | 20260704100500 | 20260704203442 | ❌ |
| assumption_evidence | 20260704200000 | 20260704230650 | ❌ |
| blind_spots | 20260704200100 | 20260704230701 | ❌ |
| interview_guides | 20260704200200 | 20260704230712 | ❌ |
| reports | 20260704200300 | 20260704230724 | ❌ |
| model_routing_run2 | 20260704200400 | 20260704230734 | ❌ |
| storage_session_uploads | 20260705100000 | 20260705003548 | ❌ |
| model_usage_web_search | 20260705100100 | 20260705003556 | ❌ |
| portfolio_profiles | 20260705130000 | 20260705194309 | ❌ |
| portfolio_projects | 20260705130100 | 20260705194320 | ❌ |
| model_routing_run4 | 20260705130200 | 20260705194330 | ❌ |
| market_briefs | 20260705150000 | 20260706000909 | ❌ |
| market_evidence | 20260705150100 | 20260706000919 | ❌ |
| competitors | 20260705150200 | 20260706000931 | ❌ |
| competitor_evidence | 20260705150300 | 20260706000943 | ❌ |
| products_competitive_gap | 20260705150400 | 20260706000957 | ❌ |
| intel_config_run5 | 20260705150500 | 20260706001007 | ❌ |
| products_intel_status | 20260705160000 | 20260706005016 | ❌ |
| agent_loop_session_state | 20260706100000 | 20260706182233 | ❌ |
| agent_loop_model_routing | 20260706100100 | 20260706182238 | ❌ |
| market_intel_run_cap | 20260710090000 | 20260711011818 | ❌ |
| user_feedback | 20260710130000 | 20260711013606 | ❌ |
| competitive_intel_run_caps | 20260710100000 | 20260711013707 | ❌ |
| user_feedback_contact_email | 20260710140000 | 20260711020420 | ❌ |

Note `storage_session_uploads`/`model_usage_web_search` and `market_intel_run_cap`/
`competitive_intel_run_caps`/`user_feedback` even show their **relative order flipped** between
local filename and remote timestamp (e.g. locally `market_intel_run_cap` < `competitive_intel_run_caps`
< `user_feedback` by filename; remotely `market_intel_run_cap` < `user_feedback` <
`competitive_intel_run_caps` by applied timestamp). This is consistent with migrations being
authored locally in one order within a session but applied to remote via MCP in a slightly
different call order.

## 2. Classification

**Remote-only (MCP-applied, no local file): zero.**
**Local-only (local file that never reached remote): zero.**
**Hash/order mismatch: 36 of 47**, all a pure version-string mismatch (same name, same
presumed content — content hashes were not compared; see "Could not verify"), zero missing
entries in either direction.

This is the best-case version of "migration drift." `supabase db push` fails on this because it
matches migrations by version string against `supabase_migrations.schema_migrations`, and 36
of the 47 version strings don't match what's on remote — but every migration that was written
locally did, in fact, reach remote. Nothing was lost.

## 3. Evaluation against the standing advisory recommendation

The recommendation on record: **adopt MCP-only migrations for this repo, drop `db push`, use
periodic `supabase db dump` snapshots as the schema record.**

**Explicit answer to the question posed:** does anything in the actual drift contradict that
recommendation? **No.** A local-only migration that never reached remote *would* contradict
it — the comm/join diff above confirms there is no such migration. Every local `.sql` file has
a corresponding applied migration on remote (matched by name), and every remote migration has
a corresponding local `.sql` file. The drift is entirely explained by MCP's timestamp remapping
behavior, which is already correctly described in CLAUDE.md's B-011 caveat. **Nothing here was a
surprise; the diagnostic confirms the existing understanding rather than overturning it.**

## 4. Recommendation: formalize MCP-only

**Reconcile** (make local filenames match remote versions) was considered and rejected as the
primary fix: it requires renaming 36 files, and every rename is itself a small risk of a
copy-paste error on a 3600s-diff timestamp with no functional payoff — the content doesn't
change, only its label. It buys nothing that formalizing doesn't also buy, at higher risk.

**Recommended: formalize MCP-only.** Concrete steps, none executed by this diagnostic:

1. **Update CLAUDE.md's Migration workflow section** (small edit, currently already halfway
   there) to state plainly: local `.sql` files under `supabase/migrations/` are the
   **content record** — what changed and why, reviewable in git, diffable in PRs. They are
   **not** the push source. `supabase db push` is retired from this project's workflow
   entirely, not just "worked around."
2. **Stop trying to match local filenames to remote versions.** The filename's timestamp
   becomes purely chronological-authoring metadata, same role a build-log date already plays.
   Nothing downstream depends on the local timestamp matching remote.
3. **Add a periodic `supabase db dump --schema-only` snapshot** (e.g. committed alongside build
   logs, or as its own `docs/schema-snapshots/` file) as the authoritative "what does the schema
   actually look like right now" record — independent of migration history, immune to the same
   drift.
4. **`supabase migration repair` / `db pull` remain off-limits** without a planned, deliberate
   cleanup — CLAUDE.md's existing caveat is correct and should stay as-is. This diagnostic found
   no reason to run either.
5. **Re-authenticate the Supabase CLI** in this environment if `db dump` (step 3) or any other
   CLI-only capability is wanted going forward — the 401 in §1 blocks CLI use entirely right
   now, not just `db push`.

## 5. How pending migrations should be applied under this regime

**DEU-89 (Spec 1, §6 — the deletion tombstone + 6 FK constraint changes):** apply via MCP
`apply_migration` exactly as every migration since 2026-04-30 already has. Write the local
`.sql` file first as the reviewable content record, commit it alongside the spec (already the
established pattern — see the two Spec 1 commits this session), then apply via MCP. Do not
attempt to force its remote version to match the local filename timestamp; let MCP assign
whatever it assigns. This is already exactly what DEU-89's own scope section says to do
("Migration (via MCP `apply_migration`, not `db push`") — this diagnostic finds no reason to
change that plan.

**DEU-94 (`handle_new_user` error handling) and DEU-95 (role-change audit trail):** same
treatment. DEU-95 in particular is schema (`SECURITY DEFINER` trigger + new history table) and
should follow the identical local-file-then-MCP-apply sequence, mirroring the existing
`assumption_status_history` pattern precisely (per its own issue body).

**What "committed .sql file" means under this regime:** a push **source** it is not, and never
will be again for this project. It is a **labeled historical record** — proof in git of exactly
what schema change was made, when, and why, reviewable in a PR diff, without carrying any
expectation that its filename timestamp will ever match what `supabase_migrations
.schema_migrations` says on remote. That distinction should be stated explicitly in CLAUDE.md
so a future session doesn't rediscover this confusion from scratch.

---

## Findings table

| Severity | Item | Evidence | Recommended action |
|---|---|---|---|
| 🟡 Medium | `supabase` CLI unauthenticated in this environment (401 on `migration list --linked`) | §1, this session | Re-authenticate if CLI-only capabilities (e.g. `db dump`) are wanted. Not urgent — MCP fully covers current needs. |
| 🟢 Low | 36 of 47 migrations have mismatched local-vs-remote version strings | §1–§2, this session | No fix needed for the mismatch itself — formalize the regime (§4) so the mismatch stops being treated as a problem to solve |
| ✅ Confirmed | Zero local-only migrations (none missing from remote) | §1–§3, this session | Directly answers the goal's explicit check — nothing here contradicts the MCP-only recommendation |
| ✅ Confirmed | Zero remote-only migrations (none missing from local) | §1–§3, this session | Same |
| ➡️ Recommendation | Adopt MCP-only formally, retire `db push`, add periodic `db dump` snapshots | §4 | Human decision — this diagnostic recommends but does not execute |

## Could not verify

- **Migration file content hashes were not compared.** This diagnostic confirmed every
  migration *name* exists on both sides with a *some* version string on remote; it did not
  pull each migration's SQL body from `supabase_migrations.schema_migrations` (if that table
  even stores the body — it may only store version+name) to byte-for-byte confirm the applied
  SQL matches the local file. If a local `.sql` file was ever hand-edited *after* being applied
  via MCP, that drift would not show up in this diagnostic. Recommend a spot-check on 2-3
  migrations if that risk matters before Spec 1's migration lands.
- **`supabase db dump` was not run** (no CLI auth, per §1), so no live schema snapshot exists
  yet as the §4 recommendation's first concrete artifact.
- **Whether `supabase_migrations.schema_migrations` on remote has any entry with no
  corresponding name at all** (e.g. a manually-run `ALTER` outside both the CLI and MCP flow) —
  the MCP `list_migrations` tool only returns registered migrations; it would not surface an
  unregistered manual DDL change. The `pg_policies` and `pg_proc` dumps in the companion RLS
  audit are the closest thing to a check on this, and found no orphaned/unexplained objects.
