# QA — Unified feedback system (Phase 1)

Date: 2026-07-10
Task slug: unified-feedback-system

## Files changed

- `supabase/migrations/20260710130000_user_feedback.sql` — new `user_feedback` table (Mo's proposed schema verbatim + a `message_rating`-requires-`rating` CHECK), own-rows RLS, service-role full access, column-level INSERT grant on exactly six columns. Applied via MCP `apply_migration`; grants/policies verified live via `execute_sql`.
- `supabase/functions/admin-feedback/index.ts` + `deno.json` — new read-only GET endpoint (admin/owner via `requireAdmin`), latest 200 feedback rows joined with submitter email/display name. Deployed.
- `src/lib/feedback-api.ts` — new; the one `user_feedback` insert helper.
- `src/hooks/use-feedback.ts` — dual-write: `messages.feedback` stays the per-message state (and Insights source); non-null ratings also log a `message_rating` event with a `surface` tag.
- `src/components/FeedbackButtons.tsx` — thumbs UI extracted verbatim from Index so chat + Sprint share one implementation.
- `src/components/FeedbackForm.tsx` — shared bug/idea/praise form (FAB dialog + Settings).
- `src/components/FeedbackFab.tsx` — floating feedback button with one-time helper tip (localStorage, lazy `useState` init).
- `src/pages/Index.tsx` — inline thumbs block removed, imports the shared component (`surface="chat"`), FAB mounted (raised).
- `src/pages/Sprint.tsx` — thumbs on assistant bubbles (`surface="discovery"`), FAB mounted (raised).
- `src/pages/Discovery.tsx` — FAB mounted.
- `src/pages/Settings.tsx` — "Send feedback" card (`surface="settings"`).
- `src/lib/discovery-api.ts` — `ThreadMessage.feedback` + select column.
- `src/lib/admin-api.ts` — `FeedbackEntry` + `getFeedbackLog()`.
- `src/pages/Admin.tsx` — new read-only Feedback tab.
- `tasks/todo.md`, `docs/logs/build-log-feedback.md` — plan + build log with the RLS batch review.

## Logic

One event log (`user_feedback`) now receives every form of user feedback — FAB and Settings submissions plus message thumb ratings — while the existing `messages.feedback` column keeps doing its old job (thumb UI state + Insights aggregation), so nothing already shipped had to change shape.

## RLS review

In `docs/logs/build-log-feedback.md` §RLS batch review: own-rows insert/select, six-column INSERT grant, no client UPDATE/DELETE, admin reads behind `requireAdmin`. Two accepted-for-v1 items flagged (no DB-side `comment` length cap; `source_surface` free text per spec).

## Verification

Type-check clean; the five new files lint clean; migration verified live. Feature flows manually click-checked by Mo (FAB + tip on all three surfaces, Sprint + chat thumbs, Settings form, admin Feedback tab) — confirmed working before this commit.

## Quiz

**Q: If a user deletes a conversation, what happens to the `user_feedback` rows whose `message_id` pointed at its messages — and why is that the right behavior for an event log?**

A: The messages cascade away with the conversation, and each affected `user_feedback.message_id` becomes NULL (`ON DELETE SET NULL`) — the event row itself survives. Right behavior twice over: the log's job is to preserve the historical signal ("someone thumbed down an answer that day") even when the target content is gone, and the FK direction means feedback rows can never block or cascade a content deletion.

Quiz result: **pass**
