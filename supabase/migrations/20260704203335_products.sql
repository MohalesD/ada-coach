-- Discovery platform Run 1 — products
-- A product is the PM's unit of discovery work; sessions and assumptions
-- hang off it. RLS mirrors the conversations/folders pattern: own-rows-only
-- for authenticated, service_role full access. Delete policy included
-- (mirroring folders) because the PRD acceptance requires a PM to delete
-- a product they own.

create table products (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_products_user
  on products (user_id, updated_at desc);

create trigger trg_products_updated
  before update on products
  for each row execute function set_updated_at();

alter table products enable row level security;

create policy "users read own products"
  on products for select
  to authenticated
  using (user_id = auth.uid());

create policy "users create own products"
  on products for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users update own products"
  on products for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users delete own products"
  on products for delete
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access products"
  on products for all
  to service_role
  using (true) with check (true);
