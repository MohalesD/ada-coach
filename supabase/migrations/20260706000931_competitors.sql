-- Discovery platform Run 5 — competitors
-- One row per named competitor of a product. Lifecycle (the addendum's
-- confirm gate): identification (Sonnet 4.6 + bounded search) inserts
-- candidates with confirmed = false; the PM confirms/adds/removes at the
-- gate BEFORE deep profiling spends the search budget; profiling fills
-- positioning/pricing/features/moves one competitor per call (retry
-- granularity, the Run 2 market-grounding shape).
--
--   added_by — 'ada' (surfaced by identification search) or 'user'
--     (added at the confirm gate); the UI labels the two honestly.
--   confidence_label — profiling's evidence-strength read; NULL until
--     profiled. Same fixed vocabulary as market_briefs.
--   retrieved_at — when the stored intel was last retrieved (identify,
--     then bumped by profiling); visibly dated in the UI.
--   profiled_at — NULL until deep profiling has run.
--
-- RLS mirrors reports/blind_spots: read-own, service-role-only writes.
-- The PM edits the list only through the competitive-intel confirm
-- endpoint — there is no client write path to tamper with stored intel.

create table competitors (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  product_id       uuid not null references products(id) on delete cascade,
  name             text not null,
  added_by         text not null default 'ada'
                   check (added_by in ('ada', 'user')),
  confirmed        boolean not null default false,
  positioning      text,
  pricing_signal   text,
  feature_notes    jsonb,
  recent_moves     text,
  confidence_label text
                   check (confidence_label in ('strong', 'moderate', 'thin', 'none')),
  retrieved_at     timestamptz not null default now(),
  profiled_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_competitors_product
  on competitors (product_id, created_at);

alter table competitors enable row level security;

create policy "users read own competitors"
  on competitors for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access competitors"
  on competitors for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the competitive-intel functions).
revoke insert, update, delete on competitors from authenticated;
