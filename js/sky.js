/* SKY — comet, graveyard fleet, pyre, archive, whisper, pointers — extracted from the original monolith.
   Classic script: shares globals with index.html's inline core. Load order
   is enforced in index.html; file:// play still works. */
/* ─── the comet — a rare third body. Runs on its own wall clock (not
   GAME.t, which only advances mid-run and resets on death), so a sighting
   is never lost to a pause or a respawn. Spawns ~every 100s ±20s of sky
   time, first pass ~25s after load, crosses on one of four diagonals in
   24–40s, tail correctly anti-sunward. Layered gradients — no sprites. ─── */
const comet = { on: false, next: 25, last: 0, x: 0, y: 0, vx: 0, vy: 0, ang: 0, dur: 1, life: 0, tail: 0, seed: 0 };
function cometTick() {
  const now = performance.now() / 1000;
  const dt = Math.min(.1, now - (comet.last || now)); comet.last = now;
  const c = comet;
  if (!c.on) {
    c.next -= dt;
    if (c.next <= 0) {
      const pick = FX.int(0, 3), j = rnd(.22, .5);        // diagonal + jitter (int is INCLUSIVE — 4 was out of range, 1 in 5 comets went invisible NaN)
      const ang = [j, PI - j, -j, PI + j][pick];
      c.gold = FX.chance(.11);                             // the true sky event
      c.x = (pick === 0 || pick === 2) ? -60 : W + 60;
      c.y = pick < 2 ? rnd(H * .05, H * .3) : rnd(H * .62, H * .85);
      const sp = Math.max(W, H) / rnd(24, 40);            // crossing in 24–40s
      c.vx = Math.cos(ang) * sp; c.vy = Math.sin(ang) * sp;
      c.ang = ang; c.tail = Math.max(W, H) * (c.gold ? rnd(.44, .54) : rnd(.3, .42));
      c.dur = rnd(24, 40); c.life = c.dur; c.seed = rnd(0, TAU);
      c.on = true;
      c.paid = 0;                                         // spawn resets the ledger — a school comet must not log the previous sighting's pay
      c.next = 100 + rnd(-20, 20);                        // schedule the next one
      if (GAME.state === 'playing') {                     // career sky log
        /* goldens are comets too: they count in the comet totals (streak
           and the 10-wish milestone read them) AND in the golden tally */
        META.sky.comets++;
        GAME.skyRun.comets++;
        if (c.gold) { META.sky.golden++; GAME.skyRun.goldens++; }
        saveMeta();
      }
      c.puffs = c.gold
        ? { warm: cometPuff('255,214,110'), cool: cometPuff('255,186,86'), core: cometPuff('255,248,226'), coolRGB: '255,214,110' }
        : { warm: cometPuff('255,224,178'), cool: cometPuff(rgbOf(PAL.tech)), core: cometPuff('255,250,242') };
      if (!c.gold) c.puffs.coolRGB = rgbOf(PAL.tech);
      if (GAME.state === 'playing') {                     // sighting is an event
        /* stargazer bonus — sky drama feeds the economy, and STYLE pays:
           grazeHeat (decays ~3s after your last near-miss) multiplies the
           reward up to ×2, so the pilots who earned it are the ones flying
           through the bullet curtain when the comet broke. */
        try {
          if (!GAME.school) {                              // school runs are practice: sky drama plays, nothing is paid
            const heat = clamp(GAME.grazeHeat || 0, 0, 1); // ×1 … ×2 style multiplier
            const style = 1 + heat;
            /* STAR CHART — the 10-wish milestone perk: META.sky.comets was
               already incremented above, so the sighting that EARNS the perk
               pays at ×1.5 in the same breath. Applies to goldens too. */
            const chart = META.sky.comets >= 10 ? 1.5 : 1;
            const bonus = Math.round((15 + GAME.wave * 2) * (c.gold ? 10 : 1) * style * chart);
            GAME.alloyRun += bonus;
            GAME.skyRun.alloy += bonus;                    // the summary itemizes what the sky paid
            if (c.gold) GAME.goldSighted = true;
            float(c.x, c.y + 24,
              '+' + bonus + (c.gold ? ' · GOLDEN COMET' : heat > .6 ? ' · blazing stargazer' : ' · stargazer') + (chart > 1 ? ' ★' : ''),
              c.gold ? '#ffd166' : PAL.gold, c.gold ? 15 : 12);
            note(c.gold
              ? 'A GOLDEN comet — wish big · +' + bonus + ' alloy'
              : 'Comet sighted — make a wish · +' + bonus + ' alloy' + (heat > .6 ? ' (blazing!)' : '') + (chart > 1 ? ' ★' : ''), 'rare');
            if (c.gold) AU.golden(); else AU.sight();
            c.paid = bonus;
          }
        } catch (e) { }
        if (GAME.state === 'playing') sightRecord(c.gold ? 'golden' : 'comet', c.paid);   // the archive keeps facts: paid 0 on school runs
      }
    }
    return;
  }
  c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
  if (c.life <= 0) c.on = false;
  else if (!isFinite(c.x + c.y + c.vx + c.vy)) c.on = false;   // NaN hardening: a broken comet must never block the schedule
  else if ((c.vx > 0 && c.x - c.tail > W + 180) || (c.vx < 0 && c.x + c.tail < -180) ||
           (c.vy > 0 && c.y - c.tail > H + 180) || (c.vy < 0 && c.y + c.tail < -180)) c.on = false;   // fully out of frame, tail included
}
/* soft radial stamp — the comet is built from layered puffs of this, so
   every edge fades to nothing (the old flat wedges + bloom read as a bar) */
