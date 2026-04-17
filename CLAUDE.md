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

**Current status:** Maven AI Coding course project (Rajesh Pentakota). Week 1 was a Wizard of Oz prototype. Week 2 delivered the real MVP with Claude API integration, multi-turn chat, conversation sidebar, admin panel, and Supabase Auth.

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
| `/login` | `Login` | Public |
| `/` | `Index` (chat + sidebar) | Authenticated |
| `/admin` | `Admin` (conversations + prompts) | Admin/Owner only |

Admin link appears in the chat header only for admin/owner users. The admin panel uses `src/lib/admin-api.ts` which forwards the user's JWT to admin Edge Functions.

## Database Schema

Four migrations in `supabase/migrations/`:

**Core tables (001):**
- `conversations` — coaching sessions (id, title, status, user_id, timestamps)
- `messages` — individual turns (role: user/assistant/system, content, token_count)
- `coaching_prompts` — versioned system prompts with `is_active` flag (exactly one active)

**Auth tables (003):**
- `user_profiles` — id (FK → auth.users), email, display_name, role (user/admin/owner)
- Auto-created by `handle_new_user()` trigger on `auth.users` insert
- `conversations.user_id` — FK → auth.users, added as NOT NULL

**RLS posture:**
- Authenticated users see only their own conversations/messages (via `user_id = auth.uid()`)
- Authenticated users can read only the active coaching prompt
- Service role has full access (used by Edge Functions for trusted writes)
- Anon role has no policies (blocked entirely)

## Edge Functions

All functions require a valid Supabase Auth JWT.

- **`chat`** — `POST { message, conversation_id? }`. Verifies user ownership of conversation (via RLS), fetches active prompt + last 20 messages, calls Claude, persists both turns, returns `{ reply, conversation_id, message_id }`.
- **`admin-conversations`** — `GET` (list with counts), `GET ?id=` (full messages), `PATCH ?id=` (update status). Requires admin/owner role.
- **`admin-prompts`** — `GET` (list), `POST` (create, auto-versions), `POST ?id=&action=activate`, `PUT ?id=` (update), `DELETE ?id=` (blocked if active). Requires admin/owner role.

## Ada's Coaching Persona (System Prompt)

Key constraints to preserve when editing the system prompt:
- Never validate assumptions — always pressure-test them
- Ask **one** focused follow-up question at a time (not a list)
- Keep responses concise: 2–4 sentences + one question
- Redirect non-discovery questions back to coaching context

## Backlog

Key future items that affect architecture decisions today:
- **B-002** (Week 3): Token usage dashboard — `token_count` column on `messages` is already planned for this.
- **B-003** (Week 4): Rate limiting per user.
- **B-005** (post-Week 2): Rebrand any remaining "Vera" references to "Ada" / "Ada Coach".
