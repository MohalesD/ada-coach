-- Discovery platform Run 1 — session-scoped documents
-- Extends the existing documents/document_chunks pipeline (PRD v2 change
-- #2: extend, don't build a parallel system). A document with a non-null
-- session_id is session-scoped: owned by the session's PM (any
-- authenticated user, not just the owner role), searchable only via
-- match_session_chunks, auto-purged when its session's conversation is
-- deleted (conversation -> session -> document -> chunks cascade).
-- Global corpus rows keep session_id IS NULL and remain owner-role-only.

alter table documents
  add column session_id uuid references sessions(id) on delete cascade;

create index idx_documents_session
  on documents (session_id)
  where session_id is not null;

-- ── Per-user RLS for session-scoped rows (additive; the existing
--    owner-role policies continue to govern global rows) ─────────────────

create policy "users read own session documents"
  on documents for select
  to authenticated
  using (session_id is not null and user_id = auth.uid());

create policy "users create own session documents"
  on documents for insert
  to authenticated
  with check (
    session_id is not null
    and user_id = auth.uid()
    and exists (
      select 1 from sessions s
      where s.id = documents.session_id
        and s.user_id = auth.uid()
    )
  );

create policy "users delete own session documents"
  on documents for delete
  to authenticated
  using (session_id is not null and user_id = auth.uid());

create policy "users read own session chunks"
  on document_chunks for select
  to authenticated
  using (
    exists (
      select 1 from documents d
      where d.id = document_chunks.document_id
        and d.session_id is not null
        and d.user_id = auth.uid()
    )
  );

-- ── Retrieval isolation ──────────────────────────────────────────────────

-- Global RAG search now explicitly excludes session-scoped documents.
create or replace function match_document_chunks(
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count     int
)
returns table (content text, similarity float)
language sql stable
as $$
  select
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  join documents on document_chunks.document_id = documents.id
  where documents.status = 'ready'
    and documents.session_id is null
    and 1 - (document_chunks.embedding <=> query_embedding) >= match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- Session-scoped search: only chunks belonging to this session's ready
-- documents. Callers (Edge Functions using the service client) must verify
-- the requesting user owns p_session_id before calling.
create or replace function match_session_chunks(
  p_session_id    uuid,
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count     int
)
returns table (content text, similarity float)
language sql stable
as $$
  select
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  join documents on document_chunks.document_id = documents.id
  where documents.session_id = p_session_id
    and documents.status = 'ready'
    and 1 - (document_chunks.embedding <=> query_embedding) >= match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
