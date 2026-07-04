-- Discovery platform Run 1 — config-driven model routing
-- Seeds the model_routing key in the existing owner-only app_settings
-- store. The value is JSON (stored as text, parsed by
-- supabase/functions/_shared/models.ts) mapping call types to model IDs.
-- Editing this row changes routing without a redeploy. The consuming code
-- rejects any route that resolves to a Fable/Mythos-tier model.

insert into app_settings (key, value)
values (
  'model_routing',
  '{"stage_classification":"claude-haiku-4-5","session_summary":"claude-haiku-4-5","assumption_mapping":"claude-sonnet-4-6"}'
)
on conflict (key) do nothing;
