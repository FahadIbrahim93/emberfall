-- EMBERFALL public mirror schema (ADR 0001 + the best-run dossier).
-- Idempotent. Apply once in the Supabase SQL editor (service role), then
-- pump with: node tools/db-sync.mjs
--
-- The deck's SQLite stays authoritative. These tables are public projections:
-- callsigns, accepted scores, the run that set each board score, season
-- totals, and a pilot card. No password hashes, sessions, telemetry, or
-- profile JSON.
--
-- Postgres notes (Supabase best practices):
--   * RLS on, forced, anon/authenticated SELECT only. No write policies.
--   * auth.uid() is not used: this mirror has no tenant. The policy is
--     `using (true)` for SELECT, which the planner can treat as a constant.
--   * Foreign keys are indexed. Board reads are (mode, rank).
--   * Natural keys from the deck (deck_id), not a second identity sequence.

-- ── legacy projections (safe if a previous apply already created them) ──

create table if not exists public.pilots (
  deck_id      bigint primary key,
  callsign     text not null,
  created_at   timestamptz,
  last_seen_at timestamptz,
  runs         integer not null default 0,
  best_score   bigint not null default 0,
  best_wave    integer not null default 0,
  total_paid   bigint not null default 0,
  best_streak  integer not null default 0,
  wardenfalls  integer not null default 0,
  constraint pilots_best_score_nonneg check (best_score >= 0)
);

create table if not exists public.scores (
  deck_id  bigint primary key,
  pilot    bigint not null references public.pilots (deck_id) on delete cascade,
  mode     text not null,
  score    bigint not null,
  wave     integer not null,
  ship     text not null,
  diff     integer not null,
  flown_at timestamptz,
  constraint scores_mode_known check (mode in ('main', 'daily', 'rush')),
  constraint scores_score_nonneg check (score >= 0)
);

create index if not exists scores_pilot_idx on public.scores (pilot);
create index if not exists scores_mode_score_idx on public.scores (mode, score desc);

create table if not exists public.gauntlet_days (
  day        text primary key,
  pilots     integer not null,
  runs       integer not null,
  top_score  bigint not null,
  top_pilot  text
);

create table if not exists public.deck_stats (
  id         integer primary key,
  pilots     integer not null,
  runs       integer not null,
  top_score  bigint not null,
  updated_at timestamptz
);

-- best_score / best_wave are the single career-best accepted run
-- (highest score, earliest flight on a tie), not two independent maximums.

-- ── per-mode board: one row per pilot per mode, the flight that set it ──

create table if not exists public.board_standings (
  mode      text not null,
  deck_id   bigint not null references public.pilots (deck_id) on delete cascade,
  callsign  text not null,
  score     bigint not null,
  wave      integer not null,
  ship      text not null,
  paint     text,
  mastery   integer not null default 0,
  rank      integer not null,
  flown_at  timestamptz,
  primary key (mode, deck_id),
  constraint board_standings_mode_known check (mode in ('main', 'daily', 'rush')),
  constraint board_standings_score_nonneg check (score >= 0),
  constraint board_standings_paint_known check (
    paint is null or paint in ('yard', 'slate', 'verdant', 'crimson', 'violet', 'glacier', 'gold', 'night')
  )
);

create index if not exists board_standings_mode_rank_idx
  on public.board_standings (mode, rank, flown_at);

-- ── season history: best five classic runs per pilot per Monday-UTC week ──

create table if not exists public.seasons (
  season    text not null,
  deck_id   bigint not null references public.pilots (deck_id) on delete cascade,
  callsign  text not null,
  pts       bigint not null,
  runs      integer not null,
  best      bigint not null,
  rank      integer not null,
  primary key (season, deck_id)
);

create index if not exists seasons_season_rank_idx on public.seasons (season, rank);

-- ── one public dossier per pilot, the same facts /pilot/<name> serves ──

