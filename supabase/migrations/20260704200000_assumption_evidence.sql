-- Discovery platform Run 2 — market-grounding evidence
-- One row per web-sourced citation attached to an assumption by the
-- market-grounding Edge Function (Sonnet 4.6 + the Anthropic web search
-- server tool). Carries the PRD's audit-trail fields: source URL,
-- retrieval timestamp, and the query used.
--
-- RLS mirrors model_usage, not assumptions: evidence is a
-- function-produced artifact, so users can read their own rows but only
-- the service role writes. stance is the model's read on whether the
-- source supports or challenges the assumption; 'neutral' when unclear.

create table assumption_evidence (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  assumption_id uuid not null references assumptions(id) on delete cascade,
  session_id    uuid not null references sessions(id) on delete cascade,
  source_url    text not null,
  title         text,
  snippet       text,
  query         text,
  stance        text not null default 'neutral'
                check (stance in ('supports', 'challenges', 'neutral')),
  retrieved_at  timestamptz not null default now()
);

create index idx_assumption_evidence_assumption
  on assumption_evidence (assumption_id, retrieved_at);

create index idx_assumption_evidence_session
  on assumption_evidence (session_id);

alter table assumption_evidence enable row level security;

create policy "users read own assumption evidence"
  on assumption_evidence for select
  to authenticated
  using (user_id = auth.uid());

create policy "service_role full access assumption_evidence"
  on assumption_evidence for all
  to service_role
  using (true) with check (true);

-- Writes are service-role only (the market-grounding function).
revoke insert, update, delete on assumption_evidence from authenticated;
