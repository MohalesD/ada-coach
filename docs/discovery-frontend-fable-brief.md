# Fable execution brief — Discovery agent-loop frontend

**Task:** finish the frontend for Ada's agent-loop discovery redesign. The
backend is done, deployed, and live-verified; the client contract is written and
type-checked. What's left is the `Sprint.tsx` integration and the cutover.

**Scope:** frontend only. Boundary is hard — see §6.

## Why this exists (read before building)

Ada is an AI customer-discovery coach for PMs. Her Discovery Sprint used to be a
**fixed 7-step script** (`SPRINT_STEPS` walked in order). It's now an **agent
loop**: the PM talks to Ada, a server-side controller coaches, evaluates whether
there's enough signal, and — for any direction-changing move — surfaces a
**PM-gated proposal** the PM confirms, overrides, or declines. Ada suggests; she
never silently acts. A framework library (Mom Test, MoSCoW, RICE, North Star +
proxy) rides on the same loop, each framework attached to the goal it serves.

The frontend's job is to make that loop legible: render Ada's coaching, surface
one proposal at a time as a decision card, let the PM choose frameworks (with a
light "when & why" teaching beat), pick a grounded North Star metric, and show
where the sprint stands — without turning a conversation into a dashboard.

Source of truth for the design decisions behind this: the approved plan at
`C:/Users/mohal/.claude/plans/plan-mode-session-opus-lovely-whistle.md`, plus
`CLAUDE.md` and `docs/prds/`. Read the plan — it explains the loop shape, the
gating rule, and the North Star anti-quiz gate the backend already enforces.

---

## 1. Already done — build against this, don't recreate it

