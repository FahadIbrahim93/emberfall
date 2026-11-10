import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations'))
  .filter(name => name.endsWith('.sql')).sort();

const BIG = '9223372036854775807';

function uid(n) {
  return '00000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
}

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

async function seedPilot(db, n, { anonymous = false, callsign = null } = {}) {
  const id = uid(n);
  await db.query(
    'insert into auth.users (id, is_anonymous) values ($1, $2)',
    [id, anonymous]
  );
  if (!anonymous) {
    await db.query(
      'insert into public.profiles (id, callsign) values ($1, $2)',
      [id, callsign || ('P' + String(n).padStart(4, '0'))]
    );
  }
  return id;
}

async function score(db, id, mode, value, stats, at, day = null) {
  await db.query(
    `insert into public.player_scores (user_id, mode, day, score, stats, created_at)
     values ($1, $2, $3::date, $4::bigint, $5::jsonb, $6::timestamptz)`,
    [id, mode, day, value, JSON.stringify(stats || {}), at]
  );
}

async function page(db, args) {
  const r = await db.query(
    `select public.standings_page($1, $2::date, $3, $4::timestamptz, $5, $6::timestamptz, $7::uuid) as page`,
    [
      args.board,
      args.day || null,
      args.limit ?? 50,
      args.watermark || null,
      args.cursor ? args.cursor.score : null,
      args.cursor ? args.cursor.created_at : null,
      args.cursor ? args.cursor.user_id : null
    ]
  );
  return r.rows[0].page;
}

function lastCursor(rows) {
  const row = rows[rows.length - 1];
  return { score: row.score, created_at: row.created_at, user_id: row.user_id };
}

test('standings walk a frozen watermark, exact scores and competition ranks', async () => {
  const db = await fresh();
  const past = '2026-11-01T00:00:00Z';
  const ids = [];
  for (let n = 1; n <= 201; n += 1) {
    const id = await seedPilot(db, n);
    ids.push(id);
    const at = new Date(Date.parse(past) + n * 1000).toISOString();
    const value = n === 1 || n === 2 ? '500' : String(n);
    await score(db, id, 'endless', value, { wave: n, ship: 'wraith', paint: 'gold' }, at);
  }
  await score(db, ids[10], 'daily', BIG, {
    wave: 9, ship: 'seraph', paint: '<img src=x onerror=alert(1)>'
  }, '2026-11-02T00:00:00Z', '2026-11-02');
  const guest = await seedPilot(db, 900, { anonymous: true });
  await db.query('insert into public.profiles (id, callsign) values ($1, $2)', [guest, 'GUEST900']);
  await score(db, guest, 'endless', '999999', { wave: 1, ship: 'vesper' }, past);

  await db.query('set role anon');
  const first = await page(db, { board: 'alltime', limit: 50 });
  assert.equal(first.rows.length, 50);
  assert.ok(first.watermark);
  assert.equal(first.rows[0].score, BIG);
  assert.equal(first.rows[0].source_mode, 'daily');
  assert.equal(first.rows[0].place, 1);
  assert.equal(first.rows[0].ship, 'seraph');
  assert.equal(first.rows[0].paint, null);
  const tied = first.rows.filter(row => row.score === '500');
  assert.equal(tied.length, 2);
  assert.deepEqual(tied.map(row => row.place), [2, 2]);
  assert.ok(tied[0].created_at <= tied[1].created_at);
  assert.equal(first.rows[3].score, '201');
  assert.equal(first.rows[3].place, 4);

  const seen = new Set(first.rows.map(row => row.user_id));
  let cursor = lastCursor(first.rows);
  let guard = 0;
  let next = first;
  while (next.rows.length === 50 && guard < 10) {
    next = await page(db, { board: 'alltime', limit: 50, watermark: first.watermark, cursor });
    assert.equal(next.watermark, first.watermark);
    for (const row of next.rows) {
      assert.equal(seen.has(row.user_id), false);
      seen.add(row.user_id);
    }
    if (next.rows.length) cursor = lastCursor(next.rows);
    guard += 1;
  }
  assert.equal(seen.size, 201);
  assert.equal(seen.has(guest), false);

  await db.query('reset role');
  const late = await seedPilot(db, 901);
  await score(db, late, 'endless', '999999999', { wave: 1, ship: 'atlas' }, new Date().toISOString());
  await score(db, ids[10], 'endless', BIG, { wave: 1, ship: 'vesper', paint: 'gold' }, new Date().toISOString());
  await db.query('set role anon');

  const again = [];
  let walk = await page(db, { board: 'alltime', limit: 50, watermark: first.watermark });
  again.push(...walk.rows);
  cursor = lastCursor(walk.rows);
  guard = 0;
  while (walk.rows.length === 50 && guard < 10) {
    walk = await page(db, { board: 'alltime', limit: 50, watermark: first.watermark, cursor });
    again.push(...walk.rows);
    if (walk.rows.length) cursor = lastCursor(walk.rows);
    guard += 1;
  }
  assert.equal(again.length, 201);
  assert.equal(new Set(again.map(row => row.user_id)).size, 201);
  assert.equal(again.some(row => row.user_id === late), false);
  const kept = again.find(row => row.user_id === ids[10]);
  assert.equal(kept.score, BIG);
  assert.equal(kept.source_mode, 'daily');
  assert.equal(kept.ship, 'seraph');

  const open = await page(db, { board: 'alltime', limit: 2 });
  assert.equal(open.rows[0].user_id, ids[10]);
  assert.equal(open.rows[0].score, BIG);
  assert.equal(open.rows[1].user_id, late);
  assert.equal(open.rows[1].score, '999999999');

  await assert.rejects(() => page(db, { board: 'nope' }), /bad board/);
  await assert.rejects(() => page(db, { board: 'daily' }), /needs a day/);
  await assert.rejects(
    () => page(db, { board: 'alltime', cursor: { score: '1', created_at: null, user_id: null } }),
    /partial cursor/
  );
  await db.query('reset role');
});

