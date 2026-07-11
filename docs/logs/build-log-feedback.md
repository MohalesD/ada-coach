# Build Log — Unified Feedback System (`/goal`, 2026-07-10)

Two phases. Phase 1 functional, Phase 2 motion/design polish — Phase 2
starts only after Mo confirms Phase 1 verified by hand.

Out of scope, untouched: credits/gating, Market Intelligence, RAG
threshold/retrieval, auth, the merged kickoff starter-prompts work.

---

## Phase 1 — Functional (built, awaiting Mo's manual verification)

### Schema decision (confirmed against reality first)

The existing chat thumbs write `messages.feedback`
(`'positive'/'negative'`) directly via PostgREST under a column-level
GRANT, and `admin-insights` aggregates from that column. That did NOT
suggest a different schema shape from the one proposed — it suggested
**dual-write**: `messages.feedback` stays the per-message UI state (and
Insights keeps working untouched), while every non-null rating also
logs a `message_rating` event in the new unified `user_feedback` table.
Mo's proposed schema was applied verbatim plus one integrity CHECK:
`feedback_type <> 'message_rating' OR rating IS NOT NULL` (clients
insert directly, so the table is a trust boundary).

Migration `20260710130000_user_feedback.sql` — applied via MCP
`apply_migration` (B-011 workflow), local file committed as source of
truth.

### What was built

| Piece | File(s) |
|---|---|
| `user_feedback` table + RLS + lockdown GRANTs | `supabase/migrations/20260710130000_user_feedback.sql` |
| Insert helper (one job) | `src/lib/feedback-api.ts` |
| Dual-write thumbs hook + surface param | `src/hooks/use-feedback.ts` |
| Shared thumbs component (extracted verbatim from Index) | `src/components/FeedbackButtons.tsx` |
| Chat uses extracted component, `surface="chat"` | `src/pages/Index.tsx` |
| Sprint thumbs on assistant bubbles, `surface="discovery"` | `src/pages/Sprint.tsx`, `src/lib/discovery-api.ts` (ThreadMessage.feedback + select) |
| Shared submission form (bug / idea / praise) | `src/components/FeedbackForm.tsx` |
| FAB + one-time helper tip (localStorage, lazy-init) | `src/components/FeedbackFab.tsx` |
| FAB mounts: chat (raised), Discovery, Sprint (raised) | the three page files |
| Settings "Send feedback" card, `surface="settings"` | `src/pages/Settings.tsx` |
| Admin read-only Feedback tab | `src/pages/Admin.tsx`, `src/lib/admin-api.ts` |
| `admin-feedback` Edge Function (GET, admin/owner) | `supabase/functions/admin-feedback/` — **deployed** |

Surface convention (per spec): thumbs carry `chat`/`discovery`; FAB
submissions carry `fab`; Settings form carries `settings`. Nuance
accepted for v1: `fab` does not record which screen the FAB was on.

FAB scope: chat (`/`), Discovery (`/discovery`), Sprint (`/sprint/:id`)
— "Discovery" read as the discovery surface including live sprints. Not
on Portfolio, admin, reports, or public share pages, per the stated
assumption.

Deploy note: `admin-feedback` needed its own `deno.json` (copied from
`chat/`) — remote bundling can't resolve the bare
`@supabase/functions-js` specifier without it.

### RLS batch review (standing-rule batch audit, Mo sole user)

New write paths reviewed:

1. **Browser INSERT into `user_feedback`** (FAB, Settings, rating
   events): RLS `WITH CHECK (user_id = auth.uid())` — cannot write rows
   as another user. Column-level INSERT grant on exactly six columns —
   cannot forge `id`/`created_at`. CHECKs constrain `feedback_type` and
   `rating`; `message_rating` must carry a rating. No UPDATE/DELETE
   grant to authenticated at all; anon has nothing. `message_id` FK is
   `ON DELETE SET NULL` so deleting messages can't be blocked by (or
   cascade into) feedback rows.
2. **Browser SELECT on `user_feedback`**: own rows only
   (`user_id = auth.uid()`).
3. **`messages.feedback` UPDATE** (Sprint reuse): unchanged pre-existing
   path — assistant-only, own-conversation policy, single-column grant.
   Sprint messages live in the user's own conversations, so the policy
   covers them with no new grants.
4. **`admin-feedback` reads**: `requireAdmin()` (admin/owner), service
   client, GET only, capped at 200 rows, no caller-controlled filters.

Accepted-for-v1 (flagged, not fixed): no DB-side length cap on
`comment` (client caps at 4,000 chars; a hand-rolled request could
insert more — add a CHECK if this ever matters) and `source_surface` is
free text per the spec (display-only in admin; React escapes it).

### Verification state

- `npm run type-check` — clean.
- `npx eslint` on all five new files — zero errors. One new-code lint
  finding fixed properly (FAB tip → lazy `useState` init instead of
  setState-in-effect). The FeedbackTab in Admin.tsx intentionally
  matches the house load pattern that the `set-state-in-effect` rule
  flags on all nine sibling tabs — left consistent with the repo.
- Migration verified live (policies, grants, column-level INSERT list)
  via `execute_sql`.
- Per the goal: **no auto-verification of the feature flows.** Manual
  click-through list handed to Mo; commit + Phase 2 wait on his
  confirmation. TDD-via-subagent was not used this run — the goal
  defined its own definition-of-done and manual-verification protocol.

## Phase 2 — Motion & design polish

Not started. Gated on Mo confirming every Phase 1 item above works in
the browser.
