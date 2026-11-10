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
const U3 = '00000000-0000-4000-8000-000000000003';
const U4 = '00000000-0000-4000-8000-000000000004';
const RUN = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

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

async function user(db, id, anonymous = false) {
  await db.query('insert into auth.users (id, is_anonymous) values ($1, $2) on conflict (id) do update set is_anonymous = excluded.is_anonymous', [id, anonymous]);
  await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', id]);
}

async function profile(db, id, callsign) {
  await db.query('insert into public.profiles (id, callsign) values ($1, $2)', [id, callsign]);
}

async function today(db) {
  const r = await db.query("select (now() at time zone 'utc')::date::text as day");
  return r.rows[0].day;
}

const dayShift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

async function submit(db, runId, day, score, wave, opts = {}) {
  const r = await db.query(
    `select public.submit_run_v2($1::uuid, $2, $3::date, $4::bigint, $5::jsonb, $6) as ack`,
    [runId, opts.mode || 'daily', day, score, JSON.stringify({ wave, ship: 'vesper', kills: 12, runT: 90 }), opts.status || 'finished']
  );
  return r.rows[0].ack;
}

async function count(db, table, where = '1=1', params = []) {
  const r = await db.query(`select count(*)::int as n from ${table} where ${where}`, params);
  return r.rows[0].n;
}

test('duplicate Daily receipts return one acknowledgement and one reward delta', async () => {
  const db = await fresh();
  const day = await today(db);
  await user(db, U1);
  await profile(db, U1, 'PILOT87');

  const first = await submit(db, RUN(1), day, 12000, 10);
  assert.equal(first.accepted, true);
  assert.equal(first.verification, 'client-reported');
  assert.equal(first.day, day);
  assert.equal(first.daily.paid, 380);
  assert.equal(first.daily.total, 380);
  assert.equal(first.daily.streak, 1);
  assert.equal(first.daily.best, 1);
  assert.deepEqual(first.daily.medals.sort(), ['Crest', 'Crown'].sort());

  const replay = await submit(db, RUN(1), day, 12000, 10);
  assert.deepEqual(replay, first);
  assert.equal(await count(db, 'private.daily_receipts'), 1);
  assert.equal(await count(db, 'private.daily_awards'), 2);
  assert.equal(await count(db, 'public.player_scores'), 1);
  assert.equal((await db.query('select count(*)::int as n from private.daily_awards where tier = \'crest\'')).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::int as n from private.daily_awards where tier = \'crown\'')).rows[0].n, 1);

  // A second, improved run on the same day pays only the newly reached tier.
  const second = await submit(db, RUN(2), day, 26000, 15);
  assert.equal(second.daily.paid, 450);
  assert.equal(second.daily.total, 830);
  assert.deepEqual(second.daily.medals, ['Eclipse']);
  assert.equal(second.daily.streak, 1);
  assert.equal(await count(db, 'private.daily_receipts'), 2);
  assert.equal(await count(db, 'private.daily_awards'), 3);

  // Reusing a run id with different content is refused, not silently paid.
  await assert.rejects(() => submit(db, RUN(1), day, 13000, 11), /different payload/);
  assert.equal(await count(db, 'private.daily_receipts'), 2);
  assert.equal(await count(db, 'private.daily_awards'), 3);

  // The legacy compatibility RPC still writes a row, but mints no receipt and
  // no daily reward; it is never presented as an acknowledged run.
  const legacy = await db.query(`select public.submit_score('daily', 5000, '{"wave":5}'::jsonb) as id`);
  assert.ok(legacy.rows[0].id);
  assert.equal(await count(db, 'private.daily_receipts'), 2);

  const third = await submit(db, RUN(3), day, 30000, 20);
  assert.equal(third.daily.paid, 0);
  assert.equal(third.daily.total, 830);
  assert.deepEqual(third.daily.medals, []);
  assert.equal(third.daily.streak, 1);
  assert.equal(await count(db, 'public.player_scores'), 4);
});

test('receipts preserve launch-bound day, auth, callsign and payload validation', async () => {
  const db = await fresh();
  const day = await today(db);

  await assert.rejects(() => submit(db, RUN(10), day, 1, 0), /not signed in/);

  await user(db, U2, true);
  await assert.rejects(() => submit(db, RUN(11), day, 1, 0), /guest runs stay/);

  await user(db, U2, false);
  await assert.rejects(() => submit(db, RUN(12), day, 1, 0), /callsign/);
  await profile(db, U2, 'PILOT88');

  await assert.rejects(() => submit(db, RUN(13), null, 1, 0), /daily day required/);
  await assert.rejects(() => submit(db, RUN(14), dayShift(day, 1), 1, 0), /out of range/);
  await assert.rejects(() => submit(db, RUN(15), dayShift(day, -2), 1, 0), /out of range/);
  await assert.rejects(() => submit(db, RUN(16), day, 1, 0, { mode: 'endless' }), /day is only valid/);
  await assert.rejects(() => submit(db, RUN(17), day, 1, 0, { status: 'abandoned' }), /run not finished/);
  await assert.rejects(() => db.query(
    `select public.submit_run_v2($1::uuid, 'daily', $2::date, 1, '[]'::jsonb, 'finished')`,
    [RUN(18), day]
  ), /bad stats/);

  // A run launched yesterday is still accepted today (midnight crossover).
  const prior = await submit(db, RUN(19), dayShift(day, -1), 1, 0);
  assert.equal(prior.day, dayShift(day, -1));
});

