const { test, expect } = require('@playwright/test');

/* v4.30 hangar overhaul (#100–#106): five bays, the command bar, the
   armory and loadouts, contracts, and the save migration — all read off
   the real hangar at the three sizes the design names. */

const SIZES = [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'tablet', width: 768, height: 1024, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false }
];
const BAYS = ['ship', 'systems', 'arms', 'style', 'yard'];

async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.keyboard.press('Space');
  await expect(page.locator('#s-title')).toHaveClass(/on/, { timeout: 9000 });
  const close = page.locator('#btnNotesClose');
  try { await close.waitFor({ state: 'visible', timeout: 2500 }); await close.click(); } catch { /* not shown */ }
  await expect(page.locator('#s-notes')).not.toHaveClass(/on/);
  return errors;
}
async function openHangar(page) {
  await page.locator('#btnHangar').click();
  await expect(page.locator('#s-hangar')).toBeVisible();
}
async function rich(page) {
  await page.evaluate(() => {
    META.alloy = 90000;
    for (const h of HULLS) META.mastery[h.id] = { xp: 42000, level: 5 };
    saveMeta(); renderHangar();
  });
}

for (const size of SIZES) {
  test('five bays fit the ' + size.name + ' with 44 px targets and Launch always in view', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch });
    const page = await ctx.newPage();
    const errors = await boot(page);
    await openHangar(page);
    await rich(page);
    for (const bay of BAYS) {
      await page.locator('#hgtab-' + bay).click();
      await expect(page.locator('#hgtab-' + bay)).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#hgbay-' + bay)).toBeVisible();
      const m = await page.evaluate(() => {
        const box = el => el.getBoundingClientRect();
        const scr = document.getElementById('s-hangar');
        const vis = el => { const r = box(el); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
        const bar = [...document.querySelectorAll('.hg-bar button')].filter(vis).map(box);
        let overlap = 0;
        for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) {
          const a = bar[i], b = bar[j];
          if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
        }
        const panel = document.querySelector('.hg-panel:not([hidden])');
        const small = [...panel.querySelectorAll('button'), ...document.querySelectorAll('.hg-bar button, #dockSpots .spot')]
          .filter(vis).filter(b => box(b).height < 44 - .5 || box(b).width < 44 - .5).map(b => b.id || b.className + ':' + b.textContent.trim().slice(0, 20));
        const launch = box(document.getElementById('btnBayLaunch'));
        return { overlap, small, launchIn: launch.top >= 0 && launch.bottom <= innerHeight + .5, hOverflow: scr.scrollWidth - scr.clientWidth };
      });
      expect(m.overlap, bay + ': command bar controls overlap').toBe(0);
      expect(m.small, bay + ': targets under 44 px').toEqual([]);
      expect(m.launchIn, bay + ': Launch is on screen').toBe(true);
      expect(m.hOverflow, bay + ': no sideways scroll').toBeLessThanOrEqual(1);
      /* the bay's own items start on the first screen, above the command bar */
      const lead = await page.evaluate(b => {
        document.getElementById('s-hangar').scrollTop = 0;
        const first = [...document.querySelectorAll('#hgbay-' + b + ' button')].find(x => x.id !== 'btnArmsTry' && x.getBoundingClientRect().height > 0);
        return { top: first.getBoundingClientRect().top, bar: document.querySelector('.hg-bar').getBoundingClientRect().top };
      }, bay);
      expect(lead.top, bay + ': items start above the fold').toBeLessThan(lead.bar - 40);
      /* scrolled to the bottom of the bay, Launch is still there */
      await page.evaluate(() => { const s = document.getElementById('s-hangar'); s.scrollTop = s.scrollHeight; });
      const inView = await page.evaluate(() => { const r = document.getElementById('btnBayLaunch').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + .5; });
      expect(inView, bay + ': Launch survives a full scroll').toBe(true);
      await page.evaluate(() => { document.getElementById('s-hangar').scrollTop = 0; });
    }
    /* the refit tags flank the hull: none touches the sprite or the service
       caption, each names its refit and level, and the tab dots carry no count */
    await page.locator('#hgtab-ship').click();
    await page.evaluate(() => { document.getElementById('s-hangar').scrollTop = 0; });
    const dock = await page.evaluate(() => {
      const c = document.getElementById('dockCanvas').getBoundingClientRect();
      const d = document.querySelector('.hg-stage .dock').getBoundingClientRect();
      const k = Math.min(c.width / 1120, c.height / 860), w = 1120 * k, h = 860 * k;
      const x0 = c.left + (c.width - w) / 2, y0 = c.top + (c.height - h) / 2;
      const keep = { l: x0 + w * .3, r: x0 + w * .7, t: y0 + h * .26, b: y0 + h * .84 };   /* hull, pad ring core, service caption */
      const spots = [...document.querySelectorAll('#dockSpots .spot')].map(s => {
        const q = s.getBoundingClientRect(), v = { l: q.left, r: q.right, t: q.top + 2, b: q.bottom - 2 };
        return { text: s.textContent, hit: v.l < keep.r && keep.l < v.r && v.t < keep.b && keep.t < v.b, out: q.left < d.left - 1 || q.right > d.right + 1 || q.top < d.top - 1 || q.bottom > d.bottom + 1 };
      });
      const rs = [...document.querySelectorAll('#dockSpots .spot')].map(s => s.getBoundingClientRect());
      let clash = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const p = rs[i], q = rs[j];
        if (p.left < q.right && q.left < p.right && p.top + 2 < q.bottom - 2 && q.top + 2 < p.bottom - 2) clash++;
      }
      const badges = [...document.querySelectorAll('.hg-tab .badge')].filter(b => !b.hidden).map(b => b.textContent);
      const nameTop = document.getElementById('dockName').getBoundingClientRect().top;
      const gap = nameTop - Math.max(...rs.map(r => r.bottom - 2));   /* the visible tag is inset 2 px in its 44 px target */
      return { spots, badges, clash, gap };
    });
    expect(dock.spots.length).toBe(6);
    expect(dock.clash, 'refit tags overlap each other').toBe(0);
    expect(dock.gap, 'refit tags crowd the hull name').toBeGreaterThanOrEqual(8);
    for (const sp of dock.spots) {
      expect(sp.hit, sp.text + ' sits on the hull or caption').toBe(false);
      expect(sp.out, sp.text + ' spills off the dock').toBe(false);
      expect(sp.text).toMatch(/^(Guns|Hull|Thrust|Dash|Pickup|Salvage)\d\/5$/);
    }
    for (const t of dock.badges) expect(t).not.toMatch(/\d/);
    /* hull stat bars render (they used to compute to 0 px) */
    await page.locator('#hgtab-ship').click();
    const bars = await page.evaluate(() => [...document.querySelectorAll('#hullList .bars i b')].slice(0, 8).map(b => b.getBoundingClientRect()));
    for (const r of bars) { expect(r.height).toBeGreaterThan(0); expect(r.width).toBeGreaterThan(0); }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('buying in every bay spends alloy, fits the item and offers a backup', async ({ page }) => {
  const errors = await boot(page);
  await openHangar(page);
  await rich(page);
  const alloy = () => page.evaluate(() => META.alloy);
  /* every purchase is two steps: the item opens an offer, Buy completes it */
  const buy = async item => {
    await item.click();
    const go = page.locator('.hg-offer .hg-buy');
    await expect(go).toBeVisible();
    await expect(go).toHaveText(/^Buy · [\d,]+ alloy$/);
    await go.click();
    await expect(page.locator('.hg-offer')).toHaveCount(0);
  };
  /* Ship: a refit, with the exact number in its copy */
  await page.locator('#hgtab-ship').click();
  const plating = page.locator('#upList .up').first();
  await expect(plating).toContainText('Now +0 hull');
  let a0 = await alloy();
  await buy(plating);
  expect(a0 - await alloy()).toBe(220);
  /* Systems: a module drops into slot A */
  await page.locator('#hgtab-systems').click();
  a0 = await alloy();
  await buy(page.locator('#modList .up.gear', { hasText: 'Vector trim' }));
  expect(a0 - await alloy()).toBe(1200);
  expect(await page.evaluate(() => META.loadout.vesper.modA)).toBe('trim');
  /* frames: row 1 opens at mastery I */
  a0 = await alloy();
  await buy(page.locator('#frameTree .up.gear', { hasText: 'Duelist trim' }));
  expect(a0 - await alloy()).toBe(800);
  /* presets: save the fit to slot 1 */
  await page.locator('#presetList .preset').first().locator('.btn', { hasText: 'Save' }).click();
  expect(await page.evaluate(() => META.presets.vesper[0] && META.presets.vesper[0].modA)).toBe('trim');
  /* Arms: buy Rail and see it fitted; the compare panel names it */
  await page.locator('#hgtab-arms').click();
  const rail = page.locator('#armsList .up.gear', { hasText: 'Rail' }).first();
  await rail.hover();
  await expect(page.locator('#hgCompare')).toContainText('Rail');
  a0 = await alloy();
  await buy(rail);
  expect(a0 - await alloy()).toBe(2000);
  expect(await page.evaluate(() => META.arms.vesper.pat)).toBe('rail');
  /* a purchase of 1,500+ offers a save-code backup, once a day */
  await expect(page.locator('#hgBackup')).toBeVisible();
  await page.locator('#hgBackup .btn', { hasText: 'Not today' }).click();
  await expect(page.locator('#hgBackup')).toBeHidden();
  await expect(page.locator('#armsList .up.gear.sel')).toContainText('Rail');
  /* Style: a paint */
  await page.locator('#hgtab-style').click();
  a0 = await alloy();
  await buy(page.locator('#paintList .paint.locked').first());
  expect(a0).toBeGreaterThan(await alloy());
  /* Yard: this week's plate */
  await page.locator('#hgtab-yard').click();
  a0 = await alloy();
  await buy(page.locator('#weekBox .up', { hasText: 'sold this week only' }));
  expect(a0 - await alloy()).toBe(2400);
  /* every purchase survives a reload */
  await page.reload({ waitUntil: 'networkidle' });
  const kept = await page.evaluate(() => ({ trim: META.modules.includes('trim'), rail: META.armsOwned.includes('rail'), pat: META.arms.vesper.pat, frame: META.framesOwned.includes('vesper.1a'), plating: META.refits.plating }));
  expect(kept).toEqual({ trim: true, rail: true, pat: 'rail', frame: true, plating: 1 });
  expect(errors).toEqual([]);
});

