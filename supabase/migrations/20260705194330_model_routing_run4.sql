-- Discovery platform Run 4 — routing entries for the portfolio track
-- Adds portfolio_route + portfolio_profile_extraction (Haiku — cheap,
-- mechanical classification/extraction) and portfolio_idea_generation +
-- portfolio_artifact_coaching + portfolio_plan_generation (Sonnet 4.6 —
-- reasoning-heavy synthesis) to the config-driven model_routing JSON,
-- merged so prior keys and any owner edits survive. _shared/models.ts
-- carries matching hardcoded defaults and still refuses any route
-- matching /fable|mythos/i.

update app_settings
set value = (
  value::jsonb || '{"portfolio_route":"claude-haiku-4-5","portfolio_profile_extraction":"claude-haiku-4-5","portfolio_idea_generation":"claude-sonnet-4-6","portfolio_artifact_coaching":"claude-sonnet-4-6","portfolio_plan_generation":"claude-sonnet-4-6"}'::jsonb
)::text
where key = 'model_routing';
