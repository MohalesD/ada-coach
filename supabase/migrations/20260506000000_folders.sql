-- Folders MVP — per-user containers for organizing conversations
-- Tables: folders
-- Columns: conversations.folder_id (nullable FK)
-- Pattern mirrors conversations: per-user RLS, service_role full access.

-- ─────────────────────────────────────────────────────────────
-- folders
-- ─────────────────────────────────────────────────────────────
create table folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_folders_user
  on folders (user_id, created_at);

create trigger trg_folders_updated
  before update on folders
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- conversations.folder_id
-- ON DELETE SET NULL — deleting a folder unfiles its chats.
-- ─────────────────────────────────────────────────────────────
alter table conversations
  add column folder_id uuid
    references folders(id) on delete set null;

create index idx_conversations_folder
  on conversations (folder_id)
  where folder_id is not null;

-- ─────────────────────────────────────────────────────────────
-- RLS for folders
-- ─────────────────────────────────────────────────────────────
alter table folders enable row level security;

create policy "users read own folders"
  on folders for select
  to authenticated
  using (user_id = auth.uid());

create policy "users create own folders"
  on folders for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users update own folders"
  on folders for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own folders"
  on folders for delete
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access folders"
  on folders for all
  to service_role
  using (true) with check (true);