test('anon and authenticated can read standings and cannot write them', async () => {
  const db = await fresh();
  const id = await seedPilot(db, 1, { callsign: 'ACE_1' });
  await score(db, id, 'school', '42', { wave: 2, ship: 'wraith', paint: 'gold' }, '2026-11-01T00:00:00Z');
  await score(db, id, 'endless', '10', { wave: 1, ship: 'wraith', paint: 'slate' }, '2026-11-01T01:00:00Z');
  await score(db, id, 'daily', BIG, {
    wave: 9, ship: 'seraph', paint: 'gold'
  }, '2026-11-02T00:00:00Z', '2026-11-02');

  const read = await db.query(`
    select has_function_privilege('anon', 'public.standings_page(text,date,integer,timestamptz,text,timestamptz,uuid)', 'EXECUTE') as anon_exec,
           has_function_privilege('authenticated', 'public.standings_page(text,date,integer,timestamptz,text,timestamptz,uuid)', 'EXECUTE') as auth_exec,
           has_function_privilege('public', 'public.standings_page(text,date,integer,timestamptz,text,timestamptz,uuid)', 'EXECUTE') as public_exec,
           has_function_privilege('anon', 'public.pilot_dossier(text)', 'EXECUTE') as anon_dossier,
           has_table_privilege('anon', 'public.player_scores', 'SELECT') as anon_read,
           has_table_privilege('anon', 'public.player_scores', 'INSERT') as anon_insert,
           has_table_privilege('authenticated', 'public.player_scores', 'UPDATE') as auth_update,
           has_table_privilege('anon', 'public.deck_stats', 'INSERT') as stats_insert,
           has_table_privilege('anon', 'public.leaderboard_global', 'DELETE') as board_delete
  `);
  const priv = read.rows[0];
  assert.equal(priv.anon_exec, true);
  assert.equal(priv.auth_exec, true);
  assert.equal(priv.public_exec, false);
  assert.equal(priv.anon_dossier, true);
  assert.equal(priv.anon_read, true);
  assert.equal(priv.anon_insert, false);
  assert.equal(priv.auth_update, false);
  assert.equal(priv.stats_insert, false);
  assert.equal(priv.board_delete, false);

  await db.query('set role anon');
  await assert.rejects(
    () => db.query(`insert into public.player_scores (user_id, mode, score) values ('${id}', 'endless', 1)`),
    /permission denied/
  );
  const dossier = await db.query(`select public.pilot_dossier('ace_1') as card`);
  const card = dossier.rows[0].card;
  assert.equal(card.callsign, 'ACE_1');
  assert.equal(card.runs, 3);
  const school = card.modes.find(mode => mode.board === 'school');
  assert.equal(school.source_mode, 'school');
  assert.equal(school.score, '42');
  assert.equal(school.paint, 'gold');
  assert.equal(school.place, 1);
  const alltime = card.modes.find(mode => mode.board === 'alltime');
  assert.equal(alltime.source_mode, 'daily');
  assert.equal(alltime.score, BIG);
  assert.equal(alltime.ship, 'seraph');
  assert.equal(alltime.place, 1);
  const daily = card.modes.find(mode => mode.board === 'daily');
  assert.equal(daily.source_mode, 'daily');
  assert.equal(daily.score, BIG);
  assert.equal((await db.query(`select public.pilot_dossier('N%va') as card`)).rows[0].card, null);
  assert.equal((await db.query(`select public.pilot_dossier('<img>') as card`)).rows[0].card, null);
  const schoolBoard = await page(db, { board: 'school', limit: 10 });
  assert.equal(schoolBoard.rows.length, 1);
  assert.equal(schoolBoard.rows[0].source_mode, 'school');
  await db.query('reset role');

  await db.query('set role authenticated');
  await assert.rejects(
    () => db.query('update public.player_scores set score = 1'),
    /permission denied/
  );
  await db.query('reset role');
});
