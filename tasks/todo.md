# Ada Coach — Task Tracker

Reconciled 2026-07-04 at the start of the Run 1 `/goal` build. Prior
"Active focus" items are subsumed by the Run 1 plan below (NEXT-01
session-scoped uploads is a Run 1 task; agent-loop redesign and further
platform expansion are Run 2+).

---

## 🔨 In progress 2026-07-10 — Unified feedback system (`/goal`, two phases)

Out of scope (hard boundary): credits/gating, Market Intelligence, RAG
threshold/retrieval, auth, the merged kickoff starter-prompts work.

Schema locked against reality: Mo's proposed `user_feedback` verbatim +
one integrity CHECK (message_rating requires rating). Existing chat
thumbs (`messages.feedback` via PostgREST, column-GRANT) stays as
per-message UI state; `use-feedback.ts` dual-writes a `user_feedback`
event row. Insights tab untouched. FAB surfaces: `/` (chat), `/discovery`
+ `/sprint/:id` (Discovery). Admin: new read-only Feedback tab +
`admin-feedback` Edge Function.

### Phase 1 — functional

- [x] Migration `user_feedback` (RLS own-rows, service_role full,
      lockdown GRANTs) — applied via MCP, .sql committed alongside;
      grants/policies verified live via execute_sql
- [x] `src/lib/feedback-api.ts` — one insert helper
- [x] `use-feedback.ts` — dual-write + source surface param
- [x] Extract `FeedbackButtons` → `src/components/FeedbackButtons.tsx`;
      Index imports it (surface 'chat')
- [x] Sprint thumbs: `ThreadMessage.feedback`, loadThread select,
      thumbs on assistant bubbles (surface 'discovery')
- [x] `FeedbackForm.tsx` (shared) + `FeedbackFab.tsx` (dialog +
      first-use tooltip, Ada voice, localStorage lazy-init)
- [x] Mount FAB on Index (raised), Discovery, Sprint (raised)
- [x] Settings: "Send feedback" card (surface 'settings')
- [x] `admin-feedback` function deployed (CLI, + per-function deno.json)
      + admin-api `getFeedbackLog` + Admin Feedback tab
- [x] RLS batch review (in build-log-feedback.md), type-check clean,
      new-file lint clean — awaiting Mo's manual click-through before
      commit + Phase 2

### Phase 2 — polish + expanded creative brief (Mo verified Phase 1)

