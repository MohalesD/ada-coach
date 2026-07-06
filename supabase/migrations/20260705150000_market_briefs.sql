-- Discovery platform Run 5 — market intelligence briefs
-- One standing, refreshable brief per product (unique product_id, the
-- reports-per-session precedent): the market-intel Edge Function plans
-- bounded search angles (Sonnet 4.6), executes them through the Run 2
-- web-search wrapper, and stores the synthesized snapshot here. Refresh
-- overwrites summary/evidence in place; the row id stays stable.
--
-- Honesty fields (PRD: "honest gaps beat fabrication"):
--   confidence_label — the model's evidence-strength read, CHECKed to a
--     fixed vocabulary so the UI can render it without free-text drift.
--   partial — true when the run hit the search budget mid-plan; the UI
--     marks the brief partial and offers to continue.
--   retrieved_at — the snapshot timestamp, visibly dated in the UI.
--
-- RLS mirrors reports/blind_spots: read-own, service-role-only writes.

create table market_briefs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  product_id       uuid not null unique references products(id) on delete cascade,
  summary          jsonb not null,
  confidence_label text not null
                   check (confidence_label in ('strong', 'moderate', 'thin', 'none')),
  partial          boolean not null default false,
  search_count     integer check (search_count >= 0),
  retrieved_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_market_briefs_user
  on market_briefs (user_id);

create trigger trg_market_briefs_updated
  before update on market_briefs
  for each row execute function set_updated_at();

alter table market_briefs enable row level security;

create policy "users read own market briefs"
  on market_briefs for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access market_briefs"
  on market_briefs for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the market-intel function).
revoke insert, update, delete on market_briefs from authenticated;
