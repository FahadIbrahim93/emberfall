-- PostgREST maps SQLSTATE PTxxx to HTTP xxx: a rate-limited submit now answers 429, not 500.
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
  then raise exception 'rate limited' using errcode = 'PT429'; end if;
  insert into public.player_scores (user_id, mode, day, score, stats)
  values (uid, p_mode, case when p_mode = 'daily' then (now() at time zone 'utc')::date end, p_score, coalesce(p_stats, '{}'))
  returning id into new_id;
  return new_id;
end $$;

