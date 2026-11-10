-- Follow-up to 20261107000000_daily_run_receipts.sql (PR #88). Additive and
-- unapplied: it only replaces two function bodies and closes the new tables.
--
-- 1. One posting budget. public.submit_score and private.submit_run_v2 both
--    insert into public.player_scores, so both now count that table for the
--    six/minute and 300/day limits, and both take the same per-account
--    advisory lock. Mixed legacy/receipt posting can no longer exceed either
--    limit, and two concurrent posts cannot both pass the count.
-- 2. A replay never expires. An existing receipt is looked up and returned
--    before any freshness check; the launch-day window applies only to new runs.
-- 3. The new private tables get deny-by-default RLS and explicit revokes.
--
-- Scores and rewards stay client-reported. Do not apply to production as part
-- of the PR; the owner applies migrations.

create or replace function private.submit_score(p_mode text, p_score bigint, p_stats jsonb default '{}'::jsonb)
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
  -- Same per-account lock as submit_run_v2, so the count below is race-free.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  if (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 minute') >= 6
     or (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 day') >= 300
  then raise exception 'rate limited' using errcode = 'PT429'; end if;
  insert into public.player_scores (user_id, mode, day, score, stats)
  values (uid, p_mode, case when p_mode = 'daily' then (now() at time zone 'utc')::date end, p_score, coalesce(p_stats, '{}'))
  returning id into new_id;
  return new_id;
end $function$;

create or replace function private.submit_run_v2(
  p_run_id uuid,
  p_mode text,
  p_day date,
  p_score bigint,
  p_stats jsonb default '{}'::jsonb,
  p_status text default 'finished'
) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  uid uuid := (select auth.uid());
  existing private.daily_receipts%rowtype;
  v_score_id bigint;
  v_wave integer;
  v_paid integer := 0;
  v_medals text[] := '{}';
  v_amount integer;
  v_ack jsonb;
  v_daily jsonb;
  v_streak integer := 0;
  v_best integer := 0;
  v_perfect integer := 0;
  v_wardenfalls integer := 0;
  v_total bigint := 0;
  v_week_start date;
  v_day date;
  v_tier record;
  v_today date := (now() at time zone 'utc')::date;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'guest runs stay on this device: sign up to post' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'set a callsign first';
  end if;
  if p_run_id is null then
    raise exception 'run id required';
  end if;
  if p_mode not in ('endless', 'daily', 'school') then
    raise exception 'bad mode';
  end if;
  if p_status <> 'finished' then
    raise exception 'run not finished';
  end if;
  if p_score is null or p_score < 1 then
    raise exception 'score out of bounds';
  end if;
  if p_stats is null then p_stats := '{}'::jsonb; end if;
  if jsonb_typeof(p_stats) <> 'object' or pg_column_size(p_stats) >= 4096 then
    raise exception 'bad stats';
  end if;
  -- Shape only. The freshness window is applied to new runs below, after the
  -- replay lookup, so an accepted receipt stays replayable after it ages out.
  if p_mode = 'daily' then
    if p_day is null then raise exception 'daily day required'; end if;
  elsif p_day is not null then
    raise exception 'day is only valid for daily runs';
  end if;
  begin
    v_wave := coalesce((p_stats ->> 'wave')::integer, 0);
  exception when others then
    raise exception 'bad stats';
  end;
  if v_wave < 0 or v_wave > 10000 then
    raise exception 'bad stats';
  end if;

  -- One writer per account, shared with public.submit_score.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select * into existing
  from private.daily_receipts r
  where r.user_id = uid and r.run_id = p_run_id;
  if found then
    if existing.mode is distinct from p_mode
       or existing.day is distinct from p_day
       or existing.score is distinct from p_score
       or existing.status is distinct from p_status
       or existing.stats is distinct from p_stats then
      raise exception 'run id reused with a different payload' using errcode = '22000';
    end if;
    return existing.ack;
  end if;

  -- Only genuinely new runs reach the checks below.
  if p_mode = 'daily' and (p_day > v_today or p_day < v_today - 1) then
    raise exception 'daily day out of range';
  end if;

  -- Shared budget: every accepted post, legacy or receipt, is a player_scores row.
  if (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 minute') >= 6
     or (select count(*) from public.player_scores where user_id = uid and created_at > now() - interval '1 day') >= 300 then
    raise exception 'rate limited' using errcode = 'PT429';
  end if;

  insert into public.player_scores (user_id, mode, day, score, stats)
  values (uid, p_mode, p_day, p_score, p_stats)
  returning id into v_score_id;

  if p_mode = 'daily' then
    for v_tier in select * from private.daily_award_tiers(p_day, p_score, v_wave) loop
      insert into private.daily_awards (user_id, day, tier, amount)
      values (uid, p_day, v_tier.tier, v_tier.amount)
      on conflict (user_id, day, tier) do nothing
      returning amount into v_amount;
      if v_amount is not null then
        v_paid := v_paid + v_amount;
        v_medals := array_append(v_medals, v_tier.name);
      end if;
    end loop;

    -- Consecutive UTC days with an accepted Daily run; legacy rows count.
    v_day := p_day;
    while exists (
      select 1 from public.player_scores
      where user_id = uid and mode = 'daily' and day = v_day
    ) loop
      v_streak := v_streak + 1;
      v_day := v_day - 1;
    end loop;

    v_week_start := p_day - (extract(isodow from p_day)::integer - 1);
    if (select count(distinct day) from public.player_scores
        where user_id = uid and mode = 'daily'
          and day >= v_week_start and day < v_week_start + 7) = 7 then
      insert into private.daily_weeks (user_id, week_start)
      values (uid, v_week_start)
      on conflict (user_id, week_start) do nothing;
    end if;

    select count(*) into v_perfect from private.daily_weeks where user_id = uid;
    select count(*) into v_wardenfalls from private.daily_awards
      where user_id = uid and tier = 'wardenfall';
    select coalesce(sum(amount), 0) into v_total from private.daily_awards
      where user_id = uid;

    insert into private.daily_stats (user_id, best_streak, perfect_seasons, wardenfalls)
    values (uid, v_streak, v_perfect, v_wardenfalls)
    on conflict (user_id) do update set
      best_streak = greatest(private.daily_stats.best_streak, excluded.best_streak),
      perfect_seasons = greatest(private.daily_stats.perfect_seasons, excluded.perfect_seasons),
      wardenfalls = greatest(private.daily_stats.wardenfalls, excluded.wardenfalls),
      updated_at = now();
    select best_streak into v_best from private.daily_stats where user_id = uid;

    v_daily := jsonb_build_object(
      'day', p_day,
      'streak', v_streak,
      'best', v_best,
      'paid', v_paid,
      'total', v_total,
      'medals', to_jsonb(v_medals),
      'perfect', v_perfect,
      'wardenfall', exists (
        select 1 from private.daily_awards
        where user_id = uid and day = p_day and tier = 'wardenfall'
      ),
      'wardenfalls', v_wardenfalls
    );
  end if;

  v_ack := jsonb_build_object(
    'run_id', p_run_id,
    'accepted', true,
    'verification', 'client-reported',
    'mode', p_mode,
    'day', p_day,
    'score', p_score,
    'player_score_id', v_score_id
  );
  if v_daily is not null then
    v_ack := v_ack || jsonb_build_object('daily', v_daily);
  end if;

  insert into private.daily_receipts
    (user_id, run_id, mode, day, score, stats, status, verification, score_id, ack)
  values
    (uid, p_run_id, p_mode, p_day, p_score, p_stats, p_status, 'client-reported', v_score_id, v_ack);

  return v_ack;
end $function$;

-- Defense in depth: the definer functions run as the table owner and bypass
-- RLS, so enabling it with no policies denies every other role outright.
alter table private.daily_receipts enable row level security;
alter table private.daily_awards enable row level security;
alter table private.daily_weeks enable row level security;
alter table private.daily_stats enable row level security;
revoke all on table private.daily_receipts, private.daily_awards,
  private.daily_weeks, private.daily_stats from public, anon, authenticated;

notify pgrst, 'reload schema';
