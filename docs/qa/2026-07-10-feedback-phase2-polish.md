# QA — Feedback Phase 2: polish, guidance, admin wiring

Date: 2026-07-10
Task slug: feedback-phase2-polish

## Files changed

- `supabase/migrations/20260710140000_user_feedback_contact_email.sql` — `contact_email` (nullable, 320-char CHECK) + DB-side 4,000-char CHECK on `comment` (closes the Phase 1 flagged gap) + column INSERT grant extension. Applied via MCP.
- `supabase/functions/admin-users/index.ts` — new `POST ?action=reset_all` (owner-only bulk credit reset, returns count). Redeployed (v5).
- `supabase/functions/admin-feedback/index.ts` — returns `contact_email`. Redeployed (v2).
- `src/lib/feedback-api.ts` — optional `contact_email` on the event.
- `src/components/FeedbackForm.tsx` — "I'd like a reply" opt-in revealing a prefilled email input; loose validation; close-the-loop success copy.
- `src/components/FeedbackFab.tsx` — entrance animation, staggered tip entrance, hover/press feedback.
- `src/components/FeedbackButtons.tsx` — thumb-pop on selection.
- `src/components/DemoBadge.tsx` — new; "Demo" pill with an explanatory tooltip.
- `src/App.tsx` — app-wide `TooltipProvider`.
- `src/pages/Index.tsx` — Demo pill in header; tooltips on Discovery/Portfolio nav buttons.
- `src/pages/Login.tsx` — Demo pill under the wordmark.
- `src/pages/Discovery.tsx` — tooltips on Start Discovery Sprint + Market & competitors.
- `src/pages/Sprint.tsx` — tooltips on Frameworks + grounding-notes buttons (native `title` removed to avoid double tooltips); starter-chip cascade animation.
- `src/pages/Admin.tsx` — Users: Reset all with two-step inline confirm; Spend: $/day + 30-day run rate + Export CSV; Feedback tab: "wants a reply" line.
- `src/lib/admin-api.ts` — `resetAllCredits()`, `FeedbackEntry.contact_email`.
- `src/index.css` — Phase 2 keyframes, all gated on `prefers-reduced-motion`.

## Logic

Phase 2 turns the functional feedback system into something a stranger can walk into: a Demo pill sets expectations, tooltips explain where every major door leads, the FAB arrives with a composed entrance instead of just existing, and the form lets a user opt into being replied to — while the admin side gains the bulk-reset and spend-export wiring Mo actually operates with.

## Judgment calls

- **Remotion not used**: it renders video, it doesn't animate live UI — the goal's escape hatch was taken and the sequenced entrances are CSS keyframes with staggered delays.
- **"Demo" over "Prototype"**: shorter, confident, doesn't apologize for the product.
- **Email is opt-in intent, not a required field**: users are signed in, so the address is known; what the field captures is "I want to hear back." Research: every added required field costs submissions.
- **Two-step inline confirm** for Reset all instead of a modal — the consequence is visible at the control, and it self-disarms after 5s.

## Verification

Type-check clean. All authored files lint clean (one pre-existing error in `Login.tsx` untouched). Both function redeploys confirmed ACTIVE. Migration applied via MCP with grants extended. Visual/motion quality to be judged by Mo in-browser.

## Quiz

**Q: The reset_all UPDATE uses `.not('id', 'is', null)` — why is that filter there at all, and what would happen without it?**

A: PostgREST refuses UPDATE/DELETE without a WHERE filter as a full-table-mutation guard. `.not('id','is',null)` is a deliberate match-everything filter (id is a NOT NULL PK) that satisfies the guard while touching every row — without it the call would 4xx and reset nothing, and the UI would surface "Reset all failed."

Quiz result: **pass**
