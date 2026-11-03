-- Widen scores to bigint so very large runs post (approved by Fahad). No upper cap; score >= 1 kept.
drop view if exists public.leaderboard_global;
drop view if exists public.leaderboard_daily;
drop view if exists public.deck_stats;

alter table public.player_scores alter column score type bigint;
alter table public.player_scores drop constraint if exists player_scores_score_check;
alter table public.player_scores add constraint player_scores_score_check check (score >= 1);

create view public.leaderboard_daily with (security_invoker = true) as
 SELECT DISTINCT ON (s.day, s.user_id) s.day, s.user_id, p.callsign, s.score, s.stats, s.created_at
   FROM public.player_scores s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.mode = 'daily' AND private.is_registered(s.user_id)
  ORDER BY s.day, s.user_id, s.score DESC, s.created_at;

create view public.leaderboard_global with (security_invoker = true) as
 SELECT DISTINCT ON (m.mode, s.user_id) m.mode, s.user_id, p.callsign, s.score, s.stats, s.created_at
   FROM public.player_scores s JOIN public.profiles p ON p.id = s.user_id
   CROSS JOIN LATERAL (SELECT CASE WHEN s.mode = 'daily' THEN 'endless' ELSE s.mode END AS mode) m
  WHERE private.is_registered(s.user_id)
  ORDER BY m.mode, s.user_id, s.score DESC, s.created_at;

create view public.deck_stats with (security_invoker = true) as
 SELECT ((SELECT count(*) FROM public.profiles p WHERE private.is_registered(p.id)))::integer AS pilots,
        ((SELECT count(*) FROM public.player_scores s WHERE private.is_registered(s.user_id)))::integer AS runs,
        COALESCE((SELECT max(s.score) FROM public.player_scores s WHERE private.is_registered(s.user_id)), 0) AS top_score,
        now() AS updated_at;

grant select on public.leaderboard_daily, public.leaderboard_global, public.deck_stats to anon, authenticated;

drop function if exists public.submit_score(text, integer, jsonb);
drop function if exists private.submit_score(text, integer, jsonb);

create function private.submit_score(p_mode text, p_score bigint, p_stats jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = '' as $function$
declare uid uuid := (select auth.uid()); new_id bigint;
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'guest scores stay on this device: sign up to post' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'set a callsign first'; end if;
  if p_mode not in ('endless','daily','school') then raise exception 'bad mode'; end if;
  if p_score is null or p_score < 1 then raise exception 'score out of bounds'; end if;
  if (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 minute') >= 6
     or (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 day') >= 300
  then raise exception 'rate limited' using errcode = 'PT429'; end if;
  insert into public.player_scores (user_id, mode, day, score, stats)
  values (uid, p_mode, case when p_mode = 'daily' then (now() at time zone 'utc')::date end, p_score, coalesce(p_stats, '{}'))
  returning id into new_id;
  return new_id;
end $function$;

create function public.submit_score(p_mode text, p_score bigint, p_stats jsonb default '{}'::jsonb)
returns bigint language sql set search_path = '' as $function$ select private.submit_score(p_mode, p_score, p_stats) $function$;

revoke all on function private.submit_score(text, bigint, jsonb) from public, anon;
revoke all on function public.submit_score(text, bigint, jsonb) from public, anon;
grant execute on function private.submit_score(text, bigint, jsonb) to authenticated;
grant execute on function public.submit_score(text, bigint, jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
