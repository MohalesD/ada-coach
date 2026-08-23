-- Discovery platform Run 2 — routing entries for the new Sonnet calls
-- Adds market_grounding, blind_spot_analysis, and interview_guide to the
-- config-driven model_routing JSON (merged, so any owner edits to the
-- Run 1 keys survive). All three are reasoning-heavy coaching calls →
-- claude-sonnet-4-6 per the PRD's model-routing business rule.
-- _shared/models.ts carries matching hardcoded defaults and still
-- refuses any route matching /fable|mythos/i.

-- Ensure the row exists (no-op when Run 1 already seeded it).
insert into app_settings (key, value)
values (
  'model_routing',
  '{"stage_classification":"claude-haiku-4-5","session_summary":"claude-haiku-4-5","assumption_mapping":"claude-sonnet-4-6","market_grounding":"claude-sonnet-4-6","blind_spot_analysis":"claude-sonnet-4-6","interview_guide":"claude-sonnet-4-6"}'
)
on conflict (key) do nothing;

-- Merge the new keys into whatever is currently configured.
update app_settings
set value = (
  value::jsonb || '{"market_grounding":"claude-sonnet-4-6","blind_spot_analysis":"claude-sonnet-4-6","interview_guide":"claude-sonnet-4-6"}'::jsonb
)::text
where key = 'model_routing';
