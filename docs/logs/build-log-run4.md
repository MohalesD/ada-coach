# Build Log — Ada Discovery Coach v3, Run 4: Intake router + Portfolio coaching track

**Branch:** `feat/discovery-platform-run4`
**Date:** 2026-07-05
**Built by:** Claude (session started on Sonnet 5, switched to Fable 5 mid-run — build-time only; no production code path calls Fable 5 or any Mythos-tier model)
**Source of truth:** `docs/prds/ada-discovery-coach-v3.md` (RUN 4 section) + `docs/prds/ada-discovery-coach-v3-addendum.md` (JTBD 1–5, endpoints 1–8, Run 4 diagrams)

This log is written as the run proceeds: what was built, what was decided
and why, and anything that could not be verified. It is converted to DOCX
at the end, same as Runs 1–3. RUN 5 (market/competitive intelligence) is
explicitly out of scope this run.

---

## 1. Session setup and recon

- Read in full before building: the v3 PRD, the v3 addendum, the Run 1,
  2, and 3 build logs, `_shared/auth.ts`, `_shared/models.ts`,
  `_shared/anthropic.ts`, `_shared/usage.ts`, `_shared/redact.ts`,
  `_shared/ingest-core.ts`, `sessions/index.ts`,
  `assumption-mapping/index.ts`, `report/index.ts`,
  `report-public/index.ts`, `ingest/index.ts`, the `assumptions` and
  `reports` migrations (the two RLS patterns in play), `config.toml`,
  and the frontend surfaces being extended (`App.tsx`, `Index.tsx`,
  `Discovery.tsx`, `Sprint.tsx`, `discovery-api.ts`, `report-pdf.ts`,
  `types/discovery.ts`, `index.css`).
- Loaded `fable5-prompting` (per the CLAUDE.md standing rule for
  `/goal` runs) and its `design-and-voice-philosophy.md` reference
  before the UI work — Locality-First and the microcopy discipline
  apply directly; the frontend-design skill was loaded for the visual
  build as the `/goal` requires.
