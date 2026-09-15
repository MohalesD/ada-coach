-- Admin reply tracking on user_feedback (Spec 2 / DEU-90).
--
-- Two nullable columns, additive only. `replied_at` is the marker that makes
-- a handled row visibly closed in the admin Feedback tab; `reply_body` keeps
-- what was actually sent, so the thread is readable later rather than living
-- only in Mo's sent folder.
--
-- No RLS or grant change. `authenticated` has SELECT plus INSERT on an
-- explicit column list and no UPDATE grant at all, so both columns are
-- service-role-write-only by construction -- the write happens inside the
-- admin-feedback-reply Edge Function. The table-wide SELECT grant does mean
-- the feedback's own author can read the reply sent to them via PostgREST
-- (RLS still scopes it to user_id = auth.uid()). That is intentional: it is
-- their own reply, and column-scoping the existing SELECT grant to hide it
-- would be a larger change than this feature warrants.
--
-- The length cap mirrors the one `user_feedback_contact_email` added for
-- `comment`: the client caps at 4,000 and the DB enforces the same, so a
-- direct write cannot outrun the UI's own limit.

alter table user_feedback
  add column replied_at timestamptz,
  add column reply_body text;

alter table user_feedback
  add constraint user_feedback_reply_body_len
  check (reply_body is null or char_length(reply_body) <= 4000);
