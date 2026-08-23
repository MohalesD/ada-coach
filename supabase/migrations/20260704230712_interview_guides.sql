-- Discovery platform Run 2 — Mom Test interview guides
-- Versioned per session (PRD step 10: "stores the guide as a versioned
-- document linked to the session"). Regeneration inserts version + 1 and
-- never mutates a prior version — the PM may be holding an older guide
-- in a live interview, so history is append-only.
--
-- RLS mirrors model_usage: read-own, service-role-only writes.

create table interview_guides (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  session_id     uuid not null references sessions(id) on delete cascade,
  version        integer not null check (version >= 1),
  content_md     text not null,
  question_count integer,
  created_at     timestamptz not null default now(),
  unique (session_id, version)
);

create index idx_interview_guides_session
  on interview_guides (session_id, version desc);

alter table interview_guides enable row level security;

create policy "users read own interview guides"
  on interview_guides for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access interview_guides"
  on interview_guides for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the interview-guide function).
revoke insert, update, delete on interview_guides from authenticated;
