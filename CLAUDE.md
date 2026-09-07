# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git

Never add `Co-Authored-By` lines to commit messages.

## Commands

```bash
npm run dev        # Start dev server (Vite, localhost:5175)
npm run build      # Type-check + production build
npm run lint       # ESLint
npm run lint:fix   # ESLint with auto-fix
npm run type-check # TypeScript check only (no emit)
npm run test       # Vitest
npm run format     # Prettier (src/**)
```

Edge Functions run on Deno and are deployed via `supabase functions deploy <name>`. They live in `supabase/functions/` and share helpers from `supabase/functions/_shared/auth.ts`.

## Project Overview

Ada Coach is an AI-powered Customer Discovery Coach for product managers. She pressure-tests assumptions, reframes leading questions, and guides PMs toward genuine customer insights using discovery frameworks (JTBD, Five Whys, assumption mapping).

**Current status:** Maven AI Coding course project (Rajesh Pentakota). Week 1 was a Wizard of Oz prototype. Week 2 delivered the MVP (Claude API, multi-turn chat, sidebar, admin panel, Supabase Auth). Week 3 layered on per-message feedback, session summaries, markdown export, an admin insights dashboard, profile/password settings, and a security pass (CORS allowlist + column-level GRANTs).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React 18 + Tailwind CSS + shadcn/ui (Radix primitives) |
| Backend | Supabase Edge Functions (Deno runtime) |
| Auth | Supabase Auth (email/password, JWT) |
| Database | Supabase Postgres with RLS |
| AI | Anthropic API — `claude-haiku-4-5-20251001` via raw fetch (not SDK) |
| Deployment | Vercel (frontend) + Supabase (backend) |

Path alias: `@` → `./src` (configured in `vite.config.ts` and `tsconfig.app.json`).

UI components: shadcn/ui in `src/components/ui/`. Add new ones with `npx shadcn-ui@latest add <component>`.

## Architecture

```
Browser → React (Vite) → Supabase Edge Function
                              ↓
                  Supabase Auth (JWT validation)
                              ↓
                  Anthropic API (ANTHROPIC_API_KEY in Supabase Secrets)
                              ↓
                  Supabase Postgres (conversations, messages, coaching_prompts, user_profiles)
```

### Auth flow

1. User signs up/in via `supabase.auth` on the frontend (`src/lib/auth-context.tsx`)
2. `AuthProvider` wraps the app, exposes `user`, `profile`, `signIn`, `signUp`, `signOut`
3. `ProtectedRoute` redirects unauthenticated users to `/login`; `/admin` requires `role = admin|owner`
4. Edge Functions receive the JWT in `Authorization: Bearer <token>`:
   - `requireUser()` — validates JWT, returns `{ user, userClient }` (RLS-bound)
   - `requireAdmin()` — calls `requireUser()` then checks `user_profiles.role in ('admin','owner')`
5. `getServiceClient()` uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for trusted writes

All shared auth helpers live in `supabase/functions/_shared/auth.ts`.

### Frontend routing

| Route | Component | Access |
|-------|-----------|--------|
| `/login` | `Login` (sign-in + sign-up) | Public |
| `/` | `Index` (chat + sidebar) | Authenticated |
| `/settings` | `Settings` (display name + password) | Authenticated |
| `/admin` | `Admin` (conversations + prompts + insights) | Admin/Owner only |

The chat header has an avatar dropdown (Settings, Admin, Sign out). The admin link only appears for admin/owner users. The admin panel uses `src/lib/admin-api.ts`, which forwards the user's JWT to admin Edge Functions.

### Conversation sidebar (`src/components/ConversationSidebar.tsx`)

The sidebar supports search, scenario-based entry points (pre-seeded starter prompts), pin/rename/archive, and optimistic re-sort. Sort order: pinned first, then by `updated_at` desc. Archive sets `status = 'archived'` (soft-delete) — rows stay in the DB so admin can still see them.

## Database Schema

Migrations in `supabase/migrations/` (applied in filename order).