Branch: **`feat/discovery-frontend`**, cut off the merged backend (PR #8 → main).
Commit **`f084be0`** ("Frontend contract: discovery-turn types + API client")
adds, type-checked clean (`npm run type-check` passes):

- **`src/types/discovery.ts`** — `Session` gained `current_phase`, `coverage`,
  `active_framework`, `pending_action`; `Assumption` gained `framework_scores`.
  New types: `DiscoveryGoal`, `GoalStatus`, `Coverage`, `ActionType`,
  `FrameworkSlot`, `FrameworkScoring`, `PublicFramework`, `MetricCandidate`,
  `PendingAction`, `DiscoveryTurnResponse`, `RiceScores`, `MoscowScore`.
- **`src/lib/discovery-api.ts`** — `getFrameworks()`, `sendDiscoveryTurn()`,
  `resolveDiscoveryAction()`, `initiateDiscoveryAction()`, and `DispatchResult`.

These target a **real, deployed, live-verified** controller (`discovery-turn`
Edge Function). The contract is tested end to end (coach + evaluator + gating +
dispatch + cost recording). **Do not redefine these types or re-implement the API
client.** Import and use them.

The backend controller and every Edge Function are **fixed and out of scope** —
see §6.

---

## 2. What's left to build

### 2a. `src/pages/Sprint.tsx` — swap the fixed-step engine for the loop

Today it renders a chat thread spine, a `SprintProgress` header of 7 fixed steps,
and **one inline `StepCard`** at the bottom switched by a `step` state, plus a
footer chat box. Keep the good bones (thread spine, one-card-at-the-bottom,
footer input, abandon dialog, the two-tab stale guard). Replace the engine:

- **Footer chat → `sendDiscoveryTurn(sessionId, message)`** instead of `sendChat`.
  Response: `{ reply, message_id, pending_action, current_phase?, coverage?,
  session_updated_at?, evaluation_error? }`. Append `reply` to the thread; store
  `pending_action`; update phase/coverage; hold `session_updated_at` as the
  concurrency token (same role `updated_at` played for the old two-tab guard).
- **The one inline card is now driven by `pending_action`, not `step`.** At most
  one proposal outstanding at a time (the server enforces this). When
  `pending_action` is null, there's no card — just the conversation.
- **Coverage indicator replaces `SprintProgress`** (`src/components/discovery/
  SprintProgress.tsx`): show the discovery goals and their status from
  `session.coverage.goals` (`untouched | in_progress | covered | deferred`), with
  `current_phase` marked. It's a progress *read*, not a step *controller* — the PM
  no longer clicks steps to advance.
- **Framework library entry:** `getFrameworks()` returns the `PublicFramework[]`
  registry (id, name, slot, goal, isDefault, `oneLiner`, `whenWhy`, scoring). Let
  the PM browse it (read `whenWhy`) and invoke one **out of turn** via
  `initiateDiscoveryAction(...)`.

**The proposal-card contract** (what each `pending_action.action` renders and how
to resolve it). Direction-changing actions are the only ones that ever produce a
card; `ask_next`/`dig_deeper` never do — they're just Ada's reply.

| `action` | card shows | resolve with |
|---|---|---|
| `map_assumptions` | rationale + Confirm / Not now | `resolveDiscoveryAction(id, {decision:'confirm', action})` |
| `ground_assumption` | rationale + `target.label` (the assumption) | `resolve … 'confirm'` |
| `run_blind_spots` | rationale + Confirm / Not now | `resolve … 'confirm'` |
| `propose_prioritization` | rationale + `framework.options` (each `oneLiner` + a **`whenWhy` expander**), `framework.suggested` pre-selected, real alternatives + Not now | `resolve … {decision:'confirm'|'override', action, params:{framework:id}}` |
| `prepare_interviews` | rationale + the interview framework (`mom_test`) teaching + Confirm / Not now | `resolve … 'confirm'` (dismiss → declined) |
| `define_success_metric` | rationale + `data.candidates` (`MetricCandidate[]`): each candidate shows **north star, what it measures, what it's grounded in, the proxy, and the drift risk** — pick one, or Decline | `resolve … {decision:'confirm', action, params:{chosen: candidate}}` (dismiss → declined) |
| `revisit_phase` | rationale + `goal` + Confirm / Not now | `resolve … 'confirm'` |
| `conclude` | rationale + Confirm / Not now | `resolve … 'confirm'` → navigate to `/report/:id` |

`DispatchResult` (from resolve/initiate) returns `{ ok?, dismissed?, concluded?,
current_phase?, coverage?, active_framework?, result?, session_updated_at? }`.
After any dispatch, reload the session + thread + assumptions/evidence so the new
state (cleared proposal, advanced phase, mapped assumptions, etc.) shows. The
per-step functions the controller dispatches to **already write narrative
assistant messages into the thread** (the blind-spot analysis, the interview
guide, etc. arrive as Ada messages) — see §3.

Preserve: the assumptions review (reuse `AssumptionCard` — editable scores +
prioritize toggle via existing `updateAssumption`), grounding-notes paste
(`ingestPastedText`), abandon, the stale-session guard (now keyed off
`session_updated_at`), and Ada's read (`session.stage`) in the header.

### 2b. Cutover for in-flight sessions

Sessions started before this change have `current_phase = null` (and a stale
`current_step`). The controller sets `current_phase` on the first turn. The
frontend must not choke on missing loop state: treat `current_phase == null` as
`'frame'`, `coverage` as `{}`, `pending_action` as `null`, and render normally.
No data migration — the loop repopulates state as the PM continues.

---

## 3. The open design question — recommended default, but reconsider if warranted

Today's per-step **rich panels** (evidence citation lists, blind-spot cards, the
guide markdown viewer) are wired to the fixed steps. In the loop, those
capabilities fire via proposal dispatch, and their Edge Functions **already write
narrative messages into the thread**, and everything lands in the **unchanged
report**.

**Recommended default: go chat-first for v1.** Surface evidence / blind-spots /
guide as their **in-thread narratives + the report**, rather than rebuilding them
as standalone panels now. This matches the design DNA already stated at the top of
`Sprint.tsx`: *"Chat-first by design… the current step lives in ONE inline action
card… No multi-panel dashboard."* Preserve the **assumptions** panel (it's the one
structured surface the loop keeps leaning on).

This is the default to follow — **not a mandate.** If your fresh read of the code
surfaces a real reason the chat-first version loses something that matters (e.g.,
the guide is genuinely unusable as a thread message), say so and make the call.
Don't rebuild all three panels reflexively just because they exist today.

---

## 4. Creative direction — yours to own

Modern, confident, with real craft in the small stuff: a considered **cursor
treatment**, **genuine hover states**, **subtle depth on hover**. This is *your*
design judgment, not a spec to execute — I'm naming the intent, you make it good.

- **Stay inside the existing amber identity.** The tokens are already defined in
  `src/index.css` + the Tailwind config (warm amber primary, cream surfaces,
  espresso text, the display/body type pairing). Read them and work within them;
  don't introduce a new palette.
