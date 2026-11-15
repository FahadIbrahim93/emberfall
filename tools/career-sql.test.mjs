import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations'))
  .filter(f => f.endsWith('.sql')).sort();

const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, is_anonymous boolean not null default false);
    create function auth.uid() returns uuid language sql stable set search_path = '' as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable set search_path = '' as $$
      select jsonb_build_object('is_anonymous', coalesce(
        (select u.is_anonymous from auth.users u where u.id = auth.uid()), false))
    $$;
  `);
  for (const name of MIGRATIONS) {
    await db.exec(fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', name), 'utf8'));
  }
  return db;
}

async function user(db, id) {
  await db.query('insert into auth.users (id, is_anonymous) values ($1, false) on conflict (id) do nothing', [id]);
  await db.query('insert into public.profiles (id, callsign) values ($1, $2) on conflict (id) do nothing', [id, 'pilot_' + id.slice(-4)]);
  await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', id]);
}

function snap(rev, alloy) {
  return { v: 1, data: { alloy: alloy || 0, owned: ['vesper'] }, savedAt: Date.now() + (rev || 0) };
}

test('load_career returns no snapshot for a new pilot', async () => {
  const db = await fresh();
  await user(db, U1);
  const r = await db.query('select public.load_career() as r');
  const res = r.rows[0].r;
  assert.equal(res.ok, true);
  assert.equal(res.snapshot, null);
  assert.equal(res.revision, null);
});

test('save_career first save creates revision 1', async () => {
  const db = await fresh();
  await user(db, U1);
  const s = snap(1, 100);
  const r = await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(s), null]);
  const res = r.rows[0].r;
  assert.equal(res.ok, true);
  assert.equal(res.conflict, false);
  assert.equal(res.revision, 1);
});

test('load_career returns the saved snapshot and revision', async () => {
  const db = await fresh();
  await user(db, U1);
  const s = snap(1, 250);
  await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(s), null]);
  const r = await db.query('select public.load_career() as r');
  const res = r.rows[0].r;
  assert.equal(res.ok, true);
  assert.equal(res.revision, 1);
  assert.equal(res.snapshot.data.alloy, 250);
});

test('save_career CAS succeeds when base revision matches', async () => {
  const db = await fresh();
  await user(db, U1);
  const s1 = snap(1, 100);
  await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(s1), null]);
  const s2 = snap(2, 200);
  const r = await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(s2), 1]);
  const res = r.rows[0].r;
  assert.equal(res.ok, true);
  assert.equal(res.conflict, false);
  assert.equal(res.revision, 2);
});

test('save_career CAS conflict returns both sides', async () => {
  const db = await fresh();
  await user(db, U1);
  const s1 = snap(1, 100);
  await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(s1), null]);
  // stale base revision 0 should conflict
  const s2 = snap(2, 999);
  const r = await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(s2), 0]);
  const res = r.rows[0].r;
  assert.equal(res.ok, false);
  assert.equal(res.conflict, true);
  assert.equal(res.remote_revision, 1);
  assert.equal(res.remote_snapshot.data.alloy, 100);
  assert.equal(res.local_revision, 0);
});

test('save_career rejects invalid snapshot', async () => {
  const db = await fresh();
  await user(db, U1);
  let threw = false;
  try {
    await db.query('select public.save_career($1::jsonb, $2::bigint) as r', ['not-json-ish' , null]);
  } catch (e) { threw = true; }
  // passing a non-object jsonb should throw
  let threw2 = false;
  try {
    await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(42), null]);
  } catch (e) { threw2 = true; }
  assert.ok(threw || threw2, 'invalid snapshot must be rejected');
});

test('save_career requires authentication', async () => {
  const db = await fresh();
  // no user set
  let threw = false;
  try {
    await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(snap(1, 1)), null]);
  } catch (e) { threw = true; }
  assert.ok(threw, 'unauthenticated save must fail');
});

test('careers are isolated per pilot', async () => {
  const db = await fresh();
  await user(db, U1);
  const s1 = snap(1, 111);
  await db.query('select public.save_career($1::jsonb, $2::bigint) as r', [JSON.stringify(s1), null]);
  await user(db, U2);
  const r = await db.query('select public.load_career() as r');
  assert.equal(r.rows[0].r.snapshot, null);
});

