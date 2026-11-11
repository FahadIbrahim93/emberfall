/* EMBERFALL hangar — the five-bay yard (Ship · Systems · Arms · Style · Yard).
   Design: docs/design/hangar-overhaul.md. This module owns the armory,
   loadouts, frame doctrines, contracts and the hangar UI. It only DECLARES
   at the top level (deadscan load-order rule): every reference to the inline
   core sits inside a function body and runs after the core has loaded.

   Fairness contract (owner decision 2026-11-11):
   · gear never flies on the ranked Daily, rush, flight school or the range
     (except a "Try in range" trial, which is never scored or saved);
   · on Endless every stat gear touches is clamped to today's legacy ceiling
     (powerCeiling), and weapon patterns are normalised to Spread's composite
     output at every tier, so no item raises the top of the board;
   · every scored run records a compact loadout code (stats.fit). */
'use strict';

/* ── Armory: weapon patterns + branch mods (bolt hulls) and Seraph lenses ──
   A pattern reshapes how the existing WEAPONS ladder fires; WEAPONS itself is
   never edited (sim golden parity). fx keys: angMul lane angles, keep/keepAng
   converge to the centre-most lanes, outerFrac extra outer pairs per lane,
   life bolt lifetime (s), speedMul bolt speed, rateMul fire interval, pierce,
   capEvery/capMul heavy volley, seek* seeker salvos, grazeFeed, markPrey.
   Damage is normalised by armsNorm() so the composite (½ single-target +
   ½ crowd) output equals Spread's at every tier; patterns differ in shape. */
const ARMORY = [
  { id: 'spread', code: 'sp', kind: 'pattern', hull: 'bolt', parent: '', name: 'Spread', cost: 0,
    perk: 'Standard issue. A fan of lanes that widens with every ordnance tier.', weakness: 'No specialty.',
    fx: {} },
  { id: 'widefan', code: 'wf', kind: 'mod', hull: 'bolt', parent: 'spread', name: 'Wide fan', cost: 1200,
    perk: 'Lane angles ×1.35. Covers the whole corridor.', weakness: 'Fewer bolts converge on one target at range.',
    fx: { angMul: 1.35 } },
  { id: 'choke', code: 'ch', kind: 'mod', hull: 'bolt', parent: 'spread', name: 'Choke', cost: 1200,
    perk: 'Lane angles ×0.8. More bolts reach the target you aim at.', weakness: 'Flankers slip past the fan.',
    fx: { angMul: .8 } },
  { id: 'rail', code: 'rl', kind: 'pattern', hull: 'bolt', parent: '', name: 'Rail', cost: 2000,
    perk: 'Lanes fold into a parallel column of up to 3 bolts; bolt speed ×1.25. Built for capital ships.', weakness: 'Almost no coverage: crowds walk around it.',
    fx: { keep: 3, keepAng: 0, speedMul: 1.25 } },
  { id: 'penetrator', code: 'pn', kind: 'mod', hull: 'bolt', parent: 'rail', name: 'Penetrator', cost: 1400,
    perk: 'Rail bolts pierce one hostile.', weakness: 'Fire interval ×1.12.',
    fx: { pierce: 1, rateMul: 1.12 } },
  { id: 'caprounds', code: 'cr', kind: 'mod', hull: 'bolt', parent: 'rail', name: 'Capacitor rounds', cost: 1400,
    perk: 'Every 6th volley hits ×2.5.', weakness: 'Fire interval ×1.05; the volleys between are lighter.',
    fx: { capEvery: 6, capMul: 2.5, rateMul: 1.05 } },
  { id: 'scatter', code: 'sc', kind: 'pattern', hull: 'bolt', parent: '', name: 'Scatter', cost: 2000,
    perk: 'Extra outer lanes (about 4 for every 10) at wide angles. Shreds swarms up close.', weakness: 'Bolts burn out after 0.45 s (about 460 px of reach).',
    fx: { outerFrac: .4, outerAng: 1.4, life: .45 } },
  { id: 'grazefeed', code: 'gf', kind: 'mod', hull: 'bolt', parent: 'scatter', name: 'Graze feed', cost: 1400,
    perk: 'Each graze cuts the fire interval 10% for 1 s (stacks 3).', weakness: 'Lighter bolts until you fly close.',
    fx: { grazeFeed: 1 } },
  { id: 'buckshot', code: 'bs', kind: 'mod', hull: 'bolt', parent: 'scatter', name: 'Buckshot', cost: 1400,
    perk: 'Even more outer lanes (7 for every 10).', weakness: 'Each bolt is lighter still.',
    fx: { outerFrac: .7, outerAng: 1.3 } },
  { id: 'seeker', code: 'sk', kind: 'pattern', hull: 'bolt', parent: '', name: 'Seeker', cost: 2500,
    perk: 'Seeker salvos from ordnance tier 3 (stock: tier 6 only), scaled to your lane count.', weakness: 'Main lanes carry less weight.',
    fx: { seekFrom: 3, seekEvery: 7, seekLanes: 1 } },
  { id: 'swarm', code: 'hs', kind: 'mod', hull: 'bolt', parent: 'seeker', name: 'Hunter swarm', cost: 1600,
    perk: '3 seekers per salvo.', weakness: 'Each seeker hits lighter.',
    fx: { seekCount: 3, seekMul: 1 } },
  { id: 'markprey', code: 'mp', kind: 'mod', hull: 'bolt', parent: 'seeker', name: 'Marked prey', cost: 1600,
    perk: 'Seeker hits mark the target: +15% damage from your bolts for 2 s.', weakness: 'Salvos fire a little less often.',
    fx: { markPrey: 1, seekEvery: 5, seekMul: 1 } },
  { id: 'lance', code: 'ln', kind: 'pattern', hull: 'seraph', parent: '', name: 'Prism lance', cost: 0,
    perk: 'Standard issue. One continuous cutting beam.', weakness: 'Heat discipline.',
    fx: {} },
  { id: 'wideprism', code: 'wp', kind: 'mod', hull: 'seraph', parent: 'lance', name: 'Wide prism', cost: 2200,
    perk: 'Beam width ×1.6, grab radius ×1.4.', weakness: 'Beam damage ×0.83.',
    fx: { beamHit: 1.4, beamWidth: 1.6, beamDmg: .83 } },
  { id: 'coldlens', code: 'cl', kind: 'mod', hull: 'seraph', parent: 'lance', name: 'Cold lens', cost: 2200,
    perk: 'Heat builds ×0.75 as fast: longer cuts.', weakness: 'Beam damage ×0.9.',
    fx: { beamDrain: .75, beamDmg: .9 } },
  { id: 'overcharge', code: 'oc', kind: 'mod', hull: 'seraph', parent: 'lance', name: 'Overcharge', cost: 2200,
    perk: 'Beam damage ×1.12.', weakness: 'Heat builds ×1.3 as fast; vent lockout +0.5 s.',
    fx: { beamDmg: 1.12, beamDrain: 1.3, beamLock: .5 } }
];
const ARMS_STOCK = { bolt: 'spread', seraph: 'lance' };

/* ── Modules: sidegrades beside the sigil (alloy-armory spec, Layer 3) ── */
const SLOT_B_COST = 5000;
const MODULES = [
  { id: 'trim', name: 'Vector trim', cost: 1200, perk: '+18% speed.', weakness: '−1 dash charge.',
    apply() { P.speed *= 1.18; P.maxCharges = Math.max(1, P.maxCharges - 1); } },
  { id: 'claw', name: 'Salvage claw', cost: 1300, perk: '+45% pickup radius.', weakness: '−8% damage.',
    apply() { P.magMul *= 1.45; P.dmg *= .92; } },
  { id: 'bay', name: 'Bomb bay', cost: 1400, perk: '+1 nova pulse at launch.', weakness: '−1 hull (never below 1).',
    apply(g) { P.bombs += 1; g.lives -= 1; } },
  { id: 'frame', name: 'Reinforced frame', cost: 1500, perk: '+1 hull at launch.', weakness: '−10% speed.',
    apply(g) { g.lives += 1; P.speed *= .9; } },
  { id: 'barrels', name: 'Wide barrels', cost: 1600, perk: '+1 gun lane at every tier.', weakness: '+12% fire interval.',
    apply() { P.extraLanes += 1; P.rateMul *= 1.12; } },
  { id: 'lens', name: 'Focus lens', cost: 1800, perk: '+20% damage.', weakness: 'Dash recharge ×0.75.',
    apply() { P.dmg *= 1.2; P.dashMul *= .75; } }
];

