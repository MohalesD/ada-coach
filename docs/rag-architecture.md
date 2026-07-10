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

## Status: live — Arm A shipped 2026-07-10, eval ended

**Update 2026-07-10:** the decision below was made — production ships at 0.45, and the `ARM B EVAL: RAG DISABLED` gate has been removed from `chat/index.ts`. Retrieval and injection are live in production coaching chat. The A/B eval this section describes is now historical context for *why* 0.45, not a description of current status.

As of the eval described below, retrieval and injection were implemented and correct, but **the injection step was disabled in production** behind a code comment (`ARM B EVAL: RAG DISABLED`). The system was mid-way through a structured A/B evaluation: Arm A (RAG on) vs. Arm B (RAG off, then-live behavior), scored across 15 hand-picked questions spanning high, medium, and low retrieval relevance (see `docs/eval/20260502_ADA_EVAL_RAGEvalHarness_v0.1.md`). The retrieval query itself, and a debug view in the admin panel, could both be exercised live without flipping that flag — which is how this evaluation got real evidence before the feature shipped.

**A first full regression run (`docs/eval/results/rag-regression-2026-07-07T04-39-02-466Z.md`) surfaced a finding that has to be resolved before the eval can answer its own question: at the production similarity threshold of 0.60, only 1 of the 15 questions retrieved any chunks at all.** The other 14 got zero chunks, so Arm A and Arm B received the *identical* system prompt for those — they aren't a RAG-on/RAG-off comparison, they're two independent samples of RAG-off, and any difference between them is sampling noise, not a retrieval effect. The one true pair (Q07) did retrieve — top similarity 0.690 — but a single data point can't carry the harness's Tier-1 success threshold (a mean delta across 7 questions).

The likely cause: `text-embedding-3-small` tends to compress topically-related-but-differently-phrased text into cosine similarities in the 0.3–0.5 range, well under 0.60, even when the content is genuinely relevant (the corpus's best match for "What should I do when a customer tells me they love my idea?" topped out at 0.517). The 0.60 threshold may be filtering out useful context, not just noise.

**This means the decision to ship Arm A can't be made from the 0.60 run alone.** A follow-up sweep at 0.35 / 0.45 / 0.55 / 0.60 (same 15 questions, same corpus) confirms the pattern is real and monotonic, not noise:

| Threshold | Questions with ≥1 chunk retrieved |
|---|---|
| 0.35 | 12 / 15 |
| 0.45 | 9 / 15 |
| 0.55 | 5 / 15 |
| 0.60 (production default) | 1 / 15 |

Lowering the threshold does produce real, gradable A/B pairs — at 0.35, every Tier 1 (high-relevance) and Tier 2 (medium-relevance) question retrieves at least one chunk, while 3 of the 4 Tier 3 (off-topic/adversarial) questions correctly retrieve nothing. That's the shape the harness was designed to score: retrieval firing where it should and staying quiet where it shouldn't. One Tier 3 question ("I'm feeling burned out — should I take a break from my startup?") retrieved 2 chunks even at 0.35, which is worth a manual look — either the corpus genuinely covers founder resilience, or this is exactly the over-triggering the harness's authenticity dimension exists to catch.

The eval owner should score the 0.35 (or 0.45) run against the harness rubric, not the 0.60 run — that's where the hypothesis is actually testable. Whatever threshold ships, the same critical-fail condition applies: grounded responses must never surface the retrieval mechanism to the PM.
