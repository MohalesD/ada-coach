# Mega Sprint 2 / Sprint 1 — Portfolio Project polish

**Status:** PLAN, awaiting Mo's sign-off on the six open calls in §7.
**Written:** 2026-09-19 by the Claude Code orchestrator session.
**Inputs:** Mo's walkthrough notes and 12 screenshots (Drive, Product Dev /
Portfolio Project, 2026-09-11 session), the Run 4 build log
(`docs/logs/build-log-run4.md`), the Fable Mega Sprint 1 summary (Drive), the
playbooks named in `memory.md` D-003, and a read of the portfolio code on the
`main` branch as of commit `cd36ff4`.

Estimates are AI-assisted build time (Fable 5.1 orchestrating, sub-agents
building, one review round per pass), not human-developer time. They exclude
Mo's walkthrough time.

---

## 1. What the walkthrough found, mapped to root causes

| # | Symptom Mo saw | Root cause in code | Class |
|---|---|---|---|
| W1 | Workspace opens with all four ideas re-listed and no opening message; Mo had to ask "what's happening?" | `portfolio-coach` has no kickoff turn. The first assistant message only exists once the PM types. The ideas list is the idea-generation reply persisted in the same conversation (`portfolio-sessions` comment: "the same conversation carries ideation output and, later, the coaching"). | UX + engine |
| W2 | No confidence that Ada knows the chosen idea and artifact type | Both are in the system prompt (`coachSystem`), but nothing on screen says so. | UX |
| W3 | "0 sections drafted", no total, no "what's next", no coaching approach | `ARTIFACT_GUIDES` names sections in prose only; the UI has no section roadmap to count against. | UX |
| W4 | Page feels trapping: only exit is "Back to Portfolio", no home, settings, chat history | `PortfolioWorkspace.tsx` renders outside the app shell (no header avatar menu, no sidebar). | UX (Locality Law 5, Law 7) |
| W5 | Zero credits consumed; counter absent inside portfolio | No portfolio function calls `fn_reset_credits_if_due` or decrements `credits_remaining`. The counter component lives in `Index.tsx` only. | Engine, Tier 1 (credits ledger) |
| W6 | Sidebar "Portfolio Coaching" opens generic chat, not the workspace | The portfolio conversation is a normal `conversations` row; the sidebar has no notion of track, so `loadConversation()` opens it in the chat UI. | Engine + UX |
| W7 | "Ada's read on me" framing; structured digest "didn't come together", raw redacted text stored instead | `portfolio-profile` extraction fell back to raw text (the UI even says so). Copy frames it as opinion, not data. | Engine + copy |
| W8 | Unselected ideas persist forever; no park, archive, regenerate, steer | `portfolio_projects.status` has `proposed/in_progress/complete` only; no archive state, no regeneration endpoint with steering input. | Engine + UX |
| W9 | Intake form is thin | `portfolio_profiles` holds resume, background, target companies, archetype. No optional depth questions. | UX |
| W10 | No diagrams / Mermaid; end deliverable not "send to Claude Code ready" | Draft panel renders markdown sections only. PDF export exists; no build-handoff bundle. | Feature |
| W11 | Workspace too narrow; draft rail cramped | Fixed two-column layout. | UX |
| W12 | Inconsistent surface design vs. the rest of the app | Run 4 built the track as its own island in one run; no shared shell. | UX |

Telemetry gaps confirmed separately (memory.md D-009): no thumbs on portfolio
turns, no `coaching_prompt_id` on portfolio assistant rows (so `admin-insights`
never sees them), no `kind='summary'`, no client-side funnel events.

## 2. Why the portfolio track is "disconnected" (the honest answer)

It is not that the portfolio pages bypass the conversation engine. They use it:
`portfolio-sessions` creates a `conversations` row titled "Portfolio Coaching",
and `portfolio-coach` reads and writes `messages` on it. That is why the
conversation shows up in the sidebar at all.

What Run 4 did not do is join the *surfaces and side-effects* that the chat
and sprint engines grew over Weeks 2 to 3:

1. **Credits.** `chat` and `sessions` gate and decrement; portfolio functions
   never learned to. The counter is a chat-page component.
2. **Feedback and insights.** The chat page wires `use-feedback` to every
   assistant bubble and `chat` tags rows with the active `coaching_prompt_id`.
   Portfolio prompts are inline string constants in the Edge Function, so there
   is no prompt row to tag and nothing for insights to group by.
3. **Summary.** The `__SUMMARY__` sentinel and `kind='summary'` live only in
   `chat`.
4. **Routing.** The sidebar knows conversations, not tracks. Sprints avoid
   the same trap because `/sprint/:sessionId` is reached from the sprint UI,
   not the sidebar; the portfolio conversation is reachable from both.
5. **App shell.** The workspace was built as a focused, isolated surface,
   which reads as "trapped" without the header and rail everyone else has.

None of this is structural. It is five joins that a one-run build skipped.

## 3. Tiering call for Ada (playbook §6.2, applied up front)

Proposed, needs Mo's confirmation (§7 Q1):

