-- Discovery platform Run 2 — compiled discovery reports + share tokens
-- One report row per session (unique). snapshot is the full compiled
-- report as jsonb — problem framing, assumption map, evidence summary,
-- blind spots, latest interview guide, risk-map data, session summary,
-- and the PRD-required liability disclaimer. Reports are snapshots:
-- deleting a source document later leaves the report intact, and
-- post-close score edits only change the report when the PM explicitly
-- regenerates (report POST), which overwrites snapshot but keeps
-- share_token stable so shared links survive regeneration.
--
-- share_token is a 128-bit hex string minted by the report function.
-- Public access happens ONLY through the report-public Edge Function,
-- which looks the token up with the service client — there is no anon
-- RLS policy on this or any other table.
--
-- RLS mirrors model_usage: read-own, service-role-only writes.

create table reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  session_id   uuid not null unique references sessions(id) on delete cascade,
  share_token  text not null unique,
  snapshot     jsonb not null,
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table reports enable row level security;

create policy "users read own reports"
  on reports for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access reports"
  on reports for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the report function).
revoke insert, update, delete on reports from authenticated;
