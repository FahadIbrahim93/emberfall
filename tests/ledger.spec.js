const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/* ═══════════════════════════════════════════════════════════════════════
   The ledger travels: a real two-device rehearsal for the rare honor.

   Device A registers through the real account panel. The DECK LEDGER is
   then seeded directly with a felled Wardenfall for that pilot (the
   deck-open WAL allows a concurrent writer — the same trick smoke.sh's
   P0-10 uses; the day is stamped from the DECK's /api/health clock, never
   the browser's). Device B is a FRESH browser profile: it signs in
   through the real panel and must adopt the lifetime count without any
   run being flown — the plaque arrives, the feat mints at the adoption
   point, and /api/me agrees.

   Uniqueness: a unique callsign per run keeps register inside its rate
   budget. Cookie sharing: every fetch rides the browser's own cookie jar.
   ═══════════════════════════════════════════════════════════════════════ */

const BASE = 'http://127.0.0.1:8123';
const NAME = 'Trav' + Math.random().toString(36).slice(2, 8);
const PASS = 'travel-pass-1';

async function api(page, p, opts = {}) {
  return page.evaluate(async ({ p, opts }) => {
    const r = await fetch(p, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }, { p, opts });
}

async function gotoTitle(page) {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
}

async function openSettingsAccount(page) {
  await page.click('#btnSettings');
  await expect(page.locator('#s-set')).toHaveClass(/on/, { timeout: 5000 });
  await expect(page.locator('#acctStat')).toContainText(/deck linked|signed in/, { timeout: 8000 });
}

test('the ledger travels: a fresh device adopts a felled fall at sign-in', async ({ browser }) => {
  test.setTimeout(120000);

  /* ── device A: fresh profile, register through the real panel ── */
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await gotoTitle(pageA);
  await openSettingsAccount(pageA);
  await pageA.fill('#acctName', NAME);
  await pageA.fill('#acctPass', PASS);
  await pageA.click('#btnAcctNew');
  await expect(pageA.locator('#acctStat')).toContainText('signed in', { timeout: 9000 });
  await pageA.click('#btnSetClose');

  /* sanity: the deck answers the lifetime count, zero for a new pilot */
  const me0 = await api(pageA, '/api/me');
  expect(me0.json.wardenfalls).toBe(0);

  /* the day is the DECK's word, from /api/health's server clock — the same
     clock the deck's own day derivation uses */
  const health = await api(pageA, '/api/health');
  expect(health.json.ok).toBe(true);
  const day = new Date(health.json.t).toISOString().slice(0, 10);

  /* ── seed one felled fall straight into the deck's SQLite ledger ──
     The deck's default data dir is a SIBLING of the repo (dirname(repo) —
     the same location smoke.sh's P0-10 seeds; a deck started without
     EF_DATA_DIR writes there). */
  const dbPath = process.env.EF_DATA_DIR_DB
    || path.join(__dirname, '..', '..', 'emberfall-data', 'emberfall.db');
  const tmp = path.join(os.tmpdir(), 'ef-seed-' + Date.now() + '.js');
  fs.writeFileSync(tmp, `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(dbPath)});
    const u = db.prepare('SELECT id FROM users WHERE name = ?').get(${JSON.stringify(NAME)});
    if (!u) { console.error('pilot missing'); process.exit(1); }
    db.prepare('INSERT INTO daily_stats (user_id, day, created_day, best_score, best_wave, paid, streak, wardenfall) VALUES (?, ?, ?, 48000, 16, 0, 1, 1) ON CONFLICT(user_id, day) DO UPDATE SET wardenfall = 1')
      .run(u.id, ${JSON.stringify(day)}, ${JSON.stringify(day)});
    const row = db.prepare('SELECT wardenfall FROM daily_stats WHERE user_id = ? AND day = ?').get(u.id, ${JSON.stringify(day)});
    if (row && row.wardenfall === 1) { console.log('seeded'); } else { process.exit(1); }
  `);
  try { execFileSync(process.execPath, [tmp], { stdio: 'pipe' }); }
  finally { fs.rmSync(tmp, { force: true }); }

  await ctxA.close();

  /* ── device B: a brand-new browser profile signs in through the panel ── */
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await gotoTitle(pageB);
  await openSettingsAccount(pageB);
  await pageB.fill('#acctName', NAME);
  await pageB.fill('#acctPass', PASS);
  await pageB.click('#btnAcctGo');
  await expect(pageB.locator('#acctStat')).toContainText('signed in', { timeout: 9000 });

  /* the adoption, exactly as the plaque and the feat read it */
  const adopted = await pageB.evaluate(() => ({
    falls: (META.daily && META.daily.wardenfalls) || 0,
    feat: !!META.feats.wardenfall
  }));
  expect(adopted.falls, 'device B learns its fall from the deck').toBe(1);
  expect(adopted.feat, 'the feat mints at the adoption point').toBe(true);

  /* cross-check against the deck itself */
  const me1 = await api(pageB, '/api/me');
  expect(me1.json.wardenfalls).toBe(1);

  await ctxB.close();
});
