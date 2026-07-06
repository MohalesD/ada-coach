-- Discovery platform Run 5 — market brief evidence
-- One row per source-cited claim inside a market brief. The Run 2
-- anti-hallucination guarantee, both layers:
--   DB layer: source_url is NOT NULL and must look like a real URL
--     (CHECK), so a citation-less or fabricated-format claim is
--     physically unstorable.
--   Code layer: the market-intel function only inserts URLs the
--     web_search tool actually returned — a model-invented URL is
--     dropped before it ever reaches this table.
-- query_used + retrieved_at are the PRD's audit trail: which search
-- produced the claim, and when.
--
-- RLS mirrors assumption_evidence: read-own, service-role-only writes.

create table market_evidence (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  market_brief_id uuid not null references market_briefs(id) on delete cascade,
  claim           text not null,
  source_url      text not null,
  title           text,
  query_used      text,
  retrieved_at    timestamptz not null default now(),
  constraint market_evidence_real_source_url
    check (source_url ~* '^https?://')
);

create index idx_market_evidence_brief
  on market_evidence (market_brief_id, retrieved_at);

alter table market_evidence enable row level security;

create policy "users read own market evidence"
  on market_evidence for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access market_evidence"
  on market_evidence for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the market-intel function).
revoke insert, update, delete on market_evidence from authenticated;