/* ── Frame doctrines: 5 hulls × 3 rows × 2 options, gated by hull Mastery ── */
const FRAME_ROWS = [{ row: 1, mastery: 1, cost: 800 }, { row: 2, mastery: 3, cost: 1600 }, { row: 3, mastery: 5, cost: 3200 }];
const FRAMES = [
  { id: 'vesper.1a', name: 'Duelist trim', perk: '+6% damage.', weakness: '−1 pulse at launch.', apply() { P.dmg *= 1.06; P.bombs = Math.max(0, P.bombs - 1); } },
  { id: 'vesper.1b', name: 'Reserve trim', perk: '+1 pulse at launch.', weakness: '−6% damage.', apply() { P.bombs += 1; P.dmg *= .94; } },
  { id: 'vesper.2a', name: 'Slipstream', perk: 'Dash recharge ×1.15.', weakness: 'Pickup radius ×0.8.', apply() { P.dashMul *= 1.15; P.magMul *= .8; } },
  { id: 'vesper.2b', name: 'Salvage gimbal', perk: 'Pickup radius ×1.3.', weakness: 'Dash recharge ×0.9.', apply() { P.magMul *= 1.3; P.dashMul *= .9; } },
  { id: 'vesper.3a', name: 'Second wind', perk: 'Once per run a lethal hit breaks into a shield instead.', weakness: 'The save resets your combo to ×1.', apply() { P.secondWind = 1; } },
  { id: 'vesper.3b', name: 'Ace’s nerve', perk: '+1 dash charge.', weakness: '−1 hull at launch (never below 1).', apply(g) { P.maxCharges += 1; g.lives -= 1; } },
  { id: 'halcyon.1a', name: 'Afterburn', perk: '+8% speed.', weakness: 'Hitbox +6%.', apply() { P.speed *= 1.08; P.r *= 1.06; } },
  { id: 'halcyon.1b', name: 'Trim profile', perk: 'Hitbox −6%.', weakness: '−6% speed.', apply() { P.r *= .94; P.speed *= .94; } },
  { id: 'halcyon.2a', name: 'Graze capacitor', perk: 'Graze score ×1.3.', weakness: '−8% damage.', apply() { P.grazeMul *= 1.3; P.dmg *= .92; } },
  { id: 'halcyon.2b', name: 'Hot guns', perk: '+8% damage.', weakness: 'Graze score ×0.8.', apply() { P.dmg *= 1.08; P.grazeMul *= .8; } },
  { id: 'halcyon.3a', name: 'Lancer dash', perk: 'A dash hits every hostile it crosses for 3× bolt damage.', weakness: 'Dash recharge ×0.87.', apply() { P.lancer = 3; P.dashMul *= .87; } },
  { id: 'halcyon.3b', name: 'Phase surge', perk: 'Dash invulnerability +0.12 s.', weakness: '−1 dash charge.', apply() { P.dashInv = .12; P.maxCharges = Math.max(1, P.maxCharges - 1); } },
  { id: 'atlas.1a', name: 'Ablative skin', perk: 'Your shield rebuilds itself every 26 s.', weakness: '−5% speed.', apply() { P.shieldMax = Math.max(P.shieldMax, 1); P.shieldRegenOn = true; P.speed *= .95; } },
  { id: 'atlas.1b', name: 'Stripped plates', perk: '+8% speed.', weakness: 'No shield at launch.', apply() { P.speed *= 1.08; P.shield = 0; } },
  { id: 'atlas.2a', name: 'Flak skirt', perk: 'Nova pulses expand 25% faster.', weakness: 'Fire interval ×1.08.', apply() { P.novaSpd = 1.25; P.rateMul *= 1.08; } },
  { id: 'atlas.2b', name: 'Broadside', perk: '+1 outer gun lane.', weakness: 'Per-lane damage ×0.9.', apply() { P.extraLanes += 1; P.laneMul *= .9; } },
  { id: 'atlas.3a', name: 'Bastion', perk: '+1 hull at launch.', weakness: 'Score ×0.95.', apply(g) { g.lives += 1; P.frameScoreMul *= .95; } },
  { id: 'atlas.3b', name: 'Iron will', perk: '+1 pulse for every capital ship you destroy.', weakness: '−1 hull at launch (never below 1).', apply(g) { P.capPulse = 1; g.lives -= 1; } },
  { id: 'wraith.1a', name: 'Ghost veil', perk: '+0.4 s invulnerability after any hit.', weakness: 'Graze score ×0.9.', apply() { P.invBonus = .4; P.grazeMul *= .9; } },
  { id: 'wraith.1b', name: 'Wide wake', perk: '+1 pulse at launch.', weakness: 'Hitbox +8%.', apply() { P.bombs += 1; P.r *= 1.08; } },
  { id: 'wraith.2a', name: 'Night drive', perk: '+1 dash charge.', weakness: '−6% speed.', apply() { P.maxCharges += 1; P.speed *= .94; } },
  { id: 'wraith.2b', name: 'Reaper’s tithe', perk: '+1 pulse for every capital ship you destroy.', weakness: '−1 dash charge.', apply() { P.capPulse = 1; P.maxCharges = Math.max(1, P.maxCharges - 1); } },
  { id: 'wraith.3a', name: 'Gate echo', perk: 'Your first lethal hit leaves a 3 s ghost, then you fly on.', weakness: 'Score ×0.85 for the rest of the run once it fires.', apply() { P.gateEcho = 1; } },
  { id: 'wraith.3b', name: 'Pure nerve', perk: 'Dash recharge ×1.2.', weakness: 'Shield pickups do nothing.', apply() { P.dashMul *= 1.2; P.noShield = 1; } },
  { id: 'seraph.1a', name: 'Heat-sink fins', perk: 'Cooling ×1.2.', weakness: 'Beam damage ×0.95.', apply() { P.beamCool *= 1.2; P.beamDmg *= .95; } },
  { id: 'seraph.1b', name: 'Hot prism', perk: 'Beam damage ×1.06.', weakness: 'Cooling ×0.85.', apply() { P.beamDmg *= 1.06; P.beamCool *= .85; } },
  { id: 'seraph.2a', name: 'Refraction', perk: 'The beam chains to one more hostile within 120 px at 40%.', weakness: 'Heat builds ×1.1 as fast.', apply() { P.refract = .4; P.beamDrain *= 1.1; } },
  { id: 'seraph.2b', name: 'Focused core', perk: '+12% beam damage against capital ships.', weakness: '−10% against everything else.', apply() { P.beamBoss = 1.12; P.beamOther = .9; } },
  { id: 'seraph.3a', name: 'Sunline', perk: 'During overdrive the beam is 1.5× wider.', weakness: 'Vent lockout +0.5 s.', apply() { P.sunline = 1.5; P.beamLock += .5; } },
  { id: 'seraph.3b', name: 'Cool head', perk: 'Vent lockout −0.5 s.', weakness: 'Beam damage ×0.92.', apply() { P.beamLock -= .5; P.beamDmg *= .92; } }
];

/* ── Contracts: 3 daily (easy/medium/hard) + the weekly yard order ── */
const CONTRACT_REWARD = [80, 120, 180];
const CONTRACT_BONUS = 100;
const CONTRACT_POOL = [
  { id: 'graze', slots: 'emh', kind: 'sum', stat: 'grazes', text: n => 'Graze ' + fmt(n) + ' rounds', target: (T, k) => Math.round((40 + 30 * T) * k / 10) * 10 },
  { id: 'kills', slots: 'em', kind: 'sum', stat: 'kills', text: n => 'Destroy ' + fmt(n) + ' hostiles', target: (T, k) => Math.round((50 + 40 * T) * k / 10) * 10 },
  { id: 'wave', slots: 'emh', kind: 'max', stat: 'wave', text: n => 'Reach wave ' + n + ' in one run', target: (T, k) => Math.round(2 + T * 1.6 + k * 1.5) },
  { id: 'capital', slots: 'mh', kind: 'sum', stat: 'bosses', text: n => 'Destroy ' + n + ' capital ship' + (n === 1 ? '' : 's'), target: (T, k) => Math.max(1, Math.round(k * .7 + T / 3)) },
  { id: 'comets', slots: 'em', kind: 'sum', stat: 'comets', text: n => 'Sight ' + n + ' comet' + (n === 1 ? '' : 's'), target: (T, k) => Math.max(1, Math.round(k)) },
  { id: 'nopulse', slots: 'mh', kind: 'max', stat: 'nopulse', text: n => 'Reach wave ' + n + ' without firing a pulse', target: (T, k) => Math.round(2 + T * 1.4 + k) },
  { id: 'accuracy', slots: 'h', kind: 'max', stat: 'accuracy', text: n => 'Finish a run at ' + n + '% accuracy (300+ shots)', target: (T, k) => Math.min(70, 34 + T * 4 + Math.round(k * 2)) }
];
const CONTRACT_SLOT_K = { e: 1, m: 1.8, h: 3 };
const WEEKLY_ALLOY = 700;
const WEEKLY_STOCK_COST = 2400;
const WEEKLY_OBJECTIVES = [
  { id: 'graze', kind: 'sum', stat: 'grazes', target: 120, text: 'Graze 120 rounds this week' },
  { id: 'wave', kind: 'max', stat: 'wave', target: 10, text: 'Reach wave 10' },
  { id: 'capital', kind: 'sum', stat: 'bosses', target: 3, text: 'Destroy 3 capital ships' },
  { id: 'daily', kind: 'sum', stat: 'dailyRuns', target: 1, text: 'Finish a Daily run' }
];
/* plate finishes outside the standing ladder: weekly stock (sold), the
   Founder plate (gifted to existing careers) and the M10 service stripe */
const EXTRA_FINISHES = [
  { id: 'week-cobalt', name: 'Cobalt', hull: '#5f86d9', lit: '#dce7ff', sold: 0 },
  { id: 'week-copper', name: 'Copper', hull: '#c9774a', lit: '#ffe0cc', sold: 1 },
  { id: 'week-jade', name: 'Jade', hull: '#3fae7a', lit: '#d4ffe8', sold: 2 },
  { id: 'week-pearl', name: 'Pearl', hull: '#cfc8e8', lit: '#ffffff', sold: 3 },
  { id: 'founder', name: 'Founder', hull: '#b8892f', lit: '#ffe9b8', gift: 'founder' },
  { id: 'service', name: 'Service stripe', hull: '#e8b53a', lit: '#fff4cf', gift: 'm10' }
];

/* ── Mastery M6–M10: cosmetic only (M1–M5 in MASTERY_TIERS are unchanged) ── */
const MASTERY_COSMETIC = [
  { lvl: 6, xp: 15000, name: 'Dock decal', sub: 'your hull’s crest on the pad' },
  { lvl: 7, xp: 20000, name: 'Contrail shape', sub: 'ribbon, twin or spark exhaust' },
  { lvl: 8, xp: 26000, name: 'Hull title', sub: 'your board row reads “<HULL> ACE”' },
  { lvl: 9, xp: 33000, name: 'Pad ring', sub: 'the dock ring turns while you are docked' },
  { lvl: 10, xp: 41000, name: 'Service stripe', sub: 'a gold plate finish' }
];
const TRAIL_SHAPES = [
  { id: 'stock', name: 'Stock', cls: 'trail-stock' }, { id: 'ribbon', name: 'Ribbon', cls: 'trail-ribbon' },
  { id: 'twin', name: 'Twin', cls: 'trail-twin' }, { id: 'spark', name: 'Spark', cls: 'trail-spark' }
];
const BAYS = [
  { id: 'ship', name: 'Ship', icon: '◈' },
  { id: 'systems', name: 'Systems', icon: '⚙' },
  { id: 'arms', name: 'Arms', icon: '✦' },
  { id: 'style', name: 'Style', icon: '◐' },
  { id: 'yard', name: 'Yard', icon: '⌂' }
];

/* ═══════════════ save: allowlisted keys, schema 2, lossless from v1 ═══════════════
   loadMeta() stays the only parser; hgLoad() is its tail for the overhaul keys.
   Unknown ids fall back to stock, counts are clamped, nothing is renamed, so
   a v4.29 client can still load a schema-2 save (it ignores the new keys). */