- [x] Motion: FAB pop-in → tip lean-in sequence, starter-chip cascade,
      thumb pop — CSS keyframes (Remotion honestly doesn't fit live UI),
      all behind prefers-reduced-motion
- [x] Feedback follow-up: contact_email migration + opt-in "I'd like a
      reply" flow + admin "wants a reply" display
- [x] Users tab: Reset all (admin-users reset_all, redeployed) with
      two-step inline confirm
- [x] Spend tab: $/day + 30-day run rate + Export CSV
- [x] Demo pill (DemoBadge) on chat header + login, with expectation-
      setting tooltip
- [x] Guidance tooltips: Discovery/Portfolio nav, sprint-start +
      market-intel cards, Frameworks + grounding-notes buttons;
      TooltipProvider app-wide

---

## 🔨 In progress 2026-07-06 — Agent-loop FRONTEND (Fable run, `/goal`)

Branch `feat/discovery-frontend`. Source of truth:
`docs/discovery-frontend-fable-brief.md`. Frontend only — hard boundary,
no Edge Function or migration edits. Chat-first v1 accepted (my read of
Sprint.tsx confirms the per-step narratives already land in the thread
and the report carries the structured detail; rebuilding the evidence /
blind-spot / guide panels would triple surface area for no decision value).

Contract facts pinned from a read-only pass over `discovery-turn`:
- `propose_prioritization` confirm ALWAYS needs `params.framework` (no
  server fallback to the suggested id) — send it on confirm and override.
- `define_success_metric` candidates only exist on the evaluator path;
  `initiate` requires a `chosen` candidate. So the library's North Star
  entry sends a normal turn message ("let's define success") and lets the
  server-side readiness gate answer — never a fake client-side quiz.
- `conclude` completes the session but does not compile the report;
  ReportPage already compiles on demand → navigate to `/report/:id`.
- Turn mode never 409s; resolve/initiate 409 `stale_session` → the
  existing stale-tab guard, now keyed off `session_updated_at`.

### Build checklist

- [x] `CoveragePath.tsx` — coverage read over the 7 goals (+ current phase);
      replaces `SprintProgress` in the Sprint (component file stays put)
- [x] `ProposalCard.tsx` — the one PM-gated decision card: all 8
      direction-changing actions; framework options w/ when-why expander +
      suggested pre-select + real decline; North Star candidates w/ drift
      risk + decline; confirm/override/dismiss wiring
- [x] `FrameworkLibrary.tsx` — dialog: browse + teaching text + invoke out
      of turn (prioritization/interview direct initiate; North Star via a
      turn message)
- [x] `NotesDialog.tsx` — grounding-notes paste + redaction feedback,
      moved out of the old grounding step
- [x] `Sprint.tsx` rewrite — engine swap to `sendDiscoveryTurn` /
      `resolveDiscoveryAction` / `initiateDiscoveryAction`; keep thread
      spine, footer input, abandon dialog, stale guard, Ada's read,
      assumptions review (editable scores + prioritize toggle); cutover
      defaults (`current_phase ?? 'frame'`, `coverage ?? {}`)
- [x] `Discovery.tsx` resume hint: prefer `current_phase` over the retired
      `current_step`
- [x] `npm run type-check` clean (lint is broken repo-wide — see review)
- [x] Live drive on localhost:5175 (authorized by the /goal)
- [x] Commit incrementally (288cbd3 build, 06f7947 drive fixes)

### Review (2026-07-06, post live drive)

**Live-verified on a real TrailNote sprint (throwaway user, cascade-cleaned
to 0 rows after):** cutover render (null `current_phase` → frame, no
errors), within-phase turns raise no card, evaluator-raised
`map_assumptions` + `run_blind_spots` + `conclude` cards (confirm, decline,
and busy states all live), 10 Sonnet assumptions landing + score edit +
prioritize toggle, RICE via library initiate (toast + server persist),
MoSCoW override via the framework card (keyboard Tab+Enter selection),
North Star candidate picked (server-written thread message + coverage ✓),
interviews declined (coverage flag + toast), conclude → completed session →
report compiled + rendered. Coverage path visibly advanced at every step.
Console: only the two pre-existing React Router future-flag warnings.

**Honest caveat:** the evaluator (backed by Ada's skeptical persona)
declined to raise `propose_prioritization` / `define_success_metric` /
`prepare_interviews` organically in this early-stage sprint — she coached
instead, correctly. Those three cards were verified by persisting
real-shaped `pending_action` rows via the service role (the controller's
own write, options from the server registry) and resolving them through
the real dispatch path end to end. The `conclude` card DID fire
organically once readiness was met — while Ada's coach reply
simultaneously pushed back on wrapping up early. That tension (honest
coach, PM-gated choice) is the design working.

**Fixed mid-drive:** proposal card now renders below the assumptions
review (decision point stays adjacent to the composer);
`prefers-reduced-motion` also disables the smooth auto-scroll.

**Flagged, not fixed (out of scope):**
- `npm run lint` is broken repo-wide: `eslint.config.js` imports
  `eslint-plugin-react-hooks`, which is not in `package.json`. Pre-existing
  on main. Fix: `npm i -D eslint-plugin-react-hooks`.
- No UI affordance sets assumption `status` (validated/challenged/
  abandoned) — the API supports it (used it directly for the drive), the
  old UI never had one either. Without it, the North Star readiness gate
  and conclude readiness depend on grounding evidence or API-side status
  changes. Worth a small control on `AssumptionCard` in a later pass.
- RICE/MoSCoW per-assumption scoring persistence remains deliberately
  unbuilt (backend write path needed first — brief §6).

---

## 🔨 In progress 2026-07-06 — Agent-Loop Redesign + Framework Library

Branch `feat/agent-loop-discovery`. Source of truth:
`C:/Users/mohal/.claude/plans/plan-mode-session-opus-lovely-whistle.md`
(Opus Plan Mode session, approved 2026-07-06). Replaces the fixed 7-step
`SPRINT_STEPS` script with a deterministic, PM-gated controller whose
evaluate-and-decide step is model-driven. Adds a framework library (Mom
Test, MoSCoW, RICE, North Star + proxy). Personality/multi-persona layer
is OUT of scope (deferred with the backlog item).

**On the record (corrected 2026-07-06):** Anthropic API + credits are
CONFIRMED WORKING (live 200 to claude-haiku-4-5-20251001 with the
`.env.local` key). An earlier "credits exhausted" claim was stale memory
from the Run 5 log and was wrong — the loop CAN be runtime-tested once
deployed. The only current gate is deployment: the auto-mode classifier
blocked deploying the untested `discovery-turn` to production (correctly —
exceeds "structural verification"); deploy needs explicit authorization.

### Key decisions (Opus plan + advisor-reviewed)

- **Shape = Option C:** loop state (`current_phase` + `coverage` +
  `active_framework` + one `pending_action`) on `sessions`; an enumerable
  action space; a Haiku evaluator recommends one action; code dispatches;
  **direction changes are PM-gated proposals**, within-phase coaching flows
  free. PM can initiate any action out of turn. Not a fixed script; not an
  autonomous tool agent.
- **Completion = prioritized-assumption coverage** (confirmed with Mo):
  every prioritized assumption tested-or-deferred; riskiest have a
  guide-or-declined; a success metric defined-or-declined. Recommendation
  gate, PM-overridable both ways.
- **New session state is service-owned** (controller writes via service
  role, mirroring `stage`/`summary`) → no new `authenticated` UPDATE grants.
- **RICE/MoSCoW don't fit `confidence`/`impact` (1–5)** → `assumptions.framework_scores jsonb`; existing columns stay for the default. Framework-score writes route through the controller (service) → assumptions grant not loosened.
- **JTBD is not schema state** → success-metric call infers it from the transcript + validated assumptions.
- **North Star anti-quiz = the readiness gate**, not the prompt. Offer the metric flow only once a validated assumption + inferable JTBD exist.
- **Per-step functions orchestrated as capabilities**, not collapsed.
- **`chat` untouched** — stays the plain non-sprint surface.

### Foundation
- [x] Migration `agent_loop_session_state`: `sessions` (+`current_phase` w/ CHECK,`coverage`,`active_framework`,`pending_action`), `assumptions` (+`framework_scores`); column-grant lockdown so loop state is service-only. Applied via MCP + verified (columns + authenticated UPDATE limited to status/current_step).
- [x] `models.ts`: +`discovery_coach`,`discovery_evaluation`,`success_metric_candidates`; `agent_loop_model_routing` merge migration applied + verified (routes merged, prior keys preserved).
- [x] `_shared/frameworks.ts`: static registry (Mom Test, confidence×impact, MoSCoW, RICE, North Star) + `publicFrameworks`/`computeRiceScore`.

### Backend brain
- [x] `_shared/loop.ts` — action space, gating (`isDirectionChanging`), `computeReadiness` (completion criteria), coverage merge.
- [x] `_shared/coach.ts` — session-aware coach (phase focus + framework directive + assumption digest; never announces moves).
- [x] `_shared/evaluator.ts` — Haiku structured evaluator over the fixed action space; non-linearity + define_success gate baked into the prompt.
- [x] `_shared/capabilities/success-metric.ts` — grounded North Star, drift-risk per candidate, strict validation.
- [x] `discovery-turn` — turn mode (persist→coach→evaluate→gate) + resolve/initiate; `pending_action` w/ `if_unmodified_since`; readiness/validated-assumption gates; capabilities via internal JWT-forwarded calls; `conclude` → existing sessions complete path. config.toml + deno.json.
- [x] Verification: novel pure modules pass `deno check` clean; controller's only `deno check` errors match the existing shipped `sessions` function (repo-wide structural-client-typing, esbuild deploy doesn't type-check) — no new error classes.
- [x] **DEPLOYED** (`discovery-turn`, user-authorized) + **LIVE-VERIFIED** end to end (2026-07-06, throwaway users, cascade-cleaned to 0 rows):
  - Turn mode: stage classify → coach (real pressure-testing reply) + evaluator → correctly stayed within-phase for framing turns (no rubber-stamp jump); service-owned loop state persisted; 5 `model_usage` rows (Haiku) recorded → proves the `deno check` structural-typing warnings are harmless at runtime.
  - Dispatch mode: PM-initiated `map_assumptions` → real Sonnet capability → 12 assumptions + coverage/phase update; `propose_prioritization framework=rice` → `active_framework` write; invalid framework → 400; coverage merged across actions; Sonnet call recorded ($0.013).
  - `GET ?resource=frameworks` returns all 5.

### ── CHECKPOINT: review backend contract before frontend rewrite ── ◀ HERE

Flag (separate suggestion, not fixed — Scope Discipline): `_shared/models.ts` `SettingsClient` and `_shared/usage.ts` `InsertClient` structural types don't unify with a real `SupabaseClient` under `deno check` (PostgrestBuilder isn't a `Promise`). Pre-existing across all functions; a repo-wide fix would widen those helper param types.

