-- Account deletion & data retention (Spec 1 / DEU-89)
--
-- Architecture: detach-and-cascade. All FKs to auth.users are already
-- ON DELETE CASCADE, so deleting the auth.users row scrubs everything by
-- default. This migration makes retention the explicit exception by
-- detaching the tables Mo wants to keep for the feedback/eval loop:
--
--   RETAINED (de-linked, user_id -> NULL):
--     conversations (+ messages, incl. thumbs ratings via messages.feedback)
--     sessions, assumptions (+ assumption_status_history via cascade chain)
--     user_feedback (attributable to a deleted_users tombstone)
--   DESTROYED by the existing cascade:
--     user_profiles, products, portfolio_*, documents, folders, model_usage,
--     reports, competitors, market_briefs, and every other own-rows table.
--
-- RLS consequence: every own-rows policy is `user_id = auth.uid()`. A NULL
-- user_id matches no one, so retained rows become unreadable to every
-- authenticated user and visible only through service-role admin reads.
--
-- Trigger check (verified 2026-08-23, re-verify if these triggers change):
--   enforce_session_transition guards on status change only -> no-op on SET NULL
--   log_assumption_status appends only on status change -> no history row
--   set_updated_at on assumptions fires -> updated_at reflects deletion time

-- 1. Tombstone. No FK to auth.users on purpose: it must outlive the account.
create table deleted_users (
  id               uuid primary key default gen_random_uuid(),
  original_user_id uuid not null unique,
  display_name     text,
  email            text not null,
  signed_up_at     timestamptz not null,
  deleted_at       timestamptz not null default now()
);

comment on table deleted_users is
  'Tombstone written by the delete-account Edge Function. UNIQUE(original_user_id) makes the write an idempotent upsert so a retried deletion never produces two rows.';

-- Grant discipline: clients get nothing. Service role only.
revoke all on deleted_users from anon;
revoke all on deleted_users from authenticated;
alter table deleted_users enable row level security;

create policy "service_role full access deleted_users"
  on deleted_users for all
  to service_role
  using (true) with check (true);

-- 2. Retained feedback stays attributable to the tombstone.
alter table user_feedback
  add column deleted_user_id uuid references deleted_users(id) on delete set null;

create index idx_user_feedback_deleted_user
  on user_feedback (deleted_user_id)
  where deleted_user_id is not null;

-- 3. Detach the retained tables from auth.users: nullable + SET NULL.
alter table conversations alter column user_id drop not null;
alter table conversations drop constraint conversations_user_id_fkey;
alter table conversations
  add constraint conversations_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table user_feedback alter column user_id drop not null;
alter table user_feedback drop constraint user_feedback_user_id_fkey;
alter table user_feedback
  add constraint user_feedback_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table sessions alter column user_id drop not null;
alter table sessions drop constraint sessions_user_id_fkey;
alter table sessions
  add constraint sessions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table assumptions alter column user_id drop not null;
alter table assumptions drop constraint assumptions_user_id_fkey;
alter table assumptions
  add constraint assumptions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 4. Products are destroyed on deletion, but sessions/assumptions are kept,
--    so their product FKs must also survive the products cascade.
alter table sessions alter column product_id drop not null;
alter table sessions drop constraint sessions_product_id_fkey;
alter table sessions
  add constraint sessions_product_id_fkey
  foreign key (product_id) references products(id) on delete set null;

alter table assumptions alter column product_id drop not null;
alter table assumptions drop constraint assumptions_product_id_fkey;
alter table assumptions
  add constraint assumptions_product_id_fkey
  foreign key (product_id) references products(id) on delete set null;
