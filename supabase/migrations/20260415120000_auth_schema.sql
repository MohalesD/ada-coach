-- Ada Coach auth schema (Migration 003)
-- Adds Supabase Auth integration: user_profiles, user_id on conversations,
-- automatic profile creation on signup, and per-user RLS policies.

-- ─────────────────────────────────────────────────────────────
-- 1. Wipe legacy unowned data
-- Pre-auth dev conversations have no user_id; clear them so the
-- NOT NULL column add succeeds and no orphans linger under new RLS.
-- ─────────────────────────────────────────────────────────────
delete from conversations;  -- cascades to messages

-- ─────────────────────────────────────────────────────────────
-- 2. conversations.user_id
-- ─────────────────────────────────────────────────────────────
alter table conversations
  add column user_id uuid not null
    references auth.users(id) on delete cascade;

create index idx_conversations_user
  on conversations (user_id, updated_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3. user_profiles
-- ─────────────────────────────────────────────────────────────
create table user_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  role          text not null default 'user'
                check (role in ('user', 'admin', 'owner')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 4. updated_at trigger (reusable)
-- ─────────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_profiles_updated
  before update on user_profiles
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. Auto-create user_profiles row on auth signup
-- security definer + locked search_path (Supabase linter requirement)
-- swallows exceptions so a profile failure never blocks signup
-- ─────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end;
$$;

grant insert on public.user_profiles to supabase_auth_admin;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 6. RLS — replace v1 service-role-only policies with per-user policies
-- ─────────────────────────────────────────────────────────────

-- Drop v1 policies
drop policy "service_role full access to conversations"    on conversations;
drop policy "service_role full access to messages"         on messages;
drop policy "service_role full access to coaching_prompts" on coaching_prompts;

-- conversations
create policy "users read own conversations"
  on conversations for select
  to authenticated
  using (user_id = auth.uid());

create policy "users create own conversations"
  on conversations for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users update own conversations"
  on conversations for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "service_role full access conversations"
  on conversations for all
  to service_role
  using (true) with check (true);

-- messages (ownership via parent conversation)
create policy "users read own messages"
  on messages for select
  to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy "service_role full access messages"
  on messages for all
  to service_role
  using (true) with check (true);

-- coaching_prompts: authenticated users can read the active prompt
create policy "authenticated read active prompts"
  on coaching_prompts for select
  to authenticated
  using (is_active = true);

create policy "service_role full access coaching_prompts"
  on coaching_prompts for all
  to service_role
  using (true) with check (true);

-- user_profiles
alter table user_profiles enable row level security;

create policy "users read own profile"
  on user_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "users update own profile"
  on user_profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "service_role full access user_profiles"
  on user_profiles for all
  to service_role
  using (true) with check (true);
