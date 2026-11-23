-- 채팅 메시지 이모지 반응
create table chat_reactions (
  chat_id bigint not null references chat on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  emoji text not null check (emoji in ('🔥', '💪', '😂', '👍', '🤮')),
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id, emoji)
);
alter table chat_reactions enable row level security;
revoke all on chat_reactions from authenticated, anon;
grant select, delete on chat_reactions to authenticated;
grant insert (chat_id, emoji) on chat_reactions to authenticated;
create policy "read" on chat_reactions for select to authenticated using (exists (select 1 from chat c where c.id = chat_id));
create policy "own insert" on chat_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from chat c where c.id = chat_id));
create policy "own delete" on chat_reactions for delete to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table chat_reactions;
