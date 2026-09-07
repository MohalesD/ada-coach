# Ada Coach — Security Phase / DEU-96 Pause — Handoff to Claude Code

Project: Ada Coach · Repo: MohalesD/ada-coach (local: `~/maven-ai-coding/ada-coach`) · Written: 2026-09-06 · Covers: advisory thread of 2026-08-23 (paused that night), resuming 2026-09-06 · Role: Mo, sole builder and owner, aspiring AI PM (not a current PM), non-technical vibe coder using Claude Code · Handoff target: **Claude Code as advisor + executor**, replacing the Claude.ai advisory chat for this phase.

**Why this handoff exists:** the 2026-08-23 session tried to run two Claude Code terminals from a Claude.ai chat that had no visibility into the repo. It produced correct diagnostics and one good decision, then collapsed into executor reassignments and a failed CLI flag. Mo's verdict, verbatim: *"The things you're saying are without visibility into the code, and the conflict is tiring and annoying... the gap was just far too large to cross."* This document moves the advisory role into Claude Code so the advisor and the executor share one view of the tree.

---

## 0. Hard deadlines (read first)

- **2026-09-07 (tomorrow):** cohort instructor (Rajesh) check-in on where the app sits. Mo, verbatim: *"The only issue standing between a successful check-in is the ability for a user to delete their account while still retaining the information mapped the way I want it retained and mapped."*
- **~2026-09-20:** Ada Coach is Mo's capstone; must be staged and presentable.
- Mo's priority statement, verbatim: *"The golden path was to create the ability for users to delete their accounts... everything else is bullshit."* The self-serve deletion feature per Spec 1 is the single deliverable that unblocks everything.

---

## 1. Where things stand (last known state, 2026-08-23 ~17:30 local; VERIFY before trusting)

**Branch `chore/deu-96-migration-rename` (off main) had the following STAGED via `git add -A`:**
- `M CLAUDE.md` — B-011 caveat replaced with new migration regime (see §3)
- `M docs/superpowers/specs/2026-08-22-account-deletion-design.md` — §6 amended: DEU-89 migration applies via `db push`, committed `.sql` is the true push source
- `A docs/audits/2026-08-23-rls-audit.md`, `A docs/audits/2026-08-23-deu96-migration-drift.md`, `A docs/audits/2026-08-23-diagnostic-buildlog.md`
- `R` × 36: every migration from `enable_pgvector` onward renamed so the local filename timestamp matches the remote `schema_migrations.version`. Pure renames, zero content change. Includes the ordering fix (`user_feedback` → `20260711013606`, `competitive_intel_run_caps` → `20260711013707`).

**UNKNOWN: whether Mo ran the WIP commit and the `tasks/todo.md` pause-notes append.** He was given both commands (see §7) but pivoted to the manual deletion and email before confirming. Claude Code must run `git status` and `git log` first and treat "staged but uncommitted" as the likely state.

**Never done:** the schema baseline snapshot. `supabase db dump --schema-only` failed: **that flag does not exist on installed CLI v2.109.1**. Read `supabase db dump --help` fresh before retrying; do not trust prior advice on this flag. Also never done: `supabase db push --dry-run` verification, and the merge to main.

**Supabase CLI auth:** was broken all day by a stale `SUPABASE_ACCESS_TOKEN` env var that made `supabase login` "succeed" instantly without a browser. Fixed with `unset SUPABASE_ACCESS_TOKEN` then real OAuth login with verification code. `supabase link --project-ref pdxflmydzmcsynccunhn` then succeeded ("Finished supabase link"). **Check whether that env var is set again in a new shell; if it is, unset it before any CLI call.**

**Other branches:** `feat/account-deletion` exists (created by the deletion session before it switched to main and created the chore branch). Mo believed it had been "turned into" the chore branch; the likelier truth is both exist side by side. Verify with `git branch -vv`. No code was ever written on it.

**main:** was 4 commits ahead of origin at one point (docs/task files); Mo was told to `git push origin main`. Whether he did is unverified.

**The user "AR Inbound" (arinbound@gmail.com) was manually deleted** via Supabase Dashboard → Authentication → Users → Delete user on 2026-08-23. The existing `ON DELETE CASCADE` FKs wiped all their rows (profile, conversations, feedback). No tombstone, no retained transcripts; Mo screenshotted their four feedback entries first (account deletion ×2, dark-mode popup unreadable, feedback button placement). A personal confirmation email was drafted (and presumably sent) from Mo's personal address. **DEU-89's motivating request is therefore already honored manually; the feature still needs to exist for the check-in.**

---

## 2. Summary of the 2026-08-23 thread