for (const size of SIZES) {
  test('one tap never spends alloy on the ' + size.name + ': it opens an offer with the change and the price', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch });
    const page = await ctx.newPage();
    const errors = await boot(page);
    await openHangar(page);
    await rich(page);
    const tap = async loc => { if (size.touch) await loc.tap(); else await loc.click(); };
    const items = [
      ['ship', '#hullList .hull.locked'], ['ship', '#upList .up:not([disabled])'],
      ['systems', '#sigilList .sigil.locked'], ['systems', '#modList .up.gear:not(.sel)'], ['systems', '#modList .slot.locked'],
      ['systems', '#frameTree .up.gear:not(.locked):not(.sel)'],
      ['arms', '#armsList .up.gear:not(.sel):not(.locked)'],
      ['style', '#paintList .paint.locked'], ['yard', '#weekBox .up:has-text("sold this week only")']
    ];
    for (const [bay, sel] of items) {
      await page.locator('#hgtab-' + bay).click();
      const item = page.locator(sel).first();
      if (!await item.count()) continue;
      const before = await page.evaluate(() => JSON.stringify([META.alloy, META.owned, META.refits, META.sigils, META.modules, META.slotB, META.framesOwned, META.armsOwned, META.paints, META.finishes]));
      await item.scrollIntoViewIfNeeded();
      await tap(item);
      const offer = page.locator('.hg-offer');
      await expect(offer, sel + ' opens an offer').toBeVisible();
      await expect(offer.locator('.hg-offer-h')).toContainText(/[\d,]+ alloy/);
      await expect(offer.locator('.hg-offer-d')).not.toBeEmpty();
      await expect(offer.locator('.hg-buy')).toHaveText(/^Buy · [\d,]+ alloy$/);
      const after = await page.evaluate(() => JSON.stringify([META.alloy, META.owned, META.refits, META.sigils, META.modules, META.slotB, META.framesOwned, META.armsOwned, META.paints, META.finishes]));
      expect(after, sel + ': a single tap changed the save').toBe(before);
      await tap(item);   /* tapping the item again closes the offer, still free */
      await expect(offer).toHaveCount(0);
      expect(await page.evaluate(() => JSON.stringify([META.alloy, META.owned, META.refits, META.sigils, META.modules, META.slotB, META.framesOwned, META.armsOwned, META.paints, META.finishes]))).toBe(before);
    }
    /* the change summary reads on the item itself, and on phones in the strip above the bar */
    await page.locator('#hgtab-arms').click();
    const rail = page.locator('#armsList .up.gear', { hasText: 'Rail' }).first();
    await tap(rail);
    const d = page.locator('.hg-offer .hg-offer-d');
    await expect(d).toBeVisible();
    if (size.width <= 600) {
      await expect(page.locator('#hgDelta')).toBeVisible();
      await expect(page.locator('#hgDelta')).toContainText('Rail');
    }
    const box = await d.boundingBox();
    expect(box.height).toBeGreaterThan(8);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('Endless flies the fit and records it; the Daily flies standard issue', async ({ page }) => {
  const errors = await boot(page);
  const r = await page.evaluate(() => {
    META.alloy = 0; META.owned = ['vesper', 'atlas'];
    META.armsOwned = ['scatter', 'buckshot']; META.arms.vesper = { pat: 'scatter', mod: 'buckshot' };
    META.modules = ['barrels']; META.loadout.vesper = { sigil: '', modA: 'barrels', modB: '' };
    META.ship = 'vesper'; saveMeta();
    const out = {};
    startRun('endless');
    out.endless = { gear: GAME.gear, pat: GAME.armed && GAME.armed.pat, fit: fitCode() };
    pb.length = 0; P.fireCd = 0; firePrimary();
    out.endless.bolts = pb.filter(b => b.kind === 'bolt').length;
    startRun('daily');
    out.daily = { gear: GAME.gear, armed: GAME.armed, fit: fitCode() };
    pb.length = 0; P.fireCd = 0; firePrimary();
    out.daily.bolts = pb.filter(b => b.kind === 'bolt').length;
    GAME.state = 'title';
    return out;
  });
  expect(r.endless.gear).toBe('full');
  expect(r.endless.pat).toBe('scatter');
  expect(r.endless.fit).toBe('v:sc.bs|m:barrels');
  expect(r.endless.bolts).toBeGreaterThan(1);
  expect(r.daily.gear).toBe('');
  expect(r.daily.armed).toBe(null);
  expect(r.daily.fit).toMatch(/^v:std/);
  expect(r.daily.bolts).toBe(1);
  expect(errors).toEqual([]);
});

