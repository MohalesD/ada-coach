# Build Log — Ada Discovery Coach v2, Run 1: Data and backbone

**Branch:** `feat/discovery-platform-run1`
**Date:** 2026-07-04
**Built by:** Claude Fable 5 (build-time only — no production code path calls Fable 5 or any Mythos-tier model)
**Source of truth:** `docs/prds/ada-discovery-coach-v2.md`, section "Run 1: Data and backbone"

This log is written as the run proceeds: what was built, what was decided
and why, and anything that could not be verified. It is converted to DOCX
at the checkpoint.

---

## 1. Session setup and recon

- Ran the `session-start` skill steps. Branch is
  `feat/discovery-platform-run1`; pre-existing uncommitted changes found
  (CLAUDE.md doc updates, the `ARM B EVAL: RAG DISABLED` gate in
  `chat/index.ts`, stale `tasks/todo.md`). These are intentional branch
  prep and will be committed with this run. Step 4 of the skill
  (`/context`) is a CLI-only command an agent cannot invoke — skipped and
  noted. Step 5's "one thing to ship" is answered by the `/goal`: Run 1.
- **Could not load `fable5-prompting` skill** — CLAUDE.md asks for it on
  every Fable 5 run, but it is not installed in this session's skill
  registry. Proceeded using the CLAUDE.md summary of its intent (chat-
  appropriate design principles; not relevant to Run 1, which is
  backend-only).
- Loaded the `claude-api` skill for authoritative model IDs and pricing:
  `claude-haiku-4-5` ($1.00 in / $5.00 out per MTok) and
  `claude-sonnet-4-6` ($3.00 / $15.00 per MTok), pricing table cached
  2026-06-24. Usage fields confirmed: `usage.input_tokens`,
  `usage.output_tokens` on the Messages API response.
- Read in full: the PRD, `_shared/auth.ts`, `chat/index.ts`,
  `ingest/index.ts`, and the migrations that define the patterns to
  mirror (`core_schema`, `auth_schema`, `folders`, `documents_table`,
  `document_chunks`, `match_document_chunks`, `app_settings`).
- Supabase project confirmed: `ada-coach-01` (`pdxflmydzmcsynccunhn`),
  ACTIVE_HEALTHY. Remote tables and Edge Functions match CLAUDE.md.
- Untracked junk in the working tree (`Claude`, `Extensions`, `version`,
  `kellan_vance_profile.docx`) looks accidental / personal — left
  untracked, not committed.

## 2. Decisions and rationale