**Tier 1, protected core.** Full process: tests written red first, independent
review in a fresh session, QA doc, decision log entry.
- Auth, RLS policies, column grants, storage policies (any migration touching them)
- Credits ledger: `fn_reset_credits_*`, `credits_remaining` writes, 402 paths
- `messages` / `conversations` persistence integrity (what is stored, with what tags)
- Account deletion and the `deleted_users` tombstone
- `bridge-intake` HMAC path
- Model routing guard (`_shared/models.ts`, the `model_usage` CHECK)
- Redaction (`_shared/redact.ts`) and anything storing resume text

**Tier 2, everything else.** One session builds it; gate is typecheck + tests
+ build + Vercel preview + Mo's walkthrough. UI, copy, prompt wording (covered
by prompt-contract tests), analytics events, layout.

Sprint 1 touches Tier 1 in exactly two places: credits on portfolio calls, and
what portfolio turns write to `messages`. Both get the full process.

## 4. Scope, in three passes

### Pass A — Reconnect the engine (mostly Tier 1)  ~3 h

- **A1 Credits.** Gate + decrement on `portfolio-ideas`, `portfolio-coach`,
  `portfolio-plan`. Profile extraction and routing stay free (onboarding
  incentive, and they are Haiku-cheap). Return `credits_remaining` in each
  response; `portfolio-api.ts` handles 402 like `chat` does. Credits counter
  moves into the shared shell (see B3) so it shows everywhere.
- **A2 Prompt rows + feedback + insights.** Move the three portfolio system
  prompts (ideas, coach, plan) into `coaching_prompts` rows with a new
  `track` column (`discovery` | `portfolio`), keep "exactly one active per
  track". Tag portfolio assistant rows with `coaching_prompt_id`. Wire
  `use-feedback` thumbs onto Ada's coaching turns in the workspace.
  `admin-insights` and the Prompts tab group by track. Migration through MCP
  with the filename-rename rule.
- **A3 Session summary.** On `DRAFT READY` (or on demand), write a
  `kind='summary'` row for the portfolio conversation; PDF and markdown export
  include it. Reuse `SUMMARY_SYSTEM_PROMPT` via `_shared`.
