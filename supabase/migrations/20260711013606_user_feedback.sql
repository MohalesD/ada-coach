-- Unified feedback events — one row per user-submitted feedback item:
-- FAB / Settings submissions (bug, feedback, praise) and message thumb
-- ratings (message_rating). messages.feedback stays the per-message UI
-- state (and feeds the existing Insights aggregation); this table is the
-- append-only event log behind the admin Feedback tab.
--
-- Security model (mirrors folders RLS + message_feedback lockdown):
--   - Users insert and read only their own rows. No client UPDATE/DELETE.
--   - Column-level INSERT grant: clients cannot forge id/created_at.
--   - service_role full access (admin-feedback Edge Function reads all).
--   - Trust boundary: a message_rating row must carry a rating.

create table user_feedback (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  feedback_type  text not null check (feedback_type in
                   ('bug', 'feedback', 'praise', 'message_rating')),
  rating         text check (rating is null or rating in ('up', 'down')),
  message_id     uuid references messages(id) on delete set null,
  source_surface text not null,
  comment        text,
  created_at     timestamptz not null default now(),
  check (feedback_type <> 'message_rating' or rating is not null)
);

create index idx_user_feedback_created
  on user_feedback (created_at desc);

-- Lock down client writes to INSERT on explicit columns only.
revoke all on user_feedback from anon;
revoke all on user_feedback from authenticated;
grant select on user_feedback to authenticated;
grant insert (user_id, feedback_type, rating, message_id, source_surface, comment)
  on user_feedback to authenticated;

alter table user_feedback enable row level security;

create policy "users insert own feedback"
  on user_feedback for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users read own feedback"
  on user_feedback for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access user_feedback"
  on user_feedback for all
  to service_role
  using (true) with check (true);