- **The aesthetic anchor is the existing components** (`AssumptionCard`, the
  thread bubbles, `StepCard`), not an external doctrine. A `frontend-design` skill
  is available — reach for it only if it genuinely raises the bar; don't let it
  flatten your judgment into a generic AI aesthetic. If your own read is better,
  trust it.
- **Ada is a conversation, not a dashboard.** The transferable principles worth
  keeping: put the control right next to the thing it affects (the proposal card
  lives inline, at the decision point), keep interaction travel short, and give
  clear feedback on every state change. Don't import multi-panel/dashboard
  patterns onto a turn-based chat surface.
- The proposal card is the emotional center of this UI — it's where Ada hands the
  PM a real choice. Make confirming, overriding, and declining all feel first-class
  and equally reachable; a proposal with no honest "not now" isn't a choice.

---

## 5. Verification — before you claim it's done

Mechanically checkable (do these; paste real output/observations):

- `npm run type-check` exits clean.
- The **coverage indicator renders and updates** as the loop advances (drive a
  real sprint and watch it move).
- **Every framework and North Star proposal shows real alternatives plus a working
  decline** — no dead-end card.
- **`prefers-reduced-motion` is respected** (hover depth/motion damped or removed).
- **Every hover-only affordance has a working non-hover fallback** (keyboard focus
  + touch); nothing is reachable by hover alone.
- **No new console errors/warnings** on load or through a full loop.
- **Cutover handled:** open a pre-existing in-flight session and confirm it renders
  without errors and the loop resumes.

Verify it live, not just by type-check — the backend is deployed and the Anthropic
API is working, so you can run the real loop. `npm run dev` (localhost:5175), sign
in, start a sprint, and drive it: send a message, watch a proposal appear, confirm
a framework, pick a North Star candidate, initiate a framework from the library.

Two habits that matter on a long build:
- **Ground every progress claim.** Before reporting something as done, point to the
  tool result that shows it. If it isn't verified, say so — don't report work as
  finished on a confident guess.
- **Be able to explain each new component in three sentences.** If you can't, you
  don't understand what you built yet — slow down and read it.

---

## 6. Boundary — hard

**Frontend only. Do not touch `discovery-turn` or any other Edge Function, any
`supabase/functions/**` file, or any migration.** The backend contract is fixed and
verified. If you believe you need a backend change, **stop and flag it** — don't
edit the function.

You *will* hit one such case: **RICE/MoSCoW per-assumption scoring persistence is
deliberately out of scope.** `assumptions.framework_scores` is service-owned
(writable only by the controller), and no client write path exists yet — so **do
not build a per-assumption RICE/MoSCoW score grid that tries to persist.** For v1,
framework **selection** (which framework is active, via `active_framework`) is the
deliverable, with the teaching beat; the default confidence×impact scoring keeps
working through the existing `updateAssumption`. A per-assumption scoring UI for
RICE/MoSCoW is a later pass that needs a backend write path first — note it, don't
build it.

One repo gotcha: a `PreToolUse` hook blocks writes to `src/**` containing the words
"retrieval", "vector", "chunk", or "rag" (brand-voice guard). Keep those out of UI
copy and comments or the write will be rejected.

---

## How to run this

- **Effort:** `high` (Fable 5's default — no change needed). This is a
  judgment-heavy design build; `xhigh`/`ultracode` buys deeper reasoning + auto
  subagent orchestration if you want it, but `high` is sufficient.
- **Plan Mode vs `/goal`:** the quality bar here is a design judgment call, so if
  you use `/goal`, keep the aesthetic as a **human-review step**, not something the
  goal-evaluator judges. A workable condition, verification half only checkable:
  > Build the discovery agent-loop frontend per `docs/discovery-frontend-fable-brief.md`:
  > `Sprint.tsx` driven by `pending_action`, coverage indicator, framework +
  > North Star proposal cards with teaching + decline, cutover for in-flight
  > sessions. Aim for a modern, confident, crafted feel inside the existing amber
  > identity — real hover depth and cursor treatment, reduced-motion respected.
  > Verify: `npm run type-check` clean; drive a live sprint on localhost:5175 and
  > confirm a proposal renders, a framework confirms, a North Star candidate is
  > pickable, and the coverage indicator updates; no new console errors. Frontend
  > only — do not touch any Edge Function. Stop after 20 turns.
- When you have enough to act, act. If you're weighing a choice, give a
  recommendation and move — don't survey options you won't take.
