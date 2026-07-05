-- Discovery platform Run 2 — blind spot analysis
-- One row per blind spot surfaced by the blind-spots Edge Function
-- (Sonnet 4.6, Socratic questioning grounded in retrieved evidence and
-- the PM's own documents). assumption_id links the blind spot to its
-- source assumption (PRD step 8); SET NULL so deleting one assumption
-- doesn't erase the insight. evidence_backed distinguishes claims backed
-- by web evidence from Socratic-only reasoning — the report labels the
-- two differently (PRD integrations edge case), and every evidence_backed
-- row must carry at least one source URL.
--
-- RLS mirrors model_usage: read-own, service-role-only writes.

create table blind_spots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  session_id        uuid not null references sessions(id) on delete cascade,
  assumption_id     uuid references assumptions(id) on delete set null,
  statement         text not null,
  socratic_question text,
  evidence_backed   boolean not null default false,
  source_urls       text[] not null default '{}',
  created_at        timestamptz not null default now()
);

alter table blind_spots
  add constraint blind_spots_evidence_has_sources
  check (not evidence_backed or array_length(source_urls, 1) >= 1);

create index idx_blind_spots_session
  on blind_spots (session_id, created_at);

alter table blind_spots enable row level security;

create policy "users read own blind spots"
  on blind_spots for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access blind_spots"
  on blind_spots for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the blind-spots function).
revoke insert, update, delete on blind_spots from authenticated;
