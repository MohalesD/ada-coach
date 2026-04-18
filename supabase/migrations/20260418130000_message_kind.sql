-- Adds a `kind` discriminator on messages so summaries can be rendered
-- with their own visual treatment (badge, tinted bubble) on reload.
--
-- Default 'message' keeps existing rows correct without a backfill.
-- Authenticated UPDATE remains restricted to the `feedback` column only
-- (see 20260418100000_message_feedback.sql) — adding a column does not
-- broaden write access.

alter table messages
  add column kind text not null default 'message'
  check (kind in ('message', 'summary'));
