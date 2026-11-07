-- Daily completion receipts and acknowledged rewards.
--
-- Additive: the existing player_scores ledger, submit_score compatibility RPC,
-- views and grants stay in place. A run submitted through submit_run_v2 gets a
-- stable (user_id, run_id) receipt; replaying the same payload returns the
-- original acknowledgement without inserting another score or paying again.
-- Verification is explicitly client-reported, never silently "verified".

create table if not exists private.daily_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  run_id uuid not null,
  mode text not null check (mode in ('endless', 'daily', 'school')),
  day date,
  score bigint not null check (score >= 1),
  stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 4096),
  status text not null check (status = 'finished'),
  verification text not null default 'client-reported' check (verification = 'client-reported'),
  score_id bigint not null references public.player_scores(id) on delete cascade,
  ack jsonb not null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, run_id),
  check ((mode = 'daily') = (day is not null))
);
create index if not exists daily_receipts_user_time on private.daily_receipts (user_id, created_at desc);

-- Each tier is paid once per UTC day. The table is the idempotency ledger for
-- rewards; a duplicate insert is a no-op, not a second payment.
create table if not exists private.daily_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  tier text not null,
  amount integer not null check (amount > 0),
  awarded_at timestamptz not null default now(),
  primary key (user_id, day, tier)
);

-- A complete Monday-Sunday week is counted once, however many runs arrive.
create table if not exists private.daily_weeks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- Monotonic lifetime counters derived from accepted runs and awards.
create table if not exists private.daily_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  best_streak integer not null default 0 check (best_streak >= 0),
  perfect_seasons integer not null default 0 check (perfect_seasons >= 0),
  wardenfalls integer not null default 0 check (wardenfalls >= 0),
  updated_at timestamptz not null default now()
);

-- FNV-1a over the day key, matching hashStr() in the client and
-- tools/wardenfall-check.mjs. Day keys are ASCII.
create or replace function private.fnv1a(p_text text) returns bigint
language plpgsql immutable set search_path = '' as $function$
declare h bigint := 2166136261; i integer;
begin
  for i in 1..char_length(p_text) loop
    h := h # ascii(substr(p_text, i, 1));
    h := (h * 16777619) % 4294967296;
  end loop;
  return h;
end $function$;

create or replace function private.wardenfall_sunday(p_day date) returns boolean
language sql immutable set search_path = '' as $function$
  select extract(isodow from p_day) = 7
     and mod(private.fnv1a('warden-' || to_char(p_day, 'YYYY-MM-DD')), 7) = 0
$function$;

-- The exact client/tool payout contract: every tier reached by wave OR score,
-- with the Sunday and rare-Sunday gates. The rare honor is wave-gated only.
create or replace function private.daily_award_tiers(p_day date, p_score bigint, p_wave integer)
returns table (tier text, name text, amount integer)
language sql immutable set search_path = '' as $function$
  select t.tier, t.name, t.amount
  from (values
    ('crest',     'Crest',       5,  4000,  120,  false, false),
    ('crown',     'Crown',       10, 12000, 260,  false, false),
    ('eclipse',   'Eclipse',     15, 26000, 450,  false, false),
    ('solar',     'Solar Guard', 20, 40000, 800,  true,  false),
    ('wardenfall','Wardenfall',  16, 48000, 1000, true,  true)
  ) as t(tier, name, min_wave, min_score, amount, sunday_only, rare_only)
  where (not t.sunday_only or extract(isodow from p_day) = 7)
    and (not t.rare_only or private.wardenfall_sunday(p_day))
    and case
      when t.rare_only then p_wave >= t.min_wave
      else p_wave >= t.min_wave or p_score >= t.min_score
    end
  order by t.amount
$function$;

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
  if p_mode = 'daily' then
    if p_day is null then raise exception 'daily day required'; end if;
    if p_day > v_today or p_day < v_today - 1 then
      raise exception 'daily day out of range';
    end if;
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

  -- One writer per account, so a duplicate run cannot race its own receipt.
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

  -- Deduplicate before charging quota: the lookup above already returned a
  -- replay; only genuinely new runs count against the minute/day limits.
  if (select count(*) from private.daily_receipts where user_id = uid and created_at > now() - interval '1 minute') >= 6
     or (select count(*) from private.daily_receipts where user_id = uid and created_at > now() - interval '1 day') >= 300 then
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

create or replace function public.submit_run_v2(
  p_run_id uuid,
  p_mode text,
  p_day date,
  p_score bigint,
  p_stats jsonb default '{}'::jsonb,
  p_status text default 'finished'
) returns jsonb
language sql security invoker set search_path = '' as $function$
  select private.submit_run_v2(p_run_id, p_mode, p_day, p_score, p_stats, p_status)
$function$;

revoke all on function private.fnv1a(text), private.wardenfall_sunday(date),
  private.daily_award_tiers(date, bigint, integer)
  from public, anon, authenticated;
revoke all on function private.submit_run_v2(uuid, text, date, bigint, jsonb, text) from public, anon;
revoke all on function public.submit_run_v2(uuid, text, date, bigint, jsonb, text) from public, anon;
grant execute on function private.submit_run_v2(uuid, text, date, bigint, jsonb, text) to authenticated;
grant execute on function public.submit_run_v2(uuid, text, date, bigint, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