- **A4 Track-aware sidebar.** Add `conversations.track`
  (`chat` | `sprint` | `portfolio`, default `chat`, backfilled from
  `sessions` and `portfolio_profiles`). Sidebar rows for `portfolio` open
  `/portfolio/project/:id` (resolved through the profile's chosen project),
  `sprint` rows open `/sprint/:id`. One migration, one sidebar branch.
- **A5 Client-side analytics.** New `events` table (user_id, name, props
  jsonb, created_at; insert-own RLS, service-role read) and a 30-line
  `track()` helper. Portfolio funnel: `profile_saved`, `ideas_generated`,
  `idea_chosen`, `artifact_type_chosen`, `workspace_opened`,
  `section_drafted`, `draft_ready`, `plan_generated`, `shared`, plus
  `ui_error`. Admin Insights gets a funnel card. No third-party vendor; can
  add Vercel Web Analytics for page views later without touching this.
- **A6 Profile digest reliability.** Make structured extraction succeed or
  fail loudly (retry once, then store raw with a visible "digest pending"
  state). Rename the landing card to "Your background (what Ada works from)"
  and show the digest fields, not the raw dump.

### Pass B — Workspace and landing UX (Tier 2)  ~4 h, Plan Mode first

Taste-heavy, so this pass goes through Plan Mode with a reviewed HTML
mockup before any `/goal`, per the mega sprint 1 lesson.

- **B1 Kickoff turn.** On first open, Ada posts one message: confirms the
  chosen idea and artifact type, names the sections she will build (N total),
  states how coaching works (one question at a time, she writes sections as
  they land), asks the first question. Mirrors `_shared/sprint-kickoff.ts`;
  gets a prompt contract like the bridge directive.
- **B2 Section roadmap.** Draft rail shows the artifact's section list with
  drafted / current / upcoming states and "N of M drafted". Sourced from a
  typed section manifest per artifact type (replaces prose in
  `ARTIFACT_GUIDES`; the coach prompt is generated from the same manifest so
  UI and model cannot disagree).
- **B3 App shell.** Workspace and landing render inside the shared header
  (logo home link, credits, avatar menu) with a collapsible left rail of
  prior conversations. Exit lives on the draft container (Locality Law 5). A
  "focus mode" toggle can hide the rail; that is the "concentration mode"
  Mo mentioned, cheap once the shell exists.
- **B4 Idea management.** Pin / park / archive states on
  `portfolio_projects.status` (add `parked`, `archived`), "Generate more
  ideas" with a steering textbox, and two or three optional intake questions
  on the profile form (constraints, domains to avoid, artifact preference).
- **B5 Workspace transcript.** Hide the ideation message from the workspace
  thread (filter by `kind` or a message tag), so the chat starts at the
  kickoff.
- **B6 Layout.** Wider content column, resizable draft rail, responsive per
  the responsive guidelines (chips wrap, `min-w-0`, one breakpoint, overflow
  probe added to Playwright).
- **B7 Diagrams.** Coach may emit fenced `mermaid` blocks inside sections;
  draft rail renders them (client-side `mermaid`), PDF export rasterizes.
- **B8 Build handoff export.** "Export for Claude Code" bundles the artifact,
  digest, and effort plan as a markdown pack (zip) alongside PDF.

### Pass C — Architecture readiness for the coordinator (Tier 2)  ~1.5 h

Not building agents. Leaving seams so the later rebuild does not undo A and B.

- Extract `portfolio-coach` into `_shared/portfolio-coach-core.ts` with three
  named boundaries: **context assembly** (profile digest, project, sections,
  and a `context_sources[]` slot for the future "pull in other sessions"
  idea), **turn execution** (model call + section parsing), and
  **persistence** (messages, sections, credits, usage). The Edge Function
  becomes a thin handler.
- Section manifest (B2) and prompt rows (A2) already give a coordinator
  something to dispatch against.
- Record the seams and the intended sub-agent split in
  `docs/architecture/portfolio-coach-seams.md` so the chat advisor's
  coordinator design can target real interfaces.

## 5. Out of scope for Sprint 1

- The coordinator + sub-agents build itself (D-008).
- A fourth artifact type (customer discovery interview guide); see §7 Q5.
- Capstone twin feature (Sprint 3).
- Pulling other sessions or sprint artifacts into the workspace as context
  (seam only, C).
- Lint backlog cleanup (38 errors; separate task).
- RAG.

## 6. Verification plan (playbook three tiers)

- **Tier 1 gates, every pass:** `npm run type-check`, `npm test`, `npm run
  build`, prompt contracts (`contract:kickoff` plus the new portfolio kickoff
  contract). Add `deno check` for Edge Functions to CI in Sprint 2; until
  then run it via the Supabase MCP deploy (which type-checks on deploy).
- **Tier 2, Playwright pre-human pass:** portfolio landing and workspace at
  360 / 768 / 1280, kickoff message present, section roadmap counts, sidebar
  row routes to workspace, credits counter visible, thumbs present.
  Screenshots to the gitignored `.playwright-mcp/` per Run 2 precedent.
- **Tier 3, Mo's walkthrough:** the same 2026-09-11 script, re-run against
  the Vercel preview. Taste items stay `pending` until then.
- **Review round:** one fresh-session, findings-only review per pass; two
  rounds (second cross-model) for Pass A because it touches credits and
  message persistence. Findings go in a review ledger at the bottom of this
  file.

## 7. Open calls for Mo (each changes the work)

1. **Tier 1 list (§3).** Confirm or edit.
2. **Which portfolio calls charge credits.** Recommendation: ideas 1, each
   coach turn 1, plan 1, extraction and routing free. Say if you want the
   "first artifact free" onboarding incentive built now (it is one
   `app_settings` key and a banner) or noted for later.
3. **Prompts into `coaching_prompts` with a `track` column.** Schema change,
   but it is what makes insights, versioning, and the admin Prompts tab work
   for portfolio. Alternative is a `surface` tag on messages, which fixes
   insights but not versioning. Recommendation: the table.
4. **Analytics store.** Recommendation: the Supabase `events` table (own
   data, admin-readable, no vendor). PostHog if you want session replay.
5. **Fourth artifact option (interview guide).** Recommendation: defer, and
   let the Capstone discovery decide whether "discover customers first" is
   an artifact type or a route. Building it now widens Pass B.
6. **Sidebar portfolio rows.** Recommendation: route to the workspace (A4).
   Alternative: hide them from the sidebar entirely and rely on the
   Portfolio nav. Routing keeps chat history honest; hiding is simpler.

## 8. Sprint 2 preview — the automation architecture (so A and B leave room)

To be planned in its own file after Sprint 1 Pass A lands. Shape, from the
code review playbook's three tiers and the CI handoff:

- **CI (machine gates):** add `deno check supabase/functions/**`, a lint
  ratchet (fail on new errors vs. a committed baseline count instead of
  `continue-on-error`), secret scanning, `npm audit --audit-level=high`,
  prompt contracts for every system prompt, the Playwright overflow probe,
  and a migration-parity script (local filenames vs. a committed ledger
  snapshot refreshed by the MCP-backed Routine below).
- **Repo skills (`.claude/skills/`, shareable):** `ada-security-review`
  (RLS, grants, CORS, secrets; seeded from `docs/security-audit-2026-04-18.md`
  and the 2026-08-23 RLS audit), `ada-trust-audit` (a repo-scoped version of
  the trust-audit skill: code vs. docs vs. prompts drift), `ada-coach-eval`
  (fixture conversations graded by a Haiku judge against Ada's persona
  constraints: one question, 2 to 4 sentences, never validates; run as
  `npm run eval:coach`), and `review-dispatch` (the findings-only prompt
  template for the fresh-session review round).
- **Routines (Claude Code Remote):** weekly trust audit writing to
  `docs/audits/`, PR-time security review via PR subscription, migration
  parity check through the Supabase MCP.
- **The pattern doc:** `docs/architecture/quality-gates.md`, mapping each
  check to a playbook tier so the same layout ports to the next build.

## 9. Review ledger

(empty until the first review round runs)

## 10. Review (filled at sprint close)

(pending)
