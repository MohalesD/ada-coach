# Ada Coach — Security & Privacy Phase — Session Handoff

**Written:** end of this conversation (session-local "today" advanced from 2026-09-06 to
2026-08-23 mid-session; real filesystem timestamps show September). **Repo:** `MohalesD/ada-coach`,
local path `C:/Users/mohal/maven-ai-coding/ada-coach`. **This document covers only this
conversation** — the chat session that ran the account-deletion design, the PM-sync, the
read-only diagnostic, and the DEU-96 migration rename. It does not cover work done in any other
window. See §0 for why that distinction matters.

---

## 0. READ THIS FIRST — a parallel session was discovered on this branch

While preparing this handoff, `git log` on `chore/deu-96-migration-rename` showed **two commits
this conversation never made**:

```
ee6128b docs: pause state and resume notes for DEU-96 and account deletion
38b3424 WIP: DEU-96 rename + CLAUDE.md + spec amendments, paused (schema snapshot incomplete,
        supabase CLI --schema-only flag doesn't exist on installed version)
```

Both are authored `MohalesD <mohalesdeis@gmail.com>`, timestamped `2026-08-23 17:22–17:23`,
roughly a minute after this conversation paused with the same changes staged-but-uncommitted.
Investigating found a second handoff file already sitting in the target folder:
`docs/handoffs/AdaCoach_SecurityPhaseDeu96Pause_ChatHandoff_Summary_260906_MD.md`.

**What that file reveals:** a separate advisory thread (a Claude.ai chat with no direct repo
access) was coordinating **two other Claude Code terminal sessions** on this same repo, in
parallel with this conversation, on the same DEU-96/account-deletion work. That thread:

- Reached **the same DEU-96 evidence independently** (47 local / 47 remote, zero missing either
  direction, 36 timestamp-only mismatches, one ordering swap) — this is the "parallel
  diagnostic" and "cross-check complete" that Mo referenced mid-conversation here (see §4.6
  below). It was real, not a bluff.
- Committed the exact renames + CLAUDE.md + spec §6 changes this conversation had staged,
  producing `38b3424`.
- Attempted the schema baseline snapshot and hit a **real blocker this conversation didn't
  know about**: `supabase db dump --schema-only` is not a valid flag on the installed CLI
  (v2.109.1). This is a harder blocker than the 401-auth issue this conversation surfaced —
  even after Mo authenticates, the exact command suggested here won't work as typed. **Read
  `supabase db dump --help` fresh before retrying.**
- Recorded **two Spec 1 amendments that were verbally/textually agreed in that thread but were
  never actually written into the spec file** — confirmed absent by grep against the current
  `docs/superpowers/specs/2026-08-22-account-deletion-design.md` before writing this section:
  - **(b)** Storage deletion must paginate the bucket list until empty, not list-once.
  - **(c)** Since the `documents` bucket is owner-upload-only, non-owner storage deletion is
    empty-by-construction — the storage-deletion verification criterion should move from the
    Playwright E2E to a unit/integration test with a service-role-seeded object, and the E2E
    must not assert storage deletion it structurally cannot exercise.
  **These are not yet in the spec. Someone needs to add them before Spec 1 build starts.**
- Recorded that the real cohort user **"AR Inbound" (arinbound@gmail.com) was manually deleted**
  via the Supabase Dashboard on 2026-08-23, cascade-wiping their rows with no tombstone and no
  retained transcript — done as a stopgap ahead of a 2026-09-07 instructor check-in, with Mo
  screenshotting their four feedback entries first. **This conversation was never told about
  this and did not verify it independently.**
- Recorded that DEU-91 (Privacy Policy/Terms) requirements were posted as a Linear comment on
  2026-08-23 19:18 UTC — this conversation did not do that and has not verified it exists.
- Recorded real friction from running two uncoordinated Claude Code terminals against one
  working directory (uncommitted changes "moving" between branches on checkout, executor
  reassignment mid-flight) and a resulting process rule: *"once a session is told 'go' on a
  workstream, it finishes or it fails; reassignment only happens between workstreams, never
  during."*

**What this means for the next session:** treat that other file as a second, complementary
source — do not discard it, and do not treat this document as a full replacement for it. The
two together are more complete than either alone. Where they overlap (DEU-96 evidence, the
rename mapping, the RLS audit conclusions), they agree. Where they don't overlap (the two spec
amendments, the CLI flag failure, the manual AR Inbound deletion, the DEU-91 Linear comment),
**this document did not independently verify those claims** — they come from the other thread's
own record, reported here for completeness and flagged as unverified-by-this-conversation.

---

## 1. How this session started, and toward what goal

Mo opened with:

> "Okay, it's been a while since we've been here. I'm back with some updates—specifically some
> key ones based on feedback I received two to three weeks ago that I want to start
> incorporating. First, I need to see if Supabase is still active or if it needs to be
> restarted. Please let me know where we left off and what was left on the roadmap in general.
> Once I have that, I'll go ahead and reset prioritizations for what needs to be deployed ASAP
> based on the feedback we received."

The `session-start` skill fired (per its own instructions: git status, last 5 commits, top 3
CLAUDE.md constraints, `/context` fill, then wait for Mo's answer to "what do you need to ship
this session?" before touching code). Findings at open: branch `main`, clean, last commit
`831e200` (favicon/OG metadata). Top constraints named: the B-011 migration caveat, the
RLS/auth hard-gate, and Plan First. `/context` couldn't be queried programmatically (CLI-only
command), so that step was answered honestly rather than guessed.

Mo then revealed the actual goal — not a status check, a build:

> "While I review the spec, we could go ahead and go through security items 3-10, because that
> is long overdue, as you said. Also, let's activate the skill /PM-sync to sync everything we've
> done—including the new roadmap and the new to-do list—into Linear and Notion."

But that came *after* the real opening ask, which was account deletion:

