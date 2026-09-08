# Account Deletion — Live End-to-End Verification (Spec 1 / DEU-89)

**Date:** 2026-09-07
**Method:** Mo drove the real deployed app in a browser; the orchestrator session
verified the database outcomes through the Supabase connection immediately after.
**Target:** `ada-coach-01` (`pdxflmydzmcsynccunhn`), production.
**Result: 11 of 11 assertions PASS.**

This supersedes the earlier DB-level rehearsal on branch
`claude/account-deletion-e2e-audit-wyelxf`, which used a synthetic identity
inserted directly into `auth.users` because that session's sandbox could not
reach the frontend. That rehearsal passed 6/6 on the schema behavior and was
honest about what it did not cover. This run covers the rest: the real Settings
UI, the deployed `delete-account` Edge Function, and the sign-in path afterward.

## The account under test

A real signup through the deployed app, not a fixture.

| | |
|---|---|
| User | `b793baee-1c5b-4ca4-a28f-86725d302253` |
| Email / name | `mdeis@poprouser.com` / "Mo Tester" |
| Role | `user` (non-owner, so the owner guard does not apply) |
| Created | 2026-09-07 |

Fixture built through the UI before deletion: 1 conversation, 6 messages, 2
assistant replies rated thumbs-up, and 4 `user_feedback` rows — one praise
(102 chars, contact `mdeis@poprouser.com`), one bug report (**4,000 chars**,
contact `mohalesdeis@gmail.com`), and two `message_rating` rows. No uploaded
files, so the storage purge ran as a no-op on a real account (see Gaps).

## Assertions

Row identifiers were captured *before* deletion, so each check targets a
specific known row rather than a count that could coincidentally match.

| # | Assertion | Result | Evidence |
|---|---|---|---|
| 1 | `auth.users` row destroyed | **PASS** | 0 rows |
| 2 | `user_profiles` row destroyed | **PASS** | 0 rows |
| 3 | Conversation retained, de-linked | **PASS** | row exists, `user_id = NULL` |
| 4 | Messages and thumbs ratings survived | **PASS** | 6 messages, 2 still `feedback='positive'` |
| 5 | All 4 feedback rows retained, de-linked | **PASS** | 4 of 4 present, 4 with `user_id = NULL` |
| 6 | Opt-in reply addresses cleared | **PASS** | 0 retained rows carry a `contact_email` |
| 7 | Feedback re-attributed to the tombstone | **PASS** | 4 of 4 point at a `deleted_users` row with `email=mdeis@poprouser.com`, `display_name='Mo Tester'`, `signed_up_at=2026-09-07` |
| 8 | Exactly one tombstone (upsert is retry-safe) | **PASS** | 1 |
| 9 | The 4,000-char comment survived intact | **PASS** | 4,000 chars |
| 10 | No storage objects under the old user prefix | **PASS** | 0 |
| 11 | Assets destroyed (products, portfolio, documents, sessions) | **PASS** | all zero |

## Behavior confirmed through the UI

- Settings danger zone rendered the retention disclosure; the typed `DELETE`
  confirmation gated the button.
- Deletion returned `POST /functions/v1/delete-account → 200` at 23:48:02 UTC.
- Redirect to `/login` carried the post-deletion thank-you notice.
- Signing in with the old credentials returned "Invalid login credentials"
  (`POST /auth/v1/token → 400` at 23:53:20 UTC).
- The admin Feedback tab rendered the retained rows without throwing — the
  `null.slice()` regression from spec §8a is confirmed fixed in production — and
  labeled them "account deleted · retained via tombstone".
- The expand/collapse fix on long comments displayed the full 4,000-character
  note, which the previous `line-clamp-3` inside `max-w-md` had cut off.

## Confirmation email

Not sent, correctly. The function logged:

```
delete-account confirmation email not sent: email_not_configured
```

`RESEND_API_KEY` and `EMAIL_FROM` were added to Supabase Edge Function secrets
*after* this run. The best-effort contract held exactly as designed: the email
was skipped, the failure was logged rather than thrown, and the request still
returned 200 with `email_sent: false`. **The send path itself remains
unexercised.** The next deletion will test it, and the same log line
distinguishes the outcomes (`email_not_configured` / `resend_401` / `resend_403`
/ silence on success).

## Gaps in this run

1. **Storage deletion was not exercised on a real account.** The test user
   uploaded no files, so `purgeUserStorage` correctly found an empty folder and
   removed nothing. The pagination loop, the multi-page case, and the
   "never touch another user's folder" guarantee are covered by
   `supabase/functions/_shared/storage-purge.test.ts` (6 unit tests), not by
   this run. To close it: upload one small file to a Discovery Sprint before
   deleting, and re-check assertion 10.
2. **The owner guard was not exercised live.** No attempt was made to delete an
   owner account, by design — the only owner account is Mo's real one. The 403
   path is covered by code inspection and by `src/lib/account.test.ts`.
3. **Retry safety was not exercised live.** Assertion 8 proves the upsert
   produced exactly one tombstone on a single run; it does not prove a second
   call is idempotent. That property comes from `UNIQUE (original_user_id)` plus
   the upsert, verified structurally rather than by a forced mid-flight failure.

## Incidental finding: the migration regime held under concurrency

A second session applied `builder_journal_bridge` to the same database on the
same day (registered `20260907091423`) and committed its local file under the
matching name. A full diff of all 49 local filenames against the live
`schema_migrations` ledger came back identical, with two independent sessions
writing migrations hours apart. The DEU-96 regime documented in `CLAUDE.md`
survived its first real concurrency test.
