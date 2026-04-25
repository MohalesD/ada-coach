# Project Ada, Week 4 PRD

### RAG Document Upload Module (TDD-Driven)

**Author:** Mohales "Mo" Deis  **Date:** April 25, 2026  **Course:** AI Coding for Product Managers (Maven, Rajesh Pentakota)  **Status:** Planning — implementation stubs only

---

## 1. Problem Statement

Ada currently coaches from Claude's general knowledge. A PM can describe their product, but Ada has no access to the actual artifact — the product brief, interview notes, or assumption map sitting in the PM's Notion or Drive. The coaching is useful but generic.

RAG (Retrieval-Augmented Generation) fixes this: Ada retrieves the most relevant passages from documents the PM has uploaded and injects them into the coaching context. The coaching becomes specific: "In your brief you listed three user segments — have you validated all three, or are some still assumptions?"

---

## 2. Scope

**In scope for Week 4:**
- Admin uploads a text document (paste or file) → chunked, embedded, stored in Supabase
- `/chat` retrieves top-k relevant chunks per user turn and injects them into the system prompt
- Basic admin UI to view/delete uploaded documents

**Out of scope:**
- Per-user document uploads (admin-only for now)
- PDF parsing, URL ingestion
- Streaming responses
- Surfacing source citations in the chat UI

---

## 3. Expected Behavior

### Upload flow
1. Admin pastes or uploads a text document in the admin panel.
2. System chunks the document (~300 words, 50-word overlap), generates an embedding per chunk, stores chunks + embeddings in `document_chunks`.
3. Admin sees the document listed with chunk count and creation date.
4. Admin can delete a document (cascades to all its chunks).

### Retrieval flow
1. User sends a message in chat.
2. System embeds the user message, queries `document_chunks` for top-3 nearest chunks by cosine similarity.
3. If similarity score exceeds threshold (≥ 0.75), chunks are injected into the system prompt as a "Documents" context block.
4. Ada's response may reference the injected context; the response format is unchanged.
5. If no chunks exceed the threshold, chat proceeds with no document context (graceful degradation).

### Edge cases
- No documents uploaded → chat works normally, no retrieval attempted.
- Document upload with zero chunks produced → error returned, nothing stored.
- Embedding API failure → upload fails with clear error; no partial state written.

---

## 4. Test Cases (TDD)

Write these tests before implementation. Mark each ✅ when passing.

### Ingestion
- [ ] **T-01** Uploading a 1000-word document produces ≥ 3 chunks, each ≤ 350 words
- [ ] **T-02** Each chunk has a non-null embedding of the correct dimension (1536 for `text-embedding-3-small`)
- [ ] **T-03** Deleting a document cascades — all its chunks are removed from `document_chunks`
- [ ] **T-04** Uploading an empty string returns a 400 with `{ error: "Document content is required" }`
- [ ] **T-05** Embedding API failure returns 500 and writes nothing to the DB (no partial state)

### Retrieval
- [ ] **T-06** A user message about "task management for freelancers" returns chunks from a document that discusses freelancers and task management; irrelevant documents produce no results
- [ ] **T-07** When no documents exist, chat returns a valid Ada response with no retrieval errors
- [ ] **T-08** Chunks below the similarity threshold (< 0.75) are not injected into the prompt
- [ ] **T-09** The system prompt with injected chunks does not exceed 4000 tokens (guards against context overflow)
- [ ] **T-10** Two chunks from the same document are deduplicated if they overlap significantly (> 80% token overlap)

### Admin UI
- [ ] **T-11** Uploaded document appears in the document list within 3 seconds
- [ ] **T-12** Document list shows title, chunk count, and upload date
- [ ] **T-13** Delete button removes the document and its chunks; the list refreshes

---

## 5. Output Schema

### New tables (migration: `20260425_rag_schema.sql`)

```sql
-- Enable pgvector (check first: SELECT * FROM pg_extension WHERE extname = 'vector')
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT NOT NULL,
  doc_type     TEXT DEFAULT 'general' CHECK (doc_type IN ('product_brief', 'interview_notes', 'research', 'general')),
  char_count   INTEGER,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE document_chunks (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id  UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  chunk_text   TEXT NOT NULL,
  embedding    VECTOR(1536),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chunks_embedding ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### New Edge Function: `ingest`

**Request:** `POST { title, content, doc_type? }`

**Response:**
```json
{
  "document_id": "uuid",
  "chunk_count": 7,
  "char_count": 2840
}
```

### Modified Edge Function: `chat`

No change to the request/response shape. Retrieval is transparent to the frontend. The only observable difference: Ada's replies may reference document content.

---

## 6. Implementation Stubs

> Fill these in during the build session.

### 6A. Confirm pgvector is enabled
```bash
# _STUB_: run and confirm output before writing migration
supabase extensions list
```

### 6B. Embedding model decision
- Proposed: `text-embedding-3-small` (OpenAI, 1536-dim, $0.02/1M tokens)
- Alternative: wait for Anthropic embeddings API
- **Decision:** _STUB_

### 6C. Chunking strategy
- Proposed: 300-word chunks, 50-word overlap, split on sentence boundaries
- Implementation: _STUB_ (write chunker utility in `supabase/functions/_shared/chunker.ts`)

### 6D. `/ingest` Edge Function
_STUB_ — implement after T-01 through T-05 are written

### 6E. Retrieval in `/chat`
_STUB_ — implement after T-06 through T-10 are written

### 6F. Admin UI
_STUB_ — new tab in `/admin`, implement after backend is green

---

## 7. Open Questions

1. Is `pgvector` already enabled on the production Supabase project? (`supabase extensions list`)
2. Do source documents exist, or do they need to be authored? Minimum viable set: one JTBD primer + one assumption-mapping guide.
3. Should retrieval be per-conversation (only inject context from documents the PM explicitly linked) or global (all documents for all users)? Week 4 default: global admin-uploaded docs.
4. Token budget for injected context: 4000 tokens proposed — does that leave enough room for Ada's 2–4 sentence responses at Haiku's context limit?
