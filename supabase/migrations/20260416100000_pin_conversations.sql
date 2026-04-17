-- Add is_pinned to conversations
ALTER TABLE conversations
  ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;

-- Allow authenticated users to toggle is_pinned on their own conversations
-- (The existing UPDATE policy already covers the row; this policy is scoped
--  to just the is_pinned column so regular users can't change other fields
--  through RLS bypass. In practice the existing policy suffices because
--  the anon role is blocked entirely, but being explicit is safer.)
-- No additional RLS needed: the existing "users can update own conversations"
-- policy already permits UPDATE on any column for the row owner.
-- The service role bypasses RLS entirely and retains full access.
