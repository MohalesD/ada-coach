# Ada Coach — Claude Code Session Handoff: Privacy/Security Phase

**Written:** 2026-09-06, by this Claude Code session, for handoff to a central orchestrator
session. **Repo:** `MohalesD/ada-coach` (local: `C:/Users/mohal/maven-ai-coding/ada-coach`).
**Role of this document:** a complete, source-verified record of this session's work — every
decision, its reasoning, every file touched, exact commit/branch state, and the open threads —
so a different session can pick this up without re-deriving any of it.

**A note on sourcing.** Two kinds of fact appear below: (1) things this session directly did —
verified against actual tool output, not recalled from memory; (2) things that happened in a
*separate* advisory thread and parallel Claude Code terminal sessions between this session's
turns — reconstructed from a written handoff document those sessions left behind
(`docs/handoffs/AdaCoach_SecurityPhaseDeu96Pause_ChatHandoff_Summary_260906_MD.md`) and from
`git show` on the commits they produced. Type (2) facts are labeled **[from prior handoff]** so
their provenance stays visible.

---

## 0. Hard deadlines — read this section first

- **2026-09-07 (tomorrow, relative to this write-up):** cohort instructor (Rajesh) check-in.
  **[from prior handoff]** Mo, verbatim: *"The only issue standing between a successful check-in
  is the ability for a user to delete their account while still retaining the information mapped
  the way I want it retained and mapped."*
- **~2026-09-20:** Ada Coach is Mo's capstone project; must be staged and presentable.
- **[from prior handoff]** Mo's stated priority, verbatim: *"The golden path was to create the
  ability for users to delete their accounts... everything else is bullshit."*

**What this means for the orchestrator:** DEU-89 (account deletion) is the one deliverable that
matters most right now. Everything else in this document is either a prerequisite for it
(DEU-96), context for it (the RLS audit, the retention design), or explicitly deferred behind it.

---

## 1. How this session started, and why

Mo opened with: *"Okay, it's been a while since we've been here—specifically some key ones based
on feedback I received two to three weeks ago that I want to start incorporating. First, I need
to see if Supabase is still active or if it needs to be restarted."*

The `session-start` skill ran first (git status, last 5 commits, top CLAUDE.md constraints,
context check, then asked "what's the one thing you need to ship this session?"). Mo's answer was
the actual goal for the whole session: **build self-serve account deletion**, driven by two real
pieces of user feedback:

> *"…ete an account. not compliant with GDPR."*
> *"…ount, and sent confirmation to my email."*

Supabase was confirmed **ACTIVE_HEALTHY** (project `ada-coach-01`, ref `pdxflmydzmcsynccunhn`,
us-east-2) — no restart needed.

---

## 2. Decision log — Spec 1: Account Deletion & Data Retention

### 2.1 The finding that reshaped the whole feature

A `pg_constraint` query against every FK pointing at `auth.users` found **all 27 are
`ON DELETE CASCADE` with `user_id NOT NULL`** — including `conversations`, `user_feedback`, and
`user_profiles`. A naive `auth.admin.deleteUser()` would destroy exactly the three things Mo said
to keep: conversations, feedback, and the tombstone.

**Architecture decision (D1): detach-and-cascade, not enumerate-and-delete.** Rather than writing
per-table DELETE statements, detach the handful of retained tables (set their `user_id` nullable
+ `SET NULL`) and let the existing cascade scrub everything else. Reasoning, stated at the time:
*"Enumerate-and-delete inverts the safe default — every table you add next month silently
retains that user's data until someone remembers to update the function."* Detach-and-cascade
makes scrubbing the automatic default and retention the explicit, auditable exception.

### 2.2 Full decision table, as locked in the spec