test('paid perks land on a real launch: Rampart, Glasswing, Mastery 2, Needle, rush', async ({ page }) => {
  const errors = await boot(page);
  const r = await page.evaluate(() => {
    META.ship = 'vesper'; META.mastery = {}; META.sigils = ['', 'rampart', 'glasswing', 'needle'];
    const launch = (mode, sigilId) => { META.sigil = sigilId; saveMeta(); startRun(mode); return { lives: GAME.lives, dash: P.maxCharges, rush: GAME.rush, sigil: GAME.sigil && GAME.sigil.id, needle: P.pierce }; };
    const out = { plain: launch('endless', null), rampart: launch('endless', 'rampart'), glass: launch('endless', 'glasswing'), needle: launch('endless', 'needle') };
    pb.length = 0; P.fireCd = 0; firePrimary();
    out.needleBolts = pb.filter(b => b.kind === 'bolt').every(b => b.needle === 1);
    META.mastery.vesper = { xp: MASTERY_TIERS[1].xp };
    out.m2 = launch('endless', null);
    out.m2Daily = launch('daily', null);
    out.rush = launch('rush', 'rampart');
    out.after = launch('endless', null);
    GAME.state = 'title';
    return out;
  });
  expect(r.rampart.lives).toBe(r.plain.lives + 1);
  expect(r.glass.lives).toBe(1);
  expect(r.needle.needle).toBe(1);
  expect(r.needleBolts).toBe(true);
  expect(r.m2.dash).toBe(r.plain.dash + 1);
  expect(r.m2Daily.dash).toBe(r.plain.dash + 1);
  expect(r.rush.rush).toBe(true);
  expect(r.rush.sigil).toBe(null);
  expect(r.rush.dash).toBe(r.plain.dash);
  expect(r.after.rush).toBe(false);
  expect(errors).toEqual([]);
});

