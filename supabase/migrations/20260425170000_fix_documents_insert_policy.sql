-- Fix: replace scalar-subquery INSERT policy on documents with EXISTS pattern.
--
-- The original scalar subquery (select role from user_profiles where id = auth.uid())
-- can return NULL instead of FALSE when there is no matching row, causing the
-- WITH CHECK to fail even for a valid owner. EXISTS evaluates to a boolean directly.

drop policy if exists "owner create documents" on documents;

create policy "owner insert documents"
  on documents for insert to authenticated
  with check (
    exists (
      select 1 from user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role = 'owner'
    )
  );
