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

> **Migration workflow caveat (B-011):** `supabase db push` currently errors with "Remote migration versions not found in local migrations directory." Several recent migrations were applied via the Supabase MCP `apply_migration` tool, which registers them with timestamps that don't match the local filenames. Until B-011 is resolved, **apply new migrations via the MCP `apply_migration` tool**, not `supabase db push`. Commit the local `.sql` file alongside as the source of truth. Do not run `supabase migration repair` or `supabase db pull` without a planned cleanup — both touch shared migration history.



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

- **`chat`** — `POST { message, conversation_id? }`. Verifies ownership (RLS), fetches active prompt + last 20 messages, calls Claude, persists both turns, returns `{ reply, conversation_id, message_id, kind }`. Tags assistant messages with `coaching_prompt_id` (for analytics).
  - **Summary sentinel**: when `message === '__SUMMARY__'`, the function swaps in `SUMMARY_SYSTEM_PROMPT`, requires an existing `conversation_id`, **does not** persist the synthetic user turn, and stores the assistant reply with `kind = 'summary'`. Anthropic requires a trailing user turn, so a non-persisted directive is appended to the request only.
- **`admin-conversations`** — `GET` (list with counts), `GET ?id=` (full messages), `PATCH ?id=` (update status). Requires admin/owner.
- **`admin-prompts`** — `GET` (list), `POST` (create, auto-versions), `POST ?id=&action=activate`, `PUT ?id=` (update), `DELETE ?id=` (blocked if active). Requires admin/owner.
- **`admin-insights`** — `GET` returns aggregated feedback analytics (totals, positive/negative rates, per-conversation, per-prompt, top 5 positive/negative messages, recent 10 events). Aggregation is in-memory using the service client; if the dataset grows, move to Postgres aggregations or a materialized view.
- **`ingest`** — `POST { document_id }`. **Owner-only** (admin alone is rejected with 403). Downloads the file from the `documents` Storage bucket, extracts text (PDF via `unpdf`, plain text via `Blob.text()`), runs a sentence-aware chunker (~300 words / ~50 word overlap), embeds in batches of 96 against OpenAI `text-embedding-3-small`, deletes any prior chunks for that `document_id`, inserts new rows into `document_chunks`, and transitions the document `'uploaded' → 'processing' → 'ready'`. Any failure rolls back chunks and marks the document `'error'`. Re-ingestable: a second invocation produces the same end state, not duplicates. Requires `OPENAI_API_KEY` in Supabase Secrets.

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

Key future items that affect architecture decisions today:
- **B-002**: Token usage dashboard — `token_count` column already exists on `messages` (shipped in `core_schema`); needs an admin view to surface it.
- **B-003**: Rate limiting per user.
- **B-005**: Rebrand any remaining "Vera" references to "Ada" / "Ada Coach".

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

No Co-Authored-By: Claude line in any commit message, ever.
