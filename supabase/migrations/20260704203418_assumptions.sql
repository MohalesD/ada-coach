-- Discovery platform Run 1 — assumptions + append-only status history
-- Assumptions are extracted by the Ada Engine (Sonnet 4.6) and scored on
-- confidence and impact (integers 1-5; feeds the Run 2 confidence-by-impact
-- risk map). Status lifecycle: untested -> validated | challenged |
-- abandoned, with every change preserved in assumption_status_history.
--
-- History writes go through a SECURITY DEFINER trigger (locked search_path,
-- same hardening as handle_new_user) so client status updates produce
-- history rows without granting clients any direct write path to the
-- history table.

create table assumptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  product_id     uuid not null references products(id) on delete cascade,
  session_id     uuid not null references sessions(id) on delete cascade,
  statement      text not null,
  category       text not null
                 check (category in ('desirability', 'viability', 'feasibility', 'usability')),
  confidence     integer not null check (confidence between 1 and 5),
  impact         integer not null check (impact between 1 and 5),
  status         text not null default 'untested'
                 check (status in ('untested', 'validated', 'challenged', 'abandoned')),
  is_prioritized boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_assumptions_session
  on assumptions (session_id, created_at);

create index idx_assumptions_product
  on assumptions (product_id, status);

create trigger trg_assumptions_updated
  before update on assumptions
  for each row execute function set_updated_at();

-- ── Append-only status history ───────────────────────────────────────────

create table assumption_status_history (
  id            uuid primary key default gen_random_uuid(),
  assumption_id uuid not null references assumptions(id) on delete cascade,
  old_status    text,          -- null on the initial insert
  new_status    text not null,
  changed_by    uuid,          -- auth.uid() of the actor; null for service-role writes
  changed_at    timestamptz not null default now()
);

create index idx_assumption_history
  on assumption_status_history (assumption_id, changed_at);

create or replace function log_assumption_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into assumption_status_history (assumption_id, old_status, new_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into assumption_status_history (assumption_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_assumptions_status_history
  after insert or update on assumptions
  for each row execute function log_assumption_status();

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table assumptions enable row level security;

create policy "users read own assumptions"
  on assumptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "users create own assumptions"
  on assumptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users update own assumptions"
  on assumptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "service_role full access assumptions"
  on assumptions for all
  to service_role
  using (true) with check (true);

alter table assumption_status_history enable row level security;

create policy "users read own assumption history"
  on assumption_status_history for select
  to authenticated
  using (
    exists (
      select 1 from assumptions a
      where a.id = assumption_status_history.assumption_id
        and a.user_id = auth.uid()
    )
  );

create policy "service_role full access assumption history"
  on assumption_status_history for all
  to service_role
  using (true) with check (true);

-- Append-only from the client's perspective: no direct write path.
-- (The SECURITY DEFINER trigger writes as the function owner.)
revoke insert, update, delete on assumption_status_history from authenticated;