test('new runs are rate limited after six, but a replay is not charged', async () => {
  const db = await fresh();
  const day = await today(db);
  await user(db, U3);
  await profile(db, U3, 'PILOT89');

  for (let i = 0; i < 6; i++) {
    await submit(db, RUN(30 + i), day, 1, 0);
  }
  await assert.rejects(() => submit(db, RUN(36), day, 1, 0), /rate limited/);
  assert.equal(await count(db, 'private.daily_receipts'), 6);
  assert.equal(await count(db, 'public.player_scores'), 6);

  const replay = await submit(db, RUN(30), day, 1, 0);
  assert.equal(replay.run_id, RUN(30));
  assert.equal(await count(db, 'private.daily_receipts'), 6);
});

test('SQL payout tiers mirror the shipped JS medal contract', async () => {
  const db = await fresh();

  const rare = await db.query(`select private.wardenfall_sunday('2026-09-27'::date) as rare`);
  assert.equal(rare.rows[0].rare, true, 'the rehearsed rare Sunday must stay rare');
  assert.equal((await db.query(`select private.fnv1a('warden-2026-09-27') % 7 as gate`)).rows[0].gate, 0);

  const tiers = async (day, score, wave) => (await db.query(
    `select tier, name, amount from private.daily_award_tiers($1::date, $2::bigint, $3)`,
    [day, score, wave]
  )).rows;

  const rare15 = await tiers('2026-09-27', 48000, 15);
  assert.deepEqual(rare15.map(t => t.name), ['Crest', 'Crown', 'Eclipse', 'Solar Guard']);
  assert.equal(rare15.reduce((n, t) => n + t.amount, 0), 1630);

  const rare16 = await tiers('2026-09-27', 48000, 16);
  assert.deepEqual(rare16.map(t => t.name), ['Crest', 'Crown', 'Eclipse', 'Solar Guard', 'Wardenfall']);
  assert.equal(rare16.reduce((n, t) => n + t.amount, 0), 2630);

  const weekday = await tiers('2026-09-23', 48000, 20);
  assert.deepEqual(weekday.map(t => t.name), ['Crest', 'Crown', 'Eclipse']);
  assert.equal(weekday.reduce((n, t) => n + t.amount, 0), 830);

  const sunday = await db.query(`
    select d::date::text as day from generate_series('2026-01-01'::date, '2026-12-31'::date, '1 day') d
    where extract(isodow from d) = 7 and not private.wardenfall_sunday(d::date) limit 1
  `);
  const nonRare = await tiers(sunday.rows[0].day, 48000, 20);
  assert.deepEqual(nonRare.map(t => t.name), ['Crest', 'Crown', 'Eclipse', 'Solar Guard']);
  assert.equal(nonRare.reduce((n, t) => n + t.amount, 0), 1630);
});

test('lifetime counters stay monotonic and an out-of-order receipt is inert', async () => {
  const db = await fresh();
  const day = await today(db);
  const prior = dayShift(day, -1);
  await user(db, U4);
  await profile(db, U4, 'PILOT90');

  const first = await submit(db, RUN(40), prior, 12000, 10);
  assert.equal(first.daily.streak, 1);
  const next = await submit(db, RUN(41), day, 12000, 10);
  assert.equal(next.daily.streak, 2);
  assert.equal(next.daily.best, 2);
  assert.equal(next.daily.paid, 380, 'the new day pays its own tiers once');
  assert.equal(next.daily.total, 760);

  // Replaying the older day's ack must not move the streak backward or pay.
  const replay = await submit(db, RUN(40), prior, 12000, 10);
  assert.equal(replay.daily.streak, 1);
  assert.equal(replay.daily.total, 380);
  assert.equal((await db.query('select best_streak from private.daily_stats where user_id = $1', [U4])).rows[0].best_streak, 2);
});

const U5 = '00000000-0000-4000-8000-000000000005';
const U6 = '00000000-0000-4000-8000-000000000006';
const U7 = '00000000-0000-4000-8000-000000000007';
const U8 = '00000000-0000-4000-8000-000000000008';

async function legacy(db, mode, score, stats = { wave: 1 }) {
  const r = await db.query(`select public.submit_score($1, $2::bigint, $3::jsonb) as id`, [mode, score, JSON.stringify(stats)]);
  return r.rows[0].id;
}

