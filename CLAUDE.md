# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Type-check + production build
npm run lint       # ESLint
npm run lint:fix   # ESLint with auto-fix
npm run type-check # TypeScript check only (no emit)
npm run test       # Vitest
npm run format     # Prettier (src/**)
```

## Project Overview

Ada Coach is an AI-powered Customer Discovery Coach for product managers. She pressure-tests assumptions, reframes leading questions, and guides PMs toward genuine customer insights using discovery frameworks (JTBD, Five Whys, assumption mapping).

**Current status:** Week 2 of a Maven AI Coding course (Rajesh Pentakota). The Week 1 deliverable was a Wizard of Oz prototype (landing page + rotating static responses). Week 2 transforms it into a real MVP with Claude API integration via Supabase.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React + Tailwind CSS |
| Backend | Supabase Edge Functions (Deno runtime) |
| Database | Supabase Postgres |
| AI | Claude API — `claude-haiku-4-5-20251001` for MVP responses |
| Vector Search | pgvector (Layer 2 only) |
| Embeddings | OpenAI `text-embedding-3-small` (Layer 2 only — Claude has no embedding endpoint) |
| Deployment | Vercel (frontend) + Supabase (backend) |

## Architecture

**Data flow:**
```
Browser → React Frontend → Supabase Edge Function (/chat)
                               ↓
                   Anthropic Claude API (ANTHROPIC_API_KEY from Supabase Secrets)
                               ↓
                   Supabase Postgres (conversations, messages, coaching_prompts)
```

**Why Supabase Edge Functions (not Express or Vercel Functions):**
- API keys stay in Supabase Secrets — never in `.env` or frontend code
- Deno runtime: secure by default (no filesystem/network unless granted)
- Database and functions in the same ecosystem (lower latency, less config)
- pgvector is native Postgres — no Pinecone or external vector DB needed

## Database Schema

**Migration 001 (Layer 1 — Core MVP):**
- `conversations` — coaching sessions (id, title, status: active/archived/deleted)
- `messages` — individual turns (role: user/assistant/system, content, token_count)
- `coaching_prompts` — versioned system prompts with `is_active` flag (only one active at a time)

**Migration 002 (Layer 2 — RAG stretch goal):**
- `documents` — full text of ingested PM docs (product_brief, interview_notes, research, general)
- `document_chunks` — 300-word chunks with 50-word overlap, `embedding VECTOR(1536)` column

**RLS posture:** Service role (Edge Functions) has full CRUD. Anon role is blocked entirely. No user auth in MVP — that's a Week 3+ feature (B-001).

## Edge Functions

- **`/chat`** — Accepts `{ message, conversation_id? }`. Fetches active prompt, last 20 messages for context, calls Claude, stores both turns, returns `{ reply, conversation_id, message_id }`. Layer 2 adds embedding + pgvector retrieval before calling Claude.
- **`/ingest`** (Layer 2) — Chunks text, generates OpenAI embeddings, stores in `document_chunks`.
- **`/admin/conversations`** — GET (list with message counts), DELETE (archive).
- **`/admin/conversations/:id`** — GET (full message history).
- **`/admin/prompts`** — GET/POST/PUT/DELETE for coaching prompt management.

Admin endpoints are protected by a shared secret (admin password stored as a Supabase secret), not full auth.

## Ada's Coaching Persona (System Prompt v1)

Key constraints to preserve when editing the system prompt:
- Never validate assumptions — always pressure-test them
- Ask **one** focused follow-up question at a time (not a list)
- Keep responses concise: 2–4 sentences + one question
- Redirect non-discovery questions back to coaching context

## Frontend

The existing landing page has a demo chat widget with a bouncing-dot loading animation. Week 2 changes:
1. Replace rotating static responses with live `/chat` Edge Function calls
2. Multi-turn conversation state within a session
3. "New Conversation" button
4. `/admin` route (unlinked from nav) — conversation browser + prompt editor with version history + (Layer 2) document upload panel

## Backlog (tracked here until Linear workspace is set up April 14, 2026)

Key future items that affect architecture decisions today:
- **B-001** (Week 3–4): Role hierarchy — user/manager/admin/owner. Owner = Mo, can change app-wide settings without deploys. Design schema with this in mind; avoid hardcoding admin assumptions.
- **B-002** (Week 3): Token usage dashboard — `token_count` column on `messages` is already planned for this.
- **B-003** (Week 4): Rate limiting per user — depends on B-001 and auth.
- **B-005** (post-Week 2): Rebrand any remaining "Vera" references to "Ada" / "Ada Coach".
