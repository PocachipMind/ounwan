-- 방(그룹) 기능: 방마다 규칙, 초대 링크, 사진 여러 방 공유, 규칙 변경은 과반수 투표
begin;

-- 운동 종류를 자유 텍스트로 (방마다 종류가 다름)
alter table workouts drop constraint if exists workouts_kind_check;
update workouts set kind = case kind when 'cardio' then '유산소' when 'strength' then '근력' else kind end;
alter table workouts add constraint workouts_kind_check check (char_length(kind) between 1 and 12);

create table rooms (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 20),
  owner uuid not null references profiles on delete cascade,
  invite_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  weekly int not null default 3 check (weekly between 1 and 14),
  kinds jsonb not null default '[{"name":"유산소","min":1},{"name":"근력","min":2}]' check (jsonb_typeof(kinds) = 'array'),
  coupons int not null default 3 check (coupons between 0 and 30),
  fine int not null default 10000 check (fine between 0 and 1000000),
  show_weight boolean not null default true,
  created_at timestamptz not null default now()
);
create table room_members (
  room_id bigint not null references rooms on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table workout_rooms (
  workout_id bigint not null references workouts on delete cascade,
  room_id bigint not null references rooms on delete cascade,
  primary key (workout_id, room_id)
);
create table proposals (
  id bigint generated always as identity primary key,
  room_id bigint not null references rooms on delete cascade,
  proposer uuid not null references profiles on delete cascade,
  changes jsonb not null,
  status text not null default 'open' check (status in ('open', 'applied', 'rejected')),
  created_at timestamptz not null default now()
);
create table votes (
  proposal_id bigint not null references proposals on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  yes boolean not null,
  primary key (proposal_id, user_id)
);

create function is_member(r bigint) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from room_members where room_id = r and user_id = auth.uid());
$fn$;
create function shares_room(u uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from room_members a join room_members b using (room_id)
                 where a.user_id = auth.uid() and b.user_id = u);
$fn$;

-- 기존 데이터 → 첫 방 "오운완"
insert into rooms (name, owner, fine)
  select '오운완', id, (select fine from settings where id = 1) from profiles where is_admin order by created_at limit 1;
insert into room_members (room_id, user_id, joined_at) select (select min(id) from rooms), id, created_at from profiles;
insert into workout_rooms (workout_id, room_id) select id, (select min(id) from rooms) from workouts;
alter table chat add column room_id bigint references rooms on delete cascade;
update chat set room_id = (select min(id) from rooms);
alter table chat alter column room_id set not null;
alter table notices add column room_id bigint references rooms on delete cascade;
update notices set room_id = (select min(id) from rooms);
alter table notices alter column room_id set not null;

-- 권한
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table workout_rooms enable row level security;
alter table proposals enable row level security;
alter table votes enable row level security;
revoke all on rooms, room_members, workout_rooms, proposals, votes from authenticated, anon;
grant select on rooms, room_members, workout_rooms, proposals, votes to authenticated;
grant delete on room_members to authenticated;
grant insert (workout_id, room_id) on workout_rooms to authenticated;
create policy "member read" on rooms for select to authenticated using (is_member(id));
create policy "member read" on room_members for select to authenticated using (is_member(room_id));
create policy "leave" on room_members for delete to authenticated using (user_id = auth.uid());
create policy "member read" on workout_rooms for select to authenticated using (is_member(room_id));
create policy "share own" on workout_rooms for insert to authenticated
  with check (is_member(room_id) and exists (select 1 from workouts w where w.id = workout_id and w.user_id = auth.uid()));
create policy "member read" on proposals for select to authenticated using (is_member(room_id));
create policy "member read" on votes for select to authenticated
  using (exists (select 1 from proposals p where p.id = proposal_id and is_member(p.room_id)));

-- 운동: 나 또는 같은 방에 공유된 것만 보임
drop policy "read" on workouts;
create policy "room read" on workouts for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from workout_rooms wr where wr.workout_id = id and is_member(wr.room_id)));
-- 몸무게: 나 또는 같은 방 사람
drop policy "read" on weights;
create policy "room read" on weights for select to authenticated using (user_id = auth.uid() or shares_room(user_id));
-- 콕: 같은 방 사람한테만
drop policy "own insert" on pokes;
create policy "own insert" on pokes for insert to authenticated with check (from_id = auth.uid() and shares_room(to_id));
-- 채팅: 방 단위
grant insert (room_id) on chat to authenticated;
drop policy "read" on chat;
drop policy "own insert" on chat;
create policy "member read" on chat for select to authenticated using (is_member(room_id));
create policy "member insert" on chat for insert to authenticated with check (user_id = auth.uid() and is_member(room_id));

