-- Per-user hard cap on Market Intelligence runs, independent of the
-- (broken) credits system. Owner-editable in app_settings without a
-- redeploy, same pattern as intel_search_budget. market-intel/index.ts
-- counts lifetime model_usage rows where call_type = 'market_intel_research'
-- (the billed search step) against this value and declines with a
-- friendly message once the cap is reached.

insert into app_settings (key, value)
values ('market_intel_run_cap', '3')
on conflict (key) do nothing;

alter table app_settings
  add constraint app_settings_market_intel_run_cap_positive
  check (
    key <> 'market_intel_run_cap'
    or (value ~ '^[0-9]+$' and value::integer >= 1)
  );