test('a v4.29 save code imports whole and shows the Founder plate once', async ({ page }) => {
  const errors = await boot(page);
  const code = Buffer.from(JSON.stringify({
    v: 3, meta: {
      alloy: 4321, runs: 27, bestWave: 12, ship: 'halcyon', owned: ['vesper', 'halcyon'],
      refits: { plating: 2, ordnance: 3, thrusters: 1, capacitor: 0, magnet: 4, fortune: 1 },
      paints: ['yard', 'slate'], paint: 'slate', sigils: ['', 'needle'], sigil: 'needle',
      mastery: { halcyon: { xp: 3100, level: 2 } }
    }
  })).toString('base64');
  await openHangar(page);
  await page.locator('#hgtab-yard').click();
  await page.locator('#btnImport').click();
  await page.locator('#saveCode').fill(code);
  await page.locator('#btnSaveImport').click();
  await expect(page.locator('#saveMsg')).toContainText('Save imported');
  const m = await page.evaluate(() => ({ alloy: META.alloy, ship: META.ship, refits: META.refits, paint: META.paint, sigil: META.sigil,
    hsig: META.loadout.halcyon.sigil, xp: META.mastery.halcyon.xp, founder: META.founder, finishes: META.finishes }));
  expect(m).toMatchObject({ alloy: 4321, ship: 'halcyon', paint: 'slate', sigil: 'needle', hsig: 'needle', xp: 3100, founder: true });
  expect(m.refits).toEqual({ plating: 2, ordnance: 3, thrusters: 1, capacitor: 0, magnet: 4, fortune: 1 });
  expect(m.finishes).toContain('founder');
  await page.locator('#btnSaveClose').click();
  await page.locator('#btnBayBack').click();
  await openHangar(page);
  await expect(page.locator('#hgBackup')).toContainText('Founder plate');
  await page.locator('#hgBackup .btn', { hasText: 'Thanks' }).click();
  await page.locator('#btnBayBack').click();
  await openHangar(page);
  await expect(page.locator('#hgBackup')).toBeHidden();
  expect(errors).toEqual([]);
});