function cometPuff(rgb) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(' + rgb + ',1)');
  rg.addColorStop(.4, 'rgba(' + rgb + ',.45)');
  rg.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return c;
}
function drawComet(t) {
  const c = comet;
  if (!c.on || !c.puffs) return;
  const a = Math.min(1, (c.dur - c.life) * .8, c.life * 1.2);   // ease in/out
  if (a <= 0) return;
  // tail axis: anti-sunward, blended toward anti-velocity so the tail
  // feels like it LAGS behind the body, with a slow solar-wind flap
  const sunAx = Math.atan2(c.y - H * .08, c.x - W * .05);
  const velAx = Math.atan2(c.vy, c.vx);
  const ax = sunAx + angDiff(velAx, sunAx) * .35;
  const L = c.tail;
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(ax);
  ctx.globalCompositeOperation = 'lighter';
  const wob = Math.sin(t * .9 + c.seed);
  const G = c.gold;
  // dust tail — broad, warm: puffs widen and curve away, fading to nothing
  for (let i = 0; i < 11; i++) {
    const s = (i + 1) / 11;
    const w = 20 + s * (G ? 150 : 115);
    const dx = s * L * .78, dy = s * s * L * .075 + wob * s * 6;
    ctx.globalAlpha = Math.max(0, a * (G ? .23 : .17) * (1 - s) * (1 - s * .35));
    ctx.drawImage(c.puffs.warm, dx - w / 2, dy - w / 2, w, w);
  }
  // ion tail — straighter, cooler, flapping in the solar wind
  const flap = s2 => Math.sin(s2 * 5.2 - t * 2.1 + c.seed) * L * .018 * s2;
  for (let i = 0; i < 13; i++) {
    const s = (i + 1) / 13;
    const w = 10 + s * (G ? 56 : 42);
    const dx = s * L * .88, dy = -s * s * L * .03 + flap(s) * 2;
    ctx.globalAlpha = Math.max(0, a * (G ? .26 : .2) * (1 - s));
    ctx.drawImage(c.puffs.cool, dx - w / 2, dy - w / 2, w, w);
  }
  // striations — faint filaments inside the ion tail
  ctx.strokeStyle = 'rgba(' + c.puffs.coolRGB + ',1)';
  ctx.lineWidth = 1.1;
  for (let k = -1; k <= 1; k++) {
    ctx.globalAlpha = a * .1;
    ctx.beginPath();
    for (let i2 = 0; i2 <= 8; i2++) {
      const s = i2 / 8;
      const dx = s * L * .85, dy = -s * s * L * .03 + flap(s) * 2 + k * (2 + s * 10);
      if (i2 === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
    }
    ctx.stroke();
  }
  // dust grains — sparks riding the dust curve, twinkling
  ctx.fillStyle = G ? 'rgba(255,226,150,1)' : 'rgba(255,232,196,1)';
  for (let i = 0; i < (G ? 14 : 8); i++) {
    const s = .2 + ((i * 1.3) % 8) / 8 * .75;
    const tw = .5 + .5 * Math.sin(t * (G ? 9 : 7) + i * 2.3 + c.seed);
    ctx.globalAlpha = Math.max(0, a * (G ? .42 : .3) * tw * (1 - s));
    const gs = G ? 2.2 : 1.6;
    ctx.fillRect(s * L * .78 + Math.sin(i * 9.7) * (G ? 14 : 8), s * s * L * .075 + wob * s * 6 + Math.cos(i * 5.1) * (G ? 14 : 8), gs, gs);
  }
  // coma — layered: faint cool halo, warm glow, brilliant core
  ctx.globalAlpha = a * (G ? .62 : .5);
  ctx.drawImage(c.puffs.cool, G ? -38 : -30, G ? -38 : -30, G ? 76 : 60, G ? 76 : 60);
  ctx.globalAlpha = a * .8;
  ctx.drawImage(c.puffs.warm, -17, -17, 34, 34);
  ctx.globalAlpha = a;
  ctx.drawImage(c.puffs.core, -8, -8, 16, 16);
  if (G) {   // golden corona — four rotating glints around the nucleus
    for (let i = 0; i < 4; i++) {
      const ga = t * 1.6 + i * TAU / 4;
      const gx = Math.cos(ga) * 22, gy = Math.sin(ga) * 13;
      ctx.globalAlpha = a * (.5 + .3 * Math.sin(t * 5 + i * 2));
      ctx.drawImage(c.puffs.core, gx - 6, gy - 6, 12, 12);
    }
  }
  // bow shock — a faint compression arc on the sunward side
  const sunLocal = sunAx - ax;
  ctx.globalAlpha = a * .16;
  ctx.strokeStyle = 'rgba(' + c.puffs.coolRGB + ',1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(Math.cos(sunLocal) * 6, Math.sin(sunLocal) * 6, 13, sunLocal - 1.1, sunLocal + 1.1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}
/* ─── the graveyard fleet — fourth sky event. Every ~4 minutes a battle
   line of dead warships drifts across the moon's limb on its own wall
   clock (like the comet: sightings survive pause and respawn). Built from
   silhouette canvases — near-black hulls, one sunlit rim stroke, sparse
   survivors' windows — so they read as cut-outs against the moon's
   brightness. One hull per fleet may carry a dying reactor ember. ─── */
function fleetHull(kind) {
  const w = Math.round(rnd(150, 300) * (kind === 'cap' ? 1.7 : kind === 'escort' ? .7 : 1));
  const h = Math.round(w * rnd(.22, .34));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.translate(w / 2, h / 2);
  // hull cut-out
  x.fillStyle = '#05080f';
  x.strokeStyle = 'rgba(190,205,235,.32)';           // rim catches the sun
  x.lineWidth = 1.2;
  x.beginPath();
  if (kind === 'carrier') {                          // long deck, offset island
    x.moveTo(-w * .5, 0); x.lineTo(-w * .42, -h * .16); x.lineTo(w * .3, -h * .22);
    x.lineTo(w * .5, 0); x.lineTo(w * .28, h * .18); x.lineTo(-w * .38, h * .14);
  } else if (kind === 'cap') {                       // broken battleship: split stern
    x.moveTo(-w * .5, -h * .1); x.lineTo(-w * .2, -h * .3); x.lineTo(w * .1, -h * .05);
    x.lineTo(w * .22, -h * .34); x.lineTo(w * .5, -h * .06); x.lineTo(w * .4, h * .12);
    x.lineTo(-w * .3, h * .2);
  } else {                                           // escort: simple dagger
    x.moveTo(-w * .5, 0); x.lineTo(-w * .2, -h * .3); x.lineTo(w * .42, -h * .12);
    x.lineTo(w * .5, 0); x.lineTo(w * .3, h * .22); x.lineTo(-w * .3, h * .18);
  }
  x.closePath(); x.fill(); x.stroke();
  // superstructure blocks, still outlined against the light
  x.fillStyle = '#05080f';
  for (let i = 0; i < 3; i++) {
    const bx = -w * .3 + i * w * rnd(.2, .3), bw = w * rnd(.07, .12);
    x.fillRect(bx, -h * .34, bw, h * rnd(.18, .3));
    x.strokeRect(bx, -h * .34, bw, h * .22);
  }
  // survivors' windows — most dead, a few still lit
  for (let i = 0; i < 12; i++) {
    if (FX.chance(.5)) continue;
    x.fillStyle = 'rgba(255,190,120,' + rnd(.15, .4).toFixed(2) + ')';
    x.fillRect(-w * .4 + rnd(0, w * .8), rnd(-h * .18, h * .14), 1.8, 1.2);
  }
  return c;
}
const fleet = { on: false, next: 55, last: 0, x: 0, y: 0, vx: 0, vy: 0, dur: 1, life: 0, ships: [], ember: -1 };
function fleetTick() {
  const now = performance.now() / 1000;
  const dt = Math.min(.1, now - (fleet.last || now)); fleet.last = now;
  const f = fleet;
  if (!f.on) {
    f.next -= dt;
    if (f.next <= 0) {
      const dir = FX.chance(.5) ? 1 : -1;            // cross either way
      const y = rnd(H * .06, H * .3);                // ride the moon's limb band
      f.x = dir > 0 ? -340 : W + 340;
      f.y = y;
      f.vx = dir * rnd(9, 15); f.vy = rnd(-2.5, 2.5);
      f.dur = rnd(50, 75); f.life = f.dur;
      const kinds = ['cap', 'carrier', 'escort', 'escort', 'escort'];
      f.ships = kinds.map((k, i) => ({
        img: fleetHull(k),
        // battle line: staggered echelon, escorts out front
        ox: -i * rnd(90, 130) * dir + rnd(-24, 24),
        oy: (i % 2 ? 1 : -1) * rnd(14, 44) + rnd(-10, 10),
        rot: rnd(-.05, .05),
        a: rnd(.55, .85)
      }));
      f.ember = FX.chance(.6) ? FX.int(0, kinds.length - 1) : -1;
      f.on = true;
      f.next = 240 + rnd(-60, 60);                   // next fleet in ~4 min
      if (GAME.state === 'playing') {                // career sky log
        sightRecord('fleet', 0);
      }
    }
    return;
  }
  f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt;
  if (f.life <= 0) f.on = false;
}
/* ─── the pyre — fifth sky event, and the rarest. Every ~7 minutes a
   warship dies somewhere in the corridor and its hulk falls burning
   through the sky: steep downward transit, tumbling, shedding ember
   fragments that gutter and die mid-air. Own wall clock (pause and
   respawn safe, like every sky event). Zero per-frame cost beyond a
   handful of drawImage calls. ─── */
function pyreWreck() {
  const w = Math.round(rnd(70, 120)), h = Math.round(w * rnd(.3, .42));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.translate(w / 2, h / 2);
  // broken hull cut-out — same silhouette language as the graveyard fleet
  x.fillStyle = '#05080f';
  x.strokeStyle = 'rgba(190,205,235,.3)';            // rim catches the sun
  x.lineWidth = 1.2;
  x.beginPath();
  x.moveTo(-w * .5, -h * .08); x.lineTo(-w * .18, -h * .3); x.lineTo(w * .16, -h * .06);
  x.lineTo(w * .3, -h * .3); x.lineTo(w * .5, 0); x.lineTo(w * .3, h * .22);
  x.lineTo(-w * .2, h * .3); x.lineTo(-w * .42, h * .14);
  x.closePath(); x.fill(); x.stroke();
  // torn superstructure
  for (let i = 0; i < 3; i++) {
    const bx = -w * .3 + i * w * rnd(.18, .28), bw = w * rnd(.06, .1);
    x.fillRect(bx, -h * .38, bw, h * rnd(.2, .34));
    x.strokeRect(bx, -h * .38, bw, h * .24);
  }
  return c;
}
const pyre = { on: false, next: 40, last: 0, x: 0, y: 0, vx: 0, vy: 0, dur: 1, life: 0, rot: 0, rotA: 0, img: null, frags: [], glow: null };
/* the sky archive — every sighting recorded across sessions: kind, wave,
   difficulty, alloy it paid, when, which mode. Capped at 60 entries
   (newest kept), persisted with the profile, cloud-merged as a union. */
function logSighting(kind, paid) {
  META.skyLog.push({
    k: kind, w: Math.max(1, GAME.wave), d: CFG.diff,
    a: paid || 0, t: Date.now(),
    m: GAME.school ? 'school' : (GAME.mode || 'endless')
  });
  if (META.skyLog.length > 60) META.skyLog.splice(0, META.skyLog.length - 60);
}
/* the silent-sky whisper — when nothing appeared, say so, and tint it by
   what nearly did. The schedulers keep wall-clock countdowns, so a run
   that ended seconds before a comet's arrival can be told the truth.
   Each tier carries variant lines and the picker never repeats a tier's
   last line, so a string of quiet runs doesn't read as a broken record. */
const whisperLast = {};
/* no-repeat line picker — never serves the same string twice in a row
   (shared by the sky whisper and the game-over headline) */
function pickLine(key, lines) {
  let i = FX.int(0, lines.length - 1);
  if (lines.length > 1 && lines[i] === whisperLast[key]) i = (i + 1) % lines.length;
  whisperLast[key] = lines[i];
  return lines[i];
}
/* one color per sky kind — the edge pointers, the whisper tints, and the
   Sky log rows all read this table, so a recolor is a one-line change */
/* ═══ SKY_EVENTS — the single owner of what each sky event IS: display
   name, pointer/whisper/log color, and which career (META.sky) and run
   (GAME.skyRun) counters a sighting increments. Adding a sixth event
   means one row here plus a countSighting call — colors, counters, the
   Registry's kind column and the whisper tints follow.
   career/run keys differ because legacy saves own these shapes:
   META.sky.golden (career, legacy name) vs skyRun.goldens (per-run). ═══ */
const SKY_EVENTS = {
  comet:  { name: 'Comet',           rgb: '255,180,84',  career: 'comets', run: 'comets' },
  golden: { name: 'Golden comet',    rgb: '255,214,110', career: 'golden', run: 'goldens' },
  fleet:  { name: 'Graveyard fleet', rgb: '155,107,255', career: 'fleets', run: 'fleets' },
  pyre:   { name: 'Falling pyre',    rgb: '255,150,70',  career: 'pyres',  run: 'pyres' }
};
const SKY_RGB = { silent: '120,131,156' };   // 'silent' is a mood, not an event
for (const k in SKY_EVENTS) SKY_RGB[k] = SKY_EVENTS[k].rgb;
/* one owner for sighting bookkeeping — career counters, per-run counters,
   the archive row. Every sky event calls exactly this, mid-run only. */
function sightRecord(kind, paid) {
  const ev = SKY_EVENTS[kind] || SKY_EVENTS.comet;
  META.sky[ev.career]++;
  GAME.skyRun[ev.run]++;
  logSighting(kind, paid);
  saveMeta();
}
function skyWhisper() {
  const near = (ev, t) => !ev.on && ev.next > 0 && ev.next <= t;
  let lines, rgb;
  if (near(comet, 8))       { rgb = SKY_RGB.comet;  lines = ['The sky was silent — a comet was seconds away.', 'The sky was silent — a wish was seconds from arriving.']; }
  else if (near(comet, 20)) { rgb = SKY_RGB.comet;  lines = ['The sky was silent — a comet was almost due.', 'The sky was silent — a wish was still inbound.']; }
  else if (near(fleet, 35)) { rgb = SKY_RGB.fleet;  lines = ['The sky was silent — a graveyard fleet was drawing near.', 'The sky was silent — the war-dead were drawing near.']; }
  else if (near(pyre, 45))  { rgb = SKY_RGB.pyre;   lines = ['The sky was silent — something was falling somewhere.', 'The sky was silent — somewhere, a ship came down.']; }
  else                      { rgb = SKY_RGB.silent; lines = ['The sky was silent.', 'The stars kept their distance.', 'The heavens held their breath.', 'No word from the deep.']; }
  return { text: pickLine(rgb, lines), rgb };
}
function pyreTick() {
  const now = performance.now() / 1000;
  const dt = Math.min(.1, now - (pyre.last || now)); pyre.last = now;
  const p = pyre;
  if (!p.on) {
    p.next -= dt;
    if (p.next <= 0) {
      p.img = pyreWreck();
      p.x = rnd(W * .2, W * .8); p.y = -90;         // falls from the top of the sky
      const sp = rnd(46, 78);                        // ~10–17s to cross
      p.vx = rnd(-1, 1) * 18; p.vy = sp;
      p.rotA = rnd(-.55, -.22) * (p.vx < 0 ? -1 : 1); // tumbles as it falls
      p.rot = rnd(0, TAU);
      p.dur = rnd(10, 17); p.life = p.dur;
      p.frags = Array.from({ length: FX.int(5, 8) }, () => ({
        t: rnd(1.5, p.dur * .55),                    // shed through the fall
        ox: rnd(-.45, .45), oy: rnd(-.35, .35),      // offset on the wreck, as ×img size
        vx: rnd(-26, 26), vy: rnd(30, 90),           // kicked out, falls behind
        r: rnd(1, 2.4), life: rnd(2.5, 4.5), seed: rnd(0, TAU)
      }));
      if (!p.glow) p.glow = cometPuff(SKY_RGB.pyre);
      p.on = true;
      p.next = 420 + rnd(-90, 90);                   // next pyre in ~7 min
      if (GAME.state === 'playing') {                // career sky log
        sightRecord('pyre', 0);
      }
      if (GAME.state === 'playing') {                // sighting is an event
        note('A burning hulk falls through the sky — someone lost a ship out there', 'rare');
        AU.pyre();
      }
    }
    return;
  }
  p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.rotA * dt; p.life -= dt;
  for (const fr of p.frags) {
    if (fr.t > 0) { fr.t -= dt; continue; }
    fr.x = (fr.x ?? p.x + fr.ox * p.img.width) + fr.vx * dt;
    fr.y = (fr.y ?? p.y + fr.oy * p.img.height) + fr.vy * dt;
    fr.vy += 34 * dt;                                // fragments fall behind
    fr.life -= dt;
  }
  if (p.life <= 0 || p.y > H + 140) p.on = false;
}
function drawPyre(t) {
  const p = pyre;
  if (!p.on || !p.img) return;
  const a = Math.min(1, (p.dur - p.life) * 1.4, p.life * .9);   // ease in/out
  if (a <= 0) return;
  const burn = .5 + .5 * Math.sin(t * 3.1);
  // ember fragments first, so the wreck reads in front of its own debris
  for (const fr of p.frags) {
    if (fr.t > 0 || fr.life <= 0) continue;
    const g = Math.max(0, Math.min(1, fr.life / 3));            // gutter to black
    const tw = .5 + .5 * Math.sin(t * 7 + fr.seed);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * g * (.55 + .3 * tw);
    const s = fr.r * 7;
    ctx.drawImage(p.glow, fr.x - s / 2, fr.y - s / 2, s, s);
    ctx.globalAlpha = a * g;
    ctx.fillStyle = '#ffc06a';
    ctx.fillRect(fr.x - fr.r / 2, fr.y - fr.r / 2, fr.r, fr.r);
    ctx.restore();
  }
  // the burning hulk — silhouette with a fire halo licking off its back
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.rot);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * (.5 + .22 * burn);
  const gs = p.img.width * (1.5 + .18 * burn);
  ctx.drawImage(p.glow, -gs / 2 + p.img.width * .12, -gs / 2 + p.img.height * .18, gs, gs);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a;
  ctx.drawImage(p.img, -p.img.width / 2, -p.img.height / 2);
  ctx.restore();
  ctx.globalAlpha = 1;
}