function armsItem(id) { return ARMORY.find(a => a.id === id) || null; }
function moduleItem(id) { return MODULES.find(m => m.id === id) || null; }
function frameItem(id) { return FRAMES.find(f => f.id === id) || null; }
function armsClass(hullId) { return hullId === 'seraph' ? 'seraph' : 'bolt'; }
function objOf(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
function idList(v, ok) { return Array.isArray(v) ? v.filter((x, i, a) => typeof x === 'string' && ok(x) && a.indexOf(x) === i) : []; }
function dayKeyOk(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); }
function hgBlank() {
  return {
    schema: 2, arms: {}, armsOwned: [], modules: [], slotB: false, loadout: {}, presets: {},
    frames: {}, framesOwned: [], contracts: null, week: null, finishes: [], founder: false,
    founderSeen: true, cosmetics: {}, backupDay: '', lastBay: 'ship'
  };
}
function hgLoad(s, M) {
  if (!s || typeof s !== 'object') s = { schema: 2 };
  const legacy = !(+s.schema >= 2);
  Object.assign(M, hgBlank());
  M.armsOwned = idList(s.armsOwned, id => !!armsItem(id) && armsItem(id).cost > 0);
  const own = id => { const a = armsItem(id); return !!a && (a.cost === 0 || M.armsOwned.includes(id)); };
  for (const h of HULLS) {
    const a = objOf(objOf(s.arms)[h.id]);
    const cls = armsClass(h.id);
    const pat = armsItem(a.pat);
    const okPat = pat && pat.kind === 'pattern' && pat.hull === cls && own(pat.id);
    const p = okPat ? pat.id : ARMS_STOCK[cls];
    const mod = armsItem(a.mod);
    M.arms[h.id] = { pat: p, mod: mod && mod.kind === 'mod' && mod.parent === p && own(mod.id) ? mod.id : '' };
  }
  M.modules = idList(s.modules, id => !!moduleItem(id));
  M.slotB = !!s.slotB;
  /* legacy saves carry one global sigil; every hull starts wearing it (today's
     behaviour). META.sigil stays the docked hull's sigil (dual-written). */
  for (const h of HULLS) {
    const l = objOf(objOf(s.loadout)[h.id]);
    const sg = legacy || !(h.id in objOf(s.loadout)) ? M.sigil : l.sigil;
    const okSg = typeof sg === 'string' && SIGILS.some(g => g.id === sg) && M.sigils.includes(sg);
    const modA = M.modules.includes(l.modA) ? l.modA : '';
    const modB = M.slotB && M.modules.includes(l.modB) && l.modB !== modA ? l.modB : '';
    M.loadout[h.id] = { sigil: okSg ? sg : '', modA, modB };
  }
  M.loadout[M.ship].sigil = M.sigil || '';
  M.framesOwned = idList(s.framesOwned, id => !!frameItem(id));
  for (const h of HULLS) {
    const f = objOf(objOf(s.frames)[h.id]);
    const pick = {};
    for (const r of FRAME_ROWS) {
      const v = f['r' + r.row];
      pick['r' + r.row] = (v === 'a' || v === 'b') && M.framesOwned.includes(h.id + '.' + r.row + v) ? v : '';
    }
    M.frames[h.id] = pick;
    M.presets[h.id] = [0, 1, 2].map(i => presetClean((objOf(s.presets)[h.id] || [])[i], h.id));
  }
  M.finishes = idList(s.finishes, id => EXTRA_FINISHES.some(f => f.id === id));
  M.contracts = contractsClean(s.contracts);
  M.week = weekClean(s.week);
  for (const h of HULLS) {
    const c = objOf(objOf(s.cosmetics)[h.id]);
    M.cosmetics[h.id] = { trail: TRAIL_SHAPES.some(t => t.id === c.trail) ? c.trail : 'stock', decal: c.decal === true };
  }
  M.backupDay = dayKeyOk(s.backupDay) ? s.backupDay : '';
  M.lastBay = BAYS.some(x => x.id === s.lastBay) ? s.lastBay : 'ship';
  /* Founder plate: careers that flew before the overhaul get it once */
  M.founder = !!s.founder;
  M.founderSeen = s.founderSeen !== false;
  if (legacy && (+s.runs || 0) > 0 && !M.founder) {
    M.founder = true; M.founderSeen = false;
    if (!M.finishes.includes('founder')) M.finishes.push('founder');
  }
  if (M.founder && !M.finishes.includes('founder')) M.finishes.push('founder');
  if (masteryCosmeticLevel(M, null) >= 10 && !M.finishes.includes('service')) M.finishes.push('service');
}
function presetClean(p, hullId) {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.name == null ? '' : p.name).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Preset';
  const cls = armsClass(hullId);
  const pat = armsItem(p.pat), mod = armsItem(p.mod);
  const f = objOf(p.f);
  const out = {
    name,
    pat: pat && pat.kind === 'pattern' && pat.hull === cls ? pat.id : ARMS_STOCK[cls],
    mod: mod && mod.kind === 'mod' && pat && mod.parent === pat.id ? mod.id : '',
    sigil: typeof p.sigil === 'string' && SIGILS.some(g => g.id === p.sigil) ? p.sigil : '',
    modA: moduleItem(p.modA) ? p.modA : '',
    modB: moduleItem(p.modB) && p.modB !== p.modA ? p.modB : '',
    f: {}
  };
  for (const r of FRAME_ROWS) out.f['r' + r.row] = f['r' + r.row] === 'a' || f['r' + r.row] === 'b' ? f['r' + r.row] : '';
  return out;
}
function contractsClean(c) {
  c = objOf(c);
  if (!dayKeyOk(c.day) || !Array.isArray(c.list) || c.list.length !== 3) return null;
  const list = c.list.map(x => {
    x = objOf(x);
    const def = CONTRACT_POOL.find(d => d.id === x.id);
    return def && 'emh'.includes(x.slot) ? { id: x.id, slot: x.slot, target: Math.max(1, Math.round(+x.target || 1)), reward: clamp(Math.round(+x.reward || 0), 0, 720) } : null;
  });
  if (list.some(x => !x)) return null;
  const arr = (v, f) => [0, 1, 2].map(i => f(Array.isArray(v) ? v[i] : undefined, i));
  return {
    day: c.day, tier: clamp(Math.round(+c.tier || 0), 0, 6), list,
    prog: arr(c.prog, (v, i) => clamp(Math.round(+v || 0), 0, list[i].target)),
    claimed: arr(c.claimed, v => v === true),
    bonus: c.bonus === true, rerolled: c.rerolled === true
  };
}
function weekClean(w) {
  w = objOf(w);
  if (!Number.isInteger(w.id) || w.id < 0) return null;
  const obj = WEEKLY_OBJECTIVES[w.id % WEEKLY_OBJECTIVES.length];
  return { id: w.id, prog: clamp(Math.round(+w.prog || 0), 0, obj.target), claimed: w.claimed === true };
}
/* Reset progress: alloy, hulls, refits, armory, modules, frames, loadouts,
   presets and contracts go; honor, standing, finishes, paints, sigils and
   mastery stay (design §3.10, #97 G16). */
function hgReset(M) {
  const keep = { finishes: M.finishes.slice(), founder: M.founder, cosmetics: M.cosmetics, backupDay: M.backupDay, week: M.week, lastBay: M.lastBay };
  Object.assign(M, hgBlank(), keep);
  for (const h of HULLS) {
    M.arms[h.id] = { pat: ARMS_STOCK[armsClass(h.id)], mod: '' };
    M.loadout[h.id] = { sigil: h.id === 'vesper' ? (M.sigil || '') : '', modA: '', modB: '' };
    M.frames[h.id] = { r1: '', r2: '', r3: '' };
    M.presets[h.id] = [null, null, null];
  }
}

/* ═══════════════ mastery cosmetics ═══════════════ */
function masteryCosmeticLevel(M, hullId) {
  const m = objOf(M && M.mastery);
  const ids = hullId ? [hullId] : HULLS.map(h => h.id);
  let best = 0;
  for (const id of ids) {
    const xp = +objOf(m[id]).xp || 0;
    let lvl = 0;
    for (const t of MASTERY_TIERS) if (xp >= t.xp) lvl = t.lvl;
    for (const t of MASTERY_COSMETIC) if (xp >= t.xp) lvl = t.lvl;
    best = Math.max(best, lvl);
  }
  return best;
}

/* ═══════════════ gear: what flies, and the fairness rules ═══════════════ */
/* New gear flies on Endless and Tour only. The ranked Daily, rush, school
   and the range fly standard issue (a range "Try it" trial is the one
   exception, and it is never scored). */
function gearAllowed() {
  if (RANGE.trial) return 'trial';
  if (RANGE.starting || SCHOOL.starting || GAME.school || GAME.rush) return '';
  return GAME.mode === 'endless' || GAME.mode === 'tour' ? 'full' : '';
}
function fittedArms(hullId) {
  const a = META.arms && META.arms[hullId];
  return a || { pat: ARMS_STOCK[armsClass(hullId)], mod: '' };
}
/* Today's ceiling, per stat, across every hull with every legacy refit and
   the strongest legacy sigil — computed from the live tables. Gear may help a
   pilot reach it sooner; it never takes anyone above it. */
function powerCeiling() {
  const mx = k => Math.max.apply(null, HULLS.map(h => h[k]));
  return {
    dmg: mx('dmg') * (1 + 5 * .07) * 1.35,
    speed: mx('speed') * (1 + 5 * .045),
    lives: mx('lives') + 2 + D().lives,   /* plating III + V, plus the difficulty spare */
    bombs: mx('bombs') + 1,
    charges: mx('dash') + 1,
    grazeMul: mx('grazeMul'),
    scoreMul: mx('scoreMul'),
    hitbox: Math.min.apply(null, HULLS.map(h => h.hitbox)) * 5 * SHIP_SCALE,
    radius: 92 * (1 + 5 * .28),
    dashMul: 1.25,
    volley: armsComposite(MAX_WEAPON, {}, 1)
  };
}
/* configurePlayer() calls this after the legacy setup. Returns launch lives. */
function applyGear(h, lives) {
  P.extraLanes = 0; P.laneMul = 1; P.frameScoreMul = 1; P.secondWind = 0; P.gateEcho = 0;
  P.lancer = 0; P.dashInv = 0; P.invBonus = 0; P.capPulse = 0; P.noShield = 0; P.novaSpd = 1;
  P.beamDmg = 1; P.beamCool = 1; P.beamDrain = 1; P.beamHit = 1; P.beamWidth = 1; P.beamLock = 0;
  P.refract = 0; P.beamBoss = 1; P.beamOther = 1; P.sunline = 1;
  P.feedT = 0; P.feedStacks = 0; P.volleyN = 0;
  GAME.armed = null; GAME.fitMods = []; GAME.fitFrames = null; GAME.gear = gearAllowed();
  GAME.capped = [];
  const mode = GAME.gear;
  if (!mode) return lives;
  const legacy = { dmg: P.dmg, speed: P.speed, lives, bombs: P.bombs, charges: P.maxCharges, grazeMul: P.grazeMul,
    scoreMul: P.scoreMul, r: P.r, mag: P.magMul, dashMul: P.dashMul };
  const arms = mode === 'trial' ? RANGE.trial : fittedArms(h.id);
  const pat = armsItem(arms.pat), mod = armsItem(arms.mod);
  const fx = Object.assign({}, pat ? pat.fx : {}, mod ? mod.fx : {});
  if (h.beam) {
    if (fx.beamDmg) P.beamDmg *= fx.beamDmg;
    if (fx.beamDrain) P.beamDrain *= fx.beamDrain;
    if (fx.beamHit) P.beamHit *= fx.beamHit;
    if (fx.beamWidth) P.beamWidth *= fx.beamWidth;
    if (fx.beamLock) P.beamLock += fx.beamLock;
  }
  const g = { lives };
  if (mode === 'full') {
    const lo = META.loadout[h.id] || {};
    for (const id of [lo.modA, META.slotB ? lo.modB : '']) {
      const m = moduleItem(id);
      if (m && META.modules.includes(id) && !GAME.fitMods.includes(id)) { m.apply(g); GAME.fitMods.push(id); }
    }
    const fr = META.frames[h.id] || {};
    GAME.fitFrames = fr;
    for (const r of FRAME_ROWS) {
      const v = fr['r' + r.row];
      const f = v && frameItem(h.id + '.' + r.row + v);
      if (f && META.framesOwned.includes(f.id) && masteryLevel(h.id) >= r.mastery) f.apply(g);
    }
  }
  if (!h.beam && (pat && pat.id !== 'spread' || mod || P.extraLanes || P.laneMul !== 1)) GAME.armed = { pat: pat ? pat.id : 'spread', mod: mod ? mod.id : '', fx };
  /* the cap: each stat may rise only as far as the higher of today's
     ceiling and what this pilot already had without gear */
  const c = powerCeiling();
  const cap = (k, v, lim, low) => {
    const out = low ? Math.max(v, Math.min(lim, legacy[k])) : Math.min(v, Math.max(lim, legacy[k]));
    if (Math.abs(out - v) > 1e-9) GAME.capped.push(k);
    return out;
  };
  P.dmg = cap('dmg', P.dmg, c.dmg);
  P.speed = cap('speed', P.speed, c.speed);
  P.bombs = Math.max(0, Math.round(cap('bombs', P.bombs, c.bombs)));
  P.maxCharges = Math.max(1, Math.round(cap('charges', P.maxCharges, c.charges)));
  P.charges = P.maxCharges;
  P.grazeMul = cap('grazeMul', P.grazeMul, c.grazeMul);
  P.r = cap('r', P.r, c.hitbox, true);
  P.dashMul = cap('dashMul', P.dashMul, c.dashMul);
  const rNow = 92 * (1 + refit('magnet') * .28);
  P.magMul = cap('mag', P.magMul, c.radius / rNow);
  P.shield = Math.min(P.shield, Math.max(P.shieldMax, P.shield));
  return Math.max(1, Math.round(cap('lives', g.lives, c.lives)));
}

