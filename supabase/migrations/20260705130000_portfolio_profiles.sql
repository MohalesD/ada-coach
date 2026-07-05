-- Discovery platform Run 4 — portfolio_profiles
-- The aspiring-PM portfolio coaching track's background bundle: resume
-- text, background, and optional target-role fields, extracted by Haiku
-- from redacted input (PRD Technical Flow step 2). One profile links to
-- one conversation, which carries both idea-generation output and the
-- artifact-coaching thread (Run 4 build decision: the PRD's endpoint
-- table put a session_id FK on portfolio_projects instead, but that
-- conflicts with endpoint 2 creating the conversation at profile-creation
-- time, before any project exists — resolved as a single conversation
-- per profile, reached by portfolio_projects via portfolio_profile_id).
--
-- RLS: own-rows select (NOT the documents/document_chunks role='owner'
-- pattern — this track serves every user, not just the owner). Writes
-- are service-role only: resume_text must pass through redactPII before
-- storage, and a direct authenticated INSERT via PostgREST would bypass
-- that entirely. Mirrors reports/blind_spots/model_usage.

create table portfolio_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  conversation_id   uuid not null unique references conversations(id) on delete cascade,
  resume_text       text,
  background        text,
  target_companies  text,
  target_archetype  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_portfolio_profiles_user
  on portfolio_profiles (user_id, created_at);

create trigger trg_portfolio_profiles_updated
  before update on portfolio_profiles
  for each row execute function set_updated_at();

alter table portfolio_profiles enable row level security;

create policy "users read own portfolio profiles"
  on portfolio_profiles for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access portfolio profiles"
  on portfolio_profiles for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the portfolio-sessions/portfolio-profile
-- functions), same reasoning as reports/blind_spots/model_usage.
revoke insert, update, delete on portfolio_profiles from authenticated;