> "For now, one of the biggest complaints I receive, which is also very important for GDPR, is
> the ability to delete an account, and their data. Let's go ahead and get started discussing
> these items, and then we'll go from there."

Mo specified the retention shape up front: *"The only remaining info should be their prior user
metadata: name, email, signup date, account deletion date, and any feedback they received.
Every other point of data should be scrubbed."* And: *"Since this is a demo and a portfolio
item, I'm not strictly aiming for full GDPR compliance, but we should make sure users are
aware."*

**Why this matters for the orchestrator:** the session's real center of gravity was **Spec 1 —
account deletion**, driven by two real pieces of user feedback (quoted verbatim in the spec):
*"...ete an account. not compliant with GDPR."* and *"...ount, and sent confirmation to my
email."* Everything else this session (PM-sync, the diagnostic, DEU-96) is scaffolding that
grew out of trying to build that one feature safely.

---

## 2. Supabase status check (the literal first ask)

Confirmed via `list_projects`: `ada-coach-01` (`pdxflmydzmcsynccunhn`, us-east-2) is
**ACTIVE_HEALTHY**. No restart needed. (A second, unrelated project, "MD's Project 01," showed
`INACTIVE` — not Ada, not touched.)

---

## 3. The account-deletion design — full reasoning trail

### 3.1 The decisive discovery

Before any design work, every FK pointing at `auth.users` was queried directly via
`pg_constraint`. Result: **all 27 FKs are `ON DELETE CASCADE` with `user_id NOT NULL`** —
including `conversations`, `user_feedback`, and `user_profiles`. The obvious implementation
(`auth.admin.deleteUser()`) would destroy exactly the three things Mo said to retain.

An `advisor()` call reframed this as an asset rather than an obstacle: *"the cascade is an
asset. Detach what you retain; let the cascade scrub the rest."* This became the architecture.

### 3.2 Architecture chosen: detach-and-cascade

Three options were weighed:

- **A — Enumerate and delete.** Rejected: every future table would silently *retain* a deleted
  user's data until someone remembered to update the delete function. Inverts the safe default.
- **B — Detach and cascade (chosen).** Make the retained tables' FKs nullable + `SET NULL`,
  then delete `auth.users` and let the existing cascade scrub everything else. New tables are
  scrubbed by default; retention is the explicit, auditable exception.
- **C — Supabase `shouldSoftDelete`.** Rejected: same inverted-default problem as A, plus a
  permanently claimed email address.

### 3.3 Three clarifying questions, asked one at a time, all resolved

1. **"Feedback they received" — which table?** Mo answered "C, both" — meaning both
   `user_feedback` (submitted feedback) and `messages.feedback` (thumbs up/down, which survives
   automatically since it hangs off `conversation_id`, not `user_id`).
2. **Should retained `user_feedback` stay attributable to a name/email, or be fully
   de-identified like conversations?** Mo chose **attributable to a tombstone** — recommended,
   since he can still follow up with someone who complained.
3. **How far should conversation anonymization go — de-link only, or also run `redactPII()` on
   the content?** Mo chose **de-link only**, backed by evidence: a live query found **zero of
   207 user messages** contain a detectable email, phone number, honorific, or "my name is"
   pattern. Running `redactPII()` anyway was rejected as lossy — it would mangle legitimate
   product names into `[NAME_1]` for a corpus that has no measured PII problem today.

### 3.4 The portfolio/products contradiction, surfaced and resolved

Mo initially asked for chats to be retained (research) *and* for "product ideas" to be
completely gone if someone deletes their account. Flagged directly: *"A Discovery Sprint
transcript is 200 messages of the PM explaining their product in detail. De-linking removes
their name, not their idea... 'delete the product ideas' currently means: delete the
60-character `products.name`/`description` row, while keeping the several-thousand-word
conversation that describes the same idea."* Mo was given two coherent postures
(research-first vs. idea-safe) and picked **research-first**, explicitly: *"Research first, for
sure."*

He later refined this further, asking that `products`/`portfolio_profiles`/`portfolio_projects`
be fully destroyed (not retained de-linked) since users may see product ideas as sacred:
*"Yeah, let's go with retaining them delinked instead. Let's try that... anyone who wants to
delete their complete portfolio, that is meaningful. So when they delete the account, the
portfolio should be deleted."* This required a follow-up FK trace: `sessions.product_id` and
`assumptions.product_id` are `NOT NULL CASCADE` from `products`, so retaining sessions/
assumptions de-linked required making those two columns nullable too — this became part of
the migration scope in §6 of the spec.

### 3.5 Two mid-design feature adds, both traced to real data

- **Deletion confirmation email.** Direct feedback request: *"they explicitly said, 'Confirm
  when my account is deleted, email me.'"* No SMTP was configured (`config.toml` has it fully
  commented out) — Resend was chosen as the smallest-lift provider. Mo confirmed a sending
  domain: `enterceptmg.com` (his GoDaddy domain), and was advised to verify a **subdomain**
  (`mail.enterceptmg.com`) rather than the root, to isolate sending reputation from his primary
  business email.
- **Admin feedback reply surface.** Mo noticed the admin Feedback tab visually truncates a real
  comment from `usha_123` (2026-07-16). A direct SQL query proved the **data is intact** — the
  308-character comment ends cleanly on "All the best..!!!" — the bug is a CSS `line-clamp-3`
  inside `max-w-md` at `Admin.tsx:2178-2179`, purely cosmetic. Separately, a query showed **3 of
  5** feedback rows include a `contact_email` (60% opt-in on an optional field) — evidence Mo's
  instinct ("that means they're hoping for a response") was right and stronger than he thought.
  This became **Spec 2**, explicitly scoped to depend on Spec 1's new `_shared/email.ts`.

### 3.6 Advisor review caught two real defects before Mo ever saw the spec

After the first spec draft was written and committed (`7383861`), an unprompted `advisor()`
call found:

1. **A near-miss.** `enforce_session_transition` is a trigger that binds service-role writes.
   Its guard (`status IS DISTINCT FROM old.status`) happens to no-op against the deletion
   cascade's `SET NULL` update — but *had it raised*, the failing cascade action would have
   **aborted the parent `auth.users` DELETE**, breaking deletion for any user who'd ever
   completed a sprint. Verified by reading the actual function definition, not assumed.
2. **A real, unavoidable crash.** `Admin.tsx:2185` does `e.user_id.slice(0, 8)` as its final
   fallback for displaying a feedback row's identity. The moment any `user_feedback.user_id`
   goes `NULL` (which Spec 1 causes by design), this throws a `TypeError` and takes down the
   entire admin Feedback tab. This became **required** scope inside Spec 1 (§8a), not deferred
   to Spec 2, because "the first deletion breaks a screen you use" is not acceptable.
3. **A self-contradiction in the spec's own error-handling table** — it claimed retry-safety
   for the tombstone insert that the schema didn't actually back (no `UNIQUE` constraint on
   `original_user_id`). Fixed by adding the constraint and switching the write to an upsert.

The spec was amended and re-committed (`f74382a`) with all three fixes, each with an inline
explanation of *why*, not just *what changed*.

### 3.7 Final spec shape

`docs/superpowers/specs/2026-08-22-account-deletion-design.md` — retained: tombstone
(`deleted_users`, no FK to `auth.users`, no `authenticated`/`anon` grants), conversations,
messages, sessions, assumptions, assumption_status_history, `user_feedback` (attributable).
Destroyed by existing cascade: `user_profiles`, `products`, `portfolio_profiles`,
`portfolio_projects`, documents + storage, folders, model_usage, reports, competitors,
market_briefs, and more. `delete-account` Edge Function: owner-guarded (403), irreversible step
(`auth.admin.deleteUser`) last so failures are retry-safe, email is best-effort and never blocks
the response. TDD per Mo's global rules: a Test Author subagent writes unit + Playwright E2E
tests first, blind to implementation, before any code is written; the E2E must use a disposable
user and must never target an owner account.

**§6 (migration approach) was amended a second time later this session** — see §5 below — to
reflect the DEU-96 regime change (`db push`, not MCP `apply_migration`).

---

## 4. PM-Sync — reconciling Linear, Notion, and the repo

Triggered by Mo: *"Let's activate the skill /PM-sync to sync everything we've done—including
the new roadmap and the new to-do list—into Linear and Notion."*

### 4.1 What the pull found

Linear (team **Deus Labs**, project **Ada Coach**) had drifted badly: the project itself was
still `Backlog` despite active development since 2026-07-06. Notion's `Projects` page had no
`Status:` line for Ada Coach at all, unlike every sibling venture.

### 4.2 A real misalignment caught, not just staleness

**DEU-7 ("B-003: Rate Limiting and Usage Caps") was marked `Done` — correctly, but
misleadingly.** Its own description records that the Week 4A *credits system* shipped. That is
a usage **cap**, not rate **limiting** — a user with valid credits can still hammer `/chat` as
fast as they like. Rather than reopening DEU-7 (which would corrupt an accurate historical
record), a new issue (**DEU-92**) was filed for the real gap, with an explicit note in both the
issue and the (later corrected) security audit doc: *"Do not read DEU-7 as closing this."*

### 4.3 A self-caught error, corrected live

While updating Linear statuses, DEU-24 ("Password hardening") was marked `Done` based on the
merged `fix/password-reset-flow` branch — but DEU-24's *own description* contains a warning:
*"I marked this Done in error, then caught it... this issue's own body lists 'Still open' and
'Deferred' sub-items that are not actually finished."* The exact same mistake was repeated and
caught within the same turn, reverted to `In Progress`, and flagged plainly to Mo rather than
silently fixed: *"That's a fair ask... I made an error there and want to flag it plainly."*

### 4.4 DEU-38 vs DEU-52 — resolved as parent/child, not duplicates

Mo asked for a write-up comparing the two. Pulled both descriptions in full: DEU-52 built a
missing per-user run cap on Market Intelligence (shipped, `ca7dc76`); DEU-38 is the broader
verification task for the July 11 cohort demo, of which DEU-52 closes one part. The Linear API
confirmed DEU-52 already carries `parentId: DEU-38` — the tracker itself agreed with the read.

### 4.5 Eight new issues filed (DEU-89 through DEU-96), five statuses corrected

Full list and rationale is in the PM-sync turn of this conversation; headline items:
**DEU-89** (Spec 1, Urgent), **DEU-90** (Spec 2), **DEU-91** (Spec 3), **DEU-92** (real rate
limiting), **DEU-93** (email enumeration), **DEU-94** (`handle_new_user` swallows errors),
**DEU-95** (role-change audit trail), **DEU-96** (migration history mismatch). CLAUDE.md, the
2026-04-18 security audit doc, and the Ada Coach project memory file were all corrected to
match, with two "trap notes" written explicitly so the DEU-7/DEU-24 confusions can't recur.
13 fully-merged stale local branches were pruned; a 14th (`security-hardening`) needed `-D`
after `git branch --contains` confirmed its one commit was already in `main`.

### 4.6 Mo's "plan of record" — the four-point ruling that reshaped the next phase

