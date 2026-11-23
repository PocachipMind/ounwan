begin;
-- 방 전용 커스텀 이모지 (사진 등록)
create table emojis (
  id bigint generated always as identity primary key,
  room_id bigint not null references rooms on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  name text not null check (char_length(name) between 1 and 12),
  url text not null,
  created_at timestamptz not null default now()
);
alter table emojis enable row level security;
revoke all on emojis from authenticated, anon;
grant select, delete on emojis to authenticated;
grant insert (room_id, name, url) on emojis to authenticated;
create policy "member read" on emojis for select to authenticated using (is_member(room_id));
create policy "member insert" on emojis for insert to authenticated with check (user_id = auth.uid() and is_member(room_id));
create policy "own delete" on emojis for delete to authenticated using (user_id = auth.uid());

-- 사진 이모지 반응: 기본 5개 또는 커스텀(':<emoji id>'), 사람당 이모지별 1개
create table reactions (
  workout_id bigint not null references workouts on delete cascade,
  photo_end boolean not null,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  emoji text not null check (emoji in ('🔥', '💪', '😂', '👍', '🤮') or emoji ~ '^:[0-9]+$'),
  created_at timestamptz not null default now(),
  primary key (workout_id, photo_end, user_id, emoji)
);
alter table reactions enable row level security;
revoke all on reactions from authenticated, anon;
grant select, delete on reactions to authenticated;
grant insert (workout_id, photo_end, emoji) on reactions to authenticated;
-- 볼 수 있는 운동(내 것 또는 같은 방)에만
create policy "read" on reactions for select to authenticated using (exists (select 1 from workouts w where w.id = workout_id));
create policy "own insert" on reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from workouts w where w.id = workout_id));
create policy "own delete" on reactions for delete to authenticated using (user_id = auth.uid());

-- 채팅 스티커 (커스텀 이모지 보내기)
alter table chat add column sticker_id bigint references emojis on delete set null;
alter table chat alter column body drop not null;
alter table chat drop constraint chat_body_check;
alter table chat add constraint chat_body_check check (body is null and sticker_id is not null or char_length(body) between 1 and 300);
grant insert (sticker_id) on chat to authenticated;

alter publication supabase_realtime add table reactions;
commit;
