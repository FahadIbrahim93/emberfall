const { test, expect } = require('@playwright/test');

async function boot(page, time = '2026-11-29T23:59:59Z') {
  await page.clock.setFixedTime(new Date(time));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof startRun === 'function');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => GAME.state === 'title');
  await page.evaluate(() => { CODEX.mute = true; CFG.ghost = true; });
}

test('same-day Daily stages and hazards ignore cosmetic RNG and keep the encounter RNG stream', async ({ page }) => {
  await boot(page);
  const runs = await page.evaluate(() => {
    const out = [];
    for (let seed = 1; seed <= 12; seed++) {
      FX.reseed(seed * 104729);
      startRun('daily'); GAME.paused = true;
      out.push({ day: GAME.seedLabel, stageSeed: GAME.stageSeed,
        worlds: [1, 6, 11, 16].map(n => { const s = stageForWave(n, GAME.stageSeed); return [s.name, s.haz]; }),
        next: R() });
      toTitle();
    }
    return out;
  });
  expect(new Set(runs.map(r => JSON.stringify(r))).size).toBe(1);
  expect(runs[0].day).toBe('2026-11-29');
});

for (const sunday of ['2026-11-29', '2026-11-08']) {
test(`Sunday encounters and weekly tempo stay bound across midnight: ${sunday}`, async ({ page }) => {
  await boot(page, sunday + 'T23:59:59Z');
  const monday = new Date(Date.parse(sunday + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const before = await page.evaluate(() => {
    startRun('daily'); GAME.paused = true;
    R = makeRng(813);
    return { day: GAME.seedLabel, mutator: GAME.mutator.id, queues: [5, 6, 11].map(buildWave) };
  });
  await page.clock.setFixedTime(new Date(monday + 'T00:00:01Z'));
  const after = await page.evaluate(() => {
    R = makeRng(813);
    return { day: GAME.seedLabel, mutator: GAME.mutator.id, queues: [5, 6, 11].map(buildWave) };
  });
  expect(after).toEqual(before);
  const next = await page.evaluate(() => {
    toTitle();
    const preview = document.getElementById('dailySub').textContent;
    startRun('daily'); GAME.paused = true;
    return { preview, day: GAME.seedLabel };
  });
  expect(next.preview).toContain(monday);
  expect(next.day).toBe(monday);
});
}

test('launch samples the UTC day once even if midnight passes during setup', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(() => {
    const OriginalDate = window.Date;
    let reads = 0;
    window.Date = class extends OriginalDate {
      constructor(...args) { super(...(args.length ? args : [++reads === 1 ? '2026-11-29T23:59:59Z' : '2026-11-30T00:00:01Z'])); }
    };
    try {
      startRun('daily'); GAME.paused = true;
      return { reads, day: GAME.seedLabel, mutator: GAME.mutator.id,
        expected: MUTATORS[hashStr('mut-2026-11-29') % MUTATORS.length].id };
    } finally { window.Date = OriginalDate; }
  });
  expect(result).toEqual({ reads: 1, day: '2026-11-29', mutator: result.expected, expected: result.expected });
});

test('Daily ghosts retain their launch day and cannot race another day or legacy unbound tape', async ({ page }) => {
  await boot(page);
  const day = await page.evaluate(() => {
    startRun('daily'); GAME.paused = true;
    return GAME.seedLabel;
  });
  await page.clock.setFixedTime(new Date('2026-11-30T00:00:01Z'));
  const result = await page.evaluate(() => {
    GHOST.rec = ['10,20', '30,40']; GHOST.saveIfBest('daily', 321);
    const saved = DB.get('ghost.daily', null);
    toTitle(); startRun('daily'); GAME.paused = true;
    const wrongDayActive = GHOST.active;
    GHOST.rec = ['5,6']; GHOST.saveIfBest('daily', 10);
    GHOST.rec = ['7,8']; GHOST.saveIfBest('daily', 9);
    const mondayBest = DB.get('ghost.daily', null);
    DB.set('ghost.daily', { score: 999, frames: ['1,2'], ship: 'vesper' });
    toTitle(); startRun('daily'); GAME.paused = true;
    return { saved, mondayBest, wrongDayActive, legacyActive: GHOST.active,
      legacyStored: DB.get('ghost.daily', null) };
  });
  expect(result.saved.day).toBe(day);
  expect(result.wrongDayActive).toBe(false);
  expect(result.mondayBest.day).toBe('2026-11-30');
  expect(result.mondayBest.score).toBe(10);
  expect(result.legacyActive).toBe(false);
  expect(result.legacyStored.score).toBe(999);
  expect(result.legacyStored.day).toBeUndefined();
});

test('existing main-mode ghosts remain usable without a day stamp', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(() => {
    DB.set('ghost.main', { score: 555, frames: ['1,2'], ship: 'vesper' });
    startRun('endless'); GAME.paused = true;
    return { active: GHOST.active, score: GHOST.playback?.score, seed: GAME.seedLabel };
  });
  expect(result).toEqual({ active: true, score: 555, seed: '' });
});
