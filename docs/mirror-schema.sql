-- EMBERFALL public mirror (Supabase Postgres) — reference schema
-- Authoritative store: Command Deck SQLite (ADR 0001). Apply via console,
-- psql, or `node tools/db-sync.mjs --print-sql` for idempotent upserts.
-- Index choices follow Supabase Postgres best practices: filter columns
-- first, selective partial indexes where reads are scoped.

-- Pilots: one row per registered callsign on the synced deck(s)
create table if not exists public.pilots (
  deck_id       bigint primary key,
  callsign      text not null,
  created_at    timestamptz,
  last_seen_at  timestamptz,
  runs          integer not null default 0,
  best_score    integer not null default 0,
  best_wave     integer not null default 0,
  total_paid    integer not null default 0,
  best_streak   integer not null default 0,
  wardenfalls   integer not null default 0
);

create index if not exists idx_pilots_callsign on public.pilots (callsign);
create index if not exists idx_pilots_best_score on public.pilots (best_score desc);

-- Accepted runs only (sync filters verdict on the deck)
create table if not exists public.scores (
  deck_id   bigint primary key,
  pilot     bigint not null references public.pilots (deck_id) on delete cascade,
  mode      text not null,
  score     integer not null,
  wave      integer not null,
  ship      text,
  diff      integer,
  flown_at  timestamptz
);

create index if not exists idx_scores_board on public.scores (mode, score desc);
create index if not exists idx_scores_pilot_mode on public.scores (pilot, mode, score desc);

-- Daily gauntlet aggregates (one row per UTC day)
create table if not exists public.gauntlet_days (
  day         date primary key,
  pilots      integer not null default 0,
  runs        integer not null default 0,
  top_score   integer not null default 0,
  top_pilot   text
);

create index if not exists idx_gauntlet_days_day on public.gauntlet_days (day desc);

-- Singleton census row for badges / stats.html
create table if not exists public.deck_stats (
  id          integer primary key,
  pilots      integer not null,
  runs        integer not null,
  top_score   integer not null,
  updated_at  timestamptz
);

-- Leaderboard view: best accepted run per pilot (main-mode agnostic rollup)
create or replace view public.leaderboard as
select
  p.callsign,
  p.runs,
  p.best_score,
  p.best_wave,
  p.wardenfalls,
  p.best_streak,
  p.total_paid,
  p.created_at
from public.pilots p
where p.runs > 0
order by p.best_score desc;

-- RLS: anon read-only everywhere (no INSERT/UPDATE/DELETE for anon)
alter table public.pilots enable row level security;
alter table public.scores enable row level security;
alter table public.gauntlet_days enable row level security;
alter table public.deck_stats enable row level security;

create policy "anon read pilots" on public.pilots for select to anon using (true);
create policy "anon read scores" on public.scores for select to anon using (true);
create policy "anon read gauntlet_days" on public.gauntlet_days for select to anon using (true);
create policy "anon read deck_stats" on public.deck_stats for select to anon using (true);
