-- Per-user hard caps on Competitive Intelligence runs, mirroring
-- market_intel_run_cap's pattern exactly: owner-editable in app_settings
-- without a redeploy, checked lifetime (no reset window), fail-closed on
-- a model_usage lookup error. Each Edge Function counts its own lifetime
-- model_usage rows against its own key:
--   competitive-intel/index.ts  -> competitive_intel_run_cap   (competitor_identification)
--   competitor-profile/index.ts -> competitor_profile_run_cap  (competitor_profiling)
--   competitive-gap/index.ts    -> competitive_gap_run_cap     (competitive_gap_analysis)
--
-- competitor_profile_run_cap defaults higher (5, not 2) because that
-- call runs once PER COMPETITOR, not once per session — a cap of 2
-- would block most of a confirmed candidate list after the first couple
-- of profiles.

insert into app_settings (key, value)
values
  ('competitive_intel_run_cap', '2'),
  ('competitor_profile_run_cap', '5'),
  ('competitive_gap_run_cap', '2')
on conflict (key) do nothing;

alter table app_settings
  add constraint app_settings_competitive_intel_run_cap_positive
  check (
    key <> 'competitive_intel_run_cap'
    or (value ~ '^[0-9]+$' and value::integer >= 1)
  );

alter table app_settings
  add constraint app_settings_competitor_profile_run_cap_positive
  check (
    key <> 'competitor_profile_run_cap'
    or (value ~ '^[0-9]+$' and value::integer >= 1)
  );

alter table app_settings
  add constraint app_settings_competitive_gap_run_cap_positive
  check (
    key <> 'competitive_gap_run_cap'
    or (value ~ '^[0-9]+$' and value::integer >= 1)
  );
