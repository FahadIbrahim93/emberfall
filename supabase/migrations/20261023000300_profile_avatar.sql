-- Accounts v2: preset ship-icon avatar on the profile (docs/specs/accounts-v2.md).
-- Additive only: a nullable column, a column grant, one new RPC.
alter table public.profiles add column if not exists avatar text
  check (avatar is null or avatar in ('vesper','halcyon','atlas','wraith','seraph'));
grant select (avatar) on public.profiles to anon, authenticated;

create or replace function private.set_avatar(p_avatar text) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare r public.profiles; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'guests cannot set an avatar: sign up first' using errcode = '42501';
  end if;
  if p_avatar is null or p_avatar not in ('vesper','halcyon','atlas','wraith','seraph') then
    raise exception 'unknown avatar';
  end if;
  update public.profiles set avatar = p_avatar where id = uid returning * into r;
  if r.id is null then raise exception 'set a callsign first'; end if;
  return r;
end $$;
revoke all on function private.set_avatar(text) from public, anon;
grant execute on function private.set_avatar(text) to authenticated;

create or replace function public.set_avatar(p_avatar text)
returns public.profiles language sql security invoker set search_path = '' as $$ select private.set_avatar(p_avatar) $$;
revoke all on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;