test('tab dots mean news, clear once seen, and the hangar draws one ship', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { DB.set('hangar.seen', {}); META.alloy = 0; saveMeta(); });
  await openHangar(page);
  const dots = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.hg-tab')].map(t => [t.id.slice(6), !t.querySelector('.badge').hidden])));
  expect(Object.values(await dots()).some(Boolean)).toBe(false);   /* broke: nothing to announce */
  await page.evaluate(() => { META.alloy = 1500; saveMeta(); renderHangar(); });
  const rich = await dots();
  expect(rich.systems).toBe(true);
  await page.locator('#hgtab-systems').click();
  expect((await dots()).systems).toBe(false);
  await page.locator('#hgtab-ship').click();
  expect((await dots()).systems).toBe(false);                       /* seen stays seen */
  /* the title's self-flying hull stays off the hangar backdrop */
  const calls = await page.evaluate(async () => {
    let n = 0; const real = window.drawAttract;
    window.drawAttract = function () { n++; return real.apply(this, arguments); };
    await new Promise(r => setTimeout(r, 400));
    window.drawAttract = real;
    return n;
  });
  expect(calls).toBe(0);
  expect(errors).toEqual([]);
});

test('the bay strip is a keyboard tablist', async ({ page }) => {
  await boot(page);
  await openHangar(page);
  await page.locator('#hgtab-ship').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#hgtab-systems')).toBeFocused();
  await expect(page.locator('#hgbay-systems')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.locator('#hgtab-yard')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#hgtab-ship')).toBeFocused();
  await expect(page.locator('#hgbay-ship')).toBeVisible();
});