### Frontend + prioritization  (branch: feat/discovery-frontend, off merged backend)
- [x] `types/discovery.ts`: extended `Session` (+4 loop fields) & `Assumption` (+`framework_scores`); added DiscoveryGoal/GoalStatus/Coverage/ActionType/FrameworkSlot/FrameworkScoring/PublicFramework/MetricCandidate/PendingAction/DiscoveryTurnResponse/Rice+MoscowScores. **`npm run type-check` clean.**
- [x] `discovery-api.ts`: `getFrameworks`, `sendDiscoveryTurn`, `resolveDiscoveryAction`, `initiateDiscoveryAction` + `DispatchResult`.
- [→] **HANDED OFF TO FABLE** (2026-07-06). Execution brief: `docs/discovery-frontend-fable-brief.md`. Remaining scope (Sprint.tsx loop integration, coverage indicator, framework + North Star proposal cards, cutover) is Fable's to build against the type-checked contract (commit f084be0). Open design question (chat-first v1 vs preserving rich panels) stated as recommended default, left reconsiderable. Creative direction handed to Fable. Boundary: frontend only, no Edge Function changes.
- [ ] `Sprint.tsx`: (Fable) dynamic action card from `pending_action`; framework proposal w/ teaching expander; North Star candidate cards; framework library; via `sendDiscoveryTurn`/`resolveDiscoveryAction`/`initiateDiscoveryAction`.
- [ ] `SprintProgress.tsx`: (Fable) fixed steps → coverage indicator over goals.
- [ ] Cutover: (Fable) `current_phase == null` → treat as `'frame'`; controller repopulates loop state on first turn.
- [ ] **PHASED / FLAGGED:** RICE/MoSCoW *per-assumption* scoring persistence needs a small controller `score` write-path (framework_scores is service-only) + redeploy. Default confidence×impact scoring already works via existing `updateAssumption`. Framework *selection* (active_framework) is fully working.

### Review
_(filled on completion)_

---

## 🔨 In progress 2026-07-05 — Run 5: Market + Competitive Intelligence

Branch `feat/discovery-platform-run5`. Source of truth:
`docs/prds/ada-discovery-coach-v3.md` (RUN 5) +
`docs/prds/ada-discovery-coach-v3-addendum.md` (endpoints 9–13, JTBD
6–9, Run 5 diagrams). Build log: `docs/logs/build-log-run5.md` (MD as
we go; DOCX at the end).

### Key decisions (made during recon; rationale in the build log)

- **Four new tables** (`market_briefs`, `market_evidence`, `competitors`,
  `competitor_evidence`): select-own RLS + service-role-only writes (the
  `reports`/`blind_spots` pattern). Both `_evidence` tables:
  `source_url text not null` + CHECK `^https?://` — a citation-less
  claim is unstorable at the DB layer; code layer keeps only URLs the
  search tool actually returned (Run 2 enforcement).