| # | Decision | Reasoning |
|---|---|---|
| D1 | Detach-and-cascade | See above |
| D2 | `user_feedback` retained **attributable** to a tombstone, not de-identified | Mo's exact answer to the first clarifying question was **"C botg"** (both) when asked whether "feedback they received" meant `user_feedback` rows, per-message thumbs, or both. Then, when asked whether retained feedback should stay linked to a name/email or be fully anonymized, Mo picked "Attributable to tombstone" — enables follow-up (feeds Spec 2). |
| D3 | Conversations retained **de-linked only, no content redaction** | Evidence-based: a live query found **0 of 207 user messages** contain a detectable email, phone number, honorific, or "my name is" pattern. The existing `redactPII()` helper (`supabase/functions/_shared/redact.ts`) was rejected for this use — it's lossy and would mangle legitimate product names into `[NAME_1]`, degrading the exact corpus this retention exists to serve. |
| D4 | Immediate, irreversible deletion, typed `DELETE` confirmation | No scheduler, no pending state, no gap between what the UI promises and what's true. |
| D5 | **Research-first retention posture** | The hardest call. Mo's own words, when asked to choose: *"Research first, for sure."* This creates a real tension this session surfaced explicitly: *"'Delete my product ideas' and 'retain my conversations for research' are in tension: a Discovery Sprint transcript IS the product idea, at length. De-linking removes the name, not the idea."* Mo later refined this once told about the `products`/`sessions`/`assumptions` FK chain (see §2.3): **portfolio and products are destroyed; sessions/assumptions are retained de-linked** — his words: *"Yeah, let's go with retaining them delinked instead... anyone who wants to delete their complete portfolio, that is meaningful... let's say that should be deleted."* |
| D6 | Owner accounts **cannot** self-delete | Prevents nuking admin access mid-demo. |
| D7 | Confirmation email is **best-effort** | Deletion is irreversible and precedes the send; a failed send can't be retried against a deleted account. |

### 2.3 The chain-dependency finding that changed the retention scope

`sessions.product_id` and `assumptions.product_id` are `NOT NULL` + `CASCADE` from `products`.
Retaining sessions/assumptions de-linked required *also* making those two columns nullable +
`SET NULL` — otherwise deleting `products` (which Mo wanted gone) would cascade-delete the
retained sessions/assumptions with it. This became schema item 4 in §6.

### 2.4 Two things Mo asked for mid-design that became Specs 2 and 3

1. **Deletion confirmation email** — explicit feedback request, folded into Spec 1 (needs
   `_shared/email.ts` + Resend anyway).
2. **Admin feedback reply capability** — Mo's own observation: *"there should be a way to
   respond to feedback, especially if they leave their email... that's the only user who left
   an email and wanted feedback, and we currently do not have UI for that."* A query corrected
   this: **3 of 5** feedback rows left a contact email, not one — a 60% opt-in rate on an
   optional field. Spun out as **Spec 2** (admin reply surface), bundled with a real but
   unrelated bug: the admin Feedback tab CSS-truncates long comments (`Admin.tsx:2178-2179`,
   `line-clamp-3` inside `max-w-md`) — verified the underlying data is intact (usha_123's
   308-char comment ends cleanly; only the render clips it).
3. **Spec 3** — Privacy Policy & Terms of Use pages, split out because it's downstream: the
   policy has to describe what deletion *actually does*, so it needs Spec 1 to land first.

### 2.5 Domain decision

Mo asked whether his GoDaddy domain `enterceptmg.com` would work for Resend. Confirmed yes, with
a recommendation to verify the **subdomain** `mail.enterceptmg.com` rather than the root, to
isolate transactional-mail sending reputation from his primary business email.

### 2.6 Adversarial review caught three real bugs before any code was written

An `advisor()` call against the finished spec surfaced:

1. **A crash Spec 1 would have introduced.** `Admin.tsx:2185` does
   `e.user_display_name ?? e.user_email ?? e.user_id.slice(0, 8)`. Once a retained row's
   `user_id` is NULL, that's `null.slice()` — a TypeError that takes down the whole admin
   Feedback tab on the very first deletion. Added as **spec §8a**, a required fix, not
   deferrable to Spec 2.
2. **A near-miss on the session-status trigger.** `enforce_session_transition` binds
   service-role writes too. Had it raised on the cascade's `SET NULL` UPDATE, the failing
   cascade action would have **aborted the parent `auth.users` DELETE** — deletion would 500 for
   any user who'd ever completed a sprint. Read via `pg_get_functiondef`: it guards on
   `status IS DISTINCT FROM`, so it correctly no-ops. Documented so it isn't re-litigated.
3. **A contradiction in the spec's own retry-safety claim.** The error-handling table promised
   idempotent retries, but `deleted_users` had no uniqueness constraint to back that. Fixed with
   `UNIQUE (original_user_id)` + upsert.

---

## 3. PM-Sync — reconciling Linear, Notion, and repo docs

Triggered by Mo's `/pm-sync` request, alongside a request to work through security audit items
#3–#10. Followed the skill's pull → reconcile → report → confirm → write sequence.

### 3.1 What was found (drift)

- **Linear project "Ada Coach" was still `Backlog`**, untouched since 2026-07-06, despite five
  more weeks of shipped work (Runs 1–5, feedback system, favicon/OG metadata).
