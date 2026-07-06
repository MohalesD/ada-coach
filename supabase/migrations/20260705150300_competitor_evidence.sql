-- Discovery platform Run 5 — competitor profile evidence
-- One row per source-cited claim inside a competitor profile
-- (positioning, pricing signals, feature surface, recent moves). Same
-- two-layer anti-hallucination guarantee as market_evidence:
--   DB layer: source_url NOT NULL + real-URL CHECK — a fabricated
--     citation is physically unstorable.
--   Code layer: only URLs the web_search tool actually returned are
--     inserted (Run 2 enforcement, reused verbatim).
--
-- RLS mirrors assumption_evidence: read-own, service-role-only writes.

create table competitor_evidence (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  claim         text not null,
  source_url    text not null,
  title         text,
  query_used    text,
  retrieved_at  timestamptz not null default now(),
  constraint competitor_evidence_real_source_url
    check (source_url ~* '^https?://')
);

create index idx_competitor_evidence_competitor
  on competitor_evidence (competitor_id, retrieved_at);

alter table competitor_evidence enable row level security;

create policy "users read own competitor evidence"
  on competitor_evidence for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access competitor_evidence"
  on competitor_evidence for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the competitor-profile function).
revoke insert, update, delete on competitor_evidence from authenticated;