**Goals at open:** (1) reconcile portfolio.md via Forge `/sync` (done, `forge.skill` uploaded); (2) decide DEU-96 migration-drift strategy; (3) run the overdue CLAUDE.md-mandated RLS/auth/isolation audit; (4) build DEU-89 account deletion; (5) queue DEU-90/91 and security set DEU-92 to 95.

**What worked:** Forge sync shipped. The read-only diagnostic `/goal` (Sonnet, medium) ran clean in ~20 turns and produced three audit reports. Two independent sessions reached identical evidence on DEU-96. A real decision was made (§3). The RLS audit cleared every DEU-89-touched table.

**Where it broke apart:** the advisory chat assigned DEU-96 execution to one Claude Code session, then flipped the assignment to the other while the first was already mid-execution, then flipped back. Both sessions share ONE working directory, so uncommitted renames "moved" between branches on checkout, which looked like a branch morphing. Mo, verbatim: *"If you give me a command for one session, don't turn around and say, 'Oh, stop it,' when it's already running."* And: *"You just gave me some commands to run and said, 'Run this from where you're standing.' How do you know where I'm standing?"* The advisor's standing rule adopted after this, verbatim: *"once a session is told 'go' on a workstream, it finishes or it fails; reassignment only happens between workstreams, never during."* Then the `--schema-only` flag failure ended the night.

**Mo's process demands, verbatim, for whoever advises next:** *"Use steps again. I want 1, 2, 3, 4, 5... Be very precise. No narratives."* And: *"Always break down complex terminology... Explain key coding and PM topics at an 8th-grade reading level."* And on placeholders: *"NEVER PROVIDE THEM WITH PLACEHOLDER OR UNFILLED VARIABLES."*

---

## 3. Decisions locked (do not re-litigate)

1. **DEU-96 ruling: "Option C + snapshot + db push forward."** Rename the 36 local migration files to match remote versions (done, staged). One-time schema baseline snapshot committed to `docs/schema-snapshots/2026-08-23-baseline.sql` (NOT done). Forward regime, verbatim as required for CLAUDE.md: *"supabase db push is the ONLY sanctioned path for DDL/schema changes; MCP apply_migration is retired for DDL; MCP remains fully sanctioned for read-only inspection (list_tables, list_migrations, advisors, catalog queries)."* Evidence: 47 local / 47 remote, zero missing either direction, 36 timestamp-only mismatches, one ordering swap. The counter-recommendation (MCP-only, retire db push) was reviewed and overruled because Option C has a mechanical proof of success (`db push --dry-run` up to date) and restores fresh-database replay; MCP-only has neither.
2. **Spec 1 (account deletion design, `docs/superpowers/specs/2026-08-22-account-deletion-design.md`) is APPROVED with amendments**, verbatim: *"(a) §6 wording amended after the DEU-96 ruling; the committed .sql is the true push source. (b) Storage deletion must paginate the bucket list until empty, not list-once. (c) The documents bucket is owner-upload-only, so non-owner storage deletion is empty-by-construction: the storage-deletion criterion moves from the Playwright E2E to a unit/integration test with a service-role-seeded object. The E2E must NOT assert storage deletion it cannot exercise. (d) DEU-91 inherits mandatory disclosures."*
3. **RLS audit result:** every table DEU-89 touches is RLS-sound. Spec 1 is cleared on isolation. Two medium findings for the security set: `user_profiles`/`messages` column grants far broader than documented (anon + authenticated hold near-full INSERT/SELECT/UPDATE incl. `role`; RLS is the only wall); `documents` owner-insert policy lacks `user_id = auth.uid()` in WITH CHECK.
4. **DEU-38/DEU-52 resolved:** five separate, fully built, independent caps exist. Chat fails open; the five intel functions fail closed. Remaining: fresh-signup verification + an explicit fail-open/fail-closed decision for chat.
5. **DEU-93 ruling:** normalize password-reset to generic same-shape same-timing responses; keep signup UX friendly but rate-limited (pairs with DEU-92); accept and document residual signup-path enumeration.
6. **DEU-91 requirements** are recorded as a comment on DEU-91 in Linear (posted 2026-08-23 19:18 UTC): tombstone retention disclosure, de-identified transcript retention, purpose limitation, the two-message post-deletion contract (confirmation + at most one feedback-response note, nothing else ever), US-intent statement. Mo's posture, verbatim: *"I am not going to treat my demo, prototype, and portfolio item like it is some product from Meta."*
7. **Single-writer rule for Linear:** decisions/requirements are written by the advisor; build state by Claude Code via pm-sync; **no new issues filed without Mo's explicit go.** Five repo-local todo items (instrumentation, docs page, Judge's Mode, docs overhaul, stale-backlog note) deliberately NOT filed in Linear.
8. **Master PRD name:** `docs/prds/ada-coach-master-prd.md` (must contain "prd" for searchability). Built after the DEU-17 decision, via `/feature-breakdown` with the framing pinned to "the feature is the whole product."
9. **Docs-system fix:** `backlog.md`/`todo.md` become generated views of Linear via a script (`scripts/sync-linear-docs.sh`), run manually twice, then wired as a Stop hook. Not a cron. Post-security work.
10. **Sole-builder voice:** all portfolio/spec prose is first person "I"; "we" only when narrating advisor conversations.

