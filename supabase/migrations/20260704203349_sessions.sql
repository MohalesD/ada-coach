-- Discovery platform Run 1 — sessions
-- A Discovery Sprint session. Links 1:1 to a row in the existing
-- conversations table (PRD v2 change #3: reuse the conversation engine,
-- do not invent a new session-message structure). Deleting the
-- conversation cascades to the session, which cascades to session-scoped
-- documents — the PRD's auto-purge chain.
--
-- State machine: in_progress -> completed | abandoned. Terminal states are
-- terminal. Enforced by trigger so it holds for every role — service_role
-- bypasses RLS but not triggers.

create table sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  conversation_id  uuid not null unique references conversations(id) on delete cascade,
  status           text not null default 'in_progress'
                   check (status in ('in_progress', 'completed', 'abandoned')),
  stage            text check (stage in ('fresh_idea', 'stuck')),
  stage_confidence real check (stage_confidence >= 0 and stage_confidence <= 1),
  current_step     text,
  summary          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create index idx_sessions_user
  on sessions (user_id, updated_at desc);

create index idx_sessions_product
  on sessions (product_id, created_at desc);

create trigger trg_sessions_updated
  before update on sessions
  for each row execute function set_updated_at();

create or replace function enforce_session_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status and old.status <> 'in_progress' then
    raise exception 'invalid session transition: % -> %', old.status, new.status;
  end if;
  -- Stamp completion time when leaving in_progress, if the writer didn't.
  if old.status = 'in_progress'
     and new.status in ('completed', 'abandoned')
     and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end;
$$;

create trigger trg_sessions_transition
  before update on sessions
  for each row execute function enforce_session_transition();

alter table sessions enable row level security;

create policy "users read own sessions"
  on sessions for select
  to authenticated
  using (user_id = auth.uid());

create policy "users create own sessions"
  on sessions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users update own sessions"
  on sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "service_role full access sessions"
  on sessions for all
  to service_role
  using (true) with check (true);
