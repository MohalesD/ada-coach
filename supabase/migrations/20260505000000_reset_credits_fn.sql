-- Lazy daily credit reset, callable from both the chat Edge Function
-- and the frontend's credits-fetch on app load.
--
-- Returns the post-reset credits_remaining for the calling user.
-- Returns NULL when the user is unlimited (owner role, or
-- daily_message_limit is 0 / unset).
--
-- SECURITY DEFINER: needed because authenticated users only have a
-- column-level UPDATE grant on user_profiles.display_name. The function
-- runs with the definer's privileges so it can write the reset, but
-- identifies the target user via auth.uid() — there is no user_id
-- parameter, so a caller cannot reset someone else's credits.

create or replace function fn_reset_credits_if_due()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid    := auth.uid();
  v_role       text;
  v_credits    integer;
  v_last_reset date;
  v_limit      integer;
begin
  if v_user_id is null then
    return null;
  end if;

  select role, credits_remaining, last_credit_reset
    into v_role, v_credits, v_last_reset
    from user_profiles
    where id = v_user_id;

  if not found then
    return null;
  end if;

  if v_role = 'owner' then
    return null;
  end if;

  select nullif(value, '')::integer
    into v_limit
    from app_settings
    where key = 'daily_message_limit';

  if v_limit is null or v_limit <= 0 then
    return null;
  end if;

  if v_last_reset < current_date then
    update user_profiles
      set credits_remaining = v_limit,
          last_credit_reset = current_date
      where id = v_user_id;
    return v_limit;
  end if;

  return v_credits;
end;
$$;

revoke execute on function fn_reset_credits_if_due() from public;
grant  execute on function fn_reset_credits_if_due() to authenticated;