> **Migration workflow (resolved 2026-08-23, DEU-96):** `supabase db push` is the **only**
> sanctioned path for schema/DDL changes in this project. Write the migration as a local `.sql`
> file under `supabase/migrations/` — that file is the true push source, not a labeled record —
> and apply it with `supabase db push`. **MCP `apply_migration` is retired for DDL.** The prior
> drift (local filenames not matching remote-applied timestamps) was diagnosed 2026-08-23
> (`docs/audits/2026-08-23-deu96-migration-drift.md`) as a pure version-string mismatch — every
> migration existed on both sides, none were lost — and resolved by renaming all 36 affected
> local files to match their remote-registered versions (`chore/deu-96-migration-rename`).
> **DEU-96 is renamed but NOT fully verified as of 2026-09-06**: `supabase db push --dry-run`
> has never been run against the renamed files to confirm the drift actually resolved, and no
> one-time schema baseline snapshot exists yet — `supabase db dump --schema-only` was attempted
> and failed (`--schema-only` is not a valid flag on CLI v2.109.1; read `supabase db dump --help`
> fresh before retrying). Both are tracked in `tasks/todo.md`. Do not treat this migration
> workflow as fully validated until the dry-run has actually been run and reported clean. Do not
> run `supabase migration repair` or `supabase db pull` without a planned cleanup — both touch
> shared migration history.
>
> **MCP remains fully sanctioned for read-only inspection** — `list_tables`, `list_migrations`,
> `get_advisors`, `execute_sql` catalog/data queries, and similar. Only DDL application moved to
> `db push`.



**Core tables — `core_schema`:**
- `conversations` — coaching sessions (id, title, status, user_id, is_pinned, timestamps). `status` supports `active`/`archived`; `is_pinned` drives sidebar sort order.
- `messages` — individual turns. Columns added in later migrations: `feedback` (`null` | `'positive'` | `'negative'`, assistant-only), `kind` (`'message'` | `'summary'`, drives the gold "Summary" badge + tinted bubble on render), `coaching_prompt_id` (FK → `coaching_prompts`, `ON DELETE SET NULL`, powers per-prompt analytics).
- `coaching_prompts` — versioned system prompts with `is_active` flag (exactly one active)

**Auth tables — `auth_schema` + `grant_owner`:**
- `user_profiles` — id (FK → auth.users), email, display_name, role (user/admin/owner)
- Auto-created by `handle_new_user()` trigger on `auth.users` insert
- `conversations.user_id` — FK → auth.users, added as NOT NULL
- `grant_owner` elevates a seed user to the `owner` role

**Pin support — `pin_conversations`:**
- Adds `conversations.is_pinned BOOLEAN NOT NULL DEFAULT false`. No new RLS policy needed — the existing "update own conversations" policy covers it.