/* ── bolt patterns: volley geometry + normalisation ── */
function armsLanes(tier, fx) {
  const base = WEAPONS[clamp(tier, 1, MAX_WEAPON)].lanes;
  let L = base.map(l => [l[0], l[1] * (fx.angMul || 1), 1]);
  const n = L.length;
  if (fx.keep) {
    const k = Math.min(fx.keep, n);
    L = L.slice().sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) * 100 - Math.abs(q[0]) - Math.abs(q[1]) * 100)
      .slice(0, k).map(l => [l[0], fx.keepAng == null ? l[1] : l[1] * fx.keepAng, n / k]);
  }
  const outer = (frac, angK) => {
    const o = L.reduce((m, l) => Math.abs(l[1]) > Math.abs(m[1]) ? l : m, L[0]);
    const oa = Math.max(Math.abs(o[1]), .08) * angK, od = Math.abs(o[0]) + 6;
    for (let i = 0; i < frac; i++) L.push([-od - i * 5, -oa * (1 + i * .25), 1], [od + i * 5, oa * (1 + i * .25), 1]);
  };
  if (fx.outerFrac) outer(Math.max(1, Math.round(n * fx.outerFrac)), fx.outerAng || 1.4);
  return L;
}
/* single-target vs crowd model shared by the fire path and the parity test:
   a target 320 px out with a 26 px half-width; crowd assumes every lane
   finds a hostile. Seekers home, so they count on both axes. */
function armsModel(tier, fx, norm, extra) {
  const w = WEAPONS[clamp(tier, 1, MAX_WEAPON)];
  const L = armsLanes(tier, fx);
  for (let i = 0; i < (extra || 0); i++) L.push([(i % 2 ? -1 : 1) * (24 + i * 4), (i % 2 ? -1 : 1) * (.3 + i * .04), 1]);
  const per = w.dmg * (norm == null ? 1 : norm);
  let single = 0, crowd = 0;
  for (const l of L) {
    const d = per * l[2];
    crowd += d;
    if (Math.abs(l[0] * .9 + 320 * Math.tan(l[1])) <= 26) single += d;
  }
  const capAvg = fx.capEvery ? 1 + (fx.capMul - 1) / fx.capEvery : 1;
  single *= capAvg; crowd *= capAvg;
  const sf = fx.seekFrom || MAX_WEAPON, se = fx.seekEvery || 5, sc = fx.seekCount || 2, sm = fx.seekMul || 1.6;
  if (tier >= sf) {
    const s = sc * sm * per / se * (fx.seekLanes ? w.lanes.length / 3 : 1);
    single += s; crowd += s;
  }
  let rate = 1 / (w.rate * (fx.rateMul || 1));
  if (fx.grazeFeed) rate /= .93;            /* modelled: ~0.7 grazes/s holds ~0.7 stacks */
  single *= rate; crowd *= rate;
  if (fx.pierce) crowd *= 1.3;
  if (fx.markPrey) single *= 1.08;
  return { single, crowd, reach: Math.round(1020 * (fx.speedMul || 1) * (fx.life || 2)) };
}
function armsComposite(tier, fx, norm, extra) {
  const m = armsModel(tier, fx, norm, extra);
  return .5 * m.single + .5 * m.crowd;
}
/* per-lane damage scale that puts this pattern on Spread's composite at
   this tier (patterns are shape, not power) */
const ARMS_NORM = {};
function armsNorm(tier, key, fx) {
  const k = key + '@' + tier;
  if (!(k in ARMS_NORM)) ARMS_NORM[k] = armsComposite(tier, {}, 1) / armsComposite(tier, fx, 1);
  return ARMS_NORM[k];
}
function fireArmed(w, over, sg) {
  const a = GAME.armed, fx = a.fx, tier = clamp(P.weapon, 1, MAX_WEAPON);
  const lanes = armsLanes(tier, fx);
  for (let i = 0; i < P.extraLanes; i++) lanes.push([(i % 2 ? -1 : 1) * (24 + i * 4), (i % 2 ? -1 : 1) * (.3 + i * .04), 1]);
  P.volleyN++;
  let interval = w.rate * (over ? .68 : 1) * P.rateMul * (sg && sg.id === 'needle' ? 1.2 : 1) * (fx.rateMul || 1);
  if (fx.grazeFeed && P.feedT > 0) interval *= 1 - .1 * P.feedStacks;
  P.fireCd = interval;
  const n = armsNorm(tier, a.pat + '.' + a.mod, fx) * P.laneMul * armsVolleyScale(tier, fx, P.extraLanes);
  const dmg = w.dmg * P.dmg * (over ? 1.15 : 1) * n;
  const heavy = fx.capEvery && P.volleyN % fx.capEvery === 0;
  const vol = heavy ? dmg * fx.capMul : dmg;
  const sp = 1020 * (fx.speedMul || 1), life = fx.life || 2;
  for (const l of lanes) {
    pb.push({ x: P.x + l[0] * .9, y: P.y - 14, vx: Math.sin(l[1]) * sp, vy: -Math.cos(l[1]) * sp,
      r: heavy ? 5.5 : 4, dmg: vol * l[2], kind: 'bolt', life, pierce: fx.pierce || 0, needle: P.pierce });
    GAME.shots++;
  }
  P.muzzleT = .055;
  AU.shoot(P.weapon);
  const sf = fx.seekFrom || MAX_WEAPON;
  if (P.weapon >= sf) {
    P.seekCd -= 1;
    if (P.seekCd <= 0) {
      P.seekCd = fx.seekEvery || 5;
      const n = fx.seekCount || 2, mul = (fx.seekMul || 1.6) * (fx.seekLanes ? w.lanes.length / 3 : 1);
      for (let i = 0; i < n; i++) {
        const side = n === 2 ? (i ? 1 : -1) : i - 1;
        pb.push({ x: P.x + side * 16, y: P.y, vx: (side || .3) * 210, vy: -180,
          r: 5, dmg: dmg * mul, kind: 'seeker', life: 2.6, target: null, ang: -PI / 2, prey: fx.markPrey ? 1 : 0 });
        GAME.shots++;
      }
    }
  }
}
/* the Endless ceiling also holds for the whole volley: lanes added by gear
   can lift a low ordnance tier, never past today's top-tier composite
   (per second, before P.dmg, which is capped on its own) */
function armsVolleyScale(tier, fx, extra) {
  if (!extra) return 1;
  const norm = armsNorm(tier, 'x' + extra + JSON.stringify(fx), fx) * P.laneMul;
  const mine = armsComposite(tier, fx, norm, extra) / P.rateMul;
  const top = armsComposite(MAX_WEAPON, {}, 1);
  return mine > top ? top / mine : 1;
}
/* the dock and the range preview read this: what a fit actually fires */
function armsPreviewLanes(hullId, arms) {
  if (armsClass(hullId) === 'seraph') return null;
  const pat = armsItem(arms.pat), mod = armsItem(arms.mod);
  const fx = Object.assign({}, pat ? pat.fx : {}, mod ? mod.fx : {});
  return armsLanes(Math.max(3, Math.min(MAX_WEAPON, 1 + Math.floor(refit('ordnance') / 2) + 2)), fx);
}

/* ── Seraph lens model: sustained duty × damage, crowd ∝ grab radius ── */
function beamModel(fx) {
  const drain = BEAM.heatDrain * (fx.beamDrain || 1);
  const duty = (1 / drain) / (1 / drain + 1 / (BEAM.cool * BEAM.ventBoost));
  const single = BEAM.damage * (fx.beamDmg || 1) * duty;
  return { single, crowd: single * (fx.beamHit || 1) };
}

/* ═══════════════ loadout code: stats.fit ═══════════════
   v:sp.wf|sg:needle|m:trim,claw|f:1a2b3-   (≤ 64 chars, [a-z0-9:|.,_-]) */
function fitCode() {
  const h = hull();
  const head = h.id[0];
  const sgl = GAME.sigil ? GAME.sigil.id : '';
  if (!GAME.gear) return (head + ':std' + (sgl ? '|sg:' + sgl : '')).slice(0, 64);
  const arms = GAME.gear === 'trial' ? RANGE.trial : fittedArms(h.id);
  const p = armsItem(arms.pat), m = armsItem(arms.mod);
  let s = head + ':' + (p ? p.code : 'sp') + '.' + (m ? m.code : '-');
  if (sgl) s += '|sg:' + sgl;
  if (GAME.fitMods.length) s += '|m:' + GAME.fitMods.join(',');
  const fr = GAME.fitFrames;
  if (fr && (fr.r1 || fr.r2 || fr.r3)) s += '|f:' + FRAME_ROWS.map(r => r.row + (fr['r' + r.row] || '-')).join('');
  return s.slice(0, 64);
}
function fitDecode(code) {
  if (typeof code !== 'string' || !/^[a-z0-9:|.,_-]{1,64}$/.test(code)) return null;
  const parts = code.split('|');
  const hd = parts[0].split(':');
  const h = HULLS.find(x => x.id[0] === hd[0]);
  const out = { hull: h ? h.name : '?', std: hd[1] === 'std', pattern: '', mod: '', sigil: '', modules: [], frames: '' };
  if (!out.std && hd[1]) {
    const pm = hd[1].split('.');
    const p = ARMORY.find(a => a.kind === 'pattern' && a.code === pm[0]);
    const m = ARMORY.find(a => a.kind === 'mod' && a.code === pm[1]);
    out.pattern = p ? p.name : '';
    out.mod = m ? m.name : '';
  }
  for (const part of parts.slice(1)) {
    const [k, v] = part.split(':');
    if (k === 'sg') { const g = SIGILS.find(x => x.id === v); out.sigil = g ? g.name : ''; }
    if (k === 'm') out.modules = (v || '').split(',').map(id => (moduleItem(id) || {}).name).filter(Boolean);
    if (k === 'f') out.frames = v || '';
  }
  return out;
}
function fitLabel(code) {
  const d = fitDecode(code);
  if (!d) return 'Stock / legacy run';
  if (d.std) return 'Standard issue' + (d.sigil ? ' · ' + d.sigil : '');
  return [d.pattern + (d.mod ? ' + ' + d.mod : ''), d.sigil, d.modules.join(', '), d.frames ? 'Frame ' + d.frames : '']
    .filter(Boolean).join(' · ');
}
function fitChip(code) {
  const d = fitDecode(code);
  if (!d) return '';
  const glyph = d.std ? 'STD' : (ARMORY.find(a => a.name === d.pattern) || { code: 'sp' }).code.toUpperCase() +
    (d.modules.length ? '+' + d.modules.length : '') + (d.frames ? '·F' : '');
  return '<i class="fitchip" title="' + esc(fitLabel(code)) + '">' + esc(glyph) + '</i>';
}

