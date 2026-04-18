-- Tags each assistant message with the coaching prompt that generated it,
-- so per-prompt feedback analytics can attribute responses correctly.
-- Nullable + ON DELETE SET NULL so deleting a prompt never breaks history.

alter table messages
  add column coaching_prompt_id uuid
  references coaching_prompts(id) on delete set null;

create index messages_coaching_prompt_id_idx
  on messages(coaching_prompt_id)
  where coaching_prompt_id is not null;
