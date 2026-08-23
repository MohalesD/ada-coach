-- Run 3 hardening — session file uploads for any authenticated user
-- Closes the Run 1 known gap (a hard prerequisite before any second real
-- user touches the app): the documents-bucket storage policies required
-- the owner ROLE, so only Mo could upload session files even though the
-- documents table and the ingest function were already session-ready.
--
-- The fix keeps the per-user path scoping — a user can only touch
-- objects under their own {user_id}/ folder — and drops the role check.
-- Global-corpus protection does not live in storage and is unchanged:
-- the documents TABLE keeps owner-role policies for global rows
-- (session_id IS NULL), and the ingest global path re-checks the owner
-- role in code. A non-owner can now store files but can only attach
-- them to sessions they own (the session-documents INSERT policy).

drop policy "owner upload to documents bucket" on storage.objects;
drop policy "owner read from documents bucket" on storage.objects;
drop policy "owner delete from documents bucket" on storage.objects;

create policy "users upload to own documents folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users read own documents folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete from own documents folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
