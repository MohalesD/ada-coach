-- Feedback follow-up (Phase 2): optional contact email on user_feedback.
-- Users are signed in, so we already know their account email — this
-- column exists for the "I want to be heard, reach me HERE" case (a
-- different address than the login, or an explicit opt-in to follow-up).
-- NULL means no follow-up requested; the form treats it as opt-in.
--
-- Also closes the Phase 1 accepted-risk item: a DB-side length cap on
-- comment (client caps at 4,000; the DB now enforces it too).

alter table user_feedback
  add column contact_email text
  check (contact_email is null or char_length(contact_email) <= 320);

alter table user_feedback
  add constraint user_feedback_comment_len
  check (comment is null or char_length(comment) <= 4000);

-- Column-level INSERT grants are per-column: extend the allowed list.
grant insert (contact_email) on user_feedback to authenticated;
