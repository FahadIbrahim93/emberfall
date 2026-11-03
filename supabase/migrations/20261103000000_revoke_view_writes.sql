-- Leaderboard/stat views are read-only; drop write-type grants from client roles (keep SELECT).
revoke insert, update, delete, truncate, references, trigger
  on public.leaderboard_global, public.leaderboard_daily, public.deck_stats
  from anon, authenticated;
