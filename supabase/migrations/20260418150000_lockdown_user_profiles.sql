-- Lock down user_profiles writes: authenticated users can only update display_name.
--
-- Without this, the existing "users update own profile" RLS policy (which gates on
-- id = auth.uid()) would allow a logged-in user to UPDATE their own row's `role`
-- column and self-elevate to 'admin' or 'owner'. requireAdmin() re-reads the role
-- from the DB on every call, so a successful self-elevation would grant real
-- admin powers across all Edge Functions.
--
-- Mirrors the column-grant pattern already used for messages.feedback in
-- 20260418100000_message_feedback.sql.
--
-- service_role retains full access via the existing
-- "service_role full access user_profiles" policy + default grants, so admin
-- functions and the handle_new_user() SECURITY DEFINER trigger are unaffected.

revoke update on user_profiles from authenticated;
grant update (display_name) on user_profiles to authenticated;