/* ═══════════════ in-flight hooks (all no-ops when nothing is fitted) ═══════════════ */
function hgTick(dt) {
  if (P.feedT > 0) { P.feedT -= dt; if (P.feedT <= 0) P.feedStacks = 0; }
}
function hgOnGraze() {
  if (GAME.armed && GAME.armed.fx.grazeFeed) { P.feedStacks = Math.min(3, P.feedStacks + 1); P.feedT = 1; }
}
/* bolt damage against one hostile: Marked prey adds +15% for 2 s */
function hgBoltDmg(b, e) {
  if (b.prey) e.preyUntil = P.t + 2;
  return e.preyUntil > P.t && b.kind === 'bolt' ? b.dmg * 1.15 : b.dmg;
}
/* a lethal hit: Second wind / Gate echo may catch it once. true = absorbed */
function hgLethal() {
  if (P.secondWind === 1) {
    P.secondWind = 2; P.inv = 1.4; GAME.mult = 1; GAME.combo = 0;
    note('Second wind', 'rare'); AU.shieldBreak(); buzz([20, 30, 20]);
    return true;
  }
  if (P.gateEcho === 1) {
    P.gateEcho = 2; P.inv = 3; P.frameScoreMul *= .85;
    note('Gate echo — 3 s ghost', 'rare'); AU.shieldBreak(); buzz([20, 30, 20]);
    return true;
  }
  return false;
}
function hgOnBossKill() {
  if (P.capPulse) { P.bombs++; note('+1 pulse', 'good'); }
}
/* Lancer dash: the dash itself cuts what it crosses */
function hgDashCut() {
  if (!P.lancer || P.dashT <= 0) return;
  for (const e of foes) {
    if (e.dead || e.dying || e.ghost || e.staged || (e.lancedAt || -9) > P.t - .3) continue;
    if (hyp(e.x - P.x, e.y - P.y) < e.hitR + 26) { e.lancedAt = P.t; damageFoe(e, P.dmg * P.lancer, e.x, e.y); }
  }
}
/* Seraph doctrines/lenses: per-target damage, refraction chain */
function hgBeamDmg(e, tick) {
  return tick * (e === boss ? P.beamBoss : P.beamOther);
}
function hgRefract(hitList, tick) {
  if (!P.refract || !hitList.length) return;
  const src = hitList[0];
  let best = null, bd = 120;
  for (const e of foes) {
    if (e.dead || e.dying || e.ghost || e.staged || hitList.includes(e)) continue;
    const d = hyp(e.x - src.x, e.y - src.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) damageFoe(best, tick * P.refract, best.x, best.y);
}

/* ═══════════════ contracts: 3 daily + the weekly yard order ═══════════════ */
function contractTier() { return clamp(Math.floor((META.bestWave || 0) / 5), 0, 6); }
function contractsMake(day, T, salt) {
  const list = [], used = [];
  'emh'.split('').forEach((slot, i) => {
    const pool = CONTRACT_POOL.filter(d => d.slots.includes(slot) && !used.includes(d.id));
    const def = pool[hashStr(day + ':' + slot + ':' + T + salt) % pool.length];
    used.push(def.id);
    list.push({ id: def.id, slot, target: Math.max(1, def.target(T, CONTRACT_SLOT_K[slot])), reward: Math.round(CONTRACT_REWARD[i] * (1 + .5 * T)) });
  });
  return list;
}
/* forward-only: a clock set back never re-rolls an older board */
function contractsToday() {
  const day = todaySeedKey();
  const c = META.contracts;
  if (c && c.day >= day) return c;
  const T = contractTier();
  META.contracts = { day, tier: T, list: contractsMake(day, T, ''), prog: [0, 0, 0], claimed: [false, false, false], bonus: false, rerolled: false };
  return META.contracts;
}
function contractReroll() {
  const c = contractsToday();
  if (c.rerolled || c.claimed.some(Boolean) || c.prog.some(Boolean)) return false;
  c.list = contractsMake(c.day, c.tier, ':r');
  c.rerolled = true;
  return true;
}
function weeklyIndex(dayKey) {
  const k = dayKeyOk(dayKey) ? dayKey : todaySeedKey();
  const [y, m, d] = k.split('-').map(Number);
  return Math.max(0, Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 5)) / 6048e5));
}
function weeklyNow() {
  const id = weeklyIndex();
  if (!META.week || META.week.id < id) META.week = { id, prog: 0, claimed: false };
  return META.week;
}
function weeklyObjective() { return WEEKLY_OBJECTIVES[weeklyNow().id % WEEKLY_OBJECTIVES.length]; }
function weeklyFinish() { return EXTRA_FINISHES.find(f => f.sold === weeklyNow().id % 4); }
/* the run's numbers the boards care about; one object feeds both ledgers */
function contractRunStats() {
  return {
    grazes: GAME.grazes || 0, kills: GAME.kills || 0, wave: GAME.wave || 0, bosses: GAME.bosses || 0,
    comets: (GAME.skyRun && GAME.skyRun.comets) || 0,
    nopulse: GAME.bombsUsed ? 0 : GAME.wave || 0,
    accuracy: GAME.shots >= 300 ? Math.round(GAME.hits / GAME.shots * 100) : 0,
    dailyRuns: GAME.mode === 'daily' ? 1 : 0
  };
}
function contractsCount() {
  return !GAME.school && !GAME.rush && !RANGE.active && !RANGE.trial && ['endless', 'tour', 'daily'].includes(GAME.mode);
}
/* endRun → returns how many objectives just completed (for the nudge) */
function contractsRun(st) {
  if (!contractsCount()) return 0;
  const c = contractsToday();
  let done = 0;
  c.list.forEach((x, i) => {
    if (c.claimed[i]) return;
    const def = CONTRACT_POOL.find(d => d.id === x.id);
    const before = c.prog[i];
    const v = st[def.stat] || 0;
    c.prog[i] = Math.min(x.target, def.kind === 'sum' ? before + v : Math.max(before, v));
    if (before < x.target && c.prog[i] >= x.target) done++;
  });
  const w = weeklyNow(), wo = weeklyObjective();
  if (!w.claimed) {
    const before = w.prog, v = st[wo.stat] || 0;
    w.prog = Math.min(wo.target, wo.kind === 'sum' ? before + v : Math.max(before, v));
    if (before < wo.target && w.prog >= wo.target) done++;
  }
  return done;
}
function contractClaim(i) {
  const c = contractsToday();
  if (c.claimed[i] || c.prog[i] < c.list[i].target) return 0;
  c.claimed[i] = true;
  let pay = c.list[i].reward;
  if (!c.bonus && c.claimed.every(Boolean)) { c.bonus = true; pay += Math.round(CONTRACT_BONUS * (1 + .5 * c.tier)); }
  META.alloy += pay;
  return pay;
}
function weeklyClaim() {
  const w = weeklyNow();
  if (w.claimed || w.prog < weeklyObjective().target) return 0;
  w.claimed = true;
  META.alloy += WEEKLY_ALLOY;
  return WEEKLY_ALLOY;
}

/* ═══════════════ hangar UI: bays, compare, feedback ═══════════════ */
function hgEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function hgBay(id, focus) {
  if (!BAYS.some(b => b.id === id)) id = 'ship';
  META.lastBay = id;
  for (const b of BAYS) {
    const t = $('hgtab-' + b.id), p = $('hgbay-' + b.id);
    if (!t || !p) continue;
    const on = b.id === id;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    t.tabIndex = on ? 0 : -1;
    t.classList.toggle('on', on);
    p.hidden = !on;
  }
  if (focus) $('hgtab-' + id).focus();
  hgMarkSeen(id);
  hgBadges();
  hgCompare(null);
}
function hgTabsWire() {
  const bar = $('hgTabs');
  if (!bar || bar.dataset.wired) return;
  bar.dataset.wired = '1';
  /* phones: the flight sheet folds away so the bay's items lead */
  const st = $('btnHgSheet');
  if (st) st.onclick = () => {
    const stage = st.closest('.hg-stage'), open = !stage.classList.contains('sheet-open');
    stage.classList.toggle('sheet-open', open);
    st.setAttribute('aria-expanded', open ? 'true' : 'false');
    st.querySelector('span').textContent = open ? 'Hide' : 'Show';
    AU.ui();
  };
  for (const b of BAYS) {
    const t = $('hgtab-' + b.id);
    t.onclick = () => {
      AU.ui(); hgBay(b.id);
      /* phones: bring the bay up under the dock when it starts low */
      const p = $('hgbay-' + b.id);
      if (matchMedia('(max-width:900px)').matches && p.getBoundingClientRect().top > innerHeight * .55)
        p.scrollIntoView({ block: 'start', behavior: REDUCE ? 'auto' : 'smooth' });
    };
  }
  /* roving tablist: arrows move, Home/End jump */
  bar.addEventListener('keydown', e => {
    const i = BAYS.findIndex(b => b.id === META.lastBay);
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % BAYS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + BAYS.length - 1) % BAYS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = BAYS.length - 1;
    if (j < 0) return;
    e.preventDefault(); e.stopPropagation();
    hgBay(BAYS[j].id, true);
  });
}

/* ── flight sheet: what the docked fit actually launches with, read by
   running configurePlayer() itself on a scratch copy (no second formula) ── */
function hgSheet(mutate) {
  const keepP = Object.assign({}, P);
  const keys = ['mode', 'school', 'rush', 'sigil', 'lives', 'bonusLives', 'livesOverride', 'armed', 'fitMods', 'fitFrames', 'gear', 'capped', 'mutator'];
  const keepG = {}; for (const k of keys) keepG[k] = GAME[k];
  const keepMeta = mutate ? JSON.stringify(META) : '';
  let out = null;
  try {
    if (mutate) mutate(META);
    GAME.mode = 'endless'; GAME.school = false; GAME.rush = false; GAME.mutator = null;
    configurePlayer();
    const h = hull();
    let guns;
    if (h.beam) guns = beamModel({ beamDmg: P.beamDmg, beamDrain: P.beamDrain, beamHit: P.beamHit });
    else {
      const a = GAME.armed;
      const fx = a ? a.fx : {};
      const n = a ? armsNorm(P.weapon, a.pat + '.' + a.mod, fx) * P.laneMul * armsVolleyScale(P.weapon, fx, P.extraLanes) : 1;
      guns = armsModel(P.weapon, fx, n, P.extraLanes);
      guns.single /= P.rateMul; guns.crowd /= P.rateMul;
    }
    out = {
      hull: GAME.lives, speed: P.speed, single: guns.single * P.dmg, crowd: guns.crowd * P.dmg,
      dash: P.maxCharges, pulses: P.bombs, pickup: pickupRadius(), hitbox: P.r, score: P.scoreMul,
      capped: (GAME.capped || []).slice(), fit: fitCode()
    };
  } finally {
    if (mutate) hgRestore(META, JSON.parse(keepMeta));
    Object.assign(P, keepP);
    for (const k of keys) GAME[k] = keepG[k];
  }
  return out;
}
/* put a snapshot back without replacing nested objects: open UI closures
   keep pointing at the live META.loadout / META.frames they captured */
