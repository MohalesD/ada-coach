-- Discovery platform Run 4 — portfolio_projects
-- One row per portfolio idea Sonnet 4.6 generates for a profile (PRD
-- Technical Flow step 3); the PM picks exactly one to coach into an
-- artifact (step 4), then gets a tool recommendation + effort estimate
-- (step 5). share_token supports the export/share step (step 6) via a
-- dedicated public function mirroring report-public — reports.session_id
-- is tightly typed to the sessions table, so portfolio artifacts get
-- their own token column rather than surgery on that table.
--
-- RLS mirrors portfolio_profiles exactly: own-rows select, service-role-
-- only writes (every column here is function-produced — ideas, coaching
-- output, effort estimates — never hand-edited by the client, same
-- reasoning as reports/blind_spots).

create table portfolio_projects (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  portfolio_profile_id  uuid not null references portfolio_profiles(id) on delete cascade,
  idea_title            text not null,
  ai_angle              text,
  chosen                boolean not null default false,
  artifact_type         text
                        check (artifact_type in ('prd', 'brief', 'prototype_spec')),
  artifact_content      jsonb not null default '{}'::jsonb,
  effort_estimate       jsonb,
  status                text not null default 'proposed'
                        check (status in ('proposed', 'in_progress', 'complete')),
  share_token           text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_portfolio_projects_profile
  on portfolio_projects (portfolio_profile_id, created_at);

create index idx_portfolio_projects_user
  on portfolio_projects (user_id);

create trigger trg_portfolio_projects_updated
  before update on portfolio_projects
  for each row execute function set_updated_at();

alter table portfolio_projects enable row level security;

create policy "users read own portfolio projects"
  on portfolio_projects for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access portfolio projects"
  on portfolio_projects for all
  to service_role
  using (true) with check (true);

revoke insert, update, delete on portfolio_projects from authenticated;
