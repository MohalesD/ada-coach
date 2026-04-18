-- Adds optional thumbs-up/down feedback on assistant messages.
--
-- Security model:
--   - feedback column accepts NULL or one of ('positive', 'negative')
--   - Only the `feedback` column is writable by authenticated users
--     (column-level GRANT prevents tampering with content/role/etc. from
--      the browser, even if RLS were ever loosened)
--   - RLS limits writes to assistant messages in the user's own conversations

-- 1. Column + check constraint
alter table messages
  add column feedback text
  check (feedback is null or feedback in ('positive', 'negative'));

-- 2. Lock down authenticated UPDATE to a single column
revoke update on messages from authenticated;
grant update (feedback) on messages to authenticated;

-- 3. RLS UPDATE policy: assistant messages in own conversations only
create policy "users update feedback on own assistant messages"
  on messages for update
  to authenticated
  using (
    role = 'assistant'
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    role = 'assistant'
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and c.user_id = auth.uid()
    )
  );
