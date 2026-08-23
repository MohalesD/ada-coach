-- Discovery platform Run 5 — intel run status
-- Live web-search calls routinely exceed the edge gateway's 150s idle
-- timeout (verified twice on 2026-07-05: identify killed at 150,230ms
-- both attempts). The three search endpoints therefore run as background
-- workers (EdgeRuntime.waitUntil) and answer 202 immediately; this cell
-- is where a worker reports running/done/error, and what the client
-- polls. One run per product at a time — the status cell doubles as the
-- serialization lock (a stale 'running' older than 10 minutes is
-- reclaimable).
--
-- Service-role-only by construction: the products column grants were
-- tightened to (name, description) in 20260705150400, so authenticated
-- cannot write this column.

alter table products
  add column intel_status jsonb;
