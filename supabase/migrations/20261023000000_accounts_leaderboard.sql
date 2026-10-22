-- EMBERFALL accounts + global leaderboard (Supabase-only, ADR 0003: best run per player per board).
-- DRAFT: not yet applied — project bhcczyyhadornihhzpsu is not in the connected Supabase account.
-- Legacy mirror tables (pilots, scores, deck_stats …) are left intact; deck_stats is
-- replaced by a live view so the mirror alarm stays green without a sync pump.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  callsign text not null check (callsign ~ '^[A-Za-z0-9_-]{3,16}$'),
  created_at timestamptz not null default now()
);
create unique index profiles_callsign_ci on public.profiles (lower(callsign));

create table public.player_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('endless','daily','school')),
  day date,
  score integer not null check (score between 1 and 10000000),
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 4096),
  created_at timestamptz not null default now(),
  check ((mode = 'daily') = (day is not null))
);
create index player_scores_board on public.player_scores (mode, day, score desc);
create index player_scores_user on public.player_scores (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.player_scores enable row level security;
revoke all on public.profiles, public.player_scores from anon, authenticated;
grant select (id, callsign, created_at) on public.profiles to anon, authenticated;
grant select on public.player_scores to anon, authenticated;
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
create policy scores_read on public.player_scores for select to anon, authenticated using (true);
-- no insert/update/delete policies or grants: writes only via the RPCs below.

create or replace function private.set_callsign(p_callsign text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare r public.profiles; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  insert into public.profiles (id, callsign) values (uid, p_callsign)
  on conflict (id) do update set callsign = excluded.callsign returning * into r;
  return r;
end $$;

create or replace function private.submit_score(p_mode text, p_score integer, p_stats jsonb default '{}')
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); new_id bigint;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'set a callsign first'; end if;
  if p_mode not in ('endless','daily','school') then raise exception 'bad mode'; end if;
  if p_score is null or p_score < 1 or p_score > 10000000 then raise exception 'score out of bounds'; end if;
  if (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 minute') >= 6
     or (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 day') >= 300
  then raise exception 'rate limited' using errcode = 'P0429'; end if;
  insert into public.player_scores (user_id, mode, day, score, stats)
  values (uid, p_mode, case when p_mode = 'daily' then (now() at time zone 'utc')::date end, p_score, coalesce(p_stats, '{}'))
  returning id into new_id;
  return new_id;
end $$;

-- thin public wrappers (invoker) so PostgREST exposes rpc/submit_score while the definer body stays private
create or replace function public.submit_score(p_mode text, p_score integer, p_stats jsonb default '{}')
returns bigint language sql security invoker set search_path = '' as $$ select private.submit_score(p_mode, p_score, p_stats) $$;
create or replace function public.set_callsign(p_callsign text)
returns public.profiles language sql security invoker set search_path = '' as $$ select private.set_callsign(p_callsign) $$;
grant usage on schema private to authenticated;
revoke all on function private.submit_score(text,integer,jsonb), private.set_callsign(text) from public, anon;
grant execute on function private.submit_score(text,integer,jsonb), private.set_callsign(text) to authenticated;
revoke all on function public.submit_score(text,integer,jsonb), public.set_callsign(text) from public, anon;
grant execute on function public.submit_score(text,integer,jsonb), public.set_callsign(text) to authenticated;

-- best run per player per board (ADR 0003)
create view public.leaderboard_global with (security_invoker = true) as
select distinct on (s.mode, s.user_id) s.mode, s.user_id, p.callsign, s.score, s.stats, s.created_at
from public.player_scores s join public.profiles p on p.id = s.user_id
where s.mode <> 'daily' order by s.mode, s.user_id, s.score desc, s.created_at;
create view public.leaderboard_daily with (security_invoker = true) as
select distinct on (s.day, s.user_id) s.day, s.user_id, p.callsign, s.score, s.stats, s.created_at
from public.player_scores s join public.profiles p on p.id = s.user_id
where s.mode = 'daily' order by s.day, s.user_id, s.score desc, s.created_at;
grant select on public.leaderboard_global, public.leaderboard_daily to anon, authenticated;

-- deck_stats becomes live: freshness = now(), so the alarm is green whenever the DB answers.
-- (mirror-alarm compares deck_stats.pilots to the profile count, see tools/mirror-alarm.mjs)
drop table if exists public.deck_stats;
create view public.deck_stats with (security_invoker = true) as
select (select count(*) from public.profiles)::int as pilots,
       (select count(*) from public.player_scores)::int as runs,
       coalesce((select max(score) from public.player_scores), 0) as top_score,
       now() as updated_at;
grant select on public.deck_stats to anon, authenticated;
