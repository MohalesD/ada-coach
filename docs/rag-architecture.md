# Ada Coach: Retrieval-Augmented Coaching Pipeline

A short technical overview of the RAG (retrieval-augmented generation) system built into Ada Coach, an AI customer-discovery coach for product managers.

## Why RAG, here

Ada coaches PMs through customer discovery using frameworks like Jobs-to-be-Done and the Five Whys. Generic LLM knowledge covers these frameworks reasonably well, but the hypothesis behind this system is that grounding her responses in a curated body of customer-development literature makes her coaching more specific and less generic — citing concrete techniques and pitfalls rather than restating framework names. That hypothesis is being tested with a formal A/B evaluation before the feature ships to users (see [Status](#status-mid-evaluation) below).

## Pipeline

```
Owner uploads PDF/text
        │
        ▼
  Storage (private bucket)
        │
        ▼
   Ingest function ── extract text → chunk → embed → store
        │
        ▼
  document_chunks (Postgres + pgvector)
        │
        ▼
Chat turn arrives ── embed query → cosine similarity search → top-N chunks
        │
        ▼
  Inject into system prompt → Claude generates response
```

### 1. Ingestion

An owner uploads a PDF or plain-text file through the admin panel. A Supabase Storage bucket (private, 50 MB cap) holds the raw file; a Postgres row in `documents` tracks its lifecycle through a small state machine: `uploaded → processing → ready | error`.

An Edge Function downloads the file, extracts text (PDF via `unpdf`, plain text directly), and hands it to the chunking step. Failure at any point rolls the document back to `error` rather than leaving a half-processed record — re-ingestion is just re-running the same function.

### 2. Chunking

Text is split sentence-aware, into ~300-word chunks with a 50-word overlap between consecutive chunks (so a concept split across a sentence boundary isn't orphaned in one chunk). A minimum chunk size prevents tiny trailing fragments from becoming their own low-signal chunk — those get merged into the previous one.

### 3. Embedding

Each chunk is embedded with OpenAI's `text-embedding-3-small` (1536 dimensions), sent in batches. The embeddings are stored alongside the chunk text in a `document_chunks` table, using Postgres's `pgvector` extension with an `ivfflat` index over cosine distance.

### 4. Retrieval

On a chat turn, the PM's message is embedded with the same model. A single SQL function, `match_document_chunks`, runs a cosine-similarity search against all chunks belonging to `ready` documents and returns the top matches above a similarity threshold (currently 0.60), ordered by similarity. This is a plain SQL function, not a black box — the score returned is `1 - cosine_distance`, so 1.0 is an exact match and scores below the threshold are simply excluded.

### 5. Injection

Matched chunks are concatenated (with a hard character budget, capped to roughly 4,000 tokens) and prepended to Ada's system prompt behind an explicit instruction: use this background knowledge, but never reveal that a knowledge base, document upload, or retrieval step exists. The illusion that matters here is coaching authenticity — a PM should experience Ada as knowledgeable, not as a wrapper around a document search.

## Isolation model

Two corpora share the same pipeline and tables but never mix:

- **Global corpus** — documents with no session attached. Visible to every chat turn, owner-managed only.
- **Session-scoped documents** — a PM can paste text or upload a document scoped to their own Discovery Sprint session. These are searched by a separate function, `match_session_chunks`, filtered to that session's `id`, and are excluded from the global search entirely.

This split exists so a PM's private session notes never leak into another PM's coaching context, and so the owner's curated corpus never gets diluted by session-specific text.

## Status: mid-evaluation

As of this writing, retrieval and injection are implemented and correct, but **the injection step is disabled in production** behind a code comment (`ARM B EVAL: RAG DISABLED`). The system is mid-way through a structured A/B evaluation: Arm A (RAG on) vs. Arm B (RAG off, today's live behavior), scored across 15 hand-picked questions spanning high, medium, and low retrieval relevance (see `docs/eval/20260502_ADA_EVAL_RAGEvalHarness_v0.1.md`). The retrieval query itself, and a debug view in the admin panel, can both be exercised live without flipping that flag — which is how this evaluation gets real evidence before the feature ships.

The decision to ship Arm A depends on whether grounded responses score meaningfully higher on specificity and coaching value than ungrounded ones, without ever surfacing the retrieval mechanism to the PM — a critical-fail condition in the rubric if it happens even once.