| Decision | Rationale |
|---|---|
| One migration file per concern (6 files), applied via MCP `apply_migration`, committed locally as source of truth | Matches repo convention and the B-011 workaround documented in CLAUDE.md. `supabase db push` is known-broken for this project. |
| `products`, `sessions`, `assumptions` use the exact per-user RLS pattern of `conversations`/`folders` (`user_id = auth.uid()` for select/insert/update, service_role full access; `products` also gets delete, mirroring `folders`, because the PRD acceptance requires product deletion) | Goal requirement: "same owner-only RLS pattern as the existing conversations table". |
| `sessions.conversation_id` is a **unique, NOT NULL FK → conversations ON DELETE CASCADE** | PRD: reuse the conversation engine, do not invent a new session-message structure. Unique keeps the seam 1:1. Cascade gives the PRD's auto-purge chain: conversation → session → session documents → chunks. |
| Session state machine (`in_progress → completed | abandoned`) enforced by a BEFORE UPDATE trigger, not just app code | Service-role writes bypass RLS but not triggers, so the state machine holds no matter which code path writes. Terminal states are terminal. |
| Assumption status history is a separate append-only table (`assumption_status_history`) populated by a SECURITY DEFINER trigger (same hardening pattern as `handle_new_user`: locked `search_path`) | PRD acceptance: every prior status preserved with a timestamp. SECURITY DEFINER means client updates to `assumptions.status` write history without granting clients any direct write path to the history table (insert/update/delete revoked). |
| `model_usage` table: service-role-only writes, select-own for users, and a DB CHECK `model !~* '(fable|mythos)'` | PRD acceptance: every call logs tier/tokens/cost, and "no call logs a Mythos-tier model" is enforced at the database layer, not just in code. |
| Model routing read from `app_settings` key `model_routing` (JSON text) with hardcoded defaults in `_shared/models.ts`; unknown call types and Fable/Mythos-matching models throw | PRD: routing must be config-driven and changeable without a redeploy. `app_settings` is the existing owner-only config store — no new mechanism invented. |
| Confidence and impact are integers 1–5 (CHECK-constrained) | PRD doesn't fix a scale; 1–5 maps directly to the Run 2 confidence-by-impact grid. Documented here so Run 2 builds on it knowingly. |
| Raw `fetch` to the Anthropic API, not the SDK | Matches the existing `chat` function; the repo's documented stack is "raw fetch (not SDK)". Consistency beats the SDK-default guidance in this codebase. |
| Assumption mapping asks Sonnet 4.6 for JSON and validates/parses defensively rather than using `output_config.format` | The claude-api reference does not list Sonnet 4.6 among structured-output models, and the PRD explicitly requires a malformed-output retry path anyway. Malformed output → raw response logged server-side, 502 `malformed_model_output` returned, nothing partially inserted. |
| Session-scoped ingest is the existing `ingest` function extended, with the chunker/embedder extracted to `_shared/ingest-core.ts` | PRD: "reuse the existing ingest pipeline; do not build a parallel pipeline". Extraction is the minimal refactor that lets both paths share one pipeline. Behavior of the global path is unchanged. |
| Pasted text is a first-class session document (`documents.file_path = 'pasted/<uuid>'`, `content_text` = **redacted** text, no storage object) | The redaction acceptance test needs a path where pasted text is redacted *before* any embedding call. Storing only redacted text means raw PII never persists anywhere. |
| Global RAG isolation: `match_document_chunks` gains `documents.session_id IS NULL`; new `match_session_chunks(p_session_id, ...)` filters to one session | PRD acceptance: session docs retrievable within that session only, never in the global corpus. |
| Storage bucket policies left owner-only for now | Session *file* uploads work for Mo (he is the owner). Extending `storage.objects` policies to all authenticated users is a security-posture change outside minimal Run 1 scope — added to the backlog as a hard prerequisite for any second user. Pasted-text grounding (the redaction-critical path) needs no storage at all. |
| `chat` not yet routed through `model_usage` | Scope discipline: Run 1's cost middleware covers all *new* discovery calls (classifier, summary, mapping). Retrofitting `chat` touches existing tested code; flagged as a follow-up in the backlog instead. |

## 3. What was built

### Database (6 migrations, applied via MCP `apply_migration` and committed locally)

| Migration | Contents |
|---|---|
| `20260704100000_products.sql` | `products` (id, user_id, name, description, timestamps), own-rows RLS + delete policy, `set_updated_at` trigger |
| `20260704100100_sessions.sql` | `sessions` with unique NOT NULL FK → `conversations` (CASCADE), status CHECK (`in_progress/completed/abandoned`), `stage`/`stage_confidence`/`current_step`/`summary`/`completed_at`, `enforce_session_transition()` BEFORE UPDATE trigger, own-rows RLS |
| `20260704100200_assumptions.sql` | `assumptions` (statement, category CHECK across the 4 discovery categories, confidence/impact 1–5, status CHECK, is_prioritized) + `assumption_status_history` append-only table, SECURITY DEFINER logging trigger, own-rows RLS, client writes to history revoked |
| `20260704100300_model_usage.sql` | `model_usage` (call_type, model, tokens, cost_usd) with `CHECK (model !~* '(fable|mythos)')`, select-own RLS, service-role-only writes |
| `20260704100400_session_documents.sql` | `documents.session_id` FK → sessions (CASCADE), per-user RLS for session-scoped docs/chunks, `match_document_chunks` now excludes session docs, new `match_session_chunks(p_session_id, …)` |
| `20260704100500_model_routing.sql` | Seeds `app_settings.model_routing` with the Haiku/Sonnet split |

