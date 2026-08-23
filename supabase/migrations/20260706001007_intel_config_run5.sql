-- Discovery platform Run 5 — intel configuration
-- 1) intel_search_budget: the per-run web-search cap (PRD: "caps its
--    web_search calls (default 15, config-driven)"). Owner-editable in
--    app_settings without a redeploy; consuming code falls back to 15
--    when absent and clamps to >= 1. A single market brief run spends at
--    most this many searches; a competitive profiling run divides it
--    across the confirmed competitors.
-- 2) model_routing: the five Run 5 call types, all Sonnet 4.6 (the PRD
--    routes ALL intel planning, search execution, and synthesis to
--    Sonnet 4.6; web_search never pairs with Haiku). Merged so prior
--    keys and any owner edits survive. _shared/models.ts carries
--    matching hardcoded defaults and still refuses any route matching
--    /fable|mythos/i.

insert into app_settings (key, value)
values ('intel_search_budget', '15')
on conflict (key) do nothing;

alter table app_settings
  add constraint app_settings_intel_search_budget_positive
  check (
    key <> 'intel_search_budget'
    or (value ~ '^[0-9]+$' and value::integer >= 1)
  );

update app_settings
set value = (
  value::jsonb || '{"market_intel_plan":"claude-sonnet-4-6","market_intel_research":"claude-sonnet-4-6","competitor_identification":"claude-sonnet-4-6","competitor_profiling":"claude-sonnet-4-6","competitive_gap_analysis":"claude-sonnet-4-6"}'::jsonb
)::text
where key = 'model_routing';