async function asRole(db, role, fn) {
  await db.exec(`set role ${role}`);
  try { return await fn(); }
  finally { await db.exec('reset role'); }
}

test('mixed legacy and receipt posts share the per-minute and per-day budget', async () => {
  const db = await fresh();
  const day = await today(db);
  await user(db, U5);
  await profile(db, U5, 'PILOT91');

  for (let i = 0; i < 5; i++) await legacy(db, 'endless', 10 + i);
  await submit(db, RUN(50), day, 1, 0);
  await assert.rejects(() => submit(db, RUN(51), day, 1, 0), /rate limited/);
  await assert.rejects(() => legacy(db, 'endless', 99), /rate limited/);
  const replay = await submit(db, RUN(50), day, 1, 0);
  assert.equal(replay.run_id, RUN(50));
  assert.equal(await count(db, 'public.player_scores'), 6);
  assert.equal(await count(db, 'private.daily_receipts'), 1);
});

test('mixed posting also shares the 300/day cap, and a replay is not charged', async () => {
  const db = await fresh();
  const day = await today(db);
  await user(db, U6);
  await profile(db, U6, 'PILOT92');

  await db.query(`
    insert into public.player_scores (user_id, mode, score, stats, created_at)
    select $1::uuid, 'endless', 1, '{}'::jsonb, now() - interval '2 hours'
    from generate_series(1, 298)
  `, [U6]);
  await legacy(db, 'endless', 2);
  await submit(db, RUN(60), day, 1, 0);
  assert.equal(await count(db, 'public.player_scores', 'user_id = $1', [U6]), 300);
  await assert.rejects(() => submit(db, RUN(61), day, 1, 0), /rate limited/);
  await assert.rejects(() => legacy(db, 'daily', 3, { wave: 2 }), /rate limited/);
  const replay = await submit(db, RUN(60), day, 1, 0);
  assert.equal(replay.accepted, true);
  assert.equal(await count(db, 'public.player_scores', 'user_id = $1', [U6]), 300);
});

test('an aged receipt stays replayable; a new run for an expired day is refused', async () => {
  const db = await fresh();
  const day = await today(db);
  const aged = dayShift(day, -2);
  await user(db, U7);
  await profile(db, U7, 'PILOT93');

  const stats = { wave: 10, ship: 'vesper', kills: 12, runT: 90 };
  const scored = await db.query(`
    insert into public.player_scores (user_id, mode, day, score, stats)
    values ($1, 'daily', $2::date, 12000, $3::jsonb)
    returning id
  `, [U7, aged, JSON.stringify(stats)]);
  const ack = {
    run_id: RUN(70), accepted: true, verification: 'client-reported',
    mode: 'daily', day: aged, score: 12000, player_score_id: scored.rows[0].id,
    daily: { day: aged, paid: 380, total: 380, streak: 1, medals: ['Crest', 'Crown'] }
  };
  await db.query(`
    insert into private.daily_receipts
      (user_id, run_id, mode, day, score, stats, status, verification, score_id, ack)
    values ($1, $2::uuid, 'daily', $3::date, 12000, $4::jsonb, 'finished', 'client-reported', $5, $6::jsonb)
  `, [U7, RUN(70), aged, JSON.stringify(stats), scored.rows[0].id, JSON.stringify(ack)]);

  const replay = await submit(db, RUN(70), aged, 12000, 10);
  assert.deepEqual(replay, ack);
  assert.equal(await count(db, 'private.daily_receipts', 'user_id = $1', [U7]), 1);
  await assert.rejects(() => submit(db, RUN(71), aged, 12000, 10), /out of range/);
  assert.equal(await count(db, 'public.player_scores', 'user_id = $1', [U7]), 1);
});

test('anon and authenticated have no table privileges on private receipt ledgers', async () => {
  const db = await fresh();
  const day = await today(db);
  await user(db, U8);
  await profile(db, U8, 'PILOT94');
  await submit(db, RUN(80), day, 1, 0);

  for (const role of ['anon', 'authenticated']) {
    for (const table of ['private.daily_receipts', 'private.daily_awards', 'private.daily_weeks', 'private.daily_stats']) {
      await assert.rejects(() => asRole(db, role, () => db.query(`select * from ${table}`)), /permission denied|42501/);
      await assert.rejects(() => asRole(db, role, () => db.query(`insert into ${table} default values`)), /permission denied|42501/);
    }
  }

  const asAuthed = await asRole(db, 'authenticated', () => submit(db, RUN(81), day, 1, 0));
  assert.equal(asAuthed.accepted, true);
  await assert.rejects(
    () => asRole(db, 'anon', () => submit(db, RUN(82), day, 1, 0)),
    /permission denied|42501|not signed in|guest/
  );
});