- **DEU-7 ("B-003: Rate Limiting and Usage Caps") was `Done` and correctly so** — but its scope
  (the credits/usage-cap system) is not the same thing as true per-request rate limiting, which
  the security audit's item #4 actually asks about. Flagged explicitly so no one reopens DEU-7
  by mistake.
- **DEU-24 ("Password hardening") — self-corrected error.** This session marked it `Done` based
  on the merged `fix/password-reset-flow` branch, then caught that DEU-24's own body already
  warns *"I marked this Done in error, then caught it"* — and had just repeated that exact
  mistake. Reverted to `In Progress` within the same turn. HaveIBeenPwned breach-checking is
  still open on it (later independently confirmed disabled by the RLS audit, §5 below).
- **Security audit doc (`docs/security-audit-2026-04-18.md`) was stale.** It claimed items #3–#10
  were "not yet acted on." In fact #8 (password reset flow) had shipped. Real remaining scope
  was four items, not eight.
- **CLAUDE.md's Backlog section** still listed B-002 and B-005 as future work; both were `Done`
  in Linear for weeks.
- **14 fully-merged local branches** were stale (`git branch --no-merged main` returned nothing —
  confirmed safe before pruning). One (`security-hardening`) needed `-D` since its own remote
  tracking ref was stale; verified via `git branch --contains` that its commit was already in
  main before force-deleting.
- **Notion's Ada Coach entry** was the only project card with no `Status:` line, and claimed
  "(Urgent priority)" without the "(In Progress)" qualifier its Linear project actually had.

### 3.2 What was fixed (with explicit user go-ahead: *"anything you believe you can do on your
own and can align and fix, go for it"*)

- Linear project → `In Progress`.
- Status corrections: DEU-56, DEU-52, DEU-16 → `Done`. DEU-24 → `In Progress` (after the
  self-caught revert above).
- **8 new Linear issues filed:** DEU-89 (Spec 1), DEU-90 (Spec 2), DEU-91 (Spec 3), DEU-92
  (Security #4), DEU-93 (Security #3), DEU-94 (Security #5), DEU-95 (Security #10), DEU-96
  (B-011 migration mismatch).
- Relations set: DEU-89 ↔ DEU-13/90/91; DEU-91 ↔ DEU-25.
- `CLAUDE.md` and `docs/security-audit-2026-04-18.md` corrected and committed (`d083659`),
  including two "trap notes" so the DEU-7/DEU-24 confusions can't recur for a future reader.
- 13 branches pruned with `-d`, 1 with `-D` (verified-safe first).
- Notion Ada Coach entry updated with a real `Status:` line, open-risk line, and blocked-on line.
  Verified by re-fetch after write.
- User-level memory (`project_ada.md`) updated to reflect the privacy track and the fact that the
  RLS hard-gate has already fired (19 `user_profiles` rows at the time, including confirmed
  external users like "usha_123" and "AR Inbound").

### 3.3 DEU-38 vs DEU-52 — the write-up Mo asked for

Mo: *"You asked me to let you know whether DEU-38 is the same as DEU-52. Well, can you give me a
write-up? What do each say?"*

**Not duplicates.** DEU-52 is a **missing-feature** issue: a July 11 diagnostic found Market
Intelligence had *zero* user-facing cost throttling at all. It shipped as commit `ca7dc76`.
DEU-38 is a **verification task**: (1) confirm the existing chat credit cap actually applies to
a brand-new signup — still open at the time — and (2) set an independent dollar ceiling on the
Anthropic account for demo week — done. Linear's own data confirmed the relationship directly:
DEU-52 carries `"parentId": "DEU-38"` — it's a sub-issue, not a duplicate.

**[from prior handoff]** This was later fully resolved by the RLS/security audit: DEU-52's caps
and the four other intel-function caps (`competitive-intel`, `competitor-profile`,
`competitive-gap`) are **five separate, fully-built, independent implementations** — not one
partial shared mechanism. `chat` fails open on error (deliberately, to avoid blocking users on a
transient DB issue); the five intel functions fail closed (deliberately, a cost-protection
reversal). `discovery-turn` and `assumption-mapping` have zero gating, matching DEU-52's own
documented scope decision. This closes DEU-38's open verification item.

### 3.4 tasks/todo.md correction

Mo's next instruction was a raw shell heredoc targeting `todo.md` at the repo root. That file
doesn't exist — the canonical file per `CLAUDE.md` is `tasks/todo.md`. Redirected there rather
than creating a second, competing todo file. While there, also corrected that file's own backlog
table, which was headed *"from CLAUDE.md — still accurate"* while four of its six rows weren't
(mirroring the exact drift pattern just fixed elsewhere). Committed as `b1305ec`.

Per Mo's explicit ruling later in the session: **[from prior handoff]** *"Do NOT file the five
tasks/todo.md registered items as Linear issues. They stay repo-local deliberately until the
docs-system overhaul; they graduate to issues only when they become active work."* Those five
items (instrumentation, protected docs page, Judge's Mode, docs-system overhaul, stale-backlog
note) remain in `tasks/todo.md` only, by design.

---

## 4. DEU-96 — the migration-history drift

### 4.1 The problem

`supabase db push` was failing with "Remote migration versions not found in local migrations
directory." `CLAUDE.md` had a standing caveat: apply new migrations via the Supabase MCP
`apply_migration` tool instead, and commit the local `.sql` alongside as a "labeled record."

### 4.2 Diagnosis (this session, then independently cross-checked by a parallel session)

A version-by-version comparison found: **47 local files, 47 remote rows, zero missing in either
direction.** The first 11 migrations (2026-04-11 → 2026-04-25) match exactly. All 36 from
`enable_pgvector` onward have a **timestamp-only mismatch** — same name, different version
string, because MCP `apply_migration` assigns its own timestamp on apply rather than honoring
the local filename. One genuine ordering inversion was found: local filename sort put
`competitive_intel_run_caps` before `user_feedback`; the remote apply order (what actually
happened in production) was the reverse.

**Cross-check.** Per Mo's ruling, a second, independent Claude Code session (referred to
throughout as "Track 2") ran the identical read-only diagnostic separately. Its report
(`docs/audits/2026-08-23-deu96-migration-drift.md`) reached the **identical factual table** —
47/47, same 36 mismatches, same ordering swap — but recommended a **different fix**: formalize
MCP-only migrations and retire `db push` entirely, plus add periodic `supabase db dump
--schema-only` snapshots as an independent, filename-agnostic source of truth.

