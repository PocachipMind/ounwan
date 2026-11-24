-- 몸무게 공개/비공개 (사람마다). 비공개면 본인 말고는 DB에서 안 내려줌
begin;
alter table profiles add column weight_public boolean not null default true;
grant update (weight_public) on profiles to authenticated;

-- 몸무게 칸은 직접 못 읽게 하고, 아래 함수로만
revoke select on profiles from authenticated, anon;
grant select (id, nickname, avatar, is_admin, created_at, weight_public) on profiles to authenticated;

create function weight_info() returns table (id uuid, current_weight numeric, target_weight numeric, weight_photo text)
language sql stable security definer set search_path = public as $fn$
  select p.id, p.current_weight, p.target_weight, p.weight_photo from profiles p
  where p.id = auth.uid() or (p.weight_public and shares_room(p.id));
$fn$;
revoke execute on function weight_info from public, anon;
grant execute on function weight_info to authenticated;

-- 몸무게 기록(그래프)도 같은 규칙
drop policy "room read" on weights;
create policy "room read" on weights for select to authenticated
  using (user_id = auth.uid() or (shares_room(user_id)
         and exists (select 1 from profiles p where p.id = user_id and p.weight_public)));
commit;