function hgRestore(dst, src) {
  for (const k of Object.keys(dst)) if (!(k in src)) delete dst[k];
  for (const k of Object.keys(src)) {
    const a = dst[k], b = src[k];
    if (Array.isArray(a) && Array.isArray(b)) { a.length = 0; for (const x of b) a.push(x); }
    else if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) hgRestore(a, b);
    else dst[k] = b;
  }
}
const HG_ROWS = [
  ['hull', 'Hull', v => String(v), 6], ['speed', 'Speed', v => Math.round(v * 100) + '%', 1.5],
  ['single', 'Focus fire', v => v.toFixed(1), 0], ['crowd', 'Crowd fire', v => v.toFixed(1), 0],
  ['dash', 'Dash', v => String(v), 6], ['pulses', 'Pulses', v => String(v), 5],
  ['pickup', 'Pickup', v => Math.round(v) + ' px', 230], ['score', 'Score', v => '×' + v.toFixed(2), 1.7]
];
/* label = what is being compared; mutate = the hypothetical change */
function hgCompare(label, mutate) {
  const box = $('hgCompare');
  if (!box) return;
  const now = hgSheet(null);
  const next = mutate ? hgSheet(mutate) : null;
  const top = Math.max(now.single, now.crowd, next ? Math.max(next.single, next.crowd) : 0, 1);
  const title = label ? 'Compare · ' + label : 'Flight sheet · ' + hull().name;
  let html = '<div class="cmp">';
  for (const [k, name, f, scale] of HG_ROWS) {
    const a = now[k], b = next ? next[k] : a;
    const s = scale || top;
    const d = b - a;
    const tone = Math.abs(d) < 1e-6 ? '' : (d > 0) === (k !== 'hitbox') ? ' inc' : ' dec';
    html += '<span>' + esc(name) + '</span><i><b style="width:' + Math.round(clamp(a / s, .04, 1) * 100) + '%"></b>' +
      (next ? '<u class="' + tone + '" style="width:' + Math.round(clamp(b / s, .04, 1) * 100) + '%"></u>' : '') + '</i>' +
      '<em class="' + tone + '">' + esc(f(b)) + (next && tone ? ' (' + (d > 0 ? '+' : '−') + esc(f(Math.abs(d)).replace(/^×/, '')) + ')' : '') + '</em>';
  }
  html += '</div>';
  const capped = (next || now).capped;
  html += '<p class="cmp-f">' + (capped.length ? '<b class="capped">capped</b> at today’s Endless ceiling · ' : '') +
    'Endless and Tour fly this fit; the Daily flies standard issue.</p>';
  box.innerHTML = '<p class="cmp-h">' + esc(title) + '</p>' + html;
  /* phones: the change also reads in one line above the command bar */
  const strip = $('hgDelta');
  if (strip) {
    const bits = next ? HG_ROWS.filter(([k]) => Math.abs(next[k] - now[k]) > 1e-6).map(([k, name, f]) => {
      const up = (next[k] > now[k]) === (k !== 'hitbox');
      return '<b class="' + (up ? 'inc' : 'dec') + '">' + esc(name + ' ' + f(next[k])) + '</b>';
    }) : [];
    strip.hidden = !bits.length;
    strip.innerHTML = bits.length ? esc(label) + ': ' + bits.join(' · ') : '';
  }
}
function hgHover(el, label, mutate) {
  const show = () => hgCompare(label, mutate);
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', show);
}

/* ── purchase feedback: counter tick, dock flare, sound, haptics ── */
let hgTickRaf = 0;
function hgBought(name, cost, tone) {
  const from = META.alloy + cost, to = META.alloy;
  saveMeta();
  renderHangar();
  note(name, tone || 'rare');
  AU.unlock(); buzz([10, 40, 16]);
  const n = $('alloyN');
  if (n && !REDUCE && cost > 0) {
    cancelAnimationFrame(hgTickRaf);
    const t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / 520);
      n.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) hgTickRaf = requestAnimationFrame(step);
    };
    hgTickRaf = requestAnimationFrame(step);
  }
  const chip = $('alloyDelta');
  if (chip && cost > 0) { chip.textContent = '−' + fmt(cost); chip.classList.remove('on'); void chip.offsetWidth; chip.classList.add('on'); }
  const dock = document.querySelector('#s-hangar .dock');
  if (dock && !REDUCE) { dock.classList.remove('flare'); void dock.offsetWidth; dock.classList.add('flare'); }
  if (cost >= 1500 && META.backupDay !== todaySeedKey()) hgBackupShow();
}
function hgSpend(cost) {
  if (META.alloy < cost) { note('Need ' + fmt(cost - META.alloy) + ' more alloy', 'bad'); AU.ui(); return false; }
  META.alloy -= cost;
  return true;
}
function hgBackupShow() {
  const b = $('hgBackup');
  if (!b) return;
  b.hidden = false;
  b.innerHTML = '<p>That was a big purchase. Your save lives on this device only — keep a save code somewhere safe.</p>';
  const go = hgEl('button', 'btn key', 'Back up now');
  go.onclick = () => { META.backupDay = todaySeedKey(); saveMeta(); b.hidden = true; exportSave(); };
  const no = hgEl('button', 'btn', 'Not today');
  no.onclick = () => { META.backupDay = todaySeedKey(); saveMeta(); b.hidden = true; AU.ui(); };
  b.append(go, no);
}

/* exact numbers for each legacy refit, now and next (copy only) */
function refitLine(id, lv) {
  const pct = x => Math.round(x * 1000) / 10 + '%';
  switch (id) {
    case 'plating': return 'Now +' + ((lv >= 3) + (lv >= 5)) + ' hull · levels 3 and 5 each add one.';
    case 'ordnance': return 'Now +' + pct(lv * .07) + ' damage, launch tier ' + (1 + Math.floor(lv / 2)) + (lv >= 4 ? ', +1 pulse' : '') + ' · each level +7%.';
    case 'thrusters': return 'Now +' + pct(lv * .045) + ' speed, dash recharge +' + pct(lv * .1) + ' · each level +4.5% / +10%.';
    case 'capacitor': return 'Now ' + (lv >= 3 ? '+1 dash charge' : 'no extra dash') + (lv >= 5 ? ' and a shield that rebuilds every 26 s' : '') + ' · level 3 adds a charge, level 5 the shield.';
    case 'magnet': return 'Now ' + Math.round(92 * (1 + lv * .28)) + ' px pickup radius · each level +28%.';
    case 'fortune': return 'Now +' + pct(lv * .05) + ' alloy, drop chance ' + pct(.135 + lv * .022) + ' · each level +5% / +2.2 pts.';
  }
  return '';
}

/* next affordable goal across bays; the tab badges count what you can buy */
function hgGoals() {
  const out = [];
  const h = hull(), cls = armsClass(h.id);
  for (const r of REFITS) { const lv = refit(r.id); if (lv < r.max) out.push({ bay: 'ship', key: 'refit.' + r.id + (lv + 1), name: r.name + ' ' + (lv + 1), cost: r.cost(lv) }); }
  for (const x of HULLS) if (!META.owned.includes(x.id)) out.push({ bay: 'ship', key: 'hull.' + x.id, name: x.name, cost: x.cost });
  for (const a of ARMORY) if (a.cost && a.hull === cls && !META.armsOwned.includes(a.id)) out.push({ bay: 'arms', key: 'arms.' + a.id, name: a.name, cost: a.cost });
  for (const m of MODULES) if (!META.modules.includes(m.id)) out.push({ bay: 'systems', key: 'mod.' + m.id, name: m.name, cost: m.cost });
  if (!META.slotB) out.push({ bay: 'systems', key: 'slotB', name: 'Second module slot', cost: SLOT_B_COST });
  for (const p of PAINTS) if (!p.gift && !META.paints.includes(p.id)) out.push({ bay: 'style', key: 'paint.' + p.id, name: p.name + ' paint', cost: p.cost });
  return out;
}
/* A tab dot means news, not a count: something in that bay became
   affordable since you last opened it, or a contract is ready to claim.
   The "seen" list lives beside the save (device-local UI state). */
function hgSeen() {
  const v = DB.get('hangar.seen', null);
  return v && typeof v === 'object' ? v : {};
}
function hgNews(bay, g) {
  if (bay === 'yard') {
    const c = contractsToday();
    return c.list.some((x, i) => !c.claimed[i] && c.prog[i] >= x.target) ||
      (!weeklyNow().claimed && weeklyNow().prog >= weeklyObjective().target);
  }
  const seen = hgSeen()[bay] || [];
  return (g || hgGoals()).some(x => x.bay === bay && x.cost <= META.alloy && !seen.includes(x.key));
}
function hgMarkSeen(bay) {
  if (bay === 'yard') return;
  const all = hgSeen();
  const now = hgGoals().filter(x => x.bay === bay && x.cost <= META.alloy).map(x => x.key);
  const had = all[bay] || [];
  if (now.every(k => had.includes(k))) return;
  all[bay] = had.concat(now.filter(k => !had.includes(k))).slice(-200);
  DB.set('hangar.seen', all);
}
function hgBadges() {
  const g = hgGoals();
  for (const b of BAYS) {
    const t = $('hgtab-' + b.id);
    if (!t) continue;
    const on = b.id !== META.lastBay && hgNews(b.id, g);
    const s = t.querySelector('.badge');
    s.textContent = on ? (b.id === 'yard' ? 'reward ready' : 'new') : '';
    s.hidden = !on;
  }
  const goal = $('hgGoal');
  if (goal) {
    const left = g.filter(x => x.cost > META.alloy).sort((a, b) => a.cost - b.cost)[0];
    const can = g.filter(x => x.cost <= META.alloy).sort((a, b) => b.cost - a.cost)[0];
    goal.textContent = can ? 'Ready to buy: ' + can.name + ' (' + fmt(can.cost) + ')' :
      left ? 'Next: ' + left.name + ' — ' + fmt(left.cost - META.alloy) + ' alloy to go' : 'Every part in the yard is yours.';
  }
}