### Shared modules (`supabase/functions/_shared/`)

- `redact.ts` — pure PII redaction: emails always stripped (stable placeholders), names identified via honorifics / self-introductions / transcript speaker labels stripped everywhere they appear, ambiguous capitalized bigrams flagged with context and left in place.
- `models.ts` — routing config reader + defaults + `assertAllowedModel` (throws on `/fable|mythos/i`) + pricing table.
- `anthropic.ts` — raw-fetch Messages API wrapper returning text + token usage; `extractFirstJson` for defensive parsing.
- `usage.ts` — `computeCostUsd` + `recordModelUsage` (service-role insert into `model_usage`, best-effort).
- `stage-classifier.ts` / `session-summary.ts` — the two Haiku-tier calls, prompt + strict output validation each.
- `ingest-core.ts` — chunker/embedder extracted from `ingest` (verbatim logic) so both ingest modes share one pipeline.

### Edge Functions (deployed to `ada-coach-01` via `supabase functions deploy`)

- **`products`** — GET/POST/PATCH/DELETE through the RLS-bound client; DELETE also removes the product's sprint conversations so no orphaned chats linger.
- **`sessions`** — POST creates session + linked conversation, persists the intake as the first conversation turn, runs the Haiku stage classifier (non-fatal on failure: `classification_error: true`); a second concurrent sprint on the same product returns the existing one with `resumed: true`. GET by id / by product / all. PATCH handles `current_step` bookmarks and the `complete`/`abandon` transitions; completion generates the Haiku summary, stored on the session and as a `kind='summary'` message so the existing UI/export render it for free. Summary failure never blocks completion.
- **`assumptions`** — GET one (+full status history) / list by session or product; PATCH validates score ranges and status enum; history writes happen only via the DB trigger.
- **`assumption-mapping`** — Sonnet 4.6 call producing 5–12 scored assumptions across desirability/viability/feasibility/usability; strict validation; malformed output logs the raw response and returns 502 `malformed_model_output` (retryable) with nothing inserted.
- **`ingest`** — extended: pasted-text mode (session-scoped; redaction runs before anything is stored or embedded; only redacted text persists) and session-scoped file documents (ownership check instead of owner-role); the global corpus path is byte-for-byte the same pipeline and still owner-role-only. `config.toml` now pins every function's `verify_jwt` explicitly.

### Tests and config

- 19 Vitest tests (`redact.test.ts`, `models.test.ts`), including the PRD acceptance test that chunks of the redacted transcript — the exact text the embedding call receives — contain no known PII, and that a config routing to `claude-fable-5`/`claude-mythos-5` throws.
- `.env.example` documenting frontend vars and the Supabase Secrets (names only, no values; `.env*` confirmed gitignored).

## 4. Verification record

All of the following ran against the live `ada-coach-01` project on 2026-07-04, with outputs captured in-session.

**Unit tests:** `npx vitest run supabase/functions/_shared` → 2 files, **19/19 passed**. `npm run type-check` → clean.

**RLS isolation proof (goal requirement).** Two throwaway auth users were created (A `0c5ce4d0…`, B `51370a66…`), each seeded with one product, session (+conversation), and assumption. A transaction-scoped SECURITY INVOKER probe switched to the `authenticated` role with each user's JWT claims and counted visibility:

| Probe | products visible / other's | sessions visible / other's | assumptions visible / other's | other's history / model_usage / session docs |
|---|---|---|---|---|
| A probing B | 1 / **0** | 1 / **0** | 1 / **0** | **0 / 0 / 0** |
| B probing A | 1 / **0** | 1 / **0** | 1 / **0** | **0 / 0 / 0** |

Cross-user access was also probed over the live deployed API: user B fetching A's session → **404**; user B PATCHing A's product → **404**.