### 4.3 The disagreement, surfaced rather than resolved unilaterally

Per explicit prior instruction (*"if it disagrees anywhere, hold and surface the disagreement"*),
this session did not pick a side. It presented both option sets side by side, including a
self-critique (*"'small risk of copy-paste error' on a scripted, reviewable git mv... reads
weaker than the 'no functional payoff' argument, which is the real one"*) and one synthesis point
neither prior framing had made explicit: the two options solve different problems (filename
correctness vs. content-fidelity correctness) and are not mutually exclusive.

### 4.4 Mo's ruling — the actual regime now in force

> *"Confirmed: option 2 is the advisory ruling verbatim. Full regime: (a) execute the 36 renames
> including the two ordering fixes... (b) one-time supabase db dump --schema-only baseline
> committed to docs/schema-snapshots/2026-08-23-baseline.sql... (c) forward regime in repo
> CLAUDE.md: schema changes via supabase db push ONLY, MCP apply_migration retired for DDL...
> (d) amend Spec 1 §6... (e) done means: renames + CLAUDE.md + §6 + snapshot committed on
> chore/deu-96-migration-rename, supabase db push --dry-run reports up to date, one commit, stop
> for my review before merge."*

A later message added the precise CLAUDE.md wording requirement, verbatim: *"supabase db push is
the ONLY sanctioned path for DDL/schema changes; MCP apply_migration is retired for DDL; MCP
remains fully sanctioned for read-only inspection (list_tables, list_migrations, advisors,
catalog queries)."*

### 4.5 Execution — and a shared-workspace discovery

A full 36-row old-version → new-version mapping table was built and a `git mv` script written to
the scratchpad **for review, not run**, per Mo's explicit requirement (*"mapping presented for my
review before running"*). Mo then approved execution: *"Go. You are the sole DEU-96 executor; the
other session is being stood down."*

On attempting to run the rename script, this session discovered **the renames, the CLAUDE.md
edit, and the Spec 1 §6 amendment already existed as uncommitted working-tree changes** —
identical to what this session's own script would have produced. **Track 2 had already executed
them**, but had not committed. Because both sessions share one working directory, those
uncommitted changes silently followed this session's branch checkouts.

This was treated as a verification problem, not a green light to blindly trust: confirmed (a) all
47 migration files present with no duplicates, (b) every migrations/ change was a pure `git mv`
with zero content diff, (c) the CLAUDE.md wording matched Mo's exact requirement including the
read-only-inspection carve-out, (d) the Spec 1 §6 amendment was complete and left no stale
"via MCP" references elsewhere in the file.

**[from prior handoff — after this session's last visible turn]** The night ended before the
schema snapshot step completed. Both the WIP rename/CLAUDE.md/spec state and a `tasks/todo.md`
pause note **were in fact committed**:

- `38b3424` — *"WIP: DEU-96 rename + CLAUDE.md + spec amendments, paused (schema snapshot
  incomplete, supabase CLI --schema-only flag doesn't exist on installed version)"* — 41 files
  changed (CLAUDE.md, the spec, 3 new audit docs, 36 renames).
- `ee6128b` — *"docs: pause state and resume notes for DEU-96 and account deletion"* — appended a
  `## PAUSED 2026-08-23, resume next session` section to `tasks/todo.md`.

`supabase db dump --schema-only` **failed**: that flag does not exist on the installed CLI
(v2.109.1). **[from prior handoff]** The CLI auth itself was separately broken most of that day
by a stale `SUPABASE_ACCESS_TOKEN` environment variable that made `supabase login` "succeed"
without a real browser OAuth flow; fixed with `unset SUPABASE_ACCESS_TOKEN` followed by a real
login. `supabase link --project-ref pdxflmydzmcsynccunhn` then succeeded.

**Current DEU-96 state: NOT closed.** The rename and CLAUDE.md/spec amendment are committed as
WIP on `chore/deu-96-migration-rename`, **not merged to main**. The schema baseline snapshot has
never been produced. `supabase db push --dry-run` has never been run to confirm clean.

---

## 5. RLS / Auth / Isolation audit — [from prior handoff]

This audit exists because of the standing CLAUDE.md rule this session flagged early on: a full
RLS/auth/isolation audit is mandatory before any real external user's data touches the app, and
`user_profiles` already held confirmed-external rows. A separate, read-only diagnostic session
ran it; report at `docs/audits/2026-08-23-rls-audit.md` (250 lines), committed in `38b3424`.

**Headline result: every table Spec 1 (DEU-89) touches is RLS-sound.** No finding blocks the
deletion design.

**Findings, by severity** (from the audit's own table):

| Severity | Item |
|---|---|
| 🔴 High | None found |
| 🟡 Medium | `user_profiles`/`messages` column grants are far broader than the "defense-in-depth" framing implies — `anon` and `authenticated` hold near-full-table INSERT/SELECT/UPDATE, with RLS carrying 100% of real protection |
| 🟡 Medium | `documents` "owner insert" RLS policy doesn't constrain `user_id = auth.uid()` in its WITH CHECK |
| 🟡 Medium | Leaked-password protection (HaveIBeenPwned) is disabled in Supabase Auth settings — independently confirms the open item on DEU-24 |
| 🟢 Low | 3 `SECURITY DEFINER` functions have unrevoked `anon`/`authenticated` EXECUTE (not exploitable today, hygiene issue) |
| 🟢 Low | 4 functions lack a pinned `search_path` |

**A genuine self-correction, worth stating plainly.** Earlier in this session's own turns
(§Spec 1 design), this session told Mo: *"the `documents` storage bucket has 1 object but the
`documents` table has 0 rows — an orphaned file."* The audit found this **was wrong**. A direct
join of `storage.objects` to `public.documents` shows the one object has a matching row — zero
orphans. The root cause: `list_tables`' row counts are Postgres planner estimates
(`reltuples`), not live counts, and are unreliable for small, rarely-`ANALYZE`d tables. The audit's
own guidance: *"Do not trust `list_tables` row counts for small tables; use `COUNT(*)` directly
when a number matters."* This correction is recorded here so it isn't silently lost.

**[from prior handoff] Spec 1 amendments approved as a result of this audit** (recorded in the
prior handoff, **not yet applied to the spec file on disk** — see §7 discrepancy note below):

> *"(a) §6 wording amended after the DEU-96 ruling; the committed .sql is the true push source.
> (b) Storage deletion must paginate the bucket list until empty, not list-once. (c) The
> documents bucket is owner-upload-only, so non-owner storage deletion is empty-by-construction:
> the storage-deletion criterion moves from the Playwright E2E to a unit/integration test with a
> service-role-seeded object. The E2E must NOT assert storage deletion it cannot exercise.
> (d) DEU-91 inherits mandatory disclosures."*

Amendment (a) **is** on disk (verified, §4.5 above). Amendments (b), (c), (d) are **decided but
not yet written into** `docs/superpowers/specs/2026-08-22-account-deletion-design.md`. The
orchestrator should treat the spec file's §7 (storage deletion) and §10 (testing) sections as
**stale relative to the actual decision** until someone applies (b) and (c) to the text.

---

## 6. Other decisions recorded — [from prior handoff]

These happened in the advisory thread between this session's visible turns. Listed for
completeness; none have been independently re-verified by this session against the codebase.

1. **DEU-93 ruling** (this session already wrote this into DEU-93's Linear description, so it
   *is* independently confirmed on the Linear side): normalize password-reset responses to
   generic, same-shape, **same-timing** regardless of account existence; keep signup UX friendly
   but rate-limited (pairs with DEU-92); accept and document residual signup-path enumeration as
   a knowing trade-off.
2. **A real user was manually deleted.** "AR Inbound" (`arinbound@gmail.com`) was deleted via the
   Supabase Dashboard directly on 2026-08-23. The existing cascade wiped their profile,
   conversations, and feedback — no tombstone, no retained transcript (this predates DEU-89
   existing as working code). **Verified independently by this session**: a live query confirms
   zero rows matching `arinbound` in `user_profiles` today (total `user_profiles` count is now
   20, reflecting both that deletion and new organic signups since). Their four feedback entries
   were screenshotted first. **This means DEU-89's motivating request has already been honored
   manually for that one user — but the self-serve feature still needs to exist for the
   check-in**, and for every future request.
3. **Multi-session coordination broke down once**, resulting in a strong process rule. Mo,
   verbatim: *"If you give me a command for one session, don't turn around and say, 'Oh, stop
   it,' when it's already running."* And: *"You just gave me some commands to run and said, 'Run
   this from where you're standing.' How do you know where I'm standing?"* Resulting rule,
   verbatim: *"once a session is told 'go' on a workstream, it finishes or it fails;
   reassignment only happens between workstreams, never during."*
4. **Mo's standing communication preferences**, verbatim, worth carrying into any future session:
   *"Use steps again. I want 1, 2, 3, 4, 5... Be very precise. No narratives."* And: *"Always
   break down complex terminology... Explain key coding and PM topics at an 8th-grade reading
   level."* And: *"NEVER PROVIDE THEM WITH PLACEHOLDER OR UNFILLED VARIABLES."*
5. **Docs-system fix, decided but not started:** `backlog.md`/`todo.md` become generated views of
   Linear via a script (`scripts/sync-linear-docs.sh`), run manually twice, then wired as a Stop
   hook — explicitly not a cron. Comes after the security/privacy work.
6. **Master PRD naming decided:** `docs/prds/ada-coach-master-prd.md` (must contain "prd" for
   searchability), to be built via `/feature-breakdown` once DEU-17 (single-coach vs.
   multi-agent architecture) is decided. DEU-17 remains undecided.
7. **Sole-builder voice rule for portfolio prose:** first person "I"; "we" only when narrating an
   advisor conversation.

---

## 7. Complete document inventory

### Created this session, committed

| File | Commit | Status |
|---|---|---|
| `docs/superpowers/specs/2026-08-22-account-deletion-design.md` | `7383861` (created), `f74382a` (amended after advisor review), `38b3424` (§6 amended for DEU-96) | Committed, but §7/§10 are stale relative to the (b)/(c) amendments in §6 above — **not yet applied to file** |

### Modified this session, committed

| File | Commit(s) |
|---|---|
| `CLAUDE.md` | `d083659` (backlog reconciliation), `38b3424` (DEU-96 migration-workflow rewrite) |
| `docs/security-audit-2026-04-18.md` | `d083659` |
| `tasks/todo.md` | `b1305ec` (registered items + backlog table fix), `ee6128b` (pause notes) |

### Created by the parallel/prior session, committed in `38b3424`

| File | Purpose |
|---|---|
| `docs/audits/2026-08-23-deu96-migration-drift.md` | Independent cross-check of the DEU-96 diagnosis (201 lines) |
| `docs/audits/2026-08-23-diagnostic-buildlog.md` | Build log for the diagnostic session (97 lines) |
| `docs/audits/2026-08-23-rls-audit.md` | Full RLS/auth/isolation audit (250 lines) — see §5 above |

### Existing, untracked (not yet committed by anyone)

| File | Note |
|---|---|
| `docs/handoffs/AdaCoach_SecurityPhaseDeu96Pause_ChatHandoff_Summary_260906_MD.md` | The advisory-thread's own handoff doc, source for every **[from prior handoff]** citation above. Untracked. |
| `docs/handoffs/AdaCoach_ClaudeCodeSession_PrivacySecurityPhase_HandoffSummary_260906_MD.md` | **This document.** Untracked as of writing — not committed per standing instruction to only commit when explicitly asked. |

### Never created

- `docs/schema-snapshots/2026-08-23-baseline.sql` — the DEU-96 schema baseline. Referenced as
  already existing in the CLAUDE.md text committed in `38b3424`, but it does **not exist on
  disk**. This is a live inaccuracy in a committed file until the snapshot is actually produced.
- `scripts/sync-linear-docs.sh` — decided, not built.
- `docs/prds/ada-coach-master-prd.md` — decided, not built (blocked on DEU-17).

---

## 8. Exact current git/branch state (verified live, not recalled)

```
Current branch: chore/deu-96-migration-rename
HEAD: ee6128b "docs: pause state and resume notes for DEU-96 and account deletion"

Branches:
  chore/deu-96-migration-rename   ee6128b   ← 2 commits ahead of main (38b3424, ee6128b), 0 behind
  feat/account-deletion            b1305ec   ← identical to main; zero code written on it
  main                              b1305ec   [origin/main] ← up to date with origin

Working tree: clean except
  ?? docs/handoffs/   (both handoff files, untracked)
```

**What "done" (per Mo's own §4.4 definition) still requires, in order:**
1. Produce the schema baseline snapshot — blocked on discovering the real `db dump` flag
   (`--schema-only` does not exist on CLI v2.109.1; run `supabase db dump --help` fresh) — or a
   deliberate, explicit decision to skip it and track as a todo instead, given the 2026-09-07
   deadline.
2. Run `supabase db push --dry-run` and confirm it reports up to date.
3. Everything above is already one commit-worth of work (`38b3424`) plus a docs-only follow-up
   (`ee6128b`) — Mo's spec said "one commit," so whether to squash these two or leave them is an
   open call, not a blocker.
4. **Merge from Mo's own terminal**, never from inside a Claude Code session, per the process
   rule recorded in §6.4.
5. Only then does `feat/account-deletion` become safe to build on (or a fresh branch off
   post-merge main — [from prior handoff] noted as "cleaner").

---

## 9. Open questions / unresolved decisions, all in one place

- **DEU-96 close-out:** snapshot method unknown; needs `--help` output read fresh. Could be
  deliberately skipped given the deadline — that's Mo's call, not a default.
- **Spec 1 amendments (b) and (c)** — storage-deletion pagination, and moving the storage-deletion
  test criterion from the Playwright E2E to a unit/integration test — are decided but not yet
  written into the spec file. Someone needs to actually edit §7 (Edge Function) and §10
  (Testing) before a Test Author subagent uses this spec as its source of truth.
- **DEU-89 build has not started at all.** No migration file for it exists yet beyond the
  `20260822HHMMSS_account_deletion.sql` placeholder name in the spec. Per Mo's standing TDD rule,
  a Test Author subagent must write failing tests first, blind to implementation.
- **DEU-17** (single coach vs. multi-agent architecture) — still undecided, blocks the master
  PRD.
- **Security set (DEU-92/93/94/95)** — on hold, per Mo's explicit ruling, pending DEU-96's
  resolution (all four ship migrations).
- **Two audit findings from §5** (broad column grants; `documents` WITH CHECK gap) — not yet
  filed as their own Linear issue or folded into an existing one. **[from prior handoff]** noted
  as genuinely unanswered.
- **Resend sending domain** (`mail.enterceptmg.com` recommended) — still unverified. Blocks only
  the confirmation email, not deletion itself. Non-blocking for the 2026-09-07 check-in.
- **`docs/handoffs/` directory** — currently untracked entirely (both files). Not committed by
  design (commits only happen when explicitly requested), but worth a deliberate decision on
  whether handoff docs should be tracked going forward.

---

## 10. Verbatim tail — the last exchanges of this session, for exact continuity

Everything below is quoted exactly as it occurred, most recent first is at the bottom.

---

**Mo (prompt):**

> Confirmed: option 2 is the advisory ruling verbatim. Full regime: (a) execute the 36 renames
> including the two ordering fixes, scripted git mv, mapping presented for my review before
> running; (b) one-time supabase db dump --schema-only baseline committed to
> docs/schema-snapshots/2026-08-23-baseline.sql (tell me the exact supabase login/link commands
> when you hit the CLI 401, I run them in my own terminal); (c) forward regime in repo CLAUDE.md:
> schema changes via supabase db push ONLY, MCP apply_migration retired for DDL, B-011 caveat
> replaced by this rule; (d) amend Spec 1 §6: DEU-89's migration applies via db push, committed
> .sql is the true push source; (e) done means: renames + CLAUDE.md + §6 + snapshot committed on
> chore/deu-96-migration-rename, supabase db push --dry-run reports up to date, one commit, stop
> for my review before merge. Sonnet, low effort.

**Claude (response, summarized to its concrete actions — full text ran longer):**

Created branch `chore/deu-96-migration-rename` off `main`. Wrote a `git mv` script to the
scratchpad (not the repo, not run) containing all 36 renames including the ordering-fix trio.
Presented the complete old-version → new-version mapping table inline, with each ordering-fix
row flagged. Closed with: *"Say go and I'll run the script, then continue through (b)–(e) exactly
as confirmed. One wording requirement for CLAUDE.md: scope the rule precisely..."* — actually,
that line was Mo's next message; Claude's actual closing line was: *"Say go and I'll run the
script, then continue through (b)–(e) exactly as confirmed."*

---

**Mo (prompt):**

> Go. You are the sole DEU-96 executor; the other session is being stood down. Run the script,
> then continue through (b)-(e) exactly as confirmed. One wording requirement for CLAUDE.md:
> scope the rule precisely — supabase db push is the ONLY sanctioned path for DDL/schema changes;
> MCP apply_migration is retired for DDL; MCP remains fully sanctioned for read-only inspection
> (list_tables, list_migrations, advisors, catalog queries). Pause and tell me when you need the
> CLI login for the db dump step.

*(A system reminder accompanying this message showed that `CLAUDE.md` and the Spec 1 file had
already changed on disk, with the diffs included.)*

**Claude (response, verbatim opening, then summarized):**

> "Before running my rename script, I need to check something important: `CLAUDE.md` and Spec 1
> §6 already show the DEU-96 resolution written on disk — including a claim that the 36-file
> rename is *already done*. But I haven't run my script yet, and 'the other session is being
> stood down' suggests Track 2 may have raced ahead. Verifying actual state before trusting any
> of it."

Ran verification: confirmed via `git status`/`git branch -vv`/`git reflog` that Track 2 had
staged the exact same 36 renames plus the CLAUDE.md and spec edits as **uncommitted** working-tree
changes, which had carried onto the newly-created branch because both sessions share one working
directory. Verified: 47 files present, zero duplicates, every migrations/ change a pure rename
with no content diff, CLAUDE.md wording matched Mo's exact requirement, spec §6 had no stale MCP
references left. Flagged that CLAUDE.md's committed text would (once committed) reference a
schema-baseline file that didn't exist yet — a forward-reference gap.

Confirmed the Supabase CLI was installed (v2.109.1) and gave the three commands for Mo to run
himself:

```bash
supabase login
supabase link --project-ref pdxflmydzmcsynccunhn
supabase db dump --schema-only -f docs/schema-snapshots/2026-08-23-baseline.sql
```

closed with: *"Tell me once step 3 finishes... One more thing worth a decision, not urgent:
`docs/audits/` is sitting untracked with three real diagnostic files from Track 2... Want it
folded into this commit, kept separate, or should I leave it alone until you say?"*

*(This is the exact point where this session's directly-witnessed turns end. The
`docs/schema-snapshots/...` path referenced above turned out to be wrong on the actual CLI — see
§4.5: `--schema-only` is not a real flag on v2.109.1. That failure, the WIP commit `38b3424`, and
the pause-notes commit `ee6128b` all happened after this point, reconstructed for §4.5 and §6
above from the prior handoff document and direct `git show` inspection, not from this session's
own visible turns.)*

---

**Mo (prompt) — this current request:**

> Give me a thorough review and executive printout of the entire conversation and development in
> this session. Include quotes, key decisions along the code, the reasoning behind every decision
> made, how the session started, towards what goal, and why. [...] Finally, I want you to save
> the complete, thorough write-up and detailed summarization in this location in the local repo:
> C:/Users/mohal/maven-ai-coding/ada-coach/docs/handoffs

**Claude (this response):** produced this document. Verified, before writing a single claim
about the intervening advisory-thread work, that the described commits (`38b3424`, `ee6128b`)
actually existed and matched their claimed content (`git show --stat`, full diffs), verified the
RLS audit's own findings table directly rather than relying on secondhand summary, and
independently confirmed the "AR Inbound" deletion claim against live `user_profiles` data before
including it as fact.

---

## 11. One instruction for whoever reads this next

Before acting on anything in §5–§7 that says **[from prior handoff]**, verify it against the
actual file or live state first — this document inherited those facts from another session's
written account, cross-checked where practical (git commits, one live SQL query), but not
exhaustively re-derived line by line. Everything *without* that tag was directly observed by
this session via tool output, not recalled.
