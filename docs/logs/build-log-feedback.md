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

## Phase 2 — Polish, guidance, and the expanded creative brief

Mo verified Phase 1 and widened the brief: be creative, close gaps he
hadn't considered, add wiring he'd find useful. Web search was used
once (feedback-widget UX best practices) — findings that shaped the
build: passive always-visible widgets far out-respond triggered
surveys; every extra required field costs submissions; giving a reason
for asking and closing the loop are what make people submit again.

### Follow-up email (opt-in, not a field tax)

`contact_email` added to `user_feedback`
(`20260710140000_user_feedback_contact_email.sql`, applied via MCP).
Users are signed in, so the account email is already known — the value
of the field is *intent*. The form shows an "I'd like a reply about
this" checkbox; ticking it reveals an email input prefilled with the
account address (editable). Unticked → NULL. Loose format validation
client-side; 320-char CHECK server-side. Same migration closes the
Phase 1 flagged gap: comment now has a DB-side 4,000-char CHECK.
Column INSERT grant extended to include `contact_email`. Admin
Feedback tab shows "↩ wants a reply: …" under the submitter when
present.

### Admin wiring

- **Users → Reset all** — `admin-users` gained `POST ?action=reset_all`
  (owner-only, same limit lookup, one bulk UPDATE, returns count);
  redeployed (v5). UI: two-step inline confirm ("Reset all" → arms to
  "Really reset all N?" for 5s → fires), then refreshes the table.
- **Spend** — Total card now shows ≈ $/day and a 30-day run rate;
  "Export CSV" downloads the window's per-day, per-call-type rows
  client-side (date, call_type, model, calls, tokens, web searches,
  cost).
- `admin-feedback` redeployed (v2) to return `contact_email`.

### Demo pill

`DemoBadge` component ("Demo" chosen over "Prototype" — shorter, sets
expectations without apologizing). Placed beside the header title on
the chat page and under the wordmark on the login page. The pill
itself carries a tooltip explaining what "demo" means and pointing at
the feedback button — the cue doubles as guidance.

### Guidance tooltips

`TooltipProvider` (250ms delay) now wraps the app. Tooltips added
where a label alone doesn't convey the destination: header
Discovery/Portfolio buttons (chat), Start Discovery Sprint and
Market & competitors (product cards), Frameworks and grounding-notes
buttons (sprint header — the notes button's native `title` was
replaced so it doesn't double-render). Copy follows the voice rules:
says what you'll find, no jargon, 1–2 sentences.

### Motion

**Remotion honestly doesn't fit here** — it composes and renders video
timelines; it does not animate live React UI. The sequenced feel the
goal described (FAB first-appearance, tooltip entrance, chips arriving)
is built with CSS keyframes + staggered delays in `src/index.css`, all
inside `@media (prefers-reduced-motion: no-preference)`:

- `ada-pop-in` — FAB springs in (overshoot curve) 350ms after mount.
- `ada-tip-in` — first-use tip leans in from the right at ~950ms, after
  the FAB has landed. The two delays make it read as one composed
  sequence: page → button → whisper.
- `ada-rise-in` — starter chips cascade upward, 80ms apart.
- `ada-thumb-pop` — selected thumb scales/tilts for a beat.
- FAB also gets hover scale-up / active scale-down press feedback
  (plain Tailwind transitions — no timeline needed).

### Verification state

Type-check clean; every new/authored file lints clean (the one error
in `Login.tsx` is a pre-existing mode-reset effect untouched by this
work). `admin-users` v5 and `admin-feedback` v2 confirmed ACTIVE via
`functions list`. Migration applied and grant verified by application.
Feature flows to be eyeballed by Mo — the polish is judged on taste.