---

## 4. Open decisions and pending

- **Was the WIP commit made?** Verify first (see §7 for what was supposed to run).
- **Schema baseline snapshot:** real command unknown; discover from `supabase db dump --help`. Could also be deliberately skipped for the check-in deadline and left as a todo; that's a Mo call.
- **DEU-96 close:** `supabase db push --dry-run` must report up to date, then merge chore branch to main **from Mo's own terminal** (merges never happen inside Claude Code; commits inside Claude Code are fine).
- **DEU-89 build:** not started. Test Author subagent goes first (unit + integration + Playwright E2E per Spec 1 §10, disposable test user, never an owner account). Then the build on `feat/account-deletion` (verify branch state; recreating fresh off post-merge main is acceptable and cleaner).
- **Resend sending domain** (`mail.enterceptmg.com`): still unverified; blocks only the confirmation email, not deletion. Mo said he'll email manually for now. Non-blocking for the check-in.
- **DEU-17** (single coach vs. multi-agent): still undecided. Explicit build/icebox/kill call owed.
- **Security set** `fix/security-set-deu-92-95` plus the two audit findings plus the chat fail-open decision: not started, untouched.
- **Two Linear comments never posted** (advisor was waiting on Mo's go): DEU-96 decision record; DEU-38 caps-confirmed note. Also unanswered: new issue vs. fold-in for the two audit findings.
- **Pending since prior sessions:** connect Linear and Notion as MCP servers inside Claude Code (`claude mcp add-json ... --scope user`), still not done, still not blocking.

---

## 5. Next steps, in order (for the 2026-09-07 check-in)

1. Verify tree/branch/commit state (commands in starter prompt). Resolve any staged-but-uncommitted work with the intended WIP commit.
2. Close DEU-96: snapshot (or explicitly skip with a todo), `db push --dry-run` clean, Mo merges from his terminal.
3. Test Author writes the Spec 1 test suite with amendments (b) and (c) applied.
4. Build DEU-89 on `feat/account-deletion`: migration via `db push`, Edge Function per Spec 1 §7 ordering, Settings UI, `Admin.tsx:2185` companion fix, deletion confirmation email best-effort.
5. Verify live with a disposable user. That is the check-in demo.
6. Everything else (DEU-90/91, security set, DEU-17, PRD, sync script, portfolio pipeline) waits behind it.

---

## 6. Process rules the advisor learned, carry forward

- One executing session per workstream, named explicitly ("Window A/B/C"), never reassigned mid-flight.
- Both Claude Code terminals share one working directory unless `--worktree` was actually used; uncommitted changes follow branch checkouts. Commit before switching.
- State the exact window for every command. Mo, verbatim: *"Which session? ... where exactly?"*
- Model/effort must be stated with every Claude Code command. Ruling for this phase: Sonnet for mechanical execution and single-path fixes; Opus/Fable only for genuine forks. Diagnostics and renames were Sonnet medium/low.
- Verify CLI flags with `--help` before issuing them. The `--schema-only` failure cost the night.

---

## 7. Commands that were issued but not confirmed (Claude Code: check whether these already happened)

WIP commit on `chore/deu-96-migration-rename`:
`git commit -m "WIP: DEU-96 rename + CLAUDE.md + spec amendments, paused (schema snapshot incomplete, supabase CLI --schema-only flag doesn't exist on installed version)"`

Pause-notes append to `tasks/todo.md` under a heading `## PAUSED 2026-08-23, resume next session`, followed by `git commit -m "docs: pause state and resume notes for DEU-96 and account deletion"`.

If `git log` shows neither commit, the staged work is still sitting in the index (or was lost if the shell was closed without committing; the renames would then show as unstaged deletions + untracked files, recoverable with `git add -A` since content never changed).

---

## 8. Boundary and pointers

This is a continuity document only; it updates nothing in Linear, Notion, or portfolio.md. portfolio.md WAS synced on 2026-08-23 (Forge `/sync`, `forge.skill` uploaded) and reflects the security-phase state minus what happened after 19:00 UTC that day. Linear ground truth: workspace `deus-labs-ai`, team Deus Labs, project Ada Coach, prefix DEU-. Prior handoff: `AdaCoach_FableMegaSprint2Close_ChatHandoff_Summary_260823_MD.md`. Audit artifacts: `docs/audits/2026-08-23-*.md` (staged on the chore branch). Spec: `docs/superpowers/specs/2026-08-22-account-deletion-design.md`.
