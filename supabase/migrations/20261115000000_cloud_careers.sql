-- Cloud careers: versioned snapshots with compare-and-swap revision.
--
-- Additive: a new private.careers table keyed by pilot, plus load_career and
-- save_career RPCs. Existing tables, views, grants and RPCs are untouched.
-- The live boards and existing local saves stay intact. Schema work is applied
-- only after owner approval and a backup; this file is shipped unapplied.

create table if not exists private.careers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  snapshot jsonb not null,
  schema_version integer not null default 1 check (schema_version >= 1),
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now()
);
create index if not exists careers_updated on private.careers (updated_at desc);

-- Read the pilot's career snapshot. Returns null snapshot when none exists.
create or replace function public.load_career()
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_row private.careers%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_row from private.careers where user_id = v_uid;
  if not found then
    return jsonb_build_object('ok', true, 'snapshot', null, 'revision', null, 'updated_at', null);
  end if;
  return jsonb_build_object('ok', true, 'snapshot', v_row.snapshot,
    'revision', v_row.revision, 'updated_at', v_row.updated_at,
    'schema_version', v_row.schema_version);
end;
$function$;

-- Save a career snapshot with compare-and-swap on revision.
-- p_base_revision is the revision the client last read (null for a first save).
-- On a stale base revision the save is rejected and both sides are returned
-- so the client can offer a conflict choice instead of overwriting.
create or replace function public.save_career(p_snapshot jsonb, p_base_revision bigint default null)
returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_row private.careers%rowtype;
  v_new_rev bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'invalid snapshot' using errcode = '22023';
  end if;
  select * into v_row from private.careers where user_id = v_uid for update;
  if not found then
    insert into private.careers (user_id, snapshot, schema_version, revision)
    values (v_uid, p_snapshot,
      coalesce((p_snapshot->>'v')::integer, 1), 1);
    return jsonb_build_object('ok', true, 'revision', 1, 'conflict', false);
  end if;
  -- compare-and-swap: base revision must match the stored one
  if p_base_revision is not null and p_base_revision <> v_row.revision then
    return jsonb_build_object('ok', false, 'conflict', true,
      'remote_revision', v_row.revision, 'remote_snapshot', v_row.snapshot,
      'remote_updated_at', v_row.updated_at,
      'local_revision', p_base_revision);
  end if;
  v_new_rev := v_row.revision + 1;
  update private.careers
    set snapshot = p_snapshot,
        schema_version = coalesce((p_snapshot->>'v')::integer, v_row.schema_version),
        revision = v_new_rev,
        updated_at = now()
    where user_id = v_uid;
  return jsonb_build_object('ok', true, 'revision', v_new_rev, 'conflict', false);
end;
$function$;

grant execute on function public.load_career() to authenticated;
grant execute on function public.save_career(jsonb, bigint) to authenticated;