> "This will remain the security and audit items session. With that said, Alignment from the
> advisory thread, this is the plan of record:
> 1. HOLD all build work on audit items 3/4/5/10. Your set includes migrations (DEU-94 trigger
> fix, DEU-95 audit table, likely DEU-92), so it inherits the DEU-96 migration-regime decision,
> same as Spec 1.
> 2. Do NOT file the five tasks/todo.md registered items as Linear issues. They stay repo-local
> deliberately until the docs-system overhaul; they graduate to issues only when they become
> active work.
> 3. DEU-93 ruling from Mo: normalize the password-reset flow to generic, same-shape, same-timing
> responses regardless of account existence; keep signup UX friendly but rate-limited (pairs with
> DEU-92); accept and document residual signup-path enumeration.
> 4. Next action in THIS session: run the read-only diagnostic /goal Mo is about to paste. It
> runs on main, writes only docs/audits/* report files, no code, no schema, no branch."

This is the first explicit reference to "the advisory thread" — now confirmed (§0) to be the
separate Claude.ai coordination chat running the two other terminals. DEU-92/94/95/89 were
marked `blockedBy: DEU-96` in Linear to make the dependency structural. DEU-93's full ruling was
written into the Linear issue verbatim.

---

## 5. The read-only diagnostic (`/goal`), and DEU-96's resolution

Mo pasted a large structured `/goal`: two tracks (RLS/auth/isolation audit; DEU-96 migration
drift), explicit scope boundary (no migrations applied, no policies changed, no code edited, no
git writes except report files), Sonnet throughout, turn cap 40, done criteria (three specific
markdown files each ending in a findings table + a "could not verify" list).

### 5.1 Track 1 highlights

- **Zero critical findings.** Every table Spec 1 touches is RLS-sound.
- **A real medium finding:** `user_profiles`/`messages` column grants for both `anon` and
  `authenticated` are far broader than the "column-level GRANT defense-in-depth" framing in the
  original audit implies — both roles hold near-full-table `INSERT`/`SELECT`/`UPDATE`/
  `REFERENCES`, including on `role`. RLS is sound and is currently the *only* thing preventing
  exploitation (no `INSERT` policy exists on `user_profiles` for either role). Flagged as a
  hardening item, not an active hole.
- **A second real medium finding:** `documents`' "owner insert" RLS policy doesn't constrain
  `user_id = auth.uid()` in its `WITH CHECK` — an owner could misattribute a document to another
  user's id.
- **DEU-38/DEU-52 conclusively resolved:** five separate, fully-independent per-function caps
  exist (chat fails open; the five intel functions fail closed) — not one shared, partially
  built mechanism.
- **A self-correction, stated plainly:** earlier in this same conversation, before the
  diagnostic ran, an "orphaned storage file" claim had been made (1 object, 0 matching
  `documents` rows). A direct join during the diagnostic proved this **wrong** — the object has
  a matching row. The error came from citing two separate observations without ever actually
  joining them, plus trusting a `list_tables` row-count estimate (`reltuples`, not `COUNT(*)`)
  that was stale for a small, rarely-`ANALYZE`d table.

### 5.2 Track 2 highlights — and a self-caught scripting bug

A first attempt at diffing local-vs-remote migration filenames used `awk -F_` to split on
underscore and reconstruct the name — which silently replaced every underscore with a space
during reconstruction, and would have produced a **false "nothing matches" result** if trusted.
Caught before drawing any conclusion from it; rewritten with `sed`-based extraction.

**The real result: 47 local files, 47 remote entries, zero missing in either direction.** All
36 mismatches are pure timestamp drift from MCP's `apply_migration` re-stamping — nothing was
ever lost. This directly answered the diagnostic's own explicit check ("a local-only migration
that never reached remote WOULD contradict the MCP-only recommendation — say so loudly if
found") — nothing was found, so no contradiction. The report's own recommendation at the time
was to **formalize MCP-only** and retire `db push`.

### 5.3 The ruling that reversed that recommendation

> "Ruling from the advisory thread, cross-check complete: the parallel diagnostic reached
> identical evidence (47/47, zero missing, timestamp-only, same ordering swap) and its MCP-only
> counter-recommendation was reviewed and overruled. Option C is confirmed, with one addition
> taken from the diagnostic:
> 1. Generate the rename script now... Present the mapping for Mo's review before executing.
> 2. Branch: chore/deu-96-migration-rename off main, as agreed.
> 3. Same branch, after renames: add the forward regime to repo CLAUDE.md — schema changes via
> supabase db push ONLY; MCP apply_migration retired for DDL; replace the B-011 caveat with
> this rule. Amend Spec 1 §6...
> 4. Add a one-time schema baseline: supabase db dump --schema-only committed to
> docs/schema-snapshots/2026-08-23-baseline.sql. This requires CLI re-auth (currently 401)...
> 5. Definition of done: renames applied, CLAUDE.md rule in, spec §6 amended, snapshot committed,
> supabase db push --dry-run reports up to date, one commit, stop for Mo's review before merge."

Per §0, this "parallel diagnostic" and its evidence were real — the other Claude Code terminal
independently reached the same 47/47 result. The reversal from MCP-only to `db push`-only
("Option C") happened in that other thread; this conversation's own diagnostic report
(`docs/audits/2026-08-23-deu96-migration-drift.md`) still states the original MCP-only
recommendation on disk and was **not** rewritten to reflect the reversal — a future reader of
that file alone would see the superseded conclusion. The current, correct rule lives in
`CLAUDE.md`.

### 5.4 Building the rename mapping, and correcting a second self-made error

Before presenting the mapping for review, one more error was caught and corrected: the earlier
migration-drift report claimed **two** migration pairs had their relative order flipped between
local and remote. Rebuilding the pairs precisely for the rename table showed only **one** pair
actually swapped (`competitive_intel_run_caps` / `user_feedback`); the other claimed pair
(`storage_session_uploads` / `model_usage_web_search`) keeps the same order on both sides. This
also reconciled the ruling's phrasing — "the two ordering-fix renames" means the two individual
file renames needed to fix the one real swap, not two separate swaps.

One risk was flagged once, per Mo's no-sycophancy standing instruction, before executing:
retiring MCP `apply_migration` removes the fallback that made the diagnostic possible at all —
if a future headless/agentic session hits a CLI auth gap with `db push` as the *only* sanctioned
path, schema work is blocked until a human re-authenticates interactively.

### 5.5 Execution

Mo approved with three clarifications (quoted verbatim in §7). Execution:

- `git status`/`git log main..HEAD` on `chore/deu-96-migration-rename` **before touching
  anything**, per the standing safety rule — found the branch already checked out, identical to
  `main`, nothing staged. Safe to proceed.
- All 36 `git mv` renames executed exactly per the approved mapping — verified via `git status`
  (`R` status, zero content diff, file count still 47).
- `CLAUDE.md`'s B-011 caveat replaced with the new regime (quoted in full in §6 below); the
  backlog line for B-011 moved to "Shipped."
- Spec 1 §6 amended: DEU-89's migration now applies via `db push`, with the local `.sql` as the
  true push source, not a parallel labeled record.
- **Paused before step 4** (schema snapshot) exactly as instructed, since it needs Mo's own
  terminal for interactive CLI login. Gave him the `supabase login` / `supabase link
  --project-ref pdxflmydzmcsynccunhn` sequence.

Per §0, the other thread's terminal picked up from a state matching this pause point, committed
it (`38b3424`), attempted the snapshot, and hit the `--schema-only` flag failure — none of which
this conversation directly witnessed or executed.

---

## 6. Exact CLAUDE.md wording now in effect (verified on disk, in the Database Schema section)

```
> **Migration workflow (resolved 2026-08-23, DEU-96):** `supabase db push` is the **only**
> sanctioned path for schema/DDL changes in this project. Write the migration as a local `.sql`
> file under `supabase/migrations/` — that file is the true push source, not a labeled record —
> and apply it with `supabase db push`. **MCP `apply_migration` is retired for DDL.** The prior
> drift (local filenames not matching remote-applied timestamps) was diagnosed 2026-08-23
> (`docs/audits/2026-08-23-deu96-migration-drift.md`) as a pure version-string mismatch — every
> migration existed on both sides, none were lost — and resolved by renaming all 36 affected
> local files to match their remote-registered versions (`chore/deu-96-migration-rename`). A
> one-time schema baseline lives at `docs/schema-snapshots/2026-08-23-baseline.sql`
> (`supabase db dump --schema-only`), independent of migration history, as an ongoing sanity
> check. Do not run `supabase migration repair` or `supabase db pull` without a planned
> cleanup — both touch shared migration history.
>
> **MCP remains fully sanctioned for read-only inspection** — `list_tables`, `list_migrations`,
> `get_advisors`, `execute_sql` catalog/data queries, and similar. Only DDL application moved to
> `db push`.
```

**Note:** this text references the schema-baseline snapshot as if it already exists at
`docs/schema-snapshots/2026-08-23-baseline.sql` — it does not yet. That file has never been
created by either thread. Whoever finishes DEU-96 needs to either produce it or soften this
wording until it does.

---

## 7. Branch, worktree, and session state — exact, verified at time of writing

**Current branch:** `chore/deu-96-migration-rename`
**Other local branches:** `main`, `feat/account-deletion` (created earlier, zero commits, no
code written on it — per §0's other-handoff file, its relationship to the chore branch was a
point of confusion in that other thread; verify with `git branch -vv` before building on it)
**No worktree** was used in this conversation — everything ran in the single checkout at
`C:/Users/mohal/maven-ai-coding/ada-coach`.

**On `chore/deu-96-migration-rename`, committed (by the other thread, per §0):**
- `ee6128b` — pause-notes appended to `tasks/todo.md`
- `38b3424` — the 36 renames + `CLAUDE.md` regime change + spec §6 amendment + this
  conversation's three `docs/audits/*.md` files

**Not yet done on this branch (confirmed by both threads):**
- The schema baseline snapshot (`docs/schema-snapshots/2026-08-23-baseline.sql`) — blocked on
  CLI auth, and per §0, also blocked on finding the *actual* correct `db dump` flag.
- `supabase db push --dry-run` verification.
- Merge to `main`. Per the other thread's recorded process rule, **merges happen from Mo's own
  terminal, not inside a Claude Code session.**

**On `main`, committed (this conversation, before the DEU-96 branch existed):**
- `7383861` — Spec 1 initial write
- `f74382a` — Spec 1 amendment (three advisor-caught fixes)
- `d083659` — CLAUDE.md + security audit doc reconciliation against Linear

**Not committed anywhere:** the two Spec 1 amendments ((b) storage pagination, (c) E2E/unit
boundary shift for storage deletion) that the other thread recorded as agreed — see §0. These
exist only in prose in the other handoff file, not in the spec document itself.

---

## 8. All documents created or modified this conversation, with location and commit status

| Document | Location | Status |
|---|---|---|
| Spec 1 (account deletion design) | `docs/superpowers/specs/2026-08-22-account-deletion-design.md` | Committed on `main` (`7383861`, `f74382a`); §6 further amended and committed on the chore branch (`38b3424`, by the other thread per §0) |
| RLS/auth/isolation audit | `docs/audits/2026-08-23-rls-audit.md` | Committed on the chore branch (`38b3424`) |
| DEU-96 migration drift diagnostic | `docs/audits/2026-08-23-deu96-migration-drift.md` | Committed on the chore branch (`38b3424`). **Contains the now-superseded MCP-only recommendation** — CLAUDE.md is the corrected source of truth |
| Diagnostic build log | `docs/audits/2026-08-23-diagnostic-buildlog.md` | Committed on the chore branch (`38b3424`) |
| `CLAUDE.md` | repo root | Modified twice this conversation (Linear reconciliation, then DEU-96 regime) — first change committed on `main` (`d083659`), second committed on the chore branch (`38b3424`) |
| `docs/security-audit-2026-04-18.md` | repo root | Modified (four real open items identified vs. eight claimed; two trap notes added), committed on `main` (`d083659`) |
| Other-thread handoff (pre-existing, not authored here) | `docs/handoffs/AdaCoach_SecurityPhaseDeu96Pause_ChatHandoff_Summary_260906_MD.md` | Pre-existing, untouched by this conversation, described in full in §0 |
| **This document** | `docs/handoffs/2026-08-23-security-privacy-phase-session-handoff.md` | **Not committed** — written but not staged/committed by this conversation; that's Mo's call |

**Linear** (not a repo file, but part of the session's record): 8 new issues (DEU-89–96), 5
status corrections, 1 self-caught revert (DEU-24), 2 relation sets, DEU-93's full ruling written
into its issue body. **Notion**: the Ada Coach `Projects` page updated with a `Status:` line
matching its siblings, re-fetched and confirmed. Neither is reflected in git.

---

## 9. Open questions and unresolved items, in priority order

1. **DEU-96 close-out**: real `db dump` flag unknown (per §0, `--schema-only` is wrong on the
   installed CLI — check `--help` fresh); `db push --dry-run` never run; merge to main never
   done; must happen from Mo's own terminal per the recorded process rule.
2. **Spec 1 needs the two amendments from §0 actually written into the document** — they exist
   only as prose in the other handoff file right now.
3. **Spec 1 build hasn't started at all.** Per Mo's global TDD rule, a Test Author subagent
   writes the unit + Playwright E2E suite first, blind to implementation, on `feat/account-
   deletion` (verify its current state — see the branch-relationship confusion noted in §7).
4. **Whether the AR Inbound manual deletion (§0) actually happened** is unverified by this
   conversation. If true, it's worth confirming no residual PII sits anywhere it shouldn't, and
   whether it changes urgency on shipping Spec 1 for real.
5. **DEU-93's implementation** (generic reset-flow responses, rate-limit-gated friendly signup
   message) — ruled on, not built. Blocked on DEU-92, which is blocked on DEU-96.
6. **The security-audit hard-gate itself** — `user_profiles` holds 19 rows including real
   external users; the full RLS/auth/isolation audit this triggers has effectively been run
   (§5.1) but was never formally closed out as satisfying that standing rule.
7. **Resend domain verification** (`mail.enterceptmg.com`) — still not done; blocks only the
   confirmation email, not deletion itself.
8. **DEU-91's Linear comment** (§0) — this conversation did not post it and hasn't verified it
   exists; if it does, DEU-91's requirements should be reconciled with Spec 3's Linear issue
   body written by this conversation.
9. **Reconcile this document with the other thread's handoff** before or during the orchestrator
   session — they were not written with knowledge of each other and may both need a human (or
   the orchestrator) to merge into one authoritative next-steps list.

---

## 10. Verbatim tail — last four prompt/response pairs, word for word

### Pair 1

**Mo's prompt:**

> This will remain the security and audit items session. With that said, Alignment from the
> advisory thread, this is the plan of record:
>
> 1. HOLD all build work on audit items 3/4/5/10. Your set includes migrations (DEU-94 trigger
> fix, DEU-95 audit table, likely DEU-92), so it inherits the DEU-96 migration-regime decision,
> same as Spec 1.
> 2. Do NOT file the five tasks/todo.md registered items as Linear issues. They stay repo-local
> deliberately until the docs-system overhaul; they graduate to issues only when they become
> active work.
> 3. DEU-93 ruling from Mo: normalize the password-reset flow to generic, same-shape, same-timing
> responses regardless of account existence; keep signup UX friendly but rate-limited (pairs with
> DEU-92); accept and document residual signup-path enumeration.
> 4. Next action in THIS session: run the read-only diagnostic /goal Mo is about to paste. It
> runs on main, writes only docs/audits/* report files, no code, no schema, no branch.

**My response (final text):**

> Aligned on all four. Recording the two decisions that would otherwise evaporate, then standing
> by.
>
> [Linear writes: DEU-93 ruling written into its issue body in full; DEU-92/94/95/89 marked
> `blockedBy: DEU-96`]
>
> Plan of record acknowledged. All four points:
>
> **1. HOLD on 3/4/5/10 — recorded.** DEU-92, DEU-94, DEU-95 are now marked `blockedBy: DEU-96`
> in Linear, and DEU-89 alongside them. That makes the dependency structural rather than
> something living only in this thread — DEU-96 is the one unblocked item, and it gates every
> branch of work that carries a migration. No build work starts on any of them.
>
> **2. tasks/todo.md items stay repo-local — confirmed, and nothing to undo.** None of the eight
> issues I filed came from `tasks/todo.md`; they came from the security audit doc, the three
> specs, and the CLAUDE.md backlog. To be straight with you: I haven't read `tasks/todo.md` this
> session, so I can't name the five you mean — I'm taking the constraint as given and will not
> promote anything from that file without you saying it's become active work.
>
> **3. DEU-93 ruling — written into the issue.** Captured as three parts: normalize reset to
> same-shape/same-timing (I called out explicitly that *timing* leaks the same fact as wording,
> so both branches have to cost the same from outside); keep the friendly signup message gated
> behind DEU-92's throttle; accept and document the residual signup-path enumeration as a
> knowing trade-off. I marked it blocked on DEU-92, since the friendly message is only
> defensible once the throttle exists. It also needs an accepted-risk entry in the audit doc
> when it ships.
>
> **4. Standing by for the diagnostic `/goal`.** My read of its constraints: runs on `main`,
> read-only, writes only `docs/audits/*`, no code, no schema, no migration, no branch. I'll hold
> to that envelope — if the goal text implies anything outside it, I'll flag before acting
> rather than widen scope quietly.
>
> Current state: `main`, clean, three commits ahead of origin (`7383861`, `f74382a`, `d083659` —
> spec, spec amendment, docs reconciliation). Nothing staged, nothing in flight.
>
> Paste the `/goal` when ready.

### Pair 2

**Mo's prompt:** (the large structured `/goal`, following two local-command notices setting
model to Sonnet 5 and effort to high)

> /goal Read-only diagnostic run, two tracks, zero writes to code, schema, or remote.
>
> READ FIRST: CLAUDE.md, docs/superpowers/specs/2026-08-22-account-deletion-design.md,
> supabase/migrations/ (directory listing and file headers), tasks/todo.md.
>
> TRACK 1 — RLS/auth/isolation audit (overdue per CLAUDE.md; user_profiles holds 19 rows
> including real external cohort users):
> 1. Via the Supabase MCP, run get_advisors (security lints) and list_tables for every schema
> in use.
> 2. Query pg_policies: for every table, list each policy's command type, role, USING clause,
> and WITH CHECK clause. Flag any table with RLS disabled, any policy granting anon access, any
> USING clause not scoped to auth.uid(), and any SECURITY DEFINER function reachable by
> non-admin roles.
> 3. Map the result against the detach-and-cascade path in the DEU-89 spec: every table that
> deletion touches gets an explicit RLS verdict (sound / gap / needs human review).
> 4. Check the credit/usage-cap code path: does the DEU-52 Market Intelligence per-user run cap
> share enforcement with, or operate independently of, the coaching-chat credit system?
> One-paragraph answer with file/line references. (This resolves whether DEU-38's recurring demo
> cap is partially built.)
> 5. Storage: list all objects in the documents bucket with their path prefixes; confirm the
> owner-only upload policy; identify orphans (objects with no matching documents row). Report
> count and paths only, delete nothing.
>
> TRACK 2 — DEU-96 migration drift diagnostic:
> 1. Run supabase migration list against the linked project (pdxflmydzmcsynccunhn). Capture the
> full local-vs-remote table verbatim.
> 2. Classify every divergent entry: remote-only (MCP-applied, no local file), local-only (never
> reached remote), or hash/order mismatch.
> 3. Evaluate against the standing advisory recommendation: adopt MCP-only migrations for this
> repo and drop db push, with periodic supabase db dump snapshots as the schema record. State
> explicitly whether anything in the actual drift contradicts that recommendation. A local-only
> migration that never reached remote WOULD contradict it; say so loudly if found.
> 4. Recommend: reconcile vs. formalize MCP-only, with concrete steps for whichever you
> recommend. Also state how the pending DEU-89 migration (spec §6) and the DEU-94/DEU-95
> migrations should be applied under your recommended regime, including what "committed .sql
> file" means under it (push source vs. labeled record). Do not execute anything.
>
> SCOPE BOUNDARY: no migrations applied, no policies changed, no code edited, no git writes
> except the report files below. If any step would require a write to proceed, log it as blocked
> and continue.
> MODEL ROUTING: Sonnet throughout; this is mechanical inspection, no architecture judgment.
> Escalate nothing.
> DONE MEANS: two markdown reports exist, docs/audits/2026-08-23-rls-audit.md and
> docs/audits/2026-08-23-deu96-migration-drift.md, each ending with a findings table (severity,
> item, evidence, recommended action) and an explicit list of anything you could not verify.
> Maintain a running build log in docs/audits/2026-08-23-diagnostic-buildlog.md.
> AUTONOMY: full, within the read-only boundary. Turn cap: 40. Stop and report if the Supabase
> MCP is unreachable rather than working around it.

**My response (final text, after executing both tracks in full):**

> Diagnostic complete. Let me get a review pass on it before handing it to you.
>
> [advisor() call run]
>
> ## Diagnostic complete
>
> **Track 1 — `docs/audits/2026-08-23-rls-audit.md`**
>
> Headline: every table DEU-89 touches is RLS-sound — proceed with Spec 1 as designed. Two real
> findings, both medium severity, neither blocking:
> - **`user_profiles`/`messages` column grants are much broader than documented.** `anon` and
> `authenticated` both hold near-full-table INSERT/SELECT/UPDATE grants, including on `role`.
> RLS is currently carrying 100% of the actual protection — sound today, but thinner
> defense-in-depth than the original audit's language implies. Worth a hardening pass.
> - **`documents`' "owner insert" policy doesn't scope `user_id = auth.uid()`** in its WITH
> CHECK — an owner could theoretically misattribute a document to another user's id.
>
> Plus: DEU-38/DEU-52 resolved definitively — five separate, fully-built, independently-postured
> caps (chat fails open, the five intel functions fail closed), not one partial mechanism. And a
> correction: my "orphaned storage file" claim from earlier this session was wrong — it does
> have a matching `documents` row; I'd never actually joined the two tables.
>
> **Track 2 — `docs/audits/2026-08-23-deu96-migration-drift.md`**
>
> Best-case outcome: 47 local files, 47 remote entries, **zero** missing in either direction.
> All drift is pure version-string mismatch from MCP's timestamp remapping — nothing was ever
> lost. This does **not** contradict the MCP-only recommendation. I recommend formalizing it
> (retire `db push` entirely, add periodic `db dump` snapshots) rather than reconciling
> filenames, with concrete steps for how DEU-89/94/95 should apply under that regime.
>
> **One correction worth flagging on myself:** my first migration-diff script had a real bug —
> `awk -F_` silently converted every underscore to a space during field reconstruction, which
> would have produced a false "nothing matches" result. Caught it before drawing any conclusion
> from it and rewrote with `sed`.
>
> **Couldn't verify:** the Supabase CLI is unauthenticated in this environment (401), so I used
> the MCP `list_migrations` tool as the documented equivalent rather than the literal CLI
> command. Migration file *content* hashes weren't compared — only names and registration.
>
> Both reports end with findings tables and explicit "could not verify" lists, per the done
> criteria. Ready for whatever's next — review the reports, or move to DEU-96 as the human
> decision it's flagged as.

### Pair 3

**Mo's prompt:**

> Ruling from the advisory thread, cross-check complete: the parallel diagnostic reached
> identical evidence (47/47, zero missing, timestamp-only, same ordering swap) and its MCP-only
> counter-recommendation was reviewed and overruled. Option C is confirmed, with one addition
> taken from the diagnostic:
>
> 1. Generate the rename script now: full old → new mapping table from the diagnostic report
> (docs/audits/2026-08-23-deu96-migration-drift.md has the verbatim 36-pair table), git mv only,
> including the two ordering-fix renames. Present the mapping for Mo's review before executing.
> 2. Branch: chore/deu-96-migration-rename off main, as agreed.
> 3. Same branch, after renames: add the forward regime to repo CLAUDE.md — schema changes via
> supabase db push ONLY; MCP apply_migration retired for DDL; replace the B-011 caveat with this
> rule. Amend Spec 1 §6: DEU-89's migration applies via db push, committed .sql is the true push
> source.
> 4. Add a one-time schema baseline: supabase db dump --schema-only committed to
> docs/schema-snapshots/2026-08-23-baseline.sql. This requires CLI re-auth (currently 401) —
> tell Mo the exact supabase login / link commands to run in his own terminal when you hit it,
> then continue after he confirms.
> 5. Definition of done: renames applied, CLAUDE.md rule in, spec §6 amended, snapshot committed,
> supabase db push --dry-run reports up to date, one commit, stop for Mo's review before merge.
> Model: Sonnet, low effort. This is execution of a decided plan.

**My response (final text, after building and verifying the mapping):**

> Confirming the cross-check lines up with what I found, and building the rename mapping. One
> correction to make first: re-deriving the pairs precisely surfaced an error in my own drift
> report — I claimed **two** order-swapped pairs, but only one is real.
> `storage_session_uploads`/`model_usage_web_search` keeps the same relative order on both sides
> (100000<100100 locally, 003548<003556 remotely — not swapped). The actual swap is
> `competitive_intel_run_caps`/`user_feedback`, which is exactly what "two ordering-fix renames"
> in your ruling means — the two individual file renames needed to fix that one swap, not two
> separate swaps. Fixing that claim now.
>
> ## Rename mapping — 36 pairs, `git mv` only
>
> [36-row table, old filename → new filename, presented in full]
>
> Checked for collisions: all 36 target names are unique and don't clash with each other, with
> the 11 files that keep their names, or across execution order — `git mv` can run in any
> sequence safely.
>
> ## One risk, noted once
>
> Retiring MCP `apply_migration` as a DDL path removes the fallback that made today's diagnostic
> possible at all — the CLI is sitting at a 401 in this environment right now, and MCP was the
> only reason schema state was inspectable this session. If a future headless/agentic session
> hits the same auth gap with `db push` as the *only* sanctioned path, it's blocked on schema
> work until a human re-authenticates interactively. That's a real tradeoff against the cleaner
> single-source-of-truth story Option C buys. Flagged once — proceeding on your call.
>
> ## CLI re-auth, so you can run it whenever
>
> Independent of the rename approval, when you're ready for step 4:
> ```
> supabase login
> supabase link --project-ref pdxflmydzmcsynccunhn
> ```
> `login` opens a browser for interactive auth; `link` may also prompt for the database password
> (Project Settings → Database in the Supabase dashboard) since `db dump`/`db push` connect
> directly to Postgres, not just the management API. Run these in your own terminal — I'll pick
> up from there once you confirm.
>
> **Waiting on your go-ahead to execute the renames** (per your own instruction to present
> before executing). Once confirmed I'll create `chore/deu-96-migration-rename` off main and run
> all 36 through steps 2–5, stopping before merge as specified.

### Pair 4 (most recent before this handoff request)

**Mo's prompt:**

> Go. Execute, with three clarifications:
>
> 1. You are the sole DEU-96 executor. The other session has been stood down from all rename
> work; ignore any rename artifacts it may have staged.
> 2. Mapping approved as presented, all 36 pairs. Proceed: chore/deu-96-migration-rename off
> main, git mv per the table, then CLAUDE.md regime rule, then Spec 1 §6 amendment.
> 3. CLAUDE.md wording must scope the rule precisely: supabase db push is the ONLY sanctioned
> path for DDL/schema changes; MCP apply_migration is retired for DDL; MCP remains fully
> sanctioned for read-only inspection (list_tables, list_migrations, advisors, catalog queries).
> Replace the B-011 caveat with this rule.
>
> On step 4 (schema baseline snapshot): pause when you reach it and tell me, I'll run supabase
> login and supabase link --project-ref pdxflmydzmcsynccunhn in my own terminal, then you
> continue with db dump --schema-only to docs/schema-snapshots/2026-08-23-baseline.sql.
> Definition of done unchanged: renames + CLAUDE.md + §6 + snapshot, db push --dry-run reports
> up to date, one commit, stop before merge.

**My response (final text, after verifying branch state, executing all 36 renames, and both
document amendments):**

> Everything's clean and staged correctly. Pausing here as instructed.
>
> ## Steps 1–3 complete, on `chore/deu-96-migration-rename`
>
> - **36 renames staged** via `git mv` (no content changes, pure `R` status).
> - **`CLAUDE.md`** amended: the B-011 caveat is replaced with the new regime — `db push` is the
> only sanctioned path for DDL, MCP `apply_migration` retired for that purpose, MCP explicitly
> stays sanctioned for read-only inspection. B-011 moved to the "Shipped" list.
> - **Spec 1 §6** amended: DEU-89's migration will apply via `db push`; the local `.sql` is the
> true push source, not a parallel record.
>
> Nothing is committed yet — waiting for the single commit at the end, per your definition of
> done.
>
> ## Pausing for step 4
>
> Run in your own terminal:
> ```
> supabase login
> supabase link --project-ref pdxflmydzmcsynccunhn
> ```
> You may also be prompted for the database password (Project Settings → Database in the
> Supabase dashboard) — `db dump`/`db push` connect directly to Postgres, not just the
> management API.
>
> Once that succeeds, tell me and I'll run `supabase db dump --schema-only` to
> `docs/schema-snapshots/2026-08-23-baseline.sql`, then `supabase db push --dry-run` to confirm
> "up to date," then the single commit — and stop there for your review before merge.

*(Per §0, that pause point is where the other thread's terminal picked up, committed the staged
state, and hit the `--schema-only` flag failure — none of which happened inside this
conversation.)*
