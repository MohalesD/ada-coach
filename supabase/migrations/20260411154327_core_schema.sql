-- Ada Coach core schema (Migration 001)
-- Tables: conversations, messages, coaching_prompts
-- RLS: service_role full access, anon blocked entirely

-- ─────────────────────────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────────────────────────
create table conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text,
  status      text not null default 'active'
              check (status in ('active', 'archived', 'deleted'))
);

-- ─────────────────────────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────────────────────────
create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant', 'system')),
  content          text not null,
  created_at       timestamptz not null default now(),
  token_count      integer
);

create index idx_messages_conversation
  on messages (conversation_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- coaching_prompts
-- ─────────────────────────────────────────────────────────────
create table coaching_prompts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  prompt_text  text not null,
  is_active    boolean not null default false,
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  notes        text
);

create index idx_coaching_prompts_active
  on coaching_prompts (is_active)
  where is_active = true;

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security
-- Service role (Edge Functions) gets full CRUD; anon has no policies,
-- which means anon is blocked entirely once RLS is enabled.
-- ─────────────────────────────────────────────────────────────
alter table conversations     enable row level security;
alter table messages          enable row level security;
alter table coaching_prompts  enable row level security;

create policy "service_role full access to conversations"
  on conversations for all
  to service_role
  using (true)
  with check (true);

create policy "service_role full access to messages"
  on messages for all
  to service_role
  using (true)
  with check (true);

create policy "service_role full access to coaching_prompts"
  on coaching_prompts for all
  to service_role
  using (true)
  with check (true);
