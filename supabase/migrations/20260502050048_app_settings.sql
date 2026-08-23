-- Owner-only key/value store for app-wide configuration.
--
-- First entry is daily_message_limit, which controls the default
-- starting credits for all users (0 = unlimited). Owner-configurable
-- without a code deploy. Values are stored as text and parsed by the
-- consuming code so the table can hold arbitrary scalar settings later.

create table app_settings (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value)
values ('daily_message_limit', '10');

-- Validation: daily_message_limit must be an integer >= 0.
alter table app_settings
  add constraint app_settings_daily_message_limit_nonneg
  check (
    key <> 'daily_message_limit'
    or (value ~ '^[0-9]+$' and value::integer >= 0)
  );

-- ── RLS: owner-only ──────────────────────────────────────────────────────────

alter table app_settings enable row level security;

create policy "owner read app_settings"
  on app_settings for select to authenticated
  using ((select role from user_profiles where id = auth.uid()) = 'owner');

create policy "owner insert app_settings"
  on app_settings for insert to authenticated
  with check ((select role from user_profiles where id = auth.uid()) = 'owner');

create policy "owner update app_settings"
  on app_settings for update to authenticated
  using ((select role from user_profiles where id = auth.uid()) = 'owner')
  with check ((select role from user_profiles where id = auth.uid()) = 'owner');

create policy "owner delete app_settings"
  on app_settings for delete to authenticated
  using ((select role from user_profiles where id = auth.uid()) = 'owner');

-- Service role retains full access for trusted writes from Edge Functions.
create policy "service_role full access app_settings"
  on app_settings for all to service_role
  using (true) with check (true);
