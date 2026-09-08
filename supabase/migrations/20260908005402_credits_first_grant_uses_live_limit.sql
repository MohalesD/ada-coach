-- New signups were landing on the stale column DEFAULT of 10 rather than the
-- configured app_settings.daily_message_limit.
--
-- Three causes stacked: credits_remaining DEFAULT 10 (written when the limit
-- really was 10), handle_new_user() never reading app_settings, and
-- last_credit_reset defaulting to CURRENT_DATE — which makes the lazy top-up
-- in fn_reset_credits_for_user (guarded on last_credit_reset < current_date)
-- unable to fire until the following day.
--
-- Fix the third cause only. Backdating the default means the first
-- fn_reset_credits_if_due call — the frontend makes one on app load, and chat
-- makes one per message — grants the live limit immediately.
--
-- Deliberately NOT fixed by teaching handle_new_user() to read app_settings:
-- that trigger swallows every exception (DEU-94), so a failed settings read
-- there would silently produce a user with no profile at all. This adds no new
-- failure mode, and credits_remaining's DEFAULT 10 stays as a harmless floor
-- if the reset ever fails.

alter table user_profiles
  alter column last_credit_reset set default date '2000-01-01';

comment on column user_profiles.last_credit_reset is
  'Date credits were last granted. Defaults to a past date so a brand-new account is topped up to the live daily_message_limit on its first fn_reset_credits_if_due call, rather than sitting on the credits_remaining column default until the next calendar day.';
