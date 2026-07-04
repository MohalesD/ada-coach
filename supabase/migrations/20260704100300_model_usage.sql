-- Discovery platform Run 1 — model usage / cost tracking
-- One row per model call, written only by the service role from the
-- _shared/usage.ts middleware. Users can read their own rows (feeds a
-- future spend view, B-002). session_id is SET NULL on delete so cost
-- records outlive a deleted session.
--
-- The CHECK constraint is the database-level enforcement of the PRD rule
-- "no production call ever logs Fable 5 or a Mythos-tier model" — a
-- misrouted call cannot even be recorded, and the runtime guard in
-- _shared/models.ts refuses to make it in the first place.

create table model_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  session_id    uuid references sessions(id) on delete set null,
  call_type     text not null,
  model         text not null,
  input_tokens  integer,
  output_tokens integer,
  cost_usd      numeric(12, 6),
  created_at    timestamptz not null default now()
);

alter table model_usage
  add constraint model_usage_no_mythos_tier
  check (model !~* '(fable|mythos)');

create index idx_model_usage_user
  on model_usage (user_id, created_at desc);

create index idx_model_usage_session
  on model_usage (session_id)
  where session_id is not null;

alter table model_usage enable row level security;

create policy "users read own model usage"
  on model_usage for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access model_usage"
  on model_usage for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only.
revoke insert, update, delete on model_usage from authenticated;
