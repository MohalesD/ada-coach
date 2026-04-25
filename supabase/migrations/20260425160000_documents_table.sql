-- Documents table and storage bucket for Ada's RAG knowledge base.
--
-- Documents are a private owner-managed knowledge base that augments Ada's
-- coaching intelligence. No other role has access by design.
--
-- Phase 1: upload + storage only (status stays 'uploaded').
-- Phase 2 will add chunking/embedding logic that transitions status through
-- 'processing' → 'ready' | 'error' and populates chunk_count via service role.

create table documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  filename      text not null,
  file_path     text not null,    -- storage path: {user_id}/{uuid}_{filename}
  content_text  text,             -- nullable; populated in Phase 2 by chunker
  created_at    timestamptz not null default now(),
  status        text not null default 'uploaded'
                  check (status in ('uploaded', 'processing', 'ready', 'error')),
  chunk_count   integer           -- nullable; set in Phase 2
);

create index idx_documents_user
  on documents (user_id, created_at desc);

-- ── RLS: owner-only ──────────────────────────────────────────────────────────

alter table documents enable row level security;

create policy "owner read documents"
  on documents for select to authenticated
  using (
    user_id = auth.uid()
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );

create policy "owner create documents"
  on documents for insert to authenticated
  with check (
    user_id = auth.uid()
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );

create policy "owner delete documents"
  on documents for delete to authenticated
  using (
    user_id = auth.uid()
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );

-- Service role retains full access for Phase 2 status transitions.
create policy "service_role full access documents"
  on documents for all to service_role
  using (true) with check (true);

-- No UPDATE grant for authenticated: status and chunk_count are set by
-- service role only. Authenticated users have no update path in Phase 1.
revoke update on documents from authenticated;

-- ── Storage bucket ───────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,
  array['application/pdf', 'text/plain']
);

create policy "owner upload to documents bucket"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );

create policy "owner read from documents bucket"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );

create policy "owner delete from documents bucket"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (select role from user_profiles where id = auth.uid()) = 'owner'
  );
