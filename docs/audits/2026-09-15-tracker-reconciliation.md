# Tracker reconciliation — 2026-09-15

Scope: every Linear issue in the Ada Coach project with status Done or In Progress, checked
against the live repo (`main`, HEAD `ab88433` as of this pass), the live Supabase migration
ledger, and the actual deployed bundle of every named Edge Function (read back from Supabase,
not inferred from the deploy call's own response). Read-only on code; writes limited to this
file and to Linear.

## Headline: DEU-139

Mo's question, answered directly: **DEU-139 is Done in the sense that matters least ambiguously
— the code merged to `main` — but the deploy story both trackers told was wrong, in different
ways.**

- `aec9687` **is** on `main`, confirmed (`git branch --contains aec9687` shows it reachable from
  `main`).
- `discovery-turn` **is not** stuck on a 2026-07-07 deploy, as DEU-139's own description claimed.
  Its live bundle was redeployed 2026-09-12T04:21:15Z (read back from Supabase directly), which
  is after the fix commit (`8dfe545`, 2026-09-11T06:38:36Z). The deployed `_shared/anthropic.ts`
  was read in full and contains `REQUEST_TIMEOUT_MS`, `MAX_ATTEMPTS`, and `isRetryableFailure` —
  the fix is live in `discovery-turn`.
- Notion's separate claim — "a discovery turn hasn't run since July" — is also wrong. Live query
  against `model_usage`: `discovery_coach` and `discovery_evaluation` calls both show a
  `last_call` of **2026-09-11 05:26:58 / 05:27:00 UTC**, matching a real `sessions` row
  (`64f1a99f…`, `stage: fresh_idea`, updated the same second) — this is the same Milestone 4 test
  run DEU-139's own body already references. Nothing has run *since* Sept 11, which is 5 days
  ago, not since July, but "since July" is factually false.

**The real, unresolved problem DEU-139 doesn't fully close:** `_shared/anthropic.ts` (the
timeout/retry wrapper) is imported by 12 Edge Functions, not just `discovery-turn`. Only
`discovery-turn` has been redeployed since the fix landed (`8dfe545`, 2026-09-11). The other 11
are still running pre-fix code, unbounded and un-retried, deployed weeks before the fix existed:

| Function | Imports `_shared/anthropic.ts` | Last deployed | Carries the fix? |
|---|---|---|---|
| discovery-turn | yes | 2026-09-12T04:21:15Z | **yes** (verified) |
| assumption-mapping | yes | 2026-07-05T00:44:24Z | no |
| blind-spots | yes | 2026-07-05T00:44:24Z | no |
| interview-guide | yes | 2026-07-05T00:44:24Z | no |
| market-grounding | yes | 2026-07-06T00:45:00Z | no |
| market-intel | yes | 2026-07-11T01:18:29Z | no |
| competitive-intel | yes | 2026-07-11T01:37:18Z | no |
| competitor-profile | yes | 2026-07-11T01:37:20Z | no |
| competitive-gap | yes | 2026-07-11T01:37:21Z | no |
| portfolio-coach | yes | 2026-07-05T20:07:56Z | no |
| portfolio-ideas | yes | 2026-07-05T20:07:52Z | no |
| portfolio-plan | yes | 2026-07-05T20:07:59Z | no |

DEU-139's own text half-flagged this ("and any other function importing the shared client") but
Linear closed the issue Done without anyone acting on that half-sentence. **Action taken:**
corrected DEU-139's description in Linear with this table (see "Linear changes" below). Status
left as Done — the code fix is real and merged, and the title's claim ("bound every Anthropic
call") is true of the code, just not yet true of production for 11 of 12 callers. Whether to
reopen it or spin up a new ticket for the redeploy sweep is Mo's call, flagged, not made
unilaterally here per the "do not close/reopen anything the repo cannot fully settle" scope for
this pass.

## Every Done/In Progress issue checked

34 issues (33 Done + 1 In Progress) were pulled and their descriptions checked for a named
commit, PR, migration, or Edge Function claim. Findings:

