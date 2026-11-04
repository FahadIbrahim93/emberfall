-- All-Time board: count Daily runs too (best run per pilot across endless + daily).
-- Daily runs are folded into the 'endless' bucket; columns/order and security_invoker unchanged.
create or replace view public.leaderboard_global with (security_invoker = true) as
select distinct on (m.mode, s.user_id) m.mode, s.user_id, p.callsign, s.score, s.stats, s.created_at
from public.player_scores s
join public.profiles p on p.id = s.user_id
cross join lateral (select case when s.mode = 'daily' then 'endless'::text else s.mode end as mode) m
where private.is_registered(s.user_id)
order by m.mode, s.user_id, s.score desc, s.created_at;
