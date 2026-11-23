-- Supabase SQL Editor에 통째로 붙여넣고 Run

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null,
  target_weight numeric,
  current_weight numeric,
  weight_photo text,
  avatar text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  kind text not null check (kind in ('cardio', 'strength')),
  start_photo text not null,
  end_photo text,
  approved_by uuid references profiles,
  created_at timestamptz not null default now()
);

create table settings (
  id int primary key default 1 check (id = 1),
  fine int not null default 10000
);
insert into settings default values;

alter table profiles enable row level security;
alter table workouts enable row level security;
alter table settings enable row level security;

-- 컬럼 단위 권한: is_admin, approved_by 는 클라이언트가 직접 못 바꿈
revoke all on profiles, workouts, settings from authenticated, anon;
grant select on profiles, workouts, settings to authenticated;
grant delete on workouts to authenticated;
grant insert (id, nickname) on profiles to authenticated;
grant update (nickname, target_weight, current_weight, weight_photo, avatar) on profiles to authenticated;
grant insert (kind, start_photo) on workouts to authenticated;
grant update (end_photo) on workouts to authenticated;
grant update (fine) on settings to authenticated;

create policy "read" on profiles for select to authenticated using (true);
create policy "own insert" on profiles for insert to authenticated with check (id = auth.uid());
create policy "own update" on profiles for update to authenticated using (id = auth.uid());

create policy "read" on workouts for select to authenticated using (true);
create policy "own insert" on workouts for insert to authenticated with check (user_id = auth.uid());
create policy "own finish" on workouts for update to authenticated using (user_id = auth.uid() and approved_by is null);
create policy "own delete" on workouts for delete to authenticated using (user_id = auth.uid() and approved_by is null);

create policy "read" on settings for select to authenticated using (true);
create policy "admin update" on settings for update to authenticated
  using ((select is_admin from profiles where id = auth.uid()));

-- 승인: 남의 것만, 끝 사진 있어야
create function approve(wid bigint) returns void
language sql security definer set search_path = public as $$
  update workouts set approved_by = auth.uid()
  where id = wid and user_id <> auth.uid() and end_photo is not null and approved_by is null;
$$;
revoke execute on function approve from public, anon;
grant execute on function approve to authenticated;

-- 사진 저장소 (공개 URL, 본인 폴더에만 업로드)
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 가입 후 관리자 지정 (닉네임 바꿔서 실행):
-- update profiles set is_admin = true where nickname = '성규';
