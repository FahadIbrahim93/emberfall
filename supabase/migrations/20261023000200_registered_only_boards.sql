-- Worldwide boards are for signed-up pilots only. Guests (Supabase anonymous
-- users, auth.jwt() ->> 'is_anonymous' = true) keep their scores on-device.
-- Server-side enforcement: the RPCs refuse anonymous sessions, and the public
-- views hide any row whose owner is (still) an anonymous auth user.

-- helper: is this auth user a real (non-anonymous) account? definer so the
-- invoker views can ask without anon/authenticated reading auth.users.
create or replace function private.is_registered(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = p_uid and not coalesce(u.is_anonymous, false))
$$;
revoke all on function private.is_registered(uuid) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.is_registered(uuid) to anon, authenticated;

create or replace function private.set_callsign(p_callsign text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare r public.profiles; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'guests cannot claim a callsign: sign up first' using errcode = '42501';
  end if;
  insert into public.profiles (id, callsign) values (uid, p_callsign)
  on conflict (id) do update set callsign = excluded.callsign returning * into r;
  return r;
end $$;

create or replace function private.submit_score(p_mode text, p_score integer, p_stats jsonb default '{}')
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); new_id bigint;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'guest scores stay on this device: sign up to post' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'set a callsign first'; end if;
  if p_mode not in ('endless','daily','school') then raise exception 'bad mode'; end if;
  if p_score is null or p_score < 1 or p_score > 10000000 then raise exception 'score out of bounds'; end if;
  if (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 minute') >= 6
     or (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 day') >= 300
  then raise exception 'rate limited' using errcode = 'PT429'; end if;
  insert into public.player_scores (user_id, mode, day, score, stats)
  values (uid, p_mode, case when p_mode = 'daily' then (now() at time zone 'utc')::date end, p_score, coalesce(p_stats, '{}'))
  returning id into new_id;
  return new_id;
end $$;

-- same columns and order as before (create or replace view keeps grants)
create or replace view public.leaderboard_global with (security_invoker = true) as
select distinct on (s.mode, s.user_id) s.mode, s.user_id, p.callsign, s.score, s.stats, s.created_at
from public.player_scores s join public.profiles p on p.id = s.user_id
where s.mode <> 'daily' and private.is_registered(s.user_id)
order by s.mode, s.user_id, s.score desc, s.created_at;
create or replace view public.leaderboard_daily with (security_invoker = true) as
select distinct on (s.day, s.user_id) s.day, s.user_id, p.callsign, s.score, s.stats, s.created_at
from public.player_scores s join public.profiles p on p.id = s.user_id
where s.mode = 'daily' and private.is_registered(s.user_id)
order by s.day, s.user_id, s.score desc, s.created_at;
create or replace view public.deck_stats with (security_invoker = true) as
select (select count(*) from public.profiles p where private.is_registered(p.id))::int as pilots,
       (select count(*) from public.player_scores s where private.is_registered(s.user_id))::int as runs,
       coalesce((select max(s.score) from public.player_scores s where private.is_registered(s.user_id)), 0) as top_score,
       now() as updated_at;
