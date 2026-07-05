# Ada Coach — Task Tracker

Reconciled 2026-07-04 at the start of the Run 1 `/goal` build. Prior
"Active focus" items are subsumed by the Run 1 plan below (NEXT-01
session-scoped uploads is a Run 1 task; agent-loop redesign and further
platform expansion are Run 2+).

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
