-- Agent-Loop Redesign — routing entries for the loop's model calls
-- Adds three call types to the config-driven model_routing JSON (merged, so
-- prior keys and any owner edits survive):
--   discovery_coach            → Haiku 4.5   (Ada's coaching reply; parity
--                                with the existing chat surface, cost-lean)
--   discovery_evaluation       → Haiku 4.5   (cheap structured next-action
--                                evaluator, runs every PM turn)
--   success_metric_candidates  → Sonnet 4.6  (reasoning-heavy grounded
--                                North Star / proxy synthesis)
-- _shared/models.ts carries matching hardcoded defaults and still refuses
-- any route matching /fable|mythos/i.

-- Ensure the row exists (no-op when an earlier run already seeded it).
insert into app_settings (key, value)
values (
  'model_routing',
  '{"discovery_coach":"claude-haiku-4-5","discovery_evaluation":"claude-haiku-4-5","success_metric_candidates":"claude-sonnet-4-6"}'
)
on conflict (key) do nothing;

-- Merge the new keys into whatever is currently configured.
update app_settings
set value = (
  value::jsonb || '{"discovery_coach":"claude-haiku-4-5","discovery_evaluation":"claude-haiku-4-5","success_metric_candidates":"claude-sonnet-4-6"}'::jsonb
)::text
where key = 'model_routing';