**Credits system — `user_credits`, `app_settings`, `reset_credits_fn`:**
- `user_profiles.credits_remaining` (int, `CHECK >= 0`) and `user_profiles.last_credit_reset` (date) — written only by the service role (chat decrement) or via `fn_reset_credits_if_due()`. They intentionally fall outside the authenticated column-level UPDATE grant on `user_profiles` (which is restricted to `display_name`).
- `app_settings` — owner-only key/value store. First key is `daily_message_limit` (text-encoded int, `0` = unlimited). Owner-configurable without a code deploy.
- `fn_reset_credits_if_due()` — `SECURITY DEFINER` RPC. Lazy daily refill keyed off `auth.uid()` (no user_id param — callers can't reset others). Returns the post-reset balance, or `NULL` for unlimited (owner role, or `daily_message_limit` 0/unset). Called by both the `chat` Edge Function and the frontend on app load.

**Folders — `folders`:**
- New table `folders` (id, user_id FK auth.users, name, timestamps). Per-user RLS (own-rows-only mirroring `conversations`).
- Adds `conversations.folder_id` (nullable FK → `folders(id) ON DELETE SET NULL`) so deleting a folder unfiles its chats rather than cascading.
- Pinned chats appear in BOTH the Pinned section AND inside their folder when expanded — pinning is a global "always-visible" flag, not a substitute for folder membership.
- DnD via `@dnd-kit/core`: chat rows are draggable, folder rows + the unfiled section are droppables. Pointer activation distance is 4px so drag doesn't hijack click-to-open.

**Documents & RAG — `documents_table`, `fix_documents_insert_policy`, `enable_pgvector`, `document_chunks`:**
- `documents` — owner-managed knowledge base (id, user_id, filename, file_path, content_text, status, chunk_count). `status` is a state machine: `'uploaded' → 'processing' → 'ready' | 'error'`. `file_path` convention: `{user_id}/{uuid}_{filename}`.
- `documents` Storage bucket — private, 50 MB cap, `application/pdf` + `text/plain` only. Owner-only RLS on `storage.objects` keyed off the first folder segment (`(storage.foldername(name))[1] = auth.uid()::text`).
- `document_chunks` — one row per chunk with `embedding extensions.vector(1536)` (OpenAI `text-embedding-3-small`). Indexed with `ivfflat` cosine ops (lists = 100). Re-run `ANALYZE document_chunks` after large bulk loads so the index picks good list assignments. Authenticated UPDATE is revoked — chunks are immutable from clients.
- **Owner-only, not just admin.** `documents` and `document_chunks` RLS requires `role = 'owner'`. The `ingest` Edge Function additionally enforces this in code (`requireAdmin()` is not sufficient). Mirror this pattern when adding new RAG-adjacent tables.
- `match_document_chunks(query_embedding, match_threshold, match_count)` — SQL function used by the `chat` function for retrieval. Returns `content + similarity` for top-N chunks across `documents.status = 'ready'`, pre-filtered by cosine similarity threshold.

**Discovery platform Run 1 — `products`, `sessions`, `assumptions`, `model_usage`, `session_documents`, `model_routing` (see `docs/prds/ada-discovery-coach-v2.md` + `docs/logs/build-log-run1.md`):**
- `products` — the PM's unit of discovery work. Own-rows RLS (mirrors conversations/folders), including delete.
- `sessions` — Discovery Sprint sessions. `conversation_id` is a **unique NOT NULL FK → conversations ON DELETE CASCADE** (reuses the conversation engine; deleting the conversation purges the session and its session-scoped documents). Status state machine `in_progress → completed | abandoned` is enforced by a BEFORE UPDATE trigger (`enforce_session_transition`) — it binds service-role writes too. Also carries `stage`/`stage_confidence` (Haiku classifier), `current_step` (resume bookmark), `summary` (Haiku, written on completion).
- `assumptions` — extracted by Sonnet 4.6; `category` CHECK (desirability/viability/feasibility/usability), `confidence`/`impact` integers 1–5, `status` CHECK (untested/validated/challenged/abandoned), `is_prioritized`. Every status change is recorded in **`assumption_status_history`** (append-only) by a SECURITY DEFINER trigger; authenticated has no write path to the history table.
- `model_usage` — one row per production model call (call_type, model, tokens, cost_usd). Service-role-only writes, select-own reads, and a CHECK `model !~* '(fable|mythos)'` so a Mythos-tier call can't even be recorded.
- `documents.session_id` (nullable FK → sessions, CASCADE) marks **session-scoped documents**: owned per-user (any authenticated role), excluded from `match_document_chunks` (global RAG now filters `session_id IS NULL`), searchable only via `match_session_chunks(p_session_id, …)`. Global rows (`session_id IS NULL`) remain owner-role-only. Note: the storage bucket policies are still owner-only — session *file* uploads work only for the owner until the backlog item lands; pasted-text ingest needs no storage.
- `app_settings.model_routing` — JSON text mapping call types to models (defaults: classification/summary → `claude-haiku-4-5`, assumption mapping → `claude-sonnet-4-6`). Edit the row to change routing without a redeploy; `_shared/models.ts` refuses any route matching `/fable|mythos/i`. **Fable/Mythos-tier models are build-time only and must never be routed in production.**

**RLS posture:**
- Authenticated users see only their own conversations/messages (via `user_id = auth.uid()`)
- Authenticated users can read only the active coaching prompt
- Service role has full access (used by Edge Functions for trusted writes)
- Anon role has no policies (blocked entirely)

**Column-level GRANTs (defense-in-depth, see `lockdown_user_profiles` + `message_feedback` migrations):**
- `messages`: authenticated UPDATE is restricted to the `feedback` column only — even if RLS were loosened, browsers can't tamper with `content`/`role`/etc.
- `user_profiles`: authenticated UPDATE is restricted to `display_name` only. This blocks self-elevation to `admin`/`owner` via direct PostgREST writes (a real risk because `requireAdmin()` re-reads `role` from the DB on every call).
- When adding a new user-writable column, you must add an explicit `GRANT UPDATE (col) ON <table> TO authenticated` — don't loosen the column list back to `UPDATE`.

## Edge Functions

All functions require a valid Supabase Auth JWT. CORS is gated by an allowlist — set `ALLOWED_ORIGINS` (comma-separated) in Supabase secrets *before* deploying, or browser calls will fail preflight. Default allows only `http://localhost:5175`.

**Vercel preview URLs are blocked by default.** Vercel preview deploys get a unique origin (e.g. `https://ada-coach-git-<branch>-<scope>.vercel.app`) that is not in the default allowlist. If you need to test against the real Supabase backend from a preview URL, add that origin to `ALLOWED_ORIGINS` before testing: `supabase secrets set ALLOWED_ORIGINS="http://localhost:5175,https://ada-coach.vercel.app,https://ada-coach-git-<branch>-<scope>.vercel.app"`. Remember to remove ephemeral preview origins once the branch is merged.

- **`chat`** — `POST { message, conversation_id? }`. Verifies ownership (RLS), fetches active prompt + last 20 messages, calls Claude, persists both turns, returns `{ reply, conversation_id, message_id, kind, credits_remaining }`. Tags assistant messages with `coaching_prompt_id` (for analytics).
  - **Credits**: calls `fn_reset_credits_if_due` before the Claude call. If credits are tracked and `<= 0`, returns 402 `{ error: "credits_exhausted", credits_remaining: 0 }`. Decrements credits (service-role write) after a successful reply and surfaces the new balance in the response. `credits_remaining: null` = unlimited.
  - **RAG (currently disabled)**: the retrieval block calls `match_document_chunks` via the service client and prepends the top chunks to the user message, but the call is gated by an `ARM B EVAL: RAG DISABLED` flag. Re-enable by removing that gate — do not delete the block.
  - **Summary sentinel**: when `message === '__SUMMARY__'`, the function swaps in `SUMMARY_SYSTEM_PROMPT`, requires an existing `conversation_id`, **does not** persist the synthetic user turn, and stores the assistant reply with `kind = 'summary'`. Anthropic requires a trailing user turn, so a non-persisted directive is appended to the request only.
- **`admin-conversations`** — `GET` (list with counts), `GET ?id=` (full messages), `PATCH ?id=` (update status). Requires admin/owner.
- **`admin-prompts`** — `GET` (list), `POST` (create, auto-versions), `POST ?id=&action=activate`, `PUT ?id=` (update), `DELETE ?id=` (blocked if active). Requires admin/owner.
- **`admin-insights`** — `GET` returns aggregated feedback analytics (totals, positive/negative rates, per-conversation, per-prompt, top 5 positive/negative messages, recent 10 events). Aggregation is in-memory using the service client; if the dataset grows, move to Postgres aggregations or a materialized view.
- **`admin-users`** — **Owner-only** (admin alone is rejected with 403). `GET` lists `user_profiles` with credit fields (`credits_remaining`, `last_credit_reset`). `POST ?id=<uuid>&action=reset` resets that user's credits to the current `daily_message_limit` and stamps `last_credit_reset`.
- **`ingest`** — two modes, one pipeline (chunker/embedder shared via `_shared/ingest-core.ts`). `POST { document_id }`: downloads from Storage, extracts text (PDF via `unpdf`, plain text via `Blob.text()`), sentence-aware chunker (~300 words / ~50 overlap), embeds in batches of 96 (`text-embedding-3-small`), replaces prior chunks, transitions `'uploaded' → 'processing' → 'ready'` (`'error'` + rollback on failure; re-ingestable). Global-corpus docs (`session_id IS NULL`) remain **owner-only**; session-scoped docs only require ownership. `POST { session_id, pasted_text, title? }`: session-scoped pasted text (≤ 50k chars) — **`_shared/redact.ts` strips emails and identified names BEFORE anything is stored or embedded** (only redacted text persists; ambiguous tokens returned in `redaction.flagged` for the PM, never silently dropped). Requires `OPENAI_API_KEY` in Supabase Secrets.
- **`products`** — `GET` / `POST { name, description? }` / `PATCH ?id=` / `DELETE ?id=`. All through the RLS-bound client; delete also removes the product's sprint conversations.
- **`sessions`** — `POST { product_id, intake? }` creates a session + linked conversation, persists the intake as the first turn, and runs the Haiku stage classifier (`stage`, `stage_confidence`; failure is non-fatal → `classification_error: true`). A second concurrent sprint on the same product returns the existing one with `resumed: true`. `GET ?id= | ?product_id= |` (none). `PATCH ?id= { action: 'complete' | 'abandon', current_step? }` — completion generates the Haiku summary (stored on the session and as a `kind='summary'` message); invalid transitions → 409.
- **`assumptions`** — `GET ?id=` (one + full status history), `GET ?session_id= | ?product_id=` (list), `PATCH ?id= { confidence?, impact?, status?, is_prioritized? }` with strict validation. History rows come only from the DB trigger.
- **`assumption-mapping`** — `POST { session_id, intake? }`. Sonnet 4.6 extracts 5–12 scored assumptions from the intake (or the sprint conversation); strict JSON validation; malformed output → raw response logged server-side + 502 `{ error: 'malformed_model_output', retryable: true }`, nothing inserted. Every model call in these functions is recorded in `model_usage` via `_shared/usage.ts`.

### Required Supabase Secrets

- `ANTHROPIC_API_KEY` — used by `chat` (Claude calls)
- `OPENAI_API_KEY` — used by `ingest` (embeddings)
- `ALLOWED_ORIGINS` — comma-separated CORS allowlist
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected; consumed by `getServiceClient()`

## Ada's Coaching Persona (System Prompt)

Key constraints to preserve when editing the system prompt:
- Never validate assumptions — always pressure-test them
- Ask **one** focused follow-up question at a time (not a list)
- Keep responses concise: 2–4 sentences + one question
- Redirect non-discovery questions back to coaching context

## Frontend utilities to know about

- `src/lib/export.ts` — `exportConversation(meta, messages)` writes a markdown file (body messages, then a "Session Summary" section pulled from `kind === 'summary'` rows) and triggers a browser download. No server round-trip.
- `src/hooks/use-feedback.ts` — owns the DB write + Sonner toast for thumbs up/down on a single message; UI state stays with the caller.
- `src/lib/admin-api.ts` — thin client for all `admin-*` Edge Functions; throws `UnauthorizedError` if the session has no JWT. Also wraps the documents endpoints used by the admin Documents tab.

## Scripts

- `scripts/smoke-ingest.mjs` — end-to-end smoke test for the `ingest` Edge Function. Mints an owner JWT via `auth/admin/generate_link` (token_hash → email_otp fallback) and POSTs to `/functions/v1/ingest`. Run with `SUPABASE_URL`, `SERVICE_ROLE`, `ANON`, `OWNER_EMAIL`, `DOCUMENT_ID` env vars. Use this to verify a deployed `ingest` function before wiring it into the UI.

## Docs

- `docs/Ada_Coach_Backlog.md` — full backlog (source of truth for B-xxx IDs below)
- `docs/prds/` — weekly PRDs (read the Documents RAG Phase 2 PRD before touching `ingest`, `document_chunks`, or chunking/embedding logic)
- `docs/logs/` — working session log
- `docs/security-audit-2026-04-18.md` — auth/authz audit; tracks remediation status (lockdown migration + CORS allowlist already shipped in code)

## Backlog

Linear (team **Deus Labs**, project **Ada Coach**) is the source of truth for status.
Reconciled 2026-08-23.

Key future items that affect architecture decisions today:
- **B-003 / DEU-92**: Rate limiting per user. **Partially done.** The *usage cap* half shipped
  (credits system: `credits_remaining`, `daily_message_limit`, `fn_reset_credits_if_due`).
  True *rate* limiting — throttling requests per second on `/chat` and `admin-*` — was never
  built. Credits bound total daily spend; nothing bounds the rate.
Shipped (kept here because the IDs still appear in older docs):
- **B-002 / DEU-6**: Token usage dashboard — ✅ done. `chat` now calls `recordModelUsage()`;
  coaching-chat spend is visible in the admin Spend tab.
- **B-005 / DEU-9**: Vera → Ada Coach rebrand — ✅ done.
- **B-011 / DEU-96**: Migration history mismatch — ✅ done 2026-08-23. See the Migration
  workflow note in the Database Schema section above.

## Development Principles

### Single Responsibility
Every function, file, and component must do one clearly definable thing.
If you cannot describe its job in one sentence without using the word "and," refactor it into smaller units.
This applies to Edge Functions, React components, utility files, and SQL functions.
One job. One reason to change.

### Plan First
Use Plan Mode for any task that is 3 or more steps, touches the database schema, or makes an architectural decision.
Write the plan to tasks/todo.md with checkable items before writing any code.
Check in with the user before starting implementation.
Mark items complete as you go.
Add a review section to tasks/todo.md when done.

## Fable 5 sessions

For any Fable 5 or `/goal`-driven run, load the `fable5-prompting` skill
first, plus its `references/design-and-voice-philosophy.md` for anything
touching UI or interaction design. That reference is written mainly from
RecruiterOS, Argo, and CrackedHR examples (dashboards, pickers, dense
operational surfaces). Ada is a turn-based chat product, not a dashboard.
Apply the underlying principles (control near the object it affects,
minimal interaction travel cost, clear feedback on state changes) where
they genuinely transfer to chat and sidebar UI. Don't force dashboard-
specific patterns (multi-panel pickers, hover-reveal actions) onto a
conversational surface just because the doc describes them there.

Standing rule, negotiated 2026-07-03 (Kellan / Marcus / Priya): while Mo
is the sole user, ordinary RLS (Row-Level Security) and schema work goes
through normal Plan Mode review, no extra gate. Batch-audit with Opus or
Codex after the fact is fine. Hard trigger, non-negotiable: before any
real external user's data touches the app (beta, paid, or otherwise), a
full RLS/auth/isolation audit runs first, regardless of effort level or
goal state. This is the one thing that still pauses for review. It
satisfies "Plan First" above; it doesn't replace it.

### Scope Discipline
Only touch what is necessary to complete the requested task.
Do not refactor surrounding code unless explicitly asked.
Do not add unrequested features or "nice to have" improvements.
If you notice something worth fixing nearby, flag it as a separate suggestion after completing the task. Do not fix it unilaterally.

### No Speculation
Never guess at file paths, function names, API signatures, or schema column names.
Read the relevant file first, then answer or act.
If genuinely unsure, say so explicitly before proceeding.

### No Sycophancy
Do not validate the user's approach before answering.
Disagree when the user is wrong.
Do not change a correct answer because the user pushes back.
If the user overrides a recommendation and it introduces risk, note the risk once clearly and proceed.

### Verification — How to Hand Off Testing
When a task is complete, never auto-run tests or browser checks without being asked.
Instead, always conclude with a Verification section structured as follows:

**Verification**

How to test this manually:
1. [Step-by-step instructions written in plain language]

Expected result when working correctly:
- [What the user should see, read, or confirm at each step]

If Claude Code wants to assist with testing, suggest options like:
- "I can run the type-check with npm run type-check if you want"
- "I can open the browser with Claude in Chrome MCP if you have it connected"
- "I can query the database directly with the Supabase MCP if you want to verify the migration landed"

Do not run any of these without explicit user approval.

### PR Format
Every pull request description must include three sections:
- What this does
- Why we did it
- How to test it

## Search precedence for codebase questions

For any structural or architectural question (where does X live, what calls Y,
how does Z connect, what breaks if I change this), query graphify-out/graph.json
FIRST via /graphify query. If the graph can't answer it, use codebase-memory-mcp.
Use grep ONLY for literal string lookups the graph doesn't contain (an error
message, a config value, a specific column name). Do not grep to answer a
structural question when the graph exists.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

`graphify` is not on PATH on this machine — run it as `$(cat graphify-out/.graphify_python) -m graphify <args>` (the file holds the correct Python interpreter path).

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
