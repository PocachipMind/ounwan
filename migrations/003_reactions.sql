-- 사진 이모지 반응 (시작/끝 사진 각각, 사람당 이모지별 1개)
create table reactions (
  workout_id bigint not null references workouts on delete cascade,
  photo_end boolean not null,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  emoji text not null check (emoji in ('🔥', '💪', '😂', '👍', '🤮')),
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
alter publication supabase_realtime add table reactions;