/* ── bay renderers (renderHangar in js/net.js calls renderBays last) ── */
function renderBays() {
  hgTabsWire();
  if (!$('hgbay-ship')) return;
  renderArmory(); renderSystems(); renderStyle(); renderContracts();
  const lvl = masteryCosmeticLevel(META, META.ship);
  $('dockName').textContent = hull().name + (lvl >= 8 ? ' ACE' : '');
  hgBay(META.lastBay || 'ship');
}
function hgItemRow(o) {
  /* o: { name, perk, weakness, state: 'owned'|'worn'|'buy'|'locked', price, tag, onclick, compare } */
  const b = hgEl('button', 'up gear' + (o.state === 'worn' ? ' sel' : '') + (o.state === 'locked' ? ' locked' : ''));
  b.innerHTML = '<span><b>' + esc(o.name) + (o.tag ? ' <em class="tag">' + esc(o.tag) + '</em>' : '') + '</b>' +
    '<p>' + esc(o.perk) + (o.weakness ? ' <span class="cost-line">Cost: ' + esc(o.weakness) + '</span>' : '') + '</p></span>' +
    '<span class="buy ' + (o.state === 'worn' ? 'max' : o.state === 'buy' && META.alloy < o.price ? 'no' : '') + '">' +
    (o.state === 'worn' ? 'Fitted' : o.state === 'owned' ? 'Fit' : o.state === 'locked' ? esc(o.lockText || 'Locked') : fmt(o.price) + '<br>alloy') + '</span>';
  b.onclick = o.onclick;
  if (o.compare) hgHover(b, o.name, o.compare);
  return b;
}
function renderArmory() {
  const box = $('armsList');
  if (!box) return;
  box.innerHTML = '';
  const h = hull(), cls = armsClass(h.id);
  const cur = fittedArms(h.id);
  const owned = a => a.cost === 0 || META.armsOwned.includes(a.id);
  for (const p of ARMORY.filter(a => a.kind === 'pattern' && a.hull === cls)) {
    const grp = hgEl('div', 'arms-grp');
    const fit = arms => m => { m.arms[h.id] = arms; if (!m.armsOwned.includes(arms.pat) && armsItem(arms.pat).cost) m.armsOwned.push(arms.pat); if (arms.mod && !m.armsOwned.includes(arms.mod)) m.armsOwned.push(arms.mod); };
    grp.appendChild(hgItemRow({
      name: p.name, perk: p.perk, weakness: p.weakness, tag: 'pattern',
      state: cur.pat === p.id ? 'worn' : owned(p) ? 'owned' : 'buy', price: p.cost,
      compare: cur.pat === p.id ? null : fit({ pat: p.id, mod: '' }),
      onclick: () => {
        if (cur.pat === p.id) return;
        if (!owned(p)) { if (!hgSpend(p.cost)) return; META.armsOwned.push(p.id); META.arms[h.id] = { pat: p.id, mod: '' }; hgBought(p.name + ' acquired', p.cost); return; }
        AU.ui(); META.arms[h.id] = { pat: p.id, mod: '' }; saveMeta(); renderHangar();
      }
    }));
    for (const m of ARMORY.filter(a => a.kind === 'mod' && a.parent === p.id)) {
      const row = hgItemRow({
        name: m.name, perk: m.perk, weakness: m.weakness, tag: p.name + ' mod',
        state: cur.mod === m.id ? 'worn' : !owned(p) ? 'locked' : owned(m) ? 'owned' : 'buy', price: m.cost, lockText: 'Needs ' + p.name,
        compare: cur.mod === m.id || !owned(p) ? null : fit({ pat: p.id, mod: m.id }),
        onclick: () => {
          if (!owned(p)) { note('Own ' + p.name + ' first', 'dim'); return; }
          if (cur.mod === m.id) { AU.ui(); META.arms[h.id] = { pat: p.id, mod: '' }; saveMeta(); renderHangar(); return; }
          if (!owned(m)) { if (!hgSpend(m.cost)) return; META.armsOwned.push(m.id); META.arms[h.id] = { pat: p.id, mod: m.id }; hgBought(m.name + ' acquired', m.cost); return; }
          AU.ui(); META.arms[h.id] = { pat: p.id, mod: m.id }; saveMeta(); renderHangar();
        }
      });
      row.classList.add('mod');
      grp.appendChild(row);
    }
    box.appendChild(grp);
  }
  armsPreviewDraw();
}
/* a still of the volley: lanes from the nose out to each bolt's reach */
function armsPreviewDraw(arms) {
  const c = $('armsPreview');
  if (!c) return;
  const g = c.getContext('2d');
  const w = c.width, hh = c.height;
  g.clearRect(0, 0, w, hh);
  const h = hull();
  arms = arms || fittedArms(h.id);
  const lanes = armsPreviewLanes(h.id, arms);
  const ox = w / 2, oy = hh - 26;
  g.lineCap = 'round';
  if (!lanes) {
    const mod = armsItem(arms.mod), fx = mod ? mod.fx : {};
    g.strokeStyle = 'rgba(140,220,255,.85)';
    g.lineWidth = 6 * (fx.beamWidth || 1);
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox, 12); g.stroke();
  } else {
    const pat = armsItem(arms.pat), mod = armsItem(arms.mod);
    const fx = Object.assign({}, pat ? pat.fx : {}, mod ? mod.fx : {});
    const reach = Math.min(hh - 40, (hh - 40) * (fx.life || 2) / 2 * 2.2);
    g.strokeStyle = 'rgba(255,190,110,.9)';
    for (const l of lanes) {
      g.lineWidth = 2 + Math.min(2, l[2]);
      g.beginPath(); g.moveTo(ox + l[0] * 1.6, oy);
      g.lineTo(ox + l[0] * 1.6 + Math.sin(l[1]) * reach, oy - Math.cos(l[1]) * reach); g.stroke();
    }
    if (fx.seekFrom) { g.fillStyle = 'rgba(160,255,200,.9)'; for (const s of [-1, 1]) { g.beginPath(); g.arc(ox + s * 40, oy - 40, 5, 0, TAU); g.fill(); } }
  }
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath(); g.moveTo(ox, oy - 12); g.lineTo(ox - 9, oy + 8); g.lineTo(ox + 9, oy + 8); g.closePath(); g.fill();
}
function renderSystems() {
  const box = $('modList');
  if (!box) return;
  box.innerHTML = '';
  const h = hull();
  const lo = META.loadout[h.id] || (META.loadout[h.id] = { sigil: '', modA: '', modB: '' });
  const slots = hgEl('div', 'slots');
  for (const s of ['modA', 'modB']) {
    const locked = s === 'modB' && !META.slotB;
    const m = moduleItem(lo[s]);
    const d = hgEl('button', 'slot' + (locked ? ' locked' : ''));
    d.innerHTML =
      '<b>' + (s === 'modA' ? 'Slot A' : 'Slot B') + '</b><span>' + esc(locked ? fmt(SLOT_B_COST) + ' alloy to open' : m ? m.name : 'Empty') + '</span>';
    d.onclick = () => {
      if (locked) { if (!hgSpend(SLOT_B_COST)) return; META.slotB = true; hgBought('Second module slot opened', SLOT_B_COST); return; }
      if (m) { AU.ui(); lo[s] = ''; saveMeta(); renderHangar(); }
    };
    slots.appendChild(d);
  }
  box.appendChild(slots);
  for (const m of MODULES) {
    const own = META.modules.includes(m.id);
    const worn = lo.modA === m.id || lo.modB === m.id;
    const target = lo.modA === '' ? 'modA' : META.slotB && lo.modB === '' ? 'modB' : 'modA';
    box.appendChild(hgItemRow({
      name: m.name, perk: m.perk, weakness: m.weakness, tag: 'module',
      state: worn ? 'worn' : own ? 'owned' : 'buy', price: m.cost,
      compare: worn ? null : M => { if (!M.modules.includes(m.id)) M.modules.push(m.id); M.loadout[h.id][target] = m.id; },
      onclick: () => {
        if (worn) { AU.ui(); if (lo.modA === m.id) lo.modA = ''; if (lo.modB === m.id) lo.modB = ''; saveMeta(); renderHangar(); return; }
        if (!own) { if (!hgSpend(m.cost)) return; META.modules.push(m.id); lo[target] = m.id; hgBought(m.name + ' acquired', m.cost); return; }
        AU.ui(); lo[target] = m.id; saveMeta(); renderHangar();
      }
    }));
  }
  renderPresets(); renderFrames();
}
function renderPresets() {
  const box = $('presetList');
  if (!box) return;
  box.innerHTML = '';
  const h = hull();
  const list = META.presets[h.id] || (META.presets[h.id] = [null, null, null]);
  list.forEach((p, i) => {
    const row = hgEl('div', 'preset');
    const load = hgEl('button', 'btn', p ? p.name : 'Empty');
    load.disabled = !p;
    load.setAttribute('aria-label', p ? 'Load preset ' + p.name : 'Preset ' + (i + 1) + ' empty');
    load.onclick = () => {
      AU.ui();
      const own = id => !id || META.armsOwned.includes(id) || (armsItem(id) || {}).cost === 0;
      if (!own(p.pat) || !own(p.mod)) { note('That preset uses gear you no longer own', 'bad'); return; }
      META.arms[h.id] = { pat: p.pat, mod: p.mod };
      const okMod = id => id && META.modules.includes(id) ? id : '';
      META.loadout[h.id] = { sigil: p.sigil && META.sigils.includes(p.sigil) ? p.sigil : '', modA: okMod(p.modA), modB: META.slotB ? okMod(p.modB) : '' };
      META.sigil = META.loadout[h.id].sigil || null;
      for (const r of FRAME_ROWS) { const v = p.f['r' + r.row]; META.frames[h.id]['r' + r.row] = v && META.framesOwned.includes(h.id + '.' + r.row + v) ? v : ''; }
      saveMeta(); renderHangar(); note('Preset ' + p.name + ' loaded', 'good');
    };
    const save = hgEl('button', 'btn', 'Save');
    save.setAttribute('aria-label', 'Save current fit to preset ' + (i + 1));
    save.onclick = () => {
      AU.ui();
      const a = fittedArms(h.id), lo = META.loadout[h.id];
      list[i] = presetClean({ name: (armsItem(a.pat) || {}).name + (lo.modA ? ' ' + (moduleItem(lo.modA) || {}).name.split(' ')[0] : '') || 'Preset ' + (i + 1),
        pat: a.pat, mod: a.mod, sigil: META.sigil || '', modA: lo.modA, modB: lo.modB, f: META.frames[h.id] }, h.id);
      saveMeta(); renderHangar(); note('Saved to preset ' + (i + 1), 'good');
    };
    row.append(load, save);
    box.appendChild(row);
  });
}
function renderFrames() {
  const box = $('frameTree');
  if (!box) return;
  box.innerHTML = '';
  const h = hull();
  const lvl = masteryLevel(h.id);
  const pick = META.frames[h.id] || (META.frames[h.id] = { r1: '', r2: '', r3: '' });
  for (const r of FRAME_ROWS) {
    const row = hgEl('div', 'frame-row');
    row.appendChild(hgEl('p', 'frame-h', 'Row ' + r.row + ' · Mastery ' + toRoman(r.mastery) + ' · ' + fmt(r.cost) + ' each'));
    for (const v of ['a', 'b']) {
      const f = frameItem(h.id + '.' + r.row + v);
      const own = META.framesOwned.includes(f.id), worn = pick['r' + r.row] === v;
      const gated = lvl < r.mastery;
      row.appendChild(hgItemRow({
        name: f.name, perk: f.perk, weakness: f.weakness,
        state: gated ? 'locked' : worn ? 'worn' : own ? 'owned' : 'buy', price: r.cost, lockText: 'Mastery ' + toRoman(r.mastery),
        compare: gated || worn ? null : M => { if (!M.framesOwned.includes(f.id)) M.framesOwned.push(f.id); M.frames[h.id]['r' + r.row] = v; },
        onclick: () => {
          if (gated) { note('Reach ' + h.name + ' mastery ' + toRoman(r.mastery) + ' to open row ' + r.row, 'dim'); return; }
          if (worn) { AU.ui(); pick['r' + r.row] = ''; saveMeta(); renderHangar(); return; }
          if (!own) { if (!hgSpend(r.cost)) return; META.framesOwned.push(f.id); pick['r' + r.row] = v; hgBought(f.name + ' fitted', r.cost); return; }
          AU.ui(); pick['r' + r.row] = v; saveMeta(); renderHangar();
        }
      }));
    }
    box.appendChild(row);
  }
}
function renderStyle() {
  const box = $('cosmeticList');
  if (!box) return;
  box.innerHTML = '';
  const h = hull();
  const lvl = masteryCosmeticLevel(META, h.id);
  const c = META.cosmetics[h.id] || (META.cosmetics[h.id] = { trail: 'stock', decal: false });
  for (const t of MASTERY_COSMETIC) {
    const d = hgEl('div', 'ms' + (lvl >= t.lvl ? ' maxed' : ''));
    d.innerHTML =
      '<b>' + esc('M' + t.lvl + ' · ' + t.name) + '</b><span class="ms-l">' + esc(lvl >= t.lvl ? 'earned' : fmt(t.xp) + ' xp') + '</span>' +
      '<span class="ms-sub">' + esc(t.sub) + '</span>';
    box.appendChild(d);
  }
  const tr = hgEl('div', 'trails');
  for (const t of TRAIL_SHAPES) {
    const ok = t.id === 'stock' || lvl >= 7;
    const b = hgEl('button', 'paint' + (c.trail === t.id ? ' sel' : '') + (ok ? '' : ' locked'));
    b.innerHTML = '<i class="' + t.cls + '"></i><b>' + esc(ok ? t.name : 'M7') + '</b>';
    b.setAttribute('aria-label', 'Contrail ' + t.name + (ok ? '' : ' — reaches at mastery 7'));
    b.onclick = () => { AU.ui(); if (!ok) { note('Contrail shapes open at ' + h.name + ' mastery 7', 'dim'); return; } c.trail = t.id; saveMeta(); renderHangar(); };
    tr.appendChild(b);
  }
  box.appendChild(tr);
  const dec = hgEl('button', 'btn' + (c.decal ? ' key' : ''), lvl >= 6 ? (c.decal ? 'Dock decal on' : 'Dock decal off') : 'Dock decal · mastery 6');
  dec.onclick = () => { AU.ui(); if (lvl < 6) { note('Dock decals open at mastery 6', 'dim'); return; } c.decal = !c.decal; saveMeta(); renderHangar(); };
  box.appendChild(dec);
}
function renderContracts() {
  const box = $('contractBox');
  if (!box) return;
  box.innerHTML = '';
  const c = contractsToday();
  c.list.forEach((x, i) => {
    const def = CONTRACT_POOL.find(d => d.id === x.id);
    const done = c.prog[i] >= x.target, got = c.claimed[i];
    const b = hgEl('button', 'up contract' + (got ? ' sel' : ''));
    b.innerHTML =
      '<span><b>' + esc(['Easy', 'Medium', 'Hard'][i] + ' · ' + def.text(x.target)) + '</b>' +
      '<span class="ms-bar"><i style="width:' + Math.round(c.prog[i] / x.target * 100) + '%"></i></span>' +
      '<p>' + fmt(c.prog[i]) + ' / ' + fmt(x.target) + '</p></span>' +
      '<span class="buy ' + (got ? 'max' : done ? '' : 'no') + '">' + (got ? 'Paid' : (done ? 'Claim ' : '') + '+' + fmt(x.reward)) + '</span>';
    b.onclick = () => {
      if (got) return;
      if (!done) { AU.ui(); note('Counts on Endless, Tour and Daily runs', 'dim'); return; }
      const pay = contractClaim(i);
      if (pay) hgBought('Contract paid +' + fmt(pay) + ' alloy', 0, 'good');
    };
    box.appendChild(b);
  });
  const foot = hgEl('p', 'cmp-f', 'Full board bonus +' + fmt(Math.round(CONTRACT_BONUS * (1 + .5 * c.tier))) + (c.bonus ? ' · paid' : '') + ' · tier ' + c.tier + ' (best wave ' + (META.bestWave || 0) + ') · new board at the Daily reset');
  box.appendChild(foot);
  if (!c.rerolled && !c.prog.some(Boolean) && !c.claimed.some(Boolean)) {
    const rr = hgEl('button', 'btn', 'Swap today’s board (once)');
    rr.onclick = () => { AU.ui(); if (contractReroll()) { saveMeta(); renderHangar(); } };
    box.appendChild(rr);
  }
  const wb = $('weekBox');
  if (!wb) return;
  wb.innerHTML = '';
  const w = weeklyNow(), wo = weeklyObjective(), fin = weeklyFinish();
  const wdone = w.prog >= wo.target;
  const wbtn = hgEl('button', 'up contract' + (w.claimed ? ' sel' : ''));
  wbtn.innerHTML =
    '<span><b>' + esc('Yard order · ' + wo.text) + '</b><span class="ms-bar"><i style="width:' + Math.round(w.prog / wo.target * 100) + '%"></i></span>' +
    '<p>' + fmt(w.prog) + ' / ' + fmt(wo.target) + ' · resets Monday</p></span>' +
    '<span class="buy ' + (w.claimed ? 'max' : wdone ? '' : 'no') + '">' + (w.claimed ? 'Paid' : (wdone ? 'Claim ' : '') + '+' + fmt(WEEKLY_ALLOY)) + '</span>';
  wbtn.onclick = () => { if (w.claimed) return; if (!wdone) { AU.ui(); return; } const pay = weeklyClaim(); if (pay) hgBought('Yard order paid +' + fmt(pay) + ' alloy', 0, 'good'); };
  wb.appendChild(wbtn);
  const own = META.finishes.includes(fin.id);
  const sb = hgEl('button', 'up');
  sb.innerHTML = '<span><b>' + esc('This week’s plate · ' + fin.name) + '</b><p>A plate finish for the dock, sold this week only. Cosmetic.</p></span>' +
    '<span class="buy ' + (own ? 'max' : META.alloy >= WEEKLY_STOCK_COST ? '' : 'no') + '">' + (own ? 'Owned' : fmt(WEEKLY_STOCK_COST) + '<br>alloy') + '</span>';
  sb.onclick = () => { if (own) return; if (!hgSpend(WEEKLY_STOCK_COST)) return; META.finishes.push(fin.id); META.plate = fin.id; hgBought(fin.name + ' plate acquired', WEEKLY_STOCK_COST); };
  wb.appendChild(sb);
}
/* plate finishes outside the ladder, appended to the standing finish row */
function extraFinishButtons(fl) {
  for (const f of EXTRA_FINISHES) {
    const owned = META.finishes.includes(f.id);
    if (!owned) continue;
    const sel = META.plate === f.id;
    const btn = hgEl('button', 'paint' + (sel ? ' sel' : ''));
    const sw = document.createElement('i');
    sw.style.background = 'radial-gradient(circle at 34% 30%, ' + f.lit + ', ' + f.hull + ' 62%, rgba(0,0,0,.55))';
    btn.appendChild(sw);
    const lbl = document.createElement('b');
    lbl.textContent = sel ? 'worn' : f.name;
    btn.appendChild(lbl);
    btn.onclick = () => { AU.ui(); if (sel) return; META.plate = f.id; saveMeta(); renderHangar(); };
    fl.appendChild(btn);
  }
}
/* the one-time Founder card */
function founderCard() {
  const b = $('hgBackup');
  if (!b || META.founderSeen !== false) return;
  META.founderSeen = true; saveMeta();
  b.hidden = false;
  b.innerHTML = '<p><b>Founder plate.</b> You flew before the yard grew five bays. A gold Founder finish is yours — wear it from Yard → Plate finishes. Every refit, hull, paint and sigil you owned is exactly where you left it.</p>';
  const ok = hgEl('button', 'btn key', 'Thanks');
  ok.onclick = () => { b.hidden = true; AU.ui(); };
  b.appendChild(ok);
}
/* "Try in range": the selected pattern for one unscored range run */
function armsTry() {
  const h = hull();
  RANGE.trial = Object.assign({}, fittedArms(h.id));
  AU.ui();
  RANGE.begin();
  note('Trial fit · nothing is scored or saved', 'dim');
}
/* switching hulls swaps the sigil with it (each hull keeps its own loadout) */
function hgShip(id) {
  if (META.loadout[META.ship]) META.loadout[META.ship].sigil = META.sigil || '';
  META.ship = id;
  const lo = META.loadout[id] || (META.loadout[id] = { sigil: '', modA: '', modB: '' });
  META.sigil = lo.sigil && META.sigils.includes(lo.sigil) ? lo.sigil : null;
}
/* contrail shape for this hull (M7 cosmetic) */
function hgTrail() {
  const c = META.cosmetics && META.cosmetics[P.art];
  return c && c.trail !== 'stock' && masteryCosmeticLevel(META, P.art) >= 7 ? c.trail : 'stock';
}
/* dock overlays: M6 crest decal, M9 turning pad ring */
function dockExtras(g, w, h, t) {
  const lvl = masteryCosmeticLevel(META, META.ship);
  const c = META.cosmetics && META.cosmetics[META.ship];
  if (lvl >= 9) {
    g.save();
    g.translate(w / 2, h * .58); g.scale(1, 86 / 250);
    g.rotate(REDUCE ? 0 : t * .25);
    g.strokeStyle = rgba(PAL.gold, .35); g.lineWidth = 3;
    g.setLineDash([26, 18]);
    g.beginPath(); g.arc(0, 0, 272, 0, TAU); g.stroke();
    g.restore();
  }
  if (lvl >= 6 && c && c.decal) {
    g.save();
    g.fillStyle = rgba(PAL.gold, .22); g.strokeStyle = rgba(PAL.gold, .6); g.lineWidth = 2;
    g.beginPath(); g.ellipse(w / 2, h * .58, 64, 22, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = rgba(PAL.gold, .85); g.font = '700 22px Michroma, sans-serif'; g.textAlign = 'center';
    g.fillText(hull().name.slice(0, 1), w / 2, h * .58 + 8);
    g.restore();
  }
}
/* run summary: one line pointing back to the hangar */
function hgNudge(done) {
  const el = $('ovHangar');
  if (!el) return;
  const g = hgGoals();
  const can = g.filter(x => x.cost <= META.alloy).sort((a, b) => b.cost - a.cost)[0];
  const next = g.filter(x => x.cost > META.alloy).sort((a, b) => a.cost - b.cost)[0];
  const txt = done ? done + ' contract objective' + (done === 1 ? '' : 's') + ' complete — claim in the Yard bay' :
    can ? 'Ready in the hangar: ' + can.name + ' (' + fmt(can.cost) + ' alloy)' :
    next ? fmt(next.cost - META.alloy) + ' alloy to ' + next.name : '';
  el.innerHTML = txt ? '<b>Hangar</b><span>' + esc(txt) + '</span>' : '';
  el.classList.toggle('hidden', !txt || !!GAME.school);
}
