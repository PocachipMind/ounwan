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
  ended_at timestamptz,
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
grant update (end_photo, ended_at) on workouts to authenticated;
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

-- 인증 카드 한마디 댓글
create table comments (
  id bigint generated always as identity primary key,
  workout_id bigint not null references workouts on delete cascade,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 60),
  created_at timestamptz not null default now()
);
alter table comments enable row level security;
revoke all on comments from authenticated, anon;
grant select, delete on comments to authenticated;
grant insert (workout_id, body) on comments to authenticated;
create policy "read" on comments for select to authenticated using (true);
create policy "own insert" on comments for insert to authenticated with check (user_id = auth.uid());
create policy "own delete" on comments for delete to authenticated using (user_id = auth.uid());

-- 승인: 남의 것만, 끝 사진 있어야
create function approve(wid bigint) returns void
language sql security definer set search_path = public as $$
  update workouts set approved_by = auth.uid()
  where id = wid and user_id <> auth.uid() and end_photo is not null and approved_by is null;
$$;
revoke execute on function approve from public, anon;
grant execute on function approve to authenticated;

-- 관리자 비밀번호 초기화 (메일 발송 없이)
create function admin_reset_password(uid uuid, pw text) returns void
language plpgsql security definer set search_path = public, extensions as $fn$
begin
  if not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    raise exception '관리자만 가능';
  end if;
  if length(pw) < 6 then raise exception '비밀번호는 6자 이상'; end if;
  update auth.users set encrypted_password = crypt(pw, gen_salt('bf')) where id = uid;
end $fn$;
revoke execute on function admin_reset_password from public, anon;
grant execute on function admin_reset_password to authenticated;

-- 사진 저장소 (공개 URL, 본인 폴더에만 업로드)
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
create policy "own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 가입 후 관리자 지정 (닉네임 바꿔서 실행):
-- update profiles set is_admin = true where nickname = '성규';

-- 공지(놀리기): 관리자 또는 지난주 3회(유산소1 포함, 확인된 것) 채운 사람만
create function can_notice() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select is_admin from profiles where id = auth.uid()), false) or exists (
    select 1 from (
      select count(*) filter (where kind = 'cardio') c, count(*) n from workouts
      where user_id = auth.uid() and approved_by is not null
        and created_at >= (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') - interval '7 days'
        and created_at <  (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
    ) x where c >= 1 and n >= 3);
$fn$;
revoke execute on function can_notice from public, anon;
grant execute on function can_notice to authenticated;

create table notices (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  target uuid references profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table notices enable row level security;
revoke all on notices from authenticated, anon;
grant select, delete on notices to authenticated;
grant insert (target, body) on notices to authenticated;
create policy "read" on notices for select to authenticated using (true);
create policy "eligible insert" on notices for insert to authenticated with check (user_id = auth.uid() and can_notice());
create policy "own delete" on notices for delete to authenticated using (user_id = auth.uid());

-- 몸무게 기록 (그래프용)
create table weights (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references profiles on delete cascade,
  kg numeric not null check (kg between 20 and 300),
  created_at timestamptz not null default now()
);
alter table weights enable row level security;
revoke all on weights from authenticated, anon;
grant select on weights to authenticated;
grant insert (kg) on weights to authenticated;
create policy "read" on weights for select to authenticated using (true);
create policy "own insert" on weights for insert to authenticated with check (user_id = auth.uid());

-- 콕 찌르기: 같은 사람한테 하루 1번
create table pokes (
  id bigint generated always as identity primary key,
  from_id uuid not null default auth.uid() references profiles on delete cascade,
  to_id uuid not null references profiles on delete cascade,
  day date not null default (now() at time zone 'Asia/Seoul')::date,
  created_at timestamptz not null default now(),
  unique (from_id, to_id, day),
  check (from_id <> to_id)
);
alter table pokes enable row level security;
revoke all on pokes from authenticated, anon;
grant select on pokes to authenticated;
grant insert (to_id) on pokes to authenticated;
create policy "read" on pokes for select to authenticated using (true);
create policy "own insert" on pokes for insert to authenticated with check (from_id = auth.uid());
