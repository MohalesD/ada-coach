-- Document chunks table for Ada's RAG retrieval.
--
-- Each row is one chunk of a parent document, paired with its embedding
-- vector for cosine similarity search at query time. Populated by the
-- Phase 2 chunking/embedding pipeline (service role) after a document
-- transitions from 'uploaded' to 'ready'.
--
-- Embedding dimension is 1536 to match OpenAI text-embedding-3-small.

create table document_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents(id) on delete cascade,
  chunk_index  integer not null,
  content      text not null,
  embedding    extensions.vector(1536),
  created_at   timestamptz not null default now()
);

-- Approximate-NN index for cosine similarity search.
-- ivfflat requires ANALYZE after bulk loads to pick good list assignments.
create index idx_document_chunks_embedding
  on document_chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

create index idx_document_chunks_document
  on document_chunks (document_id, chunk_index);

-- ── RLS: owner-only, mirroring documents table ───────────────────────────────

alter table document_chunks enable row level security;

create policy "owner read document_chunks"
  on document_chunks for select to authenticated
  using (
    exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
        and d.user_id = auth.uid()
    )
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );

create policy "owner create document_chunks"
  on document_chunks for insert to authenticated
  with check (
    exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
        and d.user_id = auth.uid()
    )
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );

-- Service role retains full access for the Phase 2 embedding pipeline.
create policy "service_role full access document_chunks"
  on document_chunks for all to service_role
  using (true) with check (true);

-- No UPDATE grant for authenticated: chunks are immutable from the client.
revoke update on document_chunks from authenticated;
