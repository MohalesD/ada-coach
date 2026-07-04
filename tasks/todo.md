# Ada Coach — Task Tracker

Reconciled 2026-07-04 at the start of the Run 1 `/goal` build. Prior
"Active focus" items are subsumed by the Run 1 plan below (NEXT-01
session-scoped uploads is a Run 1 task; agent-loop redesign and further
platform expansion are Run 2+).

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
