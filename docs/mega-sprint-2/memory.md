# Mega Sprint 2 — Decisions Ledger (memory.md)

Append-only. One entry per decision, dated, with who made it. This file is the
canon for the Claude Code orchestrator session; the chat advisor owns cohort
requirements and assignment framing, and Mo relays between the two. Anything
here is settled and not to be re-litigated by a later session without a new
dated entry that supersedes it.

Related: `sprint-1.md` (the working plan for the first sprint of this mega
sprint), `tasks/todo.md` (checkable build items), `docs/backlog/ada-coach-backlog-v1.md`
(running backlog), Linear project **Ada Coach** (status of record).

---

## 2026-09-19 — Session 1 (planning intake)

**D-001. Operating model for this mega sprint.** (Mo)
Two advisors. Claude Code (Fable 5.1, this session) is the technical
orchestrator: repo access, long runs, sub-agents, `/goal` builds, architecture.
The Claude chat advisor holds Mo's history, cohort context, and assignment
requirements, and sends back targeted refinements. Mo is the relay. Neither
advisor instructs the other directly.

**D-002. Deadlines are the chat advisor's territory, not this session's.** (Mo)
The AI Engineering / AI Evals cohort presentation is 2026-09-25. This session
builds to internal, effort-based deadlines and does not cut scaffolding to hit
the cohort date. What lands by the 25th is the advisor's call; what gets built
is this session's. Estimates are given in AI-assisted build time (Fable plus
sub-agents), not human-developer time.

**D-003. Playbooks stay out of the repo.** (Mo)
Mo's personal playbooks (agentic engineering v8, Fable 5 build v4, Opus 5 v1.1,
code review & verification v1, responsive guidelines v1, design-and-voice v3,
locality-first design philosophy) live in Google Drive under
`~Build-Projects/006_Ada Customer Discovery Coach/Playbooks` and are read each
session through the Drive connector. Repo docs may name them and cite them.
Their text never lands in the repo. Anything derived from them that dictates
the build (rules, CI checks, repo skills, PRDs, QA docs, changelog) belongs in
the repo. Reason: they are diary-style "how I think" notes, noisy in a repo
and not for a future engineer's eyes; the repo's own rules and results speak
for themselves.

**D-004. Drive write policy.** (Mo)
Never edit a Drive playbook in place. Any optimization produces a new version
file (v+1) so revision history is preserved. Build-specific artifacts stay in
the repo and in artifacts, not Drive.

**D-005. Documentation lives in the repo, mirrored to Linear and Notion.** (Mo)
This ledger (`memory.md`) holds decisions only. `sprint-N.md` files hold the
working plan, status, and review for each sprint. PRDs, QA docs, changelog,
and rules stay in their existing homes under `docs/`. Linear and Notion are
synced from the repo as the build proceeds (via the pm-sync reconcile flow,
never written blind).

**D-006. Sprint order.** (Mo)
1. Polish the Portfolio Project feature (Run 4 build, July 2026), reconnecting
   it to the rest of the app.
2. Build the automated trust / safety / security / eval run architecture as a
   repeatable pattern, with the playbooks as the seed.
3. Apply lessons learned to build the Capstone twin feature (helping a cohort
   member choose a capstone project in week 1-2; sits beside the portfolio
   route as a second route into a portfolio).
Cross-cutting: a product-discovery decision on how these features are
displayed, marketed, and accessed in-app.

**D-007. Discovery/marketing split (working assumption, not yet confirmed).** (orchestrator)
Chat advisor owns user-facing framing and positioning against cohort
requirements. This session owns the in-app surface: entry points, `/start`
router, sidebar and header placement, empty states. Mo said "we'll see how
that plays out"; treat as default until overridden.

**D-008. Coordinator-plus-subagents architecture is pending.** (Mo)
The agentic redesign of the portfolio coach (coordinator agent + sub-agents)
is being constructed with the chat advisor and is not available yet. The
polish sprint proceeds without it. Constraint on the polish: leave seams open
(see sprint-1.md, "Architecture readiness") so the later agentic rebuild does
not have to undo polish work on `portfolio-coach` and the router.

**D-009. Scope of "telemetry disconnect" for the portfolio feature.** (Mo + orchestrator, verified against code)
Confirmed by reading the code on 2026-09-19:
- Model spend IS recorded: all five portfolio call types write `model_usage`
  and appear in the admin Spend tab. Not a gap.
- The portfolio coach DOES write to the shared `conversations`/`messages`
  engine (`portfolio_profiles.conversation_id`, one conversation titled
  "Portfolio Coaching" per profile). The engine is shared; the surfaces are not.
- Gaps: no thumbs feedback on portfolio turns; assistant rows are not tagged
  with `coaching_prompt_id`, so `admin-insights` per-prompt analytics exclude
  them; no `kind='summary'` row and no session summary; no credit check or
  decrement on any portfolio call; the "Portfolio Coaching" conversation shows
  in the sidebar and opens in the generic chat UI, not the workspace; no
  client-side analytics anywhere in the app (see D-010).
- RAG eval harness is out of scope for portfolio (no retrieval there).

**D-010. "Client-side analytics" defined.** (orchestrator)
Browser-side event tracking: page views, funnel events (resume saved, ideas
generated, idea chosen, artifact type chosen, first section drafted, plan
generated, shared), drop-off points, and UI errors, sent to an analytics store
(Vercel Analytics, PostHog, or a Supabase `events` table). The app has none.
All current telemetry is server-side (`model_usage`, `messages.feedback`,
`user_feedback`). The blank-page and "what do I do now" problems in the
walkthrough are exactly what a funnel would have surfaced.

**D-011. Process doctrine for this mega sprint, adopted from the playbooks.** (orchestrator, per Mo's D-003)
- Two-tier process: a named protected core gets full rigor (red-first tests,
  fresh-session independent review, QA doc); everything else is built in one
  session and gated by typecheck + tests + build + Vercel preview + Mo's
  walkthrough. The Tier 1 list for Ada is proposed in `sprint-1.md` §3 and
  becomes canon here once Mo confirms it.
- Three-tier verification: machine gates, Playwright pre-human pass, Mo's
  batched walkthrough. A QA "pass" is never recorded while a named criterion
  is unverified; record pending or failed.
- Decisions document before any long run (this file). Review findings are
  logged in a ledger per sprint file. Deferred acceptance gaps ship as
  expected-fail tests, not silence.
- Judgment-heavy UI work goes through Plan Mode with a mockup before any
  `/goal`; `/goal` is reserved for mechanically checkable finish lines.
- Accretive files (this ledger, sprint files, logs) are append-only. No agent
  is ever told to overwrite one.
