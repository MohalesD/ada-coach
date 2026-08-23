-- Per-user credit tracking for the Ada Coach credits system.
--
-- credits_remaining   — integer, never negative (CHECK constraint).
--                       Decremented per chat message; refilled by the
--                       daily reset logic.
-- last_credit_reset   — date the user's credits were last auto-granted.
--                       Used by the reset job to decide whether to top up
--                       a given user today.
--
-- Seeded with default 10 to match the initial daily_message_limit.
-- Existing users get backfilled to 10 by the column DEFAULT.

alter table user_profiles
  add column credits_remaining integer not null default 10
    check (credits_remaining >= 0),
  add column last_credit_reset date    not null default current_date;

-- No new RLS policy needed — existing user_profiles policies already
-- govern read/write access. credits_remaining and last_credit_reset are
-- written only by the service role (chat function on decrement, reset
-- job on refill), so they intentionally fall outside the authenticated
-- column-level UPDATE grant (which is restricted to display_name).
