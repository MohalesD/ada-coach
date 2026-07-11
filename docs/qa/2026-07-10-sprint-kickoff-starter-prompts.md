# QA — Fresh-sprint kickoff starter prompts

Date: 2026-07-10
Task slug: sprint-kickoff-starter-prompts

## Files changed

- `src/pages/Sprint.tsx` — three additions:
  1. `STARTER_PROMPTS` module constant — four first-person first-move prompts.
  2. An auto-focus `useEffect` that focuses the composer once the sprint finishes loading (`!loading && !loadError`).
  3. An intake-only starter-chip block, gated on `!stale && !turnBusy && messages.length === 1 && messages[0].role === 'user'`, rendering the prompts as clickable chips that call `handleTurn(prompt)`. Replaces the earlier dead-air placeholder banner.

## Logic

Session creation (`sessions` Edge Function) persists the PM's intake as the first `role:'user'` message but never calls the coach, so a fresh sprint opened with the PM's own message and silence — no reply, no cue. This change replaces that dead air with one-click first-move chips: because the intake is already in conversation history, clicking any chip sends a real turn and `discovery-turn`'s `handleTurn` (which calls `loadHistory` before the coach) hands the coach the full thread, so Ada reads the intake and responds. The top chip ("Give me your honest first read on this.") yields Ada's first diagnostic + one follow-up question.

## Scope boundary

Frontend-only, by design. The zero-click auto-kickoff (session creation calling the coach inline, or a kickoff mode on `discovery-turn`) was explicitly NOT done — it is a backend architecture decision slated for Polish Sprint 1, not same-day-as-demo work. This change delivers the "Ada reads and diagnoses" experience in one click without touching any Edge Function, migration, or backend logic.

## Verification actually performed

- `npm run type-check` — clean.
- `npm run lint` — runs now (parallel session added the missing eslint deps); 22 pre-existing errors remain in other files (Settings, redact.test, discovery-turn, etc.), **zero** in `Sprint.tsx`.
- Live browser walkthrough (Claude in Chrome, localhost:5175, signed in by Mo):
  1. Started a fresh Discovery Sprint on product "test" with a fresh-idea intake.
  2. Confirmed the four starter chips render in place of the placeholder, under "Pick a first move to get Ada's read — or just start typing below."
  3. Confirmed the composer is auto-focused on load (focus ring visible).
  4. Clicked "Give me your honest first read on this." — chip sent as a real PM turn, chips vanished (thread past intake-only), "Ada is thinking…" shown, then Ada returned a contextual diagnostic referencing the intake (freelance-designer proposals) plus a single follow-up question. End-to-end confirmed.

## Quiz

**Q: Why does clicking a generic chip like "Give me your honest first read" make Ada react to the pasted intake, rather than to the chip text alone?**

A: `startSession` persisted the intake as the first `role:'user'` message before the sprint screen ever loaded. When a chip is clicked, `handleTurn` sends its text as a new turn, and `discovery-turn`'s `handleTurn` calls `loadHistory` before invoking the coach — so the coach receives the entire thread (intake + chip), not just the chip. The chip is the trigger; the persisted intake is the content.

Quiz result: **pass**
