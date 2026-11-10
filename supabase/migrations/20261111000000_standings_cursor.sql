-- Gate 2 standings (#15, #16). Additive. Do not apply this to the live project
-- from an agent checkout; the owner applies migrations.
--
-- standings_page freezes a watermark, then pages the best run per registered
-- pilot that existed at that watermark. A score posted later cannot appear
-- in the middle of a walk, duplicate a pilot, or drop one who was already
-- on the frozen set. Rank is competition rank (1, 1, 3). Score is text so a
-- bigint above 2^53 survives JSON. source_mode is the mode of the run that
-- set the score, so a Daily best is never reported as Endless.
--
-- pilot_dossier is the public profile read. The retired seasons and
-- pilot_cards mirror views are not recreated.
--
-- leaderboard_global and leaderboard_daily stay as compatibility readers
-- for clients that have not loaded this migration yet.

create index if not exists player_scores_best_cursor_idx
  on public.player_scores (user_id, score desc, created_at asc, id asc);

create index if not exists player_scores_daily_cursor_idx
  on public.player_scores (day, user_id, score desc, created_at asc, id asc)
  where mode = 'daily';

create index if not exists player_scores_created_idx
  on public.player_scores (created_at);

drop view if exists public.deck_stats;
create view public.deck_stats with (security_invoker = true) as
select ((select count(*) from public.profiles p where private.is_registered(p.id)))::integer as pilots,
       ((select count(*) from public.player_scores s where private.is_registered(s.user_id)))::integer as runs,
       coalesce((select max(s.score) from public.player_scores s where private.is_registered(s.user_id)), 0) as top_score,
       now() as updated_at,
       coalesce((select max(s.score)::text from public.player_scores s where private.is_registered(s.user_id)), '0') as top_score_exact;
grant select on public.deck_stats to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.deck_stats from anon, authenticated;

create or replace function public.standings_page(
  p_board text,
  p_day date default null,
  p_limit integer default 50,
  p_watermark timestamptz default null,
  p_cursor_score text default null,
  p_cursor_at timestamptz default null,
  p_cursor_user uuid default null
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  wm timestamptz := coalesce(p_watermark, pg_catalog.statement_timestamp());
  cur bigint;
  rows jsonb;
begin
  if p_board not in ('alltime', 'daily', 'school') then
    raise exception 'bad board' using errcode = '22023';
  end if;
  if p_board = 'daily' and p_day is null then
    raise exception 'daily board needs a day' using errcode = '22023';
  end if;
  if ((p_cursor_score is null)::integer + (p_cursor_at is null)::integer + (p_cursor_user is null)::integer) not in (0, 3) then
    raise exception 'partial cursor' using errcode = '22023';
  end if;
  if p_cursor_score is not null and p_cursor_score !~ '^[0-9]+$' then
    raise exception 'bad cursor' using errcode = '22023';
  end if;
  if p_cursor_score is not null then
    cur := p_cursor_score::bigint;
  end if;

  with eligible as (
    select s.user_id, s.mode, s.day, s.score, s.stats, s.created_at, s.id
    from public.player_scores s
    where s.created_at <= wm
      and private.is_registered(s.user_id)
      and (
        (p_board = 'daily' and s.mode = 'daily' and s.day = p_day)
        or (p_board = 'school' and s.mode = 'school')
        or (p_board = 'alltime' and s.mode in ('endless', 'daily'))
      )
  ),
  best as (
    select distinct on (s.user_id)
      s.user_id, s.mode as source_mode, s.day, s.score, s.stats, s.created_at
    from eligible s
    order by s.user_id, s.score desc, s.created_at asc, s.id asc
  ),
  ranked as (
    select b.user_id, b.source_mode, b.day, b.score, b.stats, b.created_at, p.callsign,
           rank() over (order by b.score desc)::integer as place
    from best b
    join public.profiles p on p.id = b.user_id
  ),
  paged as (
    select r.*
    from ranked r
    where cur is null
       or r.score < cur
       or (r.score = cur and r.created_at > p_cursor_at)
       or (r.score = cur and r.created_at = p_cursor_at and r.user_id > p_cursor_user)
    order by r.score desc, r.created_at asc, r.user_id asc
    limit lim
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'place', q.place,
      'source_mode', q.source_mode,
      'day', q.day,
      'user_id', q.user_id,
      'callsign', q.callsign,
      'score', q.score::text,
      'wave', case when (q.stats ->> 'wave') ~ '^[0-9]+$' then (q.stats ->> 'wave')::integer else null end,
      'ship', case when (q.stats ->> 'ship') ~ '^[A-Za-z0-9_-]{1,24}$' then q.stats ->> 'ship' else null end,
      'paint', case when (q.stats ->> 'paint') in ('yard', 'slate', 'verdant', 'crimson', 'violet', 'glacier', 'gold', 'night')
                    then q.stats ->> 'paint' else null end,
      'created_at', q.created_at
    ) order by q.score desc, q.created_at asc, q.user_id asc
  ), '[]'::jsonb)
  into rows
  from paged q;

  return jsonb_build_object('watermark', wm, 'rows', rows);
