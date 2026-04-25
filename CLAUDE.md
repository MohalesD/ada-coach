# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Migrations in `supabase/migrations/` (applied in filename order):

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

## Ada's Coaching Persona (System Prompt)

Key constraints to preserve when editing the system prompt:
- Never validate assumptions — always pressure-test them
- Ask **one** focused follow-up question at a time (not a list)
- Keep responses concise: 2–4 sentences + one question
- Redirect non-discovery questions back to coaching context

## Frontend utilities to know about

- `src/lib/export.ts` — `exportConversation(meta, messages)` writes a markdown file (body messages, then a "Session Summary" section pulled from `kind === 'summary'` rows) and triggers a browser download. No server round-trip.
- `src/hooks/use-feedback.ts` — owns the DB write + Sonner toast for thumbs up/down on a single message; UI state stays with the caller.
- `src/lib/admin-api.ts` — thin client for all `admin-*` Edge Functions; throws `UnauthorizedError` if the session has no JWT.

## Docs

- `docs/Ada_Coach_Backlog.md` — full backlog (source of truth for B-xxx IDs below)
- `docs/prds/` — weekly PRDs
- `docs/logs/` — working session log
- `docs/security-audit-2026-04-18.md` — auth/authz audit; tracks remediation status (lockdown migration + CORS allowlist already shipped in code)

## Backlog

Key future items that affect architecture decisions today:
- **B-002**: Token usage dashboard — `token_count` column already exists on `messages` (shipped in `core_schema`); needs an admin view to surface it.
- **B-003**: Rate limiting per user.
- **B-005**: Rebrand any remaining "Vera" references to "Ada" / "Ada Coach".
