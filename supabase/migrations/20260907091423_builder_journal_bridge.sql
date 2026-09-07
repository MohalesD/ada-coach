-- Builder Journal → Ada bridge, receiving side (Spec 4, Milestone 1)
--
-- Two service-role-only tables (the deleted_users posture: RLS on, zero
-- policies for anon/authenticated, no grants), two service-write-only columns
-- on products, and a service-callable credit reset so the bridge can spend
-- the first-read credit without a JWT.
--
-- Deletion contract (Spec 1 / DEU-89): both tables carry
-- user_id → auth.users ON DELETE CASCADE, so the live delete-account function
-- scrubs them with NO change. Nothing here is retained after deletion; the
-- idea text lives in the sprint's intake message, which Spec 1 retains
-- de-linked exactly as a native intake is. If a future bridge table needs
-- retaining rather than destroying, mirror the account_deletion migration's
-- SET NULL exception explicitly — do not change these two.

-- 1. Identity link: one Builder Journal user → one Ada user.
create table bridge_identities (
  id           uuid primary key default gen_random_uuid(),
  bj_user_id   uuid not null unique,
  user_id      uuid not null references auth.users(id) on delete cascade,
  mode         text not null check (mode in ('permanent', 'session')),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

comment on table bridge_identities is
  'Builder Journal user id → Ada auth user. Written only by the bridge-intake Edge Function (service role). mode is the sender''s consent choice, recorded for the record; the consent prompt lives in Builder Journal.';

revoke all on bridge_identities from anon;
revoke all on bridge_identities from authenticated;
alter table bridge_identities enable row level security;

create policy "service_role full access bridge_identities"
  on bridge_identities for all
  to service_role
  using (true) with check (true);

-- 2. Handoff ledger: one row per (Builder Journal user, idea); request_id
--    unique so a replayed request fails on the index, not on a cache.
create table bridge_handoffs (
  id          uuid primary key default gen_random_uuid(),
  request_id  text not null unique,
  bj_user_id  uuid not null,
  bj_idea_id  uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid references products(id) on delete cascade,
  session_id  uuid references sessions(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (bj_user_id, bj_idea_id)
);

comment on table bridge_handoffs is
  'One row per idea handed from Builder Journal. UNIQUE(bj_user_id, bj_idea_id) makes re-sending an idea idempotent (returns the existing sprint); UNIQUE(request_id) rejects replays. session_id SET NULL on sprint deletion → the bridge answers 410 sprint_deleted.';

-- Daily cap lookup: handoffs per Builder Journal user per UTC day.
create index idx_bridge_handoffs_bj_user_day
  on bridge_handoffs (bj_user_id, created_at);

revoke all on bridge_handoffs from anon;
revoke all on bridge_handoffs from authenticated;
alter table bridge_handoffs enable row level security;

create policy "service_role full access bridge_handoffs"
  on bridge_handoffs for all
  to service_role
  using (true) with check (true);

-- 3. Where a product came from. The authenticated INSERT/UPDATE grants on
--    products are already explicit column lists (user_id, name, description /
--    name, description — see products_competitive_gap), so these two columns
--    are service-write-only with no grant change. Readable under the existing
--    own-rows SELECT policy; the sprint page reads source to show the arrival.
alter table products
  add column source text not null default 'ada'
    check (source in ('ada', 'builder_journal')),
  add column external_ref jsonb;

comment on column products.source is
  'ada (native) or builder_journal (created by the bridge). Service-role write only.';
comment on column products.external_ref is
  'For bridge products: { "app": "builder_journal", "idea_id": "<uuid>", "url": "<back-link>" }. Service-role write only.';

-- 4. Credit reset callable by the service role for a named user.
--    fn_reset_credits_if_due() is keyed on auth.uid() by design (a caller can
--    never reset someone else). The bridge has no JWT, so the reset logic
--    moves into this function, execute-restricted to service_role, and the
--    authenticated wrapper delegates to it. Same semantics as before:
--    returns the post-reset balance, or NULL for unlimited (owner role, or
--    daily_message_limit 0/unset), or NULL when the profile does not exist.
create or replace function fn_reset_credits_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role       text;
  v_credits    integer;
  v_last_reset date;
  v_limit      integer;
begin
  if p_user_id is null then
    return null;
  end if;

  select role, credits_remaining, last_credit_reset
    into v_role, v_credits, v_last_reset
    from user_profiles
    where id = p_user_id;

  if not found then
    return null;
  end if;

  if v_role = 'owner' then
    return null;
  end if;

  select nullif(value, '')::integer
    into v_limit
    from app_settings
    where key = 'daily_message_limit';

  if v_limit is null or v_limit <= 0 then
    return null;
  end if;

  if v_last_reset < current_date then
    update user_profiles
      set credits_remaining = v_limit,
          last_credit_reset = current_date
      where id = p_user_id;
    return v_limit;
  end if;

  return v_credits;
end;
$$;

revoke execute on function fn_reset_credits_for_user(uuid) from public;
revoke execute on function fn_reset_credits_for_user(uuid) from anon;
revoke execute on function fn_reset_credits_for_user(uuid) from authenticated;
grant  execute on function fn_reset_credits_for_user(uuid) to service_role;

-- The authenticated surface is unchanged: same name, same signature, same
-- grants (execute → authenticated only), still keyed on auth.uid().
create or replace function fn_reset_credits_if_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return fn_reset_credits_for_user(auth.uid());
end;
$$;