-- 😈: 방 단위, 방장/관리자 또는 지난주 그 방 규칙 채운 사람
grant insert (room_id) on notices to authenticated;
drop policy "read" on notices;
drop policy "eligible insert" on notices;
drop function can_notice();
create function can_notice(r bigint) returns boolean
language sql stable security definer set search_path = public as $fn$
  with rm as (select * from rooms where id = r and is_member(r)),
  lw as (
    select w.kind from workouts w join workout_rooms wr on wr.workout_id = w.id and wr.room_id = r
    where w.user_id = auth.uid() and w.approved_by is not null
      and w.created_at >= (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') - interval '7 days'
      and w.created_at <  (date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'))
  select exists (select 1 from rm) and (
    coalesce((select is_admin from profiles where id = auth.uid()), false)
    or (select owner from rm) = auth.uid()
    or ((select count(*) from lw) >= (select weekly from rm)
        and not exists (select 1 from rm, jsonb_array_elements(rm.kinds) k
                        where (select count(*) from lw where lw.kind = k->>'name') < (k->>'min')::int)));
$fn$;
revoke execute on function can_notice(bigint) from public, anon;
grant execute on function can_notice(bigint) to authenticated;
create policy "member read" on notices for select to authenticated using (is_member(room_id));
create policy "eligible insert" on notices for insert to authenticated with check (user_id = auth.uid() and can_notice(room_id));

-- 확인: 같은 방 사람만
create or replace function approve(wid bigint) returns void
language sql security definer set search_path = public as $fn$
  update workouts set approved_by = auth.uid()
  where id = wid and user_id <> auth.uid() and end_photo is not null and approved_by is null
    and exists (select 1 from workout_rooms wr where wr.workout_id = wid and is_member(wr.room_id));
$fn$;

-- 방 만들기 (만든 사람 자동 참가, 처음 규칙은 자유)
create function create_room(p_name text, p_weekly int, p_kinds jsonb, p_coupons int, p_fine int, p_show boolean) returns bigint
language plpgsql security definer set search_path = public as $fn$
declare rid bigint;
begin
  insert into rooms (name, owner, weekly, kinds, coupons, fine, show_weight)
    values (p_name, auth.uid(), p_weekly, p_kinds, p_coupons, p_fine, p_show) returning id into rid;
  insert into room_members (room_id, user_id) values (rid, auth.uid());
  return rid;
end $fn$;
-- 초대 코드로 들어가기
create function join_room(code text) returns bigint
language plpgsql security definer set search_path = public as $fn$
declare rid bigint;
begin
  select id into rid from rooms where invite_code = code;
  if rid is null then raise exception '없는 초대 링크'; end if;
  insert into room_members (room_id, user_id) values (rid, auth.uid()) on conflict do nothing;
  return rid;
end $fn$;

-- 규칙 변경: 제안 → 투표, 과반수 찬성이면 바로 적용, 과반수 반대면 기각
create function tally(pid bigint) returns text
language plpgsql security definer set search_path = public as $fn$
declare p proposals; m int; y int; n int;
begin
  select * into p from proposals where id = pid;
  if p.status <> 'open' then return p.status; end if;
  select count(*) into m from room_members where room_id = p.room_id;
  select count(*) filter (where yes), count(*) filter (where not yes) into y, n from votes where proposal_id = pid;
  if y * 2 > m then
    update rooms set
      name = coalesce(p.changes->>'name', name),
      weekly = coalesce((p.changes->>'weekly')::int, weekly),
      kinds = coalesce(p.changes->'kinds', kinds),
      coupons = coalesce((p.changes->>'coupons')::int, coupons),
      fine = coalesce((p.changes->>'fine')::int, fine),
      show_weight = coalesce((p.changes->>'show_weight')::boolean, show_weight)
    where id = p.room_id;
    update proposals set status = 'applied' where id = pid;
    return 'applied';
  elsif n * 2 >= m then
    update proposals set status = 'rejected' where id = pid;
    return 'rejected';
  end if;
  return 'open';
end $fn$;
create function propose(r bigint, ch jsonb) returns text
language plpgsql security definer set search_path = public as $fn$
declare pid bigint;
begin
  if not is_member(r) then raise exception '방 멤버만 제안 가능'; end if;
  insert into proposals (room_id, proposer, changes) values (r, auth.uid(), ch) returning id into pid;
  insert into votes (proposal_id, user_id, yes) values (pid, auth.uid(), true);
  return tally(pid);
end $fn$;
create function vote(pid bigint, agree boolean) returns text
language plpgsql security definer set search_path = public as $fn$
begin
  if not exists (select 1 from proposals p where p.id = pid and p.status = 'open' and is_member(p.room_id)) then
    raise exception '투표할 수 없는 제안';
  end if;
  insert into votes (proposal_id, user_id, yes) values (pid, auth.uid(), agree)
    on conflict (proposal_id, user_id) do update set yes = excluded.yes;
  return tally(pid);
end $fn$;
revoke execute on function create_room, join_room, tally, propose, vote, is_member, shares_room from public, anon;
grant execute on function create_room, join_room, propose, vote, is_member, shares_room to authenticated;
commit;