create table if not exists public.pilot_cards (
  deck_id       bigint primary key references public.pilots (deck_id) on delete cascade,
  callsign      text not null,
  since         timestamptz,
  paint         text,
  wardenfalls   integer not null default 0,
  flew_days     integer not null default 0,
  alloy_paid    bigint not null default 0,
  main_score    bigint,
  main_wave     integer,
  main_ship     text,
  main_paint    text,
  main_mastery  integer,
  main_rank     integer,
  daily_score   bigint,
  daily_wave    integer,
  daily_ship    text,
  daily_paint   text,
  daily_mastery integer,
  daily_rank    integer,
  rush_score    bigint,
  rush_wave     integer,
  rush_ship     text,
  rush_paint    text,
  rush_mastery  integer,
  rush_rank     integer,
  season_key    text,
  season_pts    bigint,
  season_runs   integer,
  season_best   bigint,
  season_rank   integer,
  constraint pilot_cards_paint_known check (
    paint is null or paint in ('yard', 'slate', 'verdant', 'crimson', 'violet', 'glacier', 'gold', 'night')
  )
);

create index if not exists pilot_cards_callsign_idx on public.pilot_cards (callsign);

-- Career board for older clients. Recreated every apply so a previous
-- security-definer view (owner bypasses RLS) cannot linger, and so the
-- column list stays the public contract: no last_seen, no deck identity
-- beyond what the boards already show.
drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker = true) as
select callsign, runs, best_score, best_wave, wardenfalls, best_streak, total_paid
from public.pilots
where best_score > 0;

-- ── privileges + RLS: anon reads, nobody else writes ──
-- Drop EVERY policy first. A leftover FOR ALL / INSERT policy would survive
-- a re-apply that only replaced the *_read policy.

do $$
declare
  t text;
  pol text;
begin
  foreach t in array array['pilots', 'scores', 'gauntlet_days', 'deck_stats', 'board_standings', 'seasons', 'pilot_cards']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    for pol in
      select policyname from pg_policies where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol, t);
    end loop;
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to anon, authenticated', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t
    );
  end loop;
end $$;

-- last_seen_at is login activity, not a board fact. Clear it and take it
-- off the anon/authenticated column list. The service role still bypasses
-- RLS for the operator sync; db-sync writes NULL here on purpose.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pilots' and column_name = 'last_seen_at'
  ) then
    execute 'alter table public.pilots alter column last_seen_at drop not null';
    execute 'update public.pilots set last_seen_at = null where last_seen_at is not null';
    execute 'revoke select (last_seen_at) on table public.pilots from public, anon, authenticated';
  end if;
end $$;

revoke all on table public.leaderboard from public, anon, authenticated;
grant select on table public.leaderboard to anon, authenticated;

-- The script fails closed if a write grant or a non-SELECT policy remains.
-- has_*_privilege is the ground truth: a table-level SELECT plus a column
-- revoke does not show up as a row in column_privileges.
do $$
declare
  t text;
  role text;
  bad int;
begin
  foreach t in array array['pilots', 'scores', 'gauntlet_days', 'deck_stats', 'board_standings', 'seasons', 'pilot_cards', 'leaderboard']
  loop
    foreach role in array array['anon', 'authenticated']
    loop
      if has_table_privilege(role, format('public.%I', t)::regclass, 'INSERT')
        or has_table_privilege(role, format('public.%I', t)::regclass, 'UPDATE')
        or has_table_privilege(role, format('public.%I', t)::regclass, 'DELETE')
        or has_table_privilege(role, format('public.%I', t)::regclass, 'TRUNCATE')
      then
        raise exception 'mirror schema: % still has a write grant on %', role, t;
      end if;
      if not has_table_privilege(role, format('public.%I', t)::regclass, 'SELECT') then
        raise exception 'mirror schema: % lost SELECT on %', role, t;
      end if;
    end loop;
  end loop;
  if has_column_privilege('anon', 'public.pilots', 'last_seen_at', 'SELECT')
    or has_column_privilege('authenticated', 'public.pilots', 'last_seen_at', 'SELECT')
  then
    raise exception 'mirror schema: last_seen_at is still readable by anon';
  end if;
  select count(*) into bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('pilots', 'scores', 'gauntlet_days', 'deck_stats', 'board_standings', 'seasons', 'pilot_cards')
    and cmd <> 'SELECT';
  if bad > 0 then
    raise exception 'mirror schema: a non-SELECT policy is still installed';
  end if;
end $$;