| Issue | Claim checked | Result |
|---|---|---|
| DEU-139 | `aec9687` on main; `discovery-turn` deploy state | **Wrong on the deploy date** — see above. Corrected. |
| DEU-90 | PR #29 merged; `admin-feedback`/`admin-feedback-reply` deployed | Confirmed in the prior session and again here — both live, bundles read back. |
| DEU-144 | PR #27 merged; `bridge-intake` needed and got a separate redeploy | Confirmed — fix commit `442362c` (2026-09-12T22:46:41Z) predates `bridge-intake`'s current deploy (2026-09-12T23:23:24Z). Deploy is strictly after the fix. |
| DEU-138 | PR #20 merged as `ddca0fe`; `bridge-intake` redeployed 2026-09-11 carrying the fix | `ddca0fe` confirmed on main. Current `bridge-intake` deploy (Sept 12) postdates it — still live. |
| DEU-129 | `send-welcome-email` merged + deployed v1 in PR #28 | Confirmed: function is at version 1, deployed 2026-09-12T23:43:29Z, matches PR #28's merge. |
| DEU-141 | PR #23 merged as `59ec3de`; `.github/workflows/ci.yml` added | Confirmed — commit exists on main, `ci.yml` present on disk. |
| DEU-140 | PR #22 merged as `a4f7fcb`, docs only | Confirmed. |
| DEU-114 | PR #14 merged as `cf2bb1a`; `bridge-intake` v1, `sessions` v7 deployed at the time | Commit confirmed. Deploy versions have since moved on (expected — this is a point-in-time claim, not stale). |
| DEU-122 | Live two-account isolation probe, no code artifact to check | N/A — a probe result, not a code claim. Left as-is. |
| DEU-117 | PR #16 merged; `docs/audits/2026-09-07-deletion-e2e.md` | Commit chain confirmed via PR #16 merge on main. |
| DEU-127, DEU-125, DEU-123 | All shipped in PR #26 | PR #26 merge (`2d5ae3d`) confirmed on main. |
| DEU-115 | PR #15 merged as `cc00f79` | Confirmed on main. |
| DEU-96 | Migration filename parity, 48/48 (now 50/50) | **Re-verified independently this pass**: local `supabase/migrations/*.sql` filenames diff byte-identical against a fresh `list_migrations` pull from the live ledger. Zero drift. |
| DEU-89 | PR #13 merge (`12d7e6c`), migration `20260907040404_account_deletion` | Both confirmed — commit on main, migration file present and in the live ledger. |
| DEU-116, DEU-25, DEU-54, DEU-24 | No single commit/PR hash to check, or already self-corrected in-issue | No action — DEU-24 already correctly sits at In Progress with an honest "still open" list; left alone. |
| DEU-6, DEU-7, DEU-9, DEU-16, DEU-18, DEU-22, DEU-37, DEU-52, DEU-53, DEU-55, DEU-56, DEU-119, DEU-120 | Older (pre-2026-08-23), narrative claims, no single verifiable hash, or already self-corrected in a later update note | No action — nothing here contradicts repo state. |

No other Done/In Progress issue's description made a factual claim the repo disproved.

## Edge functions whose deployed bundle is older than the most recent commit touching them

Beyond the 11 `_shared/anthropic.ts` callers above (the DEU-139 gap), one more real gap:

- **`admin-prompts`** — deployed 2026-05-05T07:25:04Z. A same-day fix (`d523bf5`,
  2026-05-05T07:52:24Z, "active prompt always appears first; `updated_at` remains the tiebreaker
  within each group") landed ~27 minutes after that deploy and was never pushed. Small, but real
  — the live function does not have that ordering fix.

Five other functions (`admin-conversations`, `admin-insights`, `admin-retrieval-debug`,
`admin-spend`, `assumptions`) show a "commit after deploy" gap in raw git-log terms, but in every
case the "later" commit is the file's own creation/first-commit into git — the deployed content
and the committed content are the same build, just recorded in git a few minutes to a few days
after it went live via MCP `deploy_edge_function`. Not a real drift; noted and set aside.

`chat` does not import `_shared/anthropic.ts` (it calls Anthropic via its own raw `fetch`, per
`CLAUDE.md`), so it is unaffected by the DEU-139 gap.

## Shipped in the last 14 days with no Linear issue at all

Two merges to `main` since 2026-09-02 have no corresponding Linear issue:

- **PR #24** — "Tavily + agent-architecture analysis sheet (md/docx/html) + backlog entries"
  (merged `ab88433`, 2026-09-15). Docs-only (`docs/analysis/2026-09-12-tavily-and-agent-architecture.*`,
  `docs/backlog/ada-coach-backlog-v1.md`). No issue found searching "Tavily" in the project.
- **PR #25** — "Clarify what's scrubbed in the account-deletion email" (merged `cc13cf0`,
  2026-09-12). Six-line change to `_shared/account-deletion-core.ts`. Searched "deletion email"
  and "EMAIL_FROM"/"cold start" — nothing matches this specific change; it rode in alongside
  DEU-89/DEU-13 context but has no ticket of its own.

Neither is being auto-filed here — this pass writes to `docs/` and Linear *status*, not new
Linear issues, per scope. Flagging so Mo can decide whether either is worth a real ticket or is
fine as an untracked drive-by.

## Migration ledger

Full parity confirmed independently this pass: 50 local `.sql` filenames, 50 remote
`schema_migrations` versions, byte-identical diff. No drift since DEU-96 closed.

## Linear changes made this pass

- **DEU-139** — description corrected. Removed the false "discovery-turn's last deploy is still
  2026-07-07" claim, replaced with the verified 2026-09-12T04:21:15Z redeploy date and the table
  of 11 functions still missing the fix (above). Status left at Done — the code shipped and is
  live for the function that mattered most (`discovery-turn`, the one that actually hung); the
  remaining deploy debt is now visible instead of buried in a half-sentence.

No other issue's status was changed. Nothing was closed or reopened that the repo could not
directly prove.