- **Gap analysis** persists as `products.competitive_gap jsonb` +
  `gap_generated_at`, with column-tightened INSERT/UPDATE grants on
  `products` (authenticated keeps name/description only) — the
  documented column-grant defense pattern. Report compile folds it
  into snapshots (addendum: gap "writes into the product's report
  snapshot"); no fifth table invented.
- **Search budget**: `app_settings.intel_search_budget` (default 15,
  config-driven). Market research call gets the whole budget; identify
  gets `min(5, budget)`; profiling splits
  `max(1, floor(budget / confirmed_count))` per competitor so a real
  multi-competitor run cannot exceed the budget in total.
  `callClaudeWithWebSearch` gains a hard ledger across pause_turn
  continuations (max_uses recomputed from remaining; stop at 0).
- **5 new call types, all Sonnet 4.6** (PRD: web_search always pairs
  with Sonnet 4.6, never Haiku): `market_intel_plan`,
  `market_intel_research`, `competitor_identification`,
  `competitor_profiling`, `competitive_gap_analysis`. Recorded to
  model_usage with `session_id: null` (Run 4 precedent) +
  `web_search_requests`.
- **Report feed**: snapshot v2 gains `market_intel` +
  `competitive_intel` sections; gap threats carry
  `related_assumption_ids` (server-validated against the product's
  real assumptions) so the risk map can badge threatened assumptions.
- **Honesty rules**: every stored claim carries `retrieved_at` and is
  visibly dated in the UI; `confidence_label` CHECK
  (strong/moderate/thin/none) on briefs and competitor profiles;
  empty search → "unmapped/limited" states, never fabrication.

### Backend

- [x] Migration `market_briefs` (unique product_id, summary jsonb,
      confidence_label CHECK, retrieved_at)
- [x] Migration `market_evidence` (claim, source_url + CHECK,
      query_used, retrieved_at)
- [x] Migration `competitors` (name, confirmed, added_by, positioning,
      pricing_signal, feature_notes jsonb, recent_moves,
      confidence_label, retrieved_at, profiled_at)
- [x] Migration `competitor_evidence` (same CHECK shape)
- [x] Migration `products` gap columns + column-tightened grants
- [x] Migration `intel_search_budget` seed + `model_routing` merge
- [x] Migration `products.intel_status` (added mid-run — see review)
- [x] `_shared/models.ts`: +5 call types
- [x] `_shared/anthropic.ts`: budget ledger + maxContinuations bound
- [x] `_shared/intel-config.ts`: budget reader + per-competitor split +
      per-call latency ceilings + honestConfidence
- [x] `_shared/intel-status.ts`: background-run status cell helpers
- [x] Edge Function `market-intel` (plan → bounded research → store;
      202 + background worker)
- [x] Edge Function `competitive-intel` (POST identify worker / PATCH
      confirm gate)
- [x] Edge Function `competitor-profile` (one competitor per call,
      202 + worker)
- [x] Edge Function `competitive-gap` (synchronous synthesis over
      stored evidence)
- [x] `report/index.ts`: snapshot v2 with intel sections
- [x] `config.toml`: pin verify_jwt for the 4 new functions
- [x] Vitest (42/42): routing + Fable/Mythos refusal; budget math

### Frontend (amber identity, tokens only)

- [x] `types/discovery.ts` + `discovery-api.ts` extensions (incl.
      pollIntelStatus)
- [x] `/product/:productId/intel` page with both modules
- [x] Discovery product card: "Market & competitors" entry
- [x] ReportPage + ShareReport + report-pdf intel sections; risk-map
      threat badges

### Verification (the /goal's done criteria)

- [x] Two-user probe: zero cross-user reads on all 4 new tables, both
      directions (+ write paths and the gap column proven closed)
- [x] Deliberate fabricated-citation INSERTs rejected by the CHECKs
      (5/5: NULL, empty, prose, ftp:// — both evidence tables)
- [x] Deliberate cap-exceed attempts: brief at budget 3 recorded
      exactly 3 searches (partial-marked); identify ≤ 3; confirming 4
      competitors under budget 3 → 400 too_many_competitors (live API)
- [x] One real market brief live (twice — budget 3 and budget 15/cap 6),
      model_usage rows read directly, all 7 costs recomputed exactly
- [~] Competitive analysis live run BLOCKED mid-run: the Anthropic
      account ran out of API credits ("credit balance is too low").
      Identification ran live once (3 searches, honest unmapped when
      the search tool errored); profiling + gap never completed a live
      model call. UI verified with labeled fixtures, then cleaned up.
      Needs: credits topped up, then one identify → confirm → profile
      → gap click-through on EchoBrief.
- [x] Playwright at 375px + 1440px: hover, loading, error states
      (identify error captured live; gate cost math; matrix; gap view;
      report threat badges; logged-out share at 375)
- [x] `npm run type-check`, Vitest 42/42, production build clean
- [x] Build log MD + DOCX; commit; PR

### Review

Shipped the full Run 5 scope with two mid-run architectural corrections
forced by live evidence: (1) synchronous web-search calls die at the
edge gateway's 150s idle timeout, so all three search endpoints became
202 + background worker + status-cell polling (new
`products.intel_status`); (2) pause_turn continuations multiply both
latency and input-token cost (a 6-search brief hit 310k input tokens),
so per-call search ceilings and continuation bounds now sit on top of
the per-run budget. Every DB-layer done-criterion passed. The single
open item is the live competitive profiling/gap run, blocked by the
Anthropic account's credit balance — external, one click-through once
topped up.

---

## ✅ Shipped 2026-07-05 — Run 4: Intake router + Portfolio coaching track

Branch `feat/discovery-platform-run4`. Source of truth:
`docs/prds/ada-discovery-coach-v3.md` (RUN 4 section) +
`docs/prds/ada-discovery-coach-v3-addendum.md` (JTBD 1–5, endpoints 1–8,
Run 4 diagrams). RUN 5 (market/competitive intel) is explicitly OUT of
scope this run. Build log: `docs/logs/build-log-run4.md` (MD as we go;
DOCX at the end).

### Key decisions (advisor-reviewed before writing code)

- **RLS on both new tables is own-rows** (`user_id = auth.uid()`), NOT
  the `documents`/`document_chunks` `role = 'owner'` pattern — CLAUDE.md's
  "owner-only RLS" phrase is table-specific to that older pattern; the
  PRD's own done-criteria ("two-user query proves zero cross-user reads
  in both directions") is only coherent under own-rows isolation, and the
  whole point of the portfolio track is serving non-owner aspiring PMs.
- **Both `portfolio_profiles` and `portfolio_projects` are service-role-
  only writes** (own-rows `select`, `revoke insert/update/delete from
  authenticated`) — mirrors `reports`/`blind_spots`/`model_usage`, not
  `products`/`assumptions`. Reason: `portfolio_profiles.resume_text` must
  pass through `redactPII` before storage; if `authenticated` had a direct
  INSERT path via PostgREST, redaction could be bypassed entirely.
- **Single-conversation-per-profile.** The PRD's endpoint table puts
  `session_id` on `portfolio_projects` but endpoint 2 creates the
  conversation at *profile* creation, before any project exists — an
  internal inconsistency. Resolved as: `portfolio_profiles.conversation_id`
  (unique, NOT NULL, FK → conversations ON DELETE CASCADE), created at
  profile-creation time, holds both ideation and coaching turns.
  `portfolio_projects` reaches it via `portfolio_profile_id` — no
  duplicate FK column.
- **Share via a `share_token` column on `portfolio_projects`** + a new
  `portfolio-project-public` function mirroring `report-public` exactly.
  Not touching `reports` (its `session_id` FK is tightly typed to
  `sessions`; polymorphism there is surgery on tested code, and the goal
  only enumerates two new tables).
- **No ingest chunk/embed pipeline for the resume.** Portfolio needs
  extracted text, not RAG. Reuse `redactPII` directly; PDF resume upload
  (optional, alongside paste) factors `unpdf`'s `extractText` into a tiny
  new `_shared/text-extract.ts` helper — does not route through `ingest`.
- **Router is stateless.** No new table. `portfolio-route` (Haiku)
  classifies free-text answers to 2–4 fixed questions and returns a
  recommendation; the client owns navigation. "Skip — take me to the
  platform" is always visible on the router screen itself. Contradictory
  answers → recommend both tracks, never silently guess.
- **AI-native lens must show up in generated content**, not just an
  `ai_angle` column — idea generation, artifact coaching, and the effort
  plan all need visible AI framing in their prose output.

### New tables (migrations via Supabase MCP `apply_migration`, per B-011)

- [x] `portfolio_profiles` — user_id, conversation_id (unique FK →
      conversations CASCADE), resume_text, background, target_companies,
      target_archetype, timestamps. Own-rows select RLS, service-role-only
      writes.
- [x] `portfolio_projects` — user_id, portfolio_profile_id FK CASCADE,
      idea_title, ai_angle, chosen bool, artifact_type CHECK
      (prd/brief/prototype_spec), artifact_content jsonb, effort_estimate
      jsonb, status CHECK (proposed/in_progress/complete), share_token
      unique nullable, timestamps. Same RLS pattern.
- [x] `model_routing` update — add `portfolio_route`,
      `portfolio_profile_extraction` → Haiku;
      `portfolio_idea_generation`, `portfolio_artifact_coaching`,
      `portfolio_plan_generation` → Sonnet 4.6.

### Shared modules

- [x] `models.ts` — extend `CallType` + `DEFAULT_MODEL_ROUTES` with the
      5 new call types above
- [x] `text-extract.ts` — small helper factoring PDF/plain-text
      extraction out of `ingest` for reuse (no chunking/embedding)
- [x] `portfolio-coaching-prompt.ts` or inline system prompts per
      function — AI-native lens instruction baked into every prompt

### Edge Functions

- [x] `portfolio-route` — POST { answers/text }: Haiku classifies
      persona + context → { recommended_track, confidence }; no writes
- [x] `portfolio-sessions` — POST: create portfolio_profiles + linked
      conversation; GET list/one (own rows)
- [x] `portfolio-profile` — POST ?id=: redact resume/background (paste
      or uploaded doc via text-extract), Haiku field extraction, write profile
- [x] `portfolio-ideas` — POST ?id=: Sonnet 4.6, 3–5 ideas + AI-native
      angle each, writes portfolio_projects rows
- [x] `portfolio-projects` — GET list/one; PATCH ?id= (`choose` /
      `share` actions)
- [x] `portfolio-coach` — POST ?id=: Sonnet 4.6 multi-turn artifact
      coaching, grounded in profile + prior turns, updates artifact_content
- [x] `portfolio-plan` — POST ?id=: Sonnet 4.6 tool rec + effort
      estimate (hours/cadence/timeline), AI-native framing included
- [x] `portfolio-project-public` — GET ?token=: mirrors report-public,
      verify_jwt false
- [x] `config.toml` entries (verify_jwt=false) + `deno.json` per function

### Frontend

- [x] `types/portfolio.ts` + `lib/portfolio-api.ts` (new files, mirrors
      discovery-api.ts patterns — not bolted onto the discovery files)
- [x] `/start` router screen — 2–4 questions, persistent "Skip — take me
      to the platform," Haiku-backed recommendation, navigates to
      `/portfolio` or `/discovery`
- [x] New scenario card on Index routing to `/start`
- [x] `/portfolio` dashboard — profile intake (paste + optional file),
      idea cards, choose flow
- [x] `/portfolio/projects/:id` — artifact workspace: chat-first coaching
      (mirrors Sprint.tsx StepCard pattern), artifact preview, effort plan,
      export/share actions, all in the amber identity
- [x] `/portfolio/share/:token` — public artifact view, outside
      ProtectedRoute (mirrors ShareReport.tsx)
- [x] `src/lib/portfolio-pdf.ts` — client-side jsPDF export (mirrors
      report-pdf.ts)

### Verification

- [x] Vitest for any new pure logic; `npm run type-check`; `npm run build`
- [x] Deploy migrations (MCP) + functions
- [x] RLS isolation proof: two throwaway users, SQL both directions on
      both new tables (the Run 1 standard) + live API 404 checks
- [x] Directly read `model_usage` rows for all 5 new call types post-run
      (Run 2's gap — don't repeat it)
- [x] Playwright: full router → portfolio track → artifact → export/share
      flow at 375px + 1440px, hover/loading/error states; cleanup test user
- [x] Build log MD + DOCX (python-docx, no pandoc available); commit; PR

### Review — Run 4 (2026-07-05)

Built: 3 migrations (portfolio_profiles with unique conversation FK,
portfolio_projects with artifact/effort jsonb + share_token, model_routing
merge for 5 new call types), 4 shared modules (routing/extraction/
classifier/text-extract), 8 Edge Functions (router, sessions, profile
with redaction-before-everything, ideas with the mandatory-AI-angle
gate, projects choose/share, delimiter-protocol coach, honest-effort
plan, public artifact endpoint), and 5 frontend surfaces (typographic
router at /start, portfolio dashboard, two-pane artifact workspace,
public share view, portfolio PDF export) + the home-screen entry points.
10 new Vitest tests (34 total).

Verified (full record in `docs/logs/build-log-run4.md` §4): 22/22
backend E2E steps including both router personas placed correctly, 8
redactions with zero PII surviving to storage, 4 ideas all AI-angled, a
coached section landing via the delimiter protocol, an 18-hour honest
plan, stable share tokens served logged-out, and four cross-user 404s.
RLS proven by SQL both directions on both tables (zero cross-user
reads) plus a write-path probe showing authenticated INSERT/UPDATE
refused. All 5 new call types read directly from model_usage with costs
recomputed exactly — no Fable/Mythos anywhere. Full UI E2E through
Playwright at 1440px and 375px including hover/loading/error states;
PDF export parsed (2 pages, all sections in the text layer); console
clean. All test users cascade-deleted to zero rows.

Known gaps (deliberate, log §5): resume FILE upload not browser-driven
end to end (pasted path verified twice); needs_more thin-profile branch
built but not observed live; one-profile-per-user is behavioral, not a
schema constraint; workspace two-tab concurrency unguarded (the Run 3
pattern is the known fix).

---

## ✅ Shipped 2026-07-04 — Run 3: Hardening

Branch `feat/discovery-platform-run3` (stacked on Run 2's branch / PR #2).
Build log: `docs/logs/build-log-run3.md` (+ .docx). A hardening run — no
new features beyond the Should-Have spend view.

- [x] Storage policies: session file uploads for ANY authenticated user
      (per-user path scoping kept, owner-role clause dropped); verified
      live by a non-owner upload + the first end-to-end file-mode ingest;
      foreign-folder writes still rejected
- [x] Admin spend view: `admin-spend` function (admin+) + Spend tab —
      totals by model + separable web-search cost, by-day × call-type
      table; new `model_usage.web_search_requests` column (no new tables)
- [x] Two-tab guard: `if_unmodified_since` on sessions PATCH → 409
      `stale_session`; sprint UI shows refresh-to-continue instead of
      silently overwriting (verified over the API: stale write rejected,
      newer step survived)
- [x] Run 2 gap closed for real: assumption-mapping + market-grounding
      run live, model_usage rows READ and costs recomputed in SQL — all
      exact, incl. 5 web searches at $0.05 inside the $0.281534 all-in
      grounding cost
- [x] 32/32 tests, type-check, build; test user + artifacts fully
      cleaned up (Mo's global RAG doc untouched)

### Review — Run 3 (2026-07-04)

The second-user storage prerequisite is now closed, spend is observable
without SQL, stale tabs can't clobber sprint progress, and cost logging
is verified at the row level rather than assumed. Remaining known gaps
live in the build log §5 (stale-tab banner not browser-driven end to
end; guard is strict by design).

---

## ✅ Shipped 2026-07-04 — Discovery Platform Run 2: Surface

Branch `feat/discovery-platform-run2`. Source of truth:
`docs/prds/ada-discovery-coach-v2.md` → Must-Have stories + "Run 2:
Surface" placeholder scope, narrowed by the Run 2 `/goal` (Must-Haves
only; explicitly NO admin spend view, NO analytics instrumentation
beyond `model_usage`, NO Notion/Linear export, NO viewer invites).
Build log: `docs/logs/build-log-run2.md` (MD as we go; DOCX at the end).

### Scope (what Run 1 did not cover)

1. Market-grounded evidence per high-risk assumption (Sonnet 4.6 + the
   Anthropic `web_search_20260209` server tool)
2. Blind spot analysis (Sonnet 4.6, grounded in evidence + PM docs +
   product ledger; evidence-backed vs Socratic-only labeled)
3. Mom Test interview guide generation (Sonnet 4.6, versioned)
4. Confidence-by-impact risk map (SVG, accessible, reused in report/PDF)
5. Report compilation (server-side snapshot) + client-side PDF export
6. Public share link (unguessable token, `verify_jwt=false` function,
   logged-out `/share/:token` route)
7. Product memory: prior session summaries + assumption ledger feed the
   mapping/blind-spot/guide calls (the "session ten builds on session
   one" story)
8. Every frontend screen for the sprint flow end to end: discovery
   dashboard, sprint surface (chat thread + step progress + tap-target
   branching), prioritization, guide display, report view, resume flow
9. Palette retokenization to the warm amber/cream identity (the goal
   fixes #B8853A / #8B6324 on #FAEFD9/#F5F0E3/#FAF7F0 with espresso
   text; status colors chosen via research)

### Migrations (local .sql + MCP `apply_migration`, per B-011)

- [x] `assumption_evidence` — per-assumption web evidence (source_url,
      title, snippet, query, stance); select-own RLS, service-role-only
      writes (mirrors `model_usage`)
- [x] `blind_spots` — per-session blind spots, FK assumption nullable,
      `evidence_backed` flag; same RLS pattern
- [x] `interview_guides` — versioned per session (unique session+version);
      same RLS pattern
- [x] `reports` — one per session (unique session_id), `share_token`
      unique unguessable, `snapshot` jsonb; same RLS pattern
- [x] `model_routing` update — add `market_grounding`,
      `blind_spot_analysis`, `interview_guide` → `claude-sonnet-4-6`

### Shared modules

- [x] `models.ts` — extend CallType + defaults (all three new types →
      Sonnet 4.6); web-search pricing constant
- [x] `anthropic.ts` — `callClaudeWithWebSearch` (server tool, citations
      extraction, `pause_turn` continuation, search-count usage)
- [x] `usage.ts` — optional extra cost (web search $/request)
- [x] `product-memory.ts` — product context bundle (prior summaries +
      validated/challenged/abandoned ledger) for the Sonnet calls

### Edge Functions

- [x] `market-grounding` — POST { assumption_id }: one assumption per
      call (retry granularity + timeout safety); stores evidence rows +
      a thread message
- [x] `blind-spots` — POST { session_id }: Socratic analysis over
      assumptions + evidence + session docs + ledger; stores rows +
      thread message; works without web evidence (labels it)
- [x] `interview-guide` — POST { session_id }: Mom Test guide for
      prioritized assumptions; versioned; thread message
- [x] `report` — POST { session_id } compile/regenerate snapshot (stable
      share token); GET ?session_id= fetch own
- [x] `report-public` — GET ?token= via service client, `verify_jwt`
      false, read-only snapshot for logged-out visitors
- [x] `assumption-mapping` — extend with product-memory bundle (memory
      story); config.toml entries for all new functions

### Frontend

- [x] Palette: retokenize index.css + tailwind to amber/cream; sweep
      hardcoded cerulean hexes; status colors researched + documented
- [x] `src/lib/discovery-api.ts` — typed client for all sprint functions
- [x] `/discovery` dashboard — products, create, resume-sprint card,
      report links, empty state
- [x] `/sprint/:sessionId` — chat thread + step progress indicator +
      tap-target branching (answer / skip / dig deeper), per-step
      loading/error/retry, assumption review, prioritize (3–5), guide
- [x] `RiskMap` SVG component (labels + color, never color alone)
- [x] `/report/:sessionId` — owner view: report, risk map, PDF export
      (jspdf), copy share link, regenerate
- [x] `/share/:token` — public read-only report + risk map
- [x] Routing + entry points (scenario card → /discovery)

### Verification

- [x] Vitest: new pure logic (routing additions, risk ranking, snapshot
      shaping); `npm run type-check`; `npm run build`
- [x] Deploy migrations (MCP) + functions; secrets already present
- [x] Playwright: fresh test user through the full sprint E2E on the
      deployed backend; screenshots of every screen at 375px + 1440px;
      hover/loading states; logged-out share link; cleanup test user
- [x] Build log MD + DOCX; commit; PR (What/Why/How to test)

### Review — Run 2 (2026-07-04)

Built: 5 migrations (assumption_evidence, blind_spots, interview_guides,
reports + share tokens, routing update), 4 shared-module changes incl.
the web-search Claude wrapper and product memory, 5 new Edge Functions
(+ assumption-mapping memory extension), the amber/cream retokenization
with researched WCAG-passing status colors and Fraunces/Karla type, and
7 new frontend surfaces (dashboard, sprint, risk map, assumption card,
report view + page, share page) plus client-side jsPDF export. 13 new
Vitest tests (32 total).

Verified (full record in `docs/logs/build-log-run2.md` §5): a fresh
test user ran the entire sprint on the live backend through Playwright
— classify (both "fresh idea" and "mid-discovery, stuck" observed),
ground with real redaction feedback, map 12 assumptions, market-check
the 3 riskiest with 24 real cited sources, 7 blind spots (3
evidence-backed with enforced source URLs), dig-deeper chat, prioritize
4, guide v1 (18 Mom Test questions), complete + report. PDF parsed and
confirmed (10 pages, embedded risk map). Share link served logged-out
(curl 200 with no auth + cleared-session browser). Product memory
demonstrably changed sprint-2 coaching. Cleanup cascade left zero rows.

Known gaps (deliberate, log §7): model_usage rows for new call types
not eyeballed before cascade cleanup; two-tab concurrency unguarded;
session file uploads still owner-only at the storage layer; PDF uses
Helvetica, not brand fonts.

---

## ✅ Shipped 2026-07-04 — Discovery Platform Run 1: Data and backbone

Branch `feat/discovery-platform-run1`. Source of truth:
`docs/prds/ada-discovery-coach-v2.md` → "Run 1: Data and backbone".
Build log: `docs/logs/build-log-run1.md` (MD; DOCX generated at the end).

### Decisions locked (rationale in the build log)

- **Model routing** is config-driven via `app_settings.model_routing`
  (JSON text), read by `_shared/models.ts` with hardcoded safe defaults:
  `stage_classification`/`session_summary` → `claude-haiku-4-5`,
  `assumption_mapping` → `claude-sonnet-4-6`. Any route resolving to a
  Fable/Mythos model throws at runtime AND is rejected by a DB CHECK on
  `model_usage.model`.
- **Raw fetch, not the Anthropic SDK** — matches the existing `chat`
  Edge Function pattern.
- **Sessions link to conversations by FK** (`sessions.conversation_id`,
  unique, ON DELETE CASCADE) — reuses the existing conversation engine.
- **Session-scoped documents** = `documents.session_id` (nullable FK →
  sessions, CASCADE). Global corpus rows keep `session_id IS NULL`;
  `match_document_chunks` now excludes session rows; new
  `match_session_chunks` searches within one session only.
- **Assumption status history** = separate append-only table written by
  a SECURITY DEFINER trigger; clients have no write path to it.
- **Scores**: confidence and impact are integers 1–5.

### Migrations (local .sql + MCP `apply_migration`, per B-011)

- [x] `products` table + own-rows RLS (mirrors conversations/folders)
- [x] `sessions` table + status CHECK (`in_progress|completed|abandoned`)
      + transition-enforcing trigger + FK conversations + RLS
- [x] `assumptions` + `assumption_status_history` + history trigger + RLS
- [x] `model_usage` + no-Fable/Mythos CHECK + select-own RLS,
      service-role-only writes
- [x] `documents.session_id` + RLS for per-user session docs +
      `match_document_chunks` global filter + `match_session_chunks`
- [x] Seed `app_settings.model_routing`

### Shared modules (`supabase/functions/_shared/`)

- [x] `redact.ts` — pure PII redaction (emails stripped, name patterns
      stripped, ambiguous tokens flagged) — Vitest-testable
- [x] `models.ts` — config-driven routing + pricing table + Mythos guard
- [x] `anthropic.ts` — raw-fetch Claude call helper returning text+usage
- [x] `usage.ts` — cost computation + `model_usage` insert
- [x] `ingest-core.ts` — chunker/embedder extracted from `ingest` so the
      session-scoped path reuses the same pipeline (no parallel system)

### Edge Functions

- [x] `products` — GET/POST/PATCH/DELETE, all through RLS-bound client
- [x] `sessions` — POST (create + linked conversation + Haiku stage
      classifier), GET, PATCH (complete → Haiku summary / abandon);
      resume-existing-in-progress behavior
- [x] `assumptions` — GET by session/product, PATCH scores/status/priority
- [x] `assumption-mapping` — Sonnet 4.6 structured extraction, insert
      assumptions, malformed-output → 502 retry path with raw logging
- [x] `ingest` — extended: session-scoped file docs + pasted-text path
      with redaction before any embedding call

### Verification

- [x] Vitest: redaction unit tests + "no PII reaches the embedding
      input" pipeline test
- [x] RLS proof: two test users; SQL proves user A sees zero of user B's
      rows in products, sessions, assumptions (output in build log)
- [x] E2E smoke on deployed functions (test user → product → session →
      classify → assumption-mapping → status history → pasted-text
      ingest → complete+summary), then test users removed
- [x] `.env.example` created; keys confirmed present, never committed

### Wrap-up

- [x] Build log finalized in MD + DOCX
- [x] Commit to `feat/discovery-platform-run1`, open PR

### Review — Run 1 (2026-07-04)

Built: 6 migrations (products, sessions, assumptions + append-only status
history, model_usage with a DB-level no-Fable/Mythos CHECK, session-scoped
documents, model_routing seed), 7 shared modules, 4 new Edge Functions +
session-scoped ingest, 19 Vitest tests, `.env.example`. All deployed to
`ada-coach-01`.

Verified (full record in `docs/logs/build-log-run1.md` §4): RLS cross-user
isolation proven by SQL in both directions (0 of the other user's rows
visible in products, sessions, assumptions, history, model_usage, session
documents) and over the live API (404s). 16/16 E2E steps passed on the
deployed functions: product CRUD → session + Haiku classification
(`fresh_idea` @ 0.98 in 1.52 s) → Sonnet 4.6 mapping (11 valid scored
assumptions) → status history trigger → pasted-text ingest with redaction
(0 PII in stored chunks; ambiguous "Acme Corp" flagged, not dropped) →
retrieval isolation (global search 0 hits, session search 1 hit on the
same embedding) → complete + Haiku summary → terminal-state 409.
model_usage logged every call with tier, tokens, and cost; a
`claude-fable-5` insert is rejected by the CHECK constraint.

Known gaps (deliberate, in the build log §5): storage bucket policies
still owner-only for file uploads; `chat` not yet routed through
model_usage; file-mode session ingest not E2E-tested (pasted-text mode,
the redaction-critical path, was).

---

## ✅ Completed (prior work)

- **Security Sprint (2026-04-25):** column-level GRANTs on `user_profiles`
  and `messages`, `ALLOWED_ORIGINS` CORS allowlist, redeployed all four
  Edge Functions, merged `security-hardening` → `main`.
- **Folders MVP:** drag-and-drop folder organization, `folders` table +
  RLS, three-dots menu, optimistic UI. Merged.
- **RAG Phase 1 + 2:** document upload/storage + retrieval pipeline
  (pgvector, `document_chunks`, `ingest`). Retrieval in `chat` remains
  gated OFF behind `ARM B EVAL: RAG DISABLED`. Do not rebuild.
- **Credits system:** lazy daily reset via `fn_reset_credits_if_due()`.

---

## 🔒 Standing rule for this window

While Mo is the sole user: no gate on ordinary RLS (Row-Level Security)
or schema work beyond normal Plan Mode review, batch-audit with
Opus/Codex after the fact is acceptable.

**Hard trigger, non-negotiable:** before any real external user's data
(beta, paid, or otherwise) touches the app, a full RLS/auth/isolation
audit runs first. No exceptions, regardless of effort level, goal state,
or how much else has been delegated. Negotiated 2026-07-03 (Kellan /
Marcus / Priya).

---

## 🗂 Backlog (from CLAUDE.md — still accurate)

| ID | Item | Notes |
|----|------|-------|
| B-002 | Token usage dashboard | `token_count` on `messages` + new `model_usage` table; needs an admin UI surface |
| B-003 | Rate limiting per user | Not yet built |
| B-005 | Rebrand remaining "Vera" references | Grep codebase for stragglers |
| B-011 | Migration history mismatch | Workaround in use: apply new migrations via Supabase MCP `apply_migration`, commit the local `.sql` alongside. Real fix (`supabase migration repair`) still pending. |
| NEW | Storage policies for non-owner session uploads | Session file uploads to the `documents` bucket currently require the owner role; extend per-user policies before any second user |
| NEW | Route `chat` model calls through `model_usage` | Cost middleware covers all new discovery calls; retrofit `chat` for full coverage |
