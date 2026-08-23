-- PostgreSQL helper for RAG retrieval in the chat Edge Function.
-- Called via service.rpc('match_document_chunks', { query_embedding, match_threshold, match_count }).
-- Returns content + cosine similarity for the top-N chunks across 'ready'
-- documents, pre-filtered by a minimum similarity threshold.

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
    and 1 - (document_chunks.embedding <=> query_embedding) >= match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