**Mythos-tier block, database layer:** `INSERT INTO model_usage (… model = 'claude-fable-5' …)` → **rejected**: `violates check constraint "model_usage_no_mythos_tier"`. Runtime layer: unit tests prove `resolveModelRoutes`/`assertAllowedModel` throw on any fable/mythos route.

**E2E smoke on the deployed functions (16/16 passed):**

1. Both test users sign in (password grant).
2. `products` create → rename → list.
3. `sessions` POST with intake → session `in_progress` with linked conversation; **Haiku classifier returned `fresh_idea` at 0.98 confidence in 1,521 ms** (acceptance: < 5 s), model logged as `claude-haiku-4-5`.
4. Second concurrent sprint on the same product → existing session returned with `resumed: true`.
5. `assumption-mapping` → **11 structured assumptions**, every one with a valid category and integer 1–5 confidence/impact, `model: claude-sonnet-4-6` (10.3 s).
6. `assumptions` PATCH to `validated` → history reads `null→untested`, `untested→validated`, both timestamped; out-of-range score (9) rejected with 400.
7. `ingest` pasted transcript containing names + emails → 200, 1 chunk, **5 redactions**, `Acme Corp` flagged (kept in text, surfaced to the PM).
8. SQL check on the stored chunks: **0 chunks containing any PII pattern** (names or `@`).
9. Retrieval isolation with the chunk's own embedding (similarity 1.0): `match_document_chunks` (global) → **0 hits**; `match_session_chunks(session)` → **1 hit**. The session doc was the only `ready` document in the corpus, so the zero can only come from the `session_id IS NULL` exclusion.
10. `sessions` PATCH `complete` → 956-char structured summary (Haiku); a further transition attempt → **409 invalid_transition**.
11. `model_usage` for the session: `stage_classification` (haiku, 176/24 tokens, $0.000296), `assumption_mapping` (sonnet-4-6, 348/520, $0.008844), `session_summary` (haiku, 194/207, $0.001229).

**Secrets:** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` proven present and working in Supabase Secrets by the live classifier/mapping/summary calls and the embedding call above. Neither appears anywhere in the repo; `.env*` is gitignored and `.env.example` documents names only.

**Cleanup:** both test users deleted; follow-up counts confirmed 0 rows remaining in products, sessions, assumptions, history, model_usage, session documents, and sprint conversations — which also exercised the full cascade/purge chain end to end.

## 5. Could not verify / known gaps

- **Storage-bucket uploads for non-owner users.** Session *file* uploads reuse the `documents` bucket, whose storage policies still require the owner role. Works for Mo today; a second user could ingest pasted text but not files. Deliberate scope cut, tracked in the backlog as a hard prerequisite for any external user (alongside the standing full-audit rule in tasks/todo.md).
- **`chat` is not yet routed through `model_usage`** — the cost middleware covers all new discovery calls; retrofitting `chat` is a flagged follow-up, so "every model call" currently means every discovery-platform call.
- **File-based session documents were not E2E-tested** (requires a storage upload as owner; the pasted-text path, which is the redaction-critical one, was tested end to end). The file path reuses the pre-existing, production-verified download/extract code unchanged.
- **`supabase db push` remains broken (B-011)** — migrations applied via MCP as documented; local `.sql` files committed as source of truth. Remote migration names lack the local timestamp prefixes (MCP names them by date + slug).
- **ESLint is broken repo-wide** before this branch (missing `eslint-plugin-react-hooks`), failing at config load on any file. Pre-existing environment issue, not addressed here.
- **`fable5-prompting` skill was unavailable at session start** (loaded mid-run once it appeared in the registry; its mandates — grounded progress claims, conventional prompting for non-Mythos models — were already being followed).
- The **evaluator-visible acceptance** "classification in under 5 seconds" was measured once (1.52 s, warm-ish function). Cold starts could exceed it occasionally; not load-tested.
- Untracked personal/accidental files in the working tree (`Claude`, `Extensions`, `version`, `kellan_vance_profile.docx`) were left untracked and uncommitted on purpose.