end
$function$;

create or replace function public.pilot_dossier(p_callsign text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  raw text := btrim(coalesce(p_callsign, ''));
  pid uuid;
  since timestamptz;
  canonical text;
  runs integer;
  modes jsonb;
begin
  if raw !~ '^[A-Za-z0-9_-]{3,16}$' then
    return null;
  end if;
  select p.id, p.callsign, p.created_at
    into pid, canonical, since
  from public.profiles p
  where lower(p.callsign) = lower(raw)
    and private.is_registered(p.id)
  limit 1;
  if pid is null then
    return null;
  end if;
  select count(*)::integer into runs
  from public.player_scores s
  where s.user_id = pid
    and private.is_registered(s.user_id);

  with best as (
    select distinct on (bucket)
      bucket, source_mode, day, score, stats, created_at
    from (
      select case
               when s.mode = 'daily' then 'daily'
               when s.mode = 'school' then 'school'
               else 'alltime'
             end as bucket,
             s.mode as source_mode,
             s.day, s.score, s.stats, s.created_at, s.id,
             case when s.mode in ('endless', 'daily') then 0 else 1 end as alltime_rank
      from public.player_scores s
      where s.user_id = pid
        and private.is_registered(s.user_id)
    ) s
    order by bucket, score desc, created_at asc, id asc
  ),
  -- all-time best is the best endless or daily run, not a third bucket above
  alltime as (
    select distinct on (s.user_id)
      'alltime'::text as bucket, s.mode as source_mode, s.day, s.score, s.stats, s.created_at
    from public.player_scores s
    where s.user_id = pid
      and s.mode in ('endless', 'daily')
      and private.is_registered(s.user_id)
    order by s.user_id, s.score desc, s.created_at asc, s.id asc
  ),
  chosen as (
    select * from alltime
    union all
    select bucket, source_mode, day, score, stats, created_at
    from best
    where bucket in ('daily', 'school')
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'board', c.bucket,
      'source_mode', c.source_mode,
      'day', c.day,
      'score', c.score::text,
      'wave', case when (c.stats ->> 'wave') ~ '^[0-9]+$' then (c.stats ->> 'wave')::integer else null end,
      'ship', case when (c.stats ->> 'ship') ~ '^[A-Za-z0-9_-]{1,24}$' then c.stats ->> 'ship' else null end,
      'paint', case when (c.stats ->> 'paint') in ('yard', 'slate', 'verdant', 'crimson', 'violet', 'glacier', 'gold', 'night')
                    then c.stats ->> 'paint' else null end,
      'place', (
        select count(*)::integer + 1
        from (
          select distinct on (s.user_id) s.user_id, s.score
          from public.player_scores s
          where private.is_registered(s.user_id)
            and (
              (c.bucket = 'alltime' and s.mode in ('endless', 'daily'))
              or (c.bucket = 'school' and s.mode = 'school')
              or (c.bucket = 'daily' and s.mode = 'daily' and s.day = c.day)
            )
          order by s.user_id, s.score desc, s.created_at asc, s.id asc
        ) peers
        where peers.score > c.score
      ),
      'created_at', c.created_at
    ) order by case c.bucket when 'alltime' then 0 when 'daily' then 1 else 2 end
  ), '[]'::jsonb)
  into modes
  from chosen c;

  return jsonb_build_object(
    'callsign', canonical,
    'since', since,
    'runs', runs,
    'modes', modes
  );
end
$function$;

revoke all on function public.standings_page(text, date, integer, timestamptz, text, timestamptz, uuid) from public;
revoke all on function public.pilot_dossier(text) from public;
grant execute on function public.standings_page(text, date, integer, timestamptz, text, timestamptz, uuid) to anon, authenticated;
grant execute on function public.pilot_dossier(text) to anon, authenticated;

notify pgrst, 'reload schema';