- Supabase project confirmed: `ada-coach-01` (`pdxflmydzmcsynccunhn`),
  ACTIVE_HEALTHY. Migrations applied via the MCP `apply_migration` tool
  per the documented B-011 workaround; local `.sql` files committed as
  source of truth. Edge Functions deployed via `supabase functions
  deploy` (the repo's documented path).
- Mid-run interruption: internet access was severed and restored, and
  the session model switched from Sonnet 5 to Fable 5 at Mo's request.
  All state (branch, applied migrations, written files) survived; work
  resumed at the edge-function stage with no rework.

## 2. Decisions and rationale

| Decision | Rationale |
|---|---|
| Both new tables use **own-rows RLS** (`user_id = auth.uid()` select), NOT the `documents`/`document_chunks` `role='owner'` pattern | The `/goal` says "owner-only RLS pattern," but that phrase is ambiguous in this codebase — it names two different patterns. The PRD's own done-criterion ("two-user query proves zero cross-user reads in both directions") plus the track's entire purpose (serving non-owner aspiring PMs) make own-rows the only coherent reading. The `reports`/`blind_spots` RLS shape is what "owner-only" means here: each user's rows are theirs alone. |
| Both tables are **service-role-only writes** (select-own, `revoke insert/update/delete from authenticated`) | The `/goal` requires it for function-produced artifacts, and there's a hard security reason for the profile table: `resume_text` must pass through `redactPII` before storage. A direct authenticated INSERT via PostgREST would bypass redaction entirely. Removing the client write path removes the bypass. |
| **One conversation per profile**, created at profile creation (`portfolio_profiles.conversation_id`, unique NOT NULL FK → conversations CASCADE); projects reach it via `portfolio_profile_id` | The PRD's table sketch put `session_id` on `portfolio_projects`, but addendum endpoint 2 creates the conversation when the profile shell is created — before any project exists. Internal inconsistency resolved in favor of the endpoint flow; the ideation output and coaching thread share one conversation, which the existing chat UI/summary/export machinery reads for free. |
| Share = `share_token` column on `portfolio_projects` + a dedicated `portfolio-project-public` function mirroring `report-public` | "Reuse the existing report-public share-token **pattern**" — the pattern is an unguessable 128-bit token resolved by a public read-only function through the service client. The `reports` table itself is tightly typed to `sessions` (unique FK); making it polymorphic is surgery on tested code for zero user benefit. |
| Resume ingestion does **not** touch the RAG pipeline; extraction factored into `_shared/text-extract.ts` | A resume needs Haiku field extraction, not vector search. `ingest`'s chunk/embed path stays untouched (its behavior is unchanged); the PDF/plain-text extraction became a small shared helper both could use. |
| `portfolio_profiles.resume_text` stores the **Haiku digest**, never the raw resume (and never unredacted anything) | Matches the addendum's sequence diagram (Haiku extracts fields → DB write is "redacted"). Redaction runs BEFORE the model call; if extraction fails, the redacted raw text is stored instead and the client is told (`extraction_error: true`) — grounding degrades gracefully, PII exposure never does. |
| Router is **stateless** — no table; malformed/failed classification returns `recommended_track: "both"` with HTTP 200 | Endpoint 1 writes "nothing persistent." The business rule is "never guess silently" — a classifier failure is behaviorally identical to a contradictory answer, so it degrades to offering both tracks rather than erroring. Skip needs no backend at all. |
| Coach output protocol is **delimiter blocks** (`<<<SECTION key=… title=…>>> … <<<END SECTION>>>` + `<<<DRAFT READY>>>`), not JSON | Run 2's interview-guide lesson: long markdown inside a JSON string is the most malformation-prone shape available, and a coach turn carries BOTH conversational prose and a markdown section. A malformed block degrades to plain reply text — coaching continues, nothing crashes, the section just doesn't land that turn. |
| Idea generation returns EITHER 3–5 ideas (each with a mandatory `ai_angle` — missing one is malformed output, 502 retryable) OR `needs_more` + 1–2 targeted questions | Enforces two PRD rules in the validation layer, not just the prompt: the AI-native lens ("every idea must surface where AI fits") and the thin-resume edge case ("ask 1–2 targeted questions rather than generating generic ideas"). |
| Re-generating ideas replaces prior un-chosen proposals; once a project is chosen the list is settled (409 `already_chosen`) | Retries converge instead of stacking duplicates (the ingest re-chunk shape). Choosing is the commitment point per endpoint 5. |
| `choose` also takes `artifact_type` (PRD/brief/prototype spec) and flips siblings back to un-chosen; switching preserves any drafted content | The coaching that starts next needs to know what it's coaching toward, so the choice lives on the choose action. "One chosen, others stay false" is endpoint 5 verbatim. |
| `portfolio-plan` requires ≥1 drafted section (400 `no_draft`), writes `effort_estimate`, moves status to `complete`; strict JSON validation with 502 retryable | Endpoint 7 fires "when the artifact reaches draft" — an estimate not grounded in an actual draft is exactly the generic-filler failure the JTBD (effort honesty) exists to prevent. The plan prompt demands an `honesty_note` naming what will overrun. |
| All five new call types recorded to `model_usage` with `session_id: null` | `model_usage.session_id` is an FK to discovery sessions; portfolio calls aren't session-scoped. Per-user cost tracing still works (user_id), and the admin spend view aggregates by call_type regardless. |
| One portfolio profile per user in practice (`portfolio-sessions` POST returns the existing profile rather than minting shells) — deliberately NOT enforced; see §5 | An aspiring PM has one background; duplicate empty shells are junk rows. Mirrors the sessions function's resume-existing behavior. |
| Frontend: router at `/start` as a "typographic interview" (2 tap questions + optional free text), skip control visible on every step; workspace is thread + draft side-by-side at desktop, header tabs at 375px | JTBD-1 is "start getting value in under a minute" — taps beat typing. "Routing guides, never gates" means skip lives with the questions, not in a corner. The workspace is the one place a two-pane layout is genuinely earned: the PM must SEE sections land as coaching progresses (feedback at the result, "input, suggestion, decision in one review neighborhood"); on mobile the panes become tabs so each control stays attached to its panel. |

## 3. What was built

### Database (3 migrations, applied via MCP `apply_migration`, committed locally)

| Migration | Contents |
|---|---|
| `20260705130000_portfolio_profiles.sql` | `portfolio_profiles` (user_id, unique NOT NULL conversation_id FK → conversations CASCADE, resume_text, background, target_companies, target_archetype, timestamps), own-rows select RLS, service-role-only writes, `set_updated_at` trigger |
| `20260705130100_portfolio_projects.sql` | `portfolio_projects` (portfolio_profile_id FK CASCADE, idea_title, ai_angle, chosen, artifact_type CHECK prd/brief/prototype_spec, artifact_content jsonb, effort_estimate jsonb, status CHECK proposed/in_progress/complete, unique nullable share_token, timestamps), same RLS pattern |
| `20260705130200_model_routing_run4.sql` | Merges 5 new call types into `app_settings.model_routing`: `portfolio_route` + `portfolio_profile_extraction` → Haiku; `portfolio_idea_generation` + `portfolio_artifact_coaching` + `portfolio_plan_generation` → Sonnet 4.6 (the addendum's API injection map, exactly) |

### Shared modules (`supabase/functions/_shared/`)

- `models.ts` — `CallType` + `DEFAULT_MODEL_ROUTES` extended with the 5
  new call types; the Fable/Mythos guard covers them automatically.
- `text-extract.ts` — PDF/plain-text extraction factored out of `ingest`
  (same `unpdf` path) for resume files; no chunking, no embedding.
- `portfolio-router.ts` — Haiku classifier: persona + recommended track
  + confidence + one-sentence reason; strict output validation.
- `portfolio-profile-extract.ts` — Haiku resume digest (role history,
  skills, years, projects, summary) over already-redacted text, plus the
  one canonical digest-to-text formatter.

### Edge Functions (8 new, deployed to ada-coach-01; config.toml pins verify_jwt for all)

- **`portfolio-route`** — POST { answers }: Haiku classification;
  failures degrade to `both`/unclear at 200, never an error (the router
  guides, it doesn't gate).
- **`portfolio-sessions`** — POST creates profile shell + linked
  conversation (returns the existing profile if one exists); GET one/all.
- **`portfolio-profile`** — POST ?id=: resume via pasted text or an
  uploaded file in the caller's own storage folder (path checked against
  `user.id`); redaction BEFORE storage or any model call; Haiku digest;
  extraction failure non-fatal; returns redaction counts + flagged
  tokens for the PM.
- **`portfolio-ideas`** — POST ?id=: Sonnet 4.6, 3–5 ideas with
  mandatory AI angles OR 1–2 targeted questions on a thin profile;
  replaces un-chosen proposals on retry; 409 once chosen; idea list also
  lands in the conversation as an assistant turn.
- **`portfolio-projects`** — GET one/by-profile/all; PATCH `choose`
  (artifact_type required, one chosen among siblings) / `share`
  (idempotent token mint, stable across re-shares).
- **`portfolio-coach`** — POST ?id= { message }: multi-turn Sonnet 4.6
  coaching grounded in the profile bundle + last 20 turns; parses
  delimiter section blocks into `artifact_content.sections` (upsert by
  key) + the draft-ready flag; persists both turns to the conversation.
- **`portfolio-plan`** — POST ?id=: Sonnet 4.6 tool recommendations
  (with an AI-acceleration requirement) + honest effort estimate
  (hours/cadence/timeline/honesty_note); strict validation; writes
  effort_estimate, status → complete, plan summary into the thread.
- **`portfolio-project-public`** — GET ?token=: the report-public
  pattern for artifacts; service-client read, selected columns only, no
  user id, no token echo; `verify_jwt=false` BY DESIGN.

### Frontend

- **Types + client:** `types/portfolio.ts`, `lib/portfolio-api.ts`
  (mirrors discovery-api; shares `DiscoveryApiError`), `lib/portfolio-pdf.ts`
  (client-side jsPDF export, report-pdf.ts precedent),
  `components/portfolio/notes.tsx` (local loading/error primitives).
- **`/start`** — the intake router: oversized Fraunces question, big
  tap-target answers with one-line descriptions, optional free-text
  detail, "Skip — take me to the platform" visible on every step,
  recommendation view with both track cards (emphasis follows Ada's
  read; `both` renders them equal).
- **`/portfolio`** — dashboard: empty state → grounding card (paste +
  file upload + background + targets, redaction feedback with flagged
  tokens), Ada's-read profile summary with Update, idea generation with
  needs-more questions path, numbered editorial idea cards (AI-angle
  callout, why-you line), inline artifact-type picker on the card, and
  a pinned continue-your-artifact card once chosen.
- **`/portfolio/project/:id`** — the workspace: coaching thread +
  growing draft panel (side-by-side ≥1024px, Coaching/Draft header tabs
  at 375px), sections rendered as they land, effort-plan card, PDF and
  Share actions attached to the draft they act on.
- **`/portfolio/share/:token`** — public read-only artifact for a
  logged-out hiring manager, with the AI-transparency footer ("the
  thinking… is the author's own"), outside ProtectedRoute.
- **Entry points:** new featured scenario card on the chat home ("New
  here? Find your track" → `/start`), "Portfolio" item in the avatar
  menu. Everything carries the amber identity (tokens only — no new
  hexes introduced).

## 4. Verification record

All of the following ran against the live ada-coach-01 backend on
2026-07-05, with outputs captured in-session.

**Static:** 34/34 Vitest tests (10 new: Run 4 routing defaults +
per-call-type Fable/Mythos refusal). `npm run type-check` clean.
`npm run build` clean (pre-existing chunk-size warning only).

**Backend E2E over the deployed functions (22/22 steps passed, two
throwaway API users):**

1. Router: the aspiring-PM answer set → `portfolio` / `aspiring_pm` at
   0.95 confidence; the early-stage-PM answer set → `discovery` /
   `early_stage_pm`. Both personas placed correctly.
2. Profile shell + linked conversation created (201).
3. Profile intake with a PII-laden resume (name ×2 forms, email, "my
   name is" pattern) → **8 redactions**, digest extracted, and a
   verbatim scan of the stored profile confirmed **neither the name nor
   the email survives anywhere** in resume_text/background.
4. Idea generation → **4 ideas, every one with a non-trivial AI angle**
   (validation would 502 otherwise).
5. Choose (PRD) → chosen + in_progress; exactly one chosen among
   siblings.
6. Three coaching turns → replies each time; the artifact section
   landed on the explicit-draft request (delimiter protocol worked; no
   malformed blocks).
7. Plan → 4 tools, 18 hours, sustainable cadence, honesty note; project
   status `complete`.
8. Share token minted (32-hex), **stable across a second share call**;
   public endpoint served the artifact **with no auth header** and
   echoed neither user_id nor share_token; bogus token → 404.
9. Cross-user over the live API: B fetching A's profile → 404, A's
   project → 404, B PATCHing A's project → 404, B coaching A's project
   → 404.

**RLS isolation proof (the Run 1 standard, both directions).**
Transaction-scoped probes as `authenticated` with each user's JWT claims:

| Probe | profiles visible / other's | projects visible / other's |
|---|---|---|
| A probing B | 1 / **0** | 4 / **0** |
| B probing A | 1 / **0** | 0 / **0** |

Write-path probe as user A: direct INSERT into portfolio_profiles →
**refused (insufficient_privilege)**; direct UPDATE of own
portfolio_projects row → **refused**. The only write path is the
functions, where redaction is unbypassable.

**model_usage rows read directly (all 5 new call types), costs
recomputed independently in SQL — every one exact:**

| call_type | model | tokens in/out | cost_usd | recomputed | match |
|---|---|---|---|---|---|
| portfolio_route (×2) | claude-haiku-4-5 | 341/70 · 339/62 | 0.000691 · 0.000649 | same | ✓ |
| portfolio_profile_extraction | claude-haiku-4-5 | 283/223 | 0.001398 | 0.001398 | ✓ |
| portfolio_idea_generation | claude-sonnet-4-6 | 586/1024 | 0.017118 | 0.017118 | ✓ |
| portfolio_artifact_coaching (×3) | claude-sonnet-4-6 | 828/110 · 1012/117 · 1150/472 | 0.004134 · 0.004791 · 0.010530 | same | ✓ |
| portfolio_plan_generation | claude-sonnet-4-6 | 832/804 | 0.014556 | 0.014556 | ✓ |

No Fable/Mythos-tier model appears anywhere; routing config verified in
`app_settings` with all 11 call types; the DB CHECK from Run 1 still
stands.

**Full UI E2E through Playwright on the local dev build against the
live backend (fresh signup, screenshots at 1440px and 375px kept
outside the repo):**

1. Signup → home shows the new "Find your track" scenario card (hover
   state captured).
2. Router: Q1 tap → Q2 tap → optional detail → loading note → **"Build
   the portfolio that gets you hired"** with Ada's one-sentence reason;
   Portfolio card emphasized, Discovery card still present; skip
   control verified on every step.
3. Portfolio: empty state → session start → grounding card → pasted the
   PII resume → **"5 personal details redacted before storage"** in the
   UI, `[NAME_1]` visible inside Ada's digest (the raw name provably
   never reached the model), ambiguous company names flagged and kept.
4. Ideas: loading note → 4 grounded idea cards, each with the AI-angle
   callout and why-you line → "Build this one" → inline artifact-type
   picker → PRD.
5. Workspace: empty-draft state → substantive coaching turn ("Ada is
   thinking…" captured) → Ada pressure-tested ("why hasn't Gainsight
   solved this?") → second turn with evidence → **Problem Statement
   section landed in the draft panel** (rich markdown, the
   auditable-by-design AI constraint in the prose) → header count
   updated.
6. Plan: loading → effort-plan card (hours · timeline · cadence, tools
   with cost notes, honesty note) → status complete.
7. **PDF export parsed, not just downloaded**: 2 pages; title, Problem
   Statement, Effort plan, AI angle, and the "auditable" constraint all
   present in the text layer.
8. Share minted server-side (verified in SQL); localStorage/session
   cleared; **`/portfolio/share/:token` rendered the full artifact
   logged-out** at 375px and 1440px; bogus token → the no-blame
   missing-link state.
9. 375px passes: workspace Coaching/Draft tabs (draft reachable, all
   controls attached to their panel), dashboard, router. Console across
   the whole session: **zero unexpected errors** (pre-existing favicon
   404 + the intentional bogus-token 404 only).

**Cleanup:** all three test users deleted; cascade verified to zero
rows in portfolio_profiles, portfolio_projects, conversations, and
model_usage both times.

## 5. Could not verify / known gaps

- **Resume file upload was not driven end-to-end in the browser** — the
  upload path (storage → `extractPlainText` → redaction → digest)
  reuses the Run 3-verified storage policies and the pre-existing,
  production-verified PDF extraction code, and the UI wiring is
  type-checked, but no actual PDF resume went through the full
  file-mode path this run. Pasted-resume mode — the redaction-critical
  path — was verified twice (API + UI).
- **`needs_more` (thin-profile questions) was not observed live** — the
  test resume was rich enough that Sonnet always generated ideas. The
  contract is enforced in validation and the UI path is built; the
  first genuinely thin profile will exercise it.
- **One profile per user is behavioral, not schema-enforced** — a
  unique constraint on `portfolio_profiles.user_id` was deliberately
  not added (the PRD doesn't mandate it, and relaxing a constraint
  later is harder than adding one). The dashboard reads the most recent
  profile; junk shells can't accumulate through the app but could
  through direct function calls.
- **`DRAFT READY` marker not observed live** — a full multi-section
  coaching arc to Ada's own draft-ready declaration takes more turns
  than an E2E run warrants. The plan path doesn't depend on it (≥1
  section gates it); the marker only upgrades the plan button's
  emphasis.
- **Two-tab concurrency on the workspace is unguarded** — same status
  as the sprint before Run 3. Last coach turn wins on
  `artifact_content`; section upsert-by-key makes real damage unlikely,
  but the Run 3 `if_unmodified_since` pattern is the known fix if it
  bites.
- The clipboard-read check for the Share button returned unrelated OS
  clipboard content in the automated browser (a Playwright quirk);
  token minting and stability were verified server-side instead, and
  the copied URL format is the same code path the button's "Copied"
  state confirms.
- Playwright screenshots live in the gitignored `.playwright-mcp/`
  directory, outside the repo, per Run 2 precedent.
