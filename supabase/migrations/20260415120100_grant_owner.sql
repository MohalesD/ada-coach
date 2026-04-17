-- Ada Coach owner bootstrap (Migration 004)
-- Idempotent: promotes Mo's account to the 'owner' role.
-- Safe to run before signup (no-op) or after (sets the role).
-- Re-run after signup if signup happened after this migration.

update user_profiles
   set role = 'owner'
 where email = 'mohalesdeis@gmail.com';
