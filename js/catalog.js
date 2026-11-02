// Emberfall content catalog — hulls, hostiles, weapons, boons, capitals,
// difficulty tiers and the Solar Tour registry (ADR 0003).
// Single-path module: this file IS the live path — the client loads it as a
// classic script (index.html) and packages/sim/src/catalog.ts (+ stages.ts)
// adapt the same bytes for tests, so content parity guards the live path.
//
// NOT here on purpose: FOE_LABEL / FOE_TIPS / BOSS_TIPS (codex strings),
// REFITS / PAINTS / PAINTS-adjacent shop tables, and the stage+palette
// derivations that read game state (D(), isCozy, tintPal, stageForWave,
// syncStage). BOONS apply() and the BOSSES move/attack methods keep their
// call-time references to the inline core's globals (P, GAME, W, H, AU, R,
// ringShot, foeShot, fan, makeBeam, squadron, ...) exactly as when inline —
// classic-script lexical globals make those references resolve unchanged.
(function () {
  'use strict';

  const G = (typeof window !== 'undefined') ? window : globalThis;

const DIFF = [
  { name: 'Cozy', bulletSpd: .74, fireRate: 1.8, hp: .78, spawn: .72, score: .7, lives: 1, grace: 1.9, cozy: true },
  { name: 'Cadet', bulletSpd: .82, fireRate: 1.35, hp: .82, spawn: .85, score: .8, lives: 1, grace: 1.5 },
  { name: 'Pilot', bulletSpd: 1, fireRate: 1, hp: 1, spawn: 1, score: 1, lives: 0, grace: 1 },
  { name: 'Ace', bulletSpd: 1.14, fireRate: .8, hp: 1.22, spawn: 1.18, score: 1.35, lives: 0, grace: .8 },
  { name: 'Nightmare', bulletSpd: 1.3, fireRate: .64, hp: 1.5, spawn: 1.4, score: 1.9, lives: -1, grace: .62 }
];
const HULLS = [
  {
    id: 'vesper', name: 'VESPER-01', cls: 'Interceptor', cost: 0,
    desc: 'The standard yard hull. Honest speed, honest guns, room to make mistakes.',
    lives: 3, speed: 1, hitbox: 1, dmg: 1, dash: 2, bombs: 2, grazeMul: 1, scoreMul: 1
  },
  {
    id: 'halcyon', name: 'HALCYON', cls: 'Lance', cost: 1400,
    desc: 'Stripped to the spars for thrust. Hits harder and turns faster, but there is less of it to hit with.',
    lives: 2, speed: 1.2, hitbox: .82, dmg: 1.3, dash: 3, bombs: 1, grazeMul: 1.4, scoreMul: 1.15
  },
  {
    id: 'atlas', name: 'ATLAS', cls: 'Bulwark', cost: 2600,
    desc: 'Yard tug plating welded over a gun platform. Slow, wide, and extremely hard to kill.',
    lives: 5, speed: .86, hitbox: 1.25, dmg: .92, dash: 1, bombs: 3, grazeMul: .8, scoreMul: .92,
    startShield: true
  },
  {
    id: 'wraith', name: 'WRAITH', cls: 'অপার্থিব', cost: 5200,
    desc: 'Recovered from the gate, not built. One hull point, a hitbox you can barely see, and it pays for nerve.',
    lives: 1, speed: 1.14, hitbox: .55, dmg: 1.1, dash: 4, bombs: 1, grazeMul: 3, scoreMul: 1.6
  },
  {
    id: 'seraph', name: 'SERAPH', cls: 'Prism', cost: 7600,
    desc: 'Yard testbed with a prism lance — one continuous cutting beam instead of guns. It pierces everything in line, but the heat sink vents while you are not firing. Burst discipline is the whole ship.',
    lives: 2, speed: 1.06, hitbox: .88, dmg: 1, dash: 3, bombs: 2, grazeMul: 1.2, scoreMul: 1.2, beam: true
  }
];
const BOONS = [
  { id: 'coils', name: 'Overcharged coils', desc: 'Fire 18% faster for the rest of the run.', apply() { P.rateMul *= .82; } },
  { id: 'plating', name: 'Nano plating', desc: 'One more hull, right now.', apply() { GAME.lives = Math.min(8, GAME.lives + 1); } },
  { id: 'phase', name: 'Phase engine', desc: 'Dash charges rebuild 30% faster.', apply() { P.dashMul *= 1.3; } },
  { id: 'salvage', name: 'Salvage rig', desc: '+30% alloy from everything this run.', apply() { P.alloyMul *= 1.3; } },
  { id: 'volatile', name: 'Volatile rounds', desc: 'All guns hit 25% harder.', apply() { P.dmg *= 1.25; } },
  { id: 'aegis', name: 'Aegis cache', desc: 'A shield now — and it rebuilds itself if lost.', apply() { P.shieldMax = Math.max(P.shieldMax, 1); P.shield = P.shieldMax; P.shieldRegenOn = true; AU.shieldOn(); } },
  { id: 'magnetics', name: 'Magnetics', desc: 'Salvage reaches you from much further out.', apply() { P.magMul *= 1.6; } },
  { id: 'cache', name: 'Ember cache', desc: 'Two nova pulses, immediately.', apply() { P.bombs = Math.min(5, P.bombs + 2); } },
  { id: 'graze', name: 'Kill instinct', desc: 'Grazes score three times as much.', apply() { P.grazeMul *= 3; } }
];
const STAGES = [
  { id: 'mercury',  name: 'Mercury',     tagline: 'Sun-scoured clutter belt',       tint: .5,  crater: 1.9, ring: 0,   storm: .12, lights: 0,   hue: 38,  sat: 1.12, bri: 1.06, waves: 4, haz: 'flare',     hazK: 1 },
  { id: 'venus',    name: 'Venus',       tagline: 'Crushing shroud, amber static',  tint: .34, crater: .25, ring: .35, storm: .75, lights: .2,  hue: 14,  sat: 1.1,  bri: 1.04, waves: 5, haz: 'cloudbank', hazK: 1 },
  { id: 'earth',    name: 'Earth',       tagline: 'Home lights behind you',         tint: 0,   crater: .3,  ring: 0,   storm: .4,  lights: 1,   hue: 0,   sat: 1,    bri: 1,    waves: 5 },
  { id: 'mars',     name: 'Mars',        tagline: 'Rust storms, thin air',          tint: .2,  crater: 1.5, ring: 0,   storm: .95, lights: .35, hue: 16,  sat: 1.06, bri: 1.02, waves: 6, haz: 'storm',     hazK: 1 },
  { id: 'jupiter',  name: 'Jupiter',     tagline: 'The magnetosphere answers back', tint: .3,  crater: .2,  ring: .6,  storm: 1,   lights: 0,   hue: 26,  sat: 1.12, bri: 1.02, waves: 6, haz: 'gravity',   hazK: 1 },
  { id: 'saturn',   name: 'Saturn',      tagline: 'Carriers breed in the rings',    tint: .3,  crater: .2,  ring: 1.4, storm: .55, lights: 0,   hue: 40,  sat: 1.04, bri: 1,    waves: 7, haz: 'haze',      hazK: .45 },
  { id: 'neptune',  name: 'Neptune',     tagline: 'Cold velocity, dim instruments', tint: .55, crater: .3,  ring: .3,  storm: .3,  lights: .15, hue: -22, sat: 1.05, bri: .98,  waves: 7, haz: 'frost',     hazK: 1 },
  { id: 'gate',     name: 'Kuiper Gate', tagline: 'The thing the tide came through',tint: .7,  crater: .8,  ring: .2,  storm: .8,  lights: 0,   hue: -14, sat: 1.05, bri: .96,  waves: 8, haz: 'gravity',   hazK: 1.5 }
];
/* cumulative wave counts per world: [4,9,14,20,26,33,40,48] — world i spans
   waves (TOUR_CUM[i-1], TOUR_CUM[i]]; the finale boss rides the last one */
const TOUR_CUM = STAGES.reduce((a, s) => (a.push((a[a.length - 1] || 0) + s.waves), a), []);
const TOUR_FINALE = TOUR_CUM[TOUR_CUM.length - 1];
/* worlds fully cleared when wave n starts (0 while inside world 1) */
const tourWorldsDone = n => TOUR_CUM.filter(c => c < n).length;

const WEAPONS = [
  null,
  { lanes: [[0, 0]], rate: .155, dmg: 1 },
  { lanes: [[-7, 0], [7, 0]], rate: .15, dmg: 1 },
  { lanes: [[0, 0], [-10, -.07], [10, .07]], rate: .145, dmg: 1 },
  { lanes: [[-5, 0], [5, 0], [-13, -.13], [13, .13]], rate: .135, dmg: 1.05 },
  { lanes: [[0, 0], [-7, -.05], [7, .05], [-15, -.17], [15, .17]], rate: .128, dmg: 1.1 },
  { lanes: [[0, 0], [-6, -.03], [6, .03], [-13, -.13], [13, .13], [-20, -.26], [20, .26]], rate: .12, dmg: 1.15 }
];
const MAX_WEAPON = WEAPONS.length - 1;

const FOES = {
  drone: { hp: 2, r: 13, hit: 11, sc: 50, guns: false },
  mini: { hp: 1, r: 9, hit: 8, sc: 30, guns: false },
  striker: { hp: 3, r: 14, hit: 12, sc: 110, guns: true, cd: 1.9 },
  weaver: { hp: 4, r: 14, hit: 12, sc: 140, guns: true, cd: 2.1 },
  splitter: { hp: 5, r: 15, hit: 13, sc: 120, guns: false },
  cruiser: { hp: 15, r: 24, hit: 21, sc: 360, guns: true, cd: 2.4, armored: true },
  lancer: { hp: 8, r: 18, hit: 15, sc: 280, guns: true, cd: 3.4 },
  orbiter: { hp: 4, r: 12, hit: 11, sc: 200, guns: true, cd: .9 },
  warden: { hp: 10, r: 16, hit: 14, sc: 320, guns: true, cd: 2.8, armored: true },
  minelayer: { hp: 7, r: 15, hit: 13, sc: 240, guns: true, cd: 2.2 },
  carrier: { hp: 20, r: 26, hit: 23, sc: 520, guns: true, cd: 3.2, armored: true },
  ram: { hp: 9, r: 16, hit: 13, sc: 230, guns: false },
  sniper: { hp: 5, r: 15, hit: 12, sc: 300, guns: true, cd: 3.6 },
  shieldbreaker: { hp: 8, r: 17, hit: 14, sc: 340, guns: true, cd: 3.2, armored: true },
  /* v4.0 — the second generation. Each one adds a verb to the fight, not a stat line. */
  hound: { hp: 4, r: 13, hit: 11, sc: 170, guns: false },
  weeper: { hp: 5, r: 15, hit: 13, sc: 260, guns: true, cd: 3.0 },
  tender: { hp: 6, r: 14, hit: 12, sc: 380, guns: true, cd: 2.6 },
  ravager: { hp: 12, r: 19, hit: 17, sc: 420, guns: true, cd: 2.2, armored: true },
  arbalest: { hp: 7, r: 17, hit: 15, sc: 350, guns: true, cd: 3.8 },
  mimic: { hp: 8, r: 16, hit: 14, sc: 400, guns: true, cd: 2.0 },
  /* v4.20 wisp: a tiny flanker with the quickest small-foe gun in the game
     (cd 1.15 — potshots, not volleys). The threat is its crossing angle and
     the surprise of rapid small shots, not hull mass. Wave 16+. */
  wisp: { hp: 3, r: 10, hit: 8, sc: 190, guns: true, cd: 1.15 }
};
const BOSSES = [
  {
    id: 'dreadnought', name: 'Dreadnought', art: 'dreadnought',
    hp: 165, r: 56, hitR: 52, sc: 3000,
    nodes: [{ ox: -64, oy: 4, r: 15, hp: 70 }, { ox: 64, oy: 4, r: 15, hp: 70 }],
    enter(b) { b.ty = 150; },
    move(b, dt) {
      b.x = W / 2 + Math.sin(b.t * .95) * (W * .5 - 150) * .62;
      b.y = b.ty + Math.sin(b.t * 1.8) * 13;
    },
    attack(b) {
      b.cycle++;
      const ph = b.phase;
      if (b.cycle % 4 === 0) {
        // spiral curtain from the spine
        const n = ph >= 3 ? 24 : ph === 2 ? 20 : 15;
        ringShot(b, n, b.spin, (ph >= 2 ? 285 : 250) * D().bulletSpd, { rad: b.r * .7 });
        b.spin = (b.spin + .42) % TAU;
        return ph >= 2 ? 1.55 : 2.0;
      }
      if (b.cycle % 4 === 2 && ph >= 2) {
        // both turrets sweep a cross
        b.nodes.forEach(n => {
          if (n.hp <= 0) return;
          makeBeam(b, aimAt({ x: b.x + n.ox, y: b.y + n.oy }), {
            ox: n.ox, oy: n.oy, w: 13, charge: .9, fire: .6, sweep: n.ox < 0 ? .55 : -.55
          });
        });
        return 2.4;
      }
      const n = ph >= 3 ? 9 : ph === 2 ? 7 : 5;
      fan(b, aimAt(b), n, .68, (ph >= 2 ? 320 : 290) * D().bulletSpd, { rad: b.r * .7, r: 5 });
      return (ph >= 2 ? 1.2 : 1.65) * rnd(.9, 1.1);
    },
    onPhase(b, ph) {
      if (ph === 2) squadron({ type: 'striker', count: 4, form: 'vee' });
      if (ph === 3) squadron({ type: 'drone', count: 6, form: 'sweep', side: -1 });
    }
  },
  {
    id: 'matriarch', name: 'Hive Matriarch', art: 'matriarch',
    hp: 210, r: 74, hitR: 46, sc: 4200,
    nodes: null,
    enter(b) { b.ty = H * .3; },
    move(b, dt) {
      b.x = W / 2 + Math.sin(b.t * .62) * (W * .5 - 130) * .55;
      b.y = b.ty + Math.cos(b.t * .9) * 30;
    },
    attack(b) {
      b.cycle++;
      const ph = b.phase;
      const mod = b.cycle % 3;
      if (mod === 0) {
        // a wall with one gap you have to find and hold
        const n = ph >= 3 ? 30 : 24;
        const gap = R.int(0, n - 1);
        const gapW = ph >= 3 ? 2 : 3;
        for (let i = 0; i < n; i++) {
          if (Math.abs(i - gap) < gapW || Math.abs(i - gap) > n - gapW) continue;
          foeShot(b, i / n * TAU + b.spin, 215 * D().bulletSpd, { rad: 40, r: 5 });
        }
        b.spin += .3;
        return ph >= 2 ? 1.7 : 2.1;
      }
      if (mod === 1) {
        // seeker pods that curve, then commit
        const n = ph >= 3 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          foeShot(b, aimAt(b) + (i - (n - 1) / 2) * .4, 165 * D().bulletSpd,
            { kind: 'seek', r: 6, col: PAL.rare, rad: 40 });
        }
        return 1.9;
      }
      squadron({ type: ph >= 2 ? 'striker' : 'drone', count: ph >= 3 ? 6 : 4, form: 'sweep', side: R.sign() });
      fan(b, aimAt(b), 7, .9, 250 * D().bulletSpd, { rad: 40 });
      return 2.5;
    },
    onPhase(b, ph) {
      squadron({ type: 'splitter', count: 3, form: 'arc' });
      if (ph === 3) squadron({ type: 'warden', count: 1, form: 'anchor' });
    }
  },
  {
    id: 'tyrant', name: 'Solar Tyrant', art: 'tyrant',
    hp: 260, r: 104, hitR: 42, sc: 5600,
    nodes: null,
    enter(b) { b.ty = H * .3; },
    move(b, dt) {
      b.spin += dt * (b.phase >= 2 ? .85 : .5);
      if (b.charging) {
        // game-time timer, not setTimeout — pause and slow-mo have to hold
        // the charge consistently
        b.chargeT -= dt;
        if (b.chargeT <= 0) b.charging = false;
        b.x = damp(b.x, b.chargeX, 5, dt);
        b.y = damp(b.y, H * .18, 3, dt);
      } else {
        b.x = W / 2 + Math.sin(b.t * .5) * (W * .5 - 150) * .5;
        b.y = b.ty + Math.sin(b.t * 1.1) * 20;
      }
    },
    attack(b) {
      b.cycle++;
      const ph = b.phase;
      const mod = b.cycle % 4;
      if (mod === 0) {
        // four spokes fire and sweep together
        for (let i = 0; i < 4; i++) {
          makeBeam(b, b.spin + i / 4 * TAU, {
            w: 14, charge: .85, fire: ph >= 2 ? .9 : .7,
            sweep: (ph >= 2 ? .75 : .5) * (b.cycle % 8 === 0 ? 1 : -1)
          });
        }
        return 2.8;
      }
      if (mod === 2) {
        // converging walls from both sides
        const rows = ph >= 3 ? 9 : 7;
        for (let i = 0; i < rows; i++) {
          const y = H * .18 + i * (H * .55 / rows);
          fb.push({ x: -20, y, vx: 210 * D().bulletSpd, vy: 0, r: 5, kind: 'orb', t: 0, col: PAL.foe, life: 9, grazed: false });
          fb.push({ x: W + 20, y: y + 24, vx: -210 * D().bulletSpd, vy: 0, r: 5, kind: 'orb', t: 0, col: PAL.foe, life: 9, grazed: false });
        }
        return 2.2;
      }
      if (mod === 3 && ph >= 2 && !b.charging) {
        b.charging = true;
        b.chargeT = 1.6;
        b.chargeX = clamp(P.x, 120, W - 120);
        AU.charge(.7);
        ringShot(b, 18, b.spin, 240 * D().bulletSpd, { rad: 44 });
        return 2.4;
      }
      ringShot(b, ph >= 3 ? 26 : 20, b.spin * 1.7, 265 * D().bulletSpd, { rad: 44, r: 4.6 });
      return ph >= 2 ? 1.5 : 1.9;
    },
    onPhase(b, ph) {
      squadron({ type: 'orbiter', count: ph >= 3 ? 4 : 2, form: 'orbit' });
      if (ph === 3) squadron({ type: 'lancer', count: 2, form: 'anchor' });
    }
  },
  {
    /* ═══ THE GATE WARDEN ═══ — cycle 4+. Rotating shield arcs: shots between
       arcs are absorbed; you fight the rotation, and the arcs themselves. */
    id: 'gatewarden', name: 'Gate Warden', art: 'gatewarden',
    hp: 340, r: 80, hitR: 50, sc: 7600,
    nodes: null,
    enter(b) { b.ty = H * .26; b.shieldAng = 0; b.absorbT = 0; },
    move(b, dt) {
      b.shieldAng += dt * (b.phase >= 3 ? 1.05 : b.phase >= 2 ? .72 : .5);
      if (b.absorbT > 0) b.absorbT -= dt;
      b.x = W / 2 + Math.sin(b.t * .5) * (W * .5 - 160) * .5;
      b.y = b.ty + Math.sin(b.t * .95) * 24;
    },
    attack(b) {
      b.cycle++;
      const ph = b.phase;
      const mod = b.cycle % 4;
      if (mod === 1) {
        // radial spike: a pulse flung outward through every gap at once
        ringShot(b, ph >= 3 ? 22 : 16, b.shieldAng, (250 + ph * 18) * D().bulletSpd, { rad: 84, r: 5 });
        b.absorbT = .22;
        return 1.7;
      }
      if (mod === 2) {
        // spiral ladder: tight double stream, one from each flank
        for (let i = 0; i < 5; i++) {
          const a = b.shieldAng * 2 + i * .3;
          foeShot(b, a, 230 * D().bulletSpd, { rad: 70, r: 4.4, col: PAL.rare });
          foeShot(b, a + PI, 230 * D().bulletSpd, { rad: 70, r: 4.4, col: PAL.rare });
        }
        return 1.9;
      }
      if (mod === 3 && ph >= 2) {
        // gate surge: a beam from the core, guarded by a slowing fan
        makeBeam(b, aimAt(b), { w: 16, charge: 1.05, fire: .85, sweep: (b.cycle % 8 === 0 ? 1 : -1) * .62 });
        fan(b, aimAt(b) + PI, 5, .8, 220 * D().bulletSpd, { rad: 70 });
        return 2.6;
      }
      // hunter volley: two aimed bursts from behind the arcs
      fan(b, aimAt(b), ph >= 3 ? 7 : 5, .6, 300 * D().bulletSpd, { rad: 70, r: 5 });
      b.absorbT = .18;
      return 1.45;
    },
    onPhase(b, ph) {
      squadron({ type: ph >= 2 ? 'shieldbreaker' : 'striker', count: 2, form: 'arc' });
      if (ph === 3) squadron({ type: 'sniper', count: 2, form: 'orbit' });
    }
  },
  /* v4.11 Wardenfall: the warden's corrupted sibling leads the daily rare
     encounter. Deeper, faster arcs, a harder spike cadence, twin beams in
     the surge, and phase pressure the warden never brings. It only ever
     spawns in the rare Sunday slot — never in the ordinary rotation. */
  {
    id: 'wardenfall', name: 'Wardenfall', art: 'wardenfall',
    hp: 430, r: 80, hitR: 50, sc: 11000,
    nodes: null,
    enter(b) { b.ty = H * .24; b.shieldAng = 0; b.absorbT = 0; },
    move(b, dt) {
      b.shieldAng += dt * (b.phase >= 3 ? 1.3 : b.phase >= 2 ? .92 : .66);
      if (b.absorbT > 0) b.absorbT -= dt;
      b.x = W / 2 + Math.sin(b.t * .5) * (W * .5 - 160) * .5;
      b.y = b.ty + Math.sin(b.t * .95) * 24;
    },
    attack(b) {
      b.cycle++;
      const ph = b.phase;
      const mod = b.cycle % 4;
      if (mod === 1) {
        // denser radial spike, spun harder than the warden ever spins
        ringShot(b, ph >= 3 ? 26 : 20, b.shieldAng, (260 + ph * 18) * D().bulletSpd, { rad: 84, r: 5 });
        b.absorbT = .22;
        return 1.45;
      }
      if (mod === 2) {
        // triple ladder: a third stream threading the two flanks
        for (let i = 0; i < 5; i++) {
          const a = b.shieldAng * 2 + i * .3;
          foeShot(b, a, 245 * D().bulletSpd, { rad: 70, r: 4.4, col: PAL.rare });
          foeShot(b, a + PI, 245 * D().bulletSpd, { rad: 70, r: 4.4, col: PAL.rare });
          foeShot(b, a + PI / 2, 235 * D().bulletSpd, { rad: 70, r: 4, col: PAL.gold });
        }
        return 1.75;
      }
      if (mod === 3 && ph >= 2) {
        // gate surge, but two beams — a pincer the warden never flies
        makeBeam(b, aimAt(b), { w: 16, charge: 1.05, fire: .85, sweep: (b.cycle % 8 === 0 ? 1 : -1) * .62 });
        makeBeam(b, aimAt(b), { w: 12, charge: 1.2, fire: .8, sweep: (b.cycle % 8 === 0 ? -.7 : .7) });
        fan(b, aimAt(b) + PI, 6, .8, 230 * D().bulletSpd, { rad: 70 });
        return 2.6;
      }
      // hunter volley: wider, faster, from behind the arcs
      fan(b, aimAt(b), ph >= 3 ? 8 : 6, .6, 315 * D().bulletSpd, { rad: 70, r: 5 });
      b.absorbT = .18;
      return 1.35;
    },
    onPhase(b, ph) {
      squadron({ type: ph >= 2 ? 'shieldbreaker' : 'striker', count: 2, form: 'arc' });
      if (ph === 3) squadron({ type: 'sniper', count: 2, form: 'orbit' });
    }
  }
];
  /* the live fire-model numerics — index.html's firePrimary keeps the
     literals (over: x.68 rate / x1.15 dmg; bolt speed 1020). These named
     mirrors exist so the sim adapter re-exports them and golden parity
     compares them against the live literals. */
  const OVER_RATE = .68;
  const OVER_DMG = 1.15;
  const BOLT_SPEED = 1020;

  G.CATALOG = {
    DIFF, HULLS, BOONS, STAGES, TOUR_CUM, TOUR_FINALE, tourWorldsDone,
    WEAPONS, MAX_WEAPON, FOES, BOSSES,
    OVER_RATE, OVER_DMG, BOLT_SPEED
  };
})();
