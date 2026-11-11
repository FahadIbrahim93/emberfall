# Hangar and upgrade overhaul ("The Yard, rebuilt")

Status: **Shipped** in v4.30.0 on 2026-11-11 ([PR #109](https://github.com/FahadIbrahim93/emberfall/pull/109), merge `a93bbe9`) · Accepted 2026-11-11 · Owner: Fahad · Tracking: Hangar overhaul epic (see `docs/expansion/IMPLEMENTATION_BACKLOG.md`, Track H)
Audited against `origin/main` **cd11007** (v4.29.8, SW cache `emberfall-v4.64`) and open PR #97 (head `issue-48`, CONFLICTING).

## As shipped (v4.30.0)

Everything in sections 3 and 4 shipped, in one PR rather than one per phase. The design below is kept as written; these are the places where the build differs from it, and why.

| Area | Design said | Shipped | Why |
|---|---|---|---|
| Delivery | One PR per phase (§4, §6) | All eight phases in PR #109, closing #100–#107 and superseding #97 | The phases share the save schema, the fairness strip and the hangar shell; landing them together kept one schema bump and one migration. |
| Purchases | Detail sheet with a stat compare (§3.1) | Tapping anything unowned opens an inline offer under it: the flight-sheet change, the price and a "Buy · N alloy" button. One tap never spends. Equipping owned items stays one tap; donations keep their confirm dialog. | Review feedback: instant spends on tap were too easy to trigger on a phone. |
| Phone layout | Verified at 360×640 and 412×915 (§7) | Verified at 390×844, 768×1024 and 1440×900 in `tests/hangar.spec.js` and on the live site. The dock is letterboxed to 150 px on phones, the flight sheet folds behind a toggle and a delta strip above the command bar repeats the offer summary. | These are the three sizes the release checks use; each bay's first items sit above the fold at all three. |
| Tab badges | Counts per bay | Dots that mark news only: something newly affordable since the bay was last opened, or a contract ready to claim. | Review feedback: a badge should mean there is something to act on. |
| Backup reminder | After purchases of 2,000+ alloy, once a day (§3.10) | After purchases of 1,500+ alloy, once a day | Lowered during the build so more of the mid-priced armory and module purchases prompt a backup. |
| Mastery 2 dash | Not addressed | The extra dash charge now applies (it never did before) and stays on the Daily; rush and flight school strip it. | Owner decision: it is a legacy mastery reward, not new gear, so the Daily rule does not remove it. |
| Boss Rush | Vanilla | Vanilla, now enforced: `GAME.rush` was never set, so rush had been flying with sigils, mastery XP and gear. | Bug found during the build. |
| Power ceiling | Clamp at today's top power | As designed; the ceiling was not raised. The compare panel says when a stat is capped. | Owner decision. |
| Existing perks | Unchanged | Rampart, Glasswing and Needle never applied in flight; all three now do, with tests. | Bug found during the build. |
| Module split | `js/hangar.js` only if deadscan, SW `CORE` and the manifest change in the same PR (§7) | Split into `js/hangar.js`, listed in the service worker, release payload and copyguard. | The condition in §7 was met. |
| Phase 7 migration | Applied after owner approval | `20261112000000_standings_fit.sql` was applied on 2026-11-11 (recorded as `20261111083113 standings_fit`) after a backup of the scores, profiles, receipt tables and both reader functions. | As designed. |

## Decisions (final, owner, 2026-11-11)
1. **Endless board:** gear is allowed, capped at today's top power (no item raises the ceiling), and every run's loadout is shown on the boards (`stats.fit`).
2. **Saves:** build now on device-local saves, with a backup (export) reminder after significant purchases. Cloud careers remain a separate track (Gate 2).
3. **PR #97:** its standing ladder is carried into the overhaul as the first commits, and #97 is closed as superseded once the overhaul lands. This design supersedes the additional layers in `docs/specs/alloy-armory.md`: fittings/bundles are replaced by loadout presets, Yard trials are deferred, and the weekly order and modules are folded into Phases 3 and 4.
4. The "approved by the owner" line in `docs/specs/alloy-armory.md` is **unconfirmed**. This document is the reference for Layers 2–5.

---

## 0. Summary

The hangar already has a lot of *stuff* (5 hulls, 6 refits, 10 paints, 5 sigils, mastery, plaques, donations), but it is
**one long shop page with no choices**. Every refit is a linear, global, always-correct buy; weapons have no player
choice at all; purchases have no moment; on a phone the Launch button sits 4½ screens down.

The overhaul keeps every existing item and every player's alloy/progress, and adds **choice depth instead of power
height**:

* an immersive **5-bay hangar** (Ship · Systems · Arms · Style · Yard) built around the docked ship, phone-first;
* an **Armory** of weapon patterns with branching mods (sidegrades, DPS-parity tested);
* a **Loadout** (sigil + up to 2 modules + presets per hull);
* per-hull **Frame doctrines** (3 rows × pick 1 of 2) unlocked by that hull's Mastery — mastery finally *unlocks
  options*;
* a **Contracts** board (3 daily + 1 weekly) as the new faucet and daily reason to return;
* cosmetic **Mastery M6–M10** and a Founder's plate for current pilots;
* a fairness rule: **new gear never touches the ranked Daily, and never raises the power ceiling** on Endless.

---

## 1. Audit — what exists today (with file paths and numbers)

### 1.1 Where things live
| Concern | Location |
|---|---|
| Hull table `HULLS` (5) | `index.html` ~L1829 (parity copy: `packages/sim/src/catalog.ts`) |
| Refit table `REFITS` (6×5) | `index.html` ~L1857 |
| Paints `PAINTS` (10) | `index.html` ~L1870 |
| Sigils `SIGILS` (5) | `index.html` ~L1892 |
| Plaques / Donations | `index.html` ~L1936 / ~L1956 |
| Save object `META`, `loadMeta()`, `saveMeta()` | `index.html` ~L1966–2027 |
| In-run boons `BOONS` (9), `offerBoons()` (after each capital kill) | `index.html` ~L2030, call at ~L5125 |
| `configurePlayer()` — where all power is applied | `index.html` ~L3333 |
| Weapon ladder `WEAPONS` (6 tiers) + `firePrimary()` | `index.html` ~L3370 / ~L3405 (golden-parity with `packages/sim`) |
| Pickups / alloy drops `rollDrop`, `collectPick` | `index.html` ~L4033–4085 |
| Scoring `addScore()` (hull scoreMul × mastery bonus) | `index.html` ~L3685 |
| Mastery tiers + run-end alloy `endRun()` | `index.html` ~L6639–6710 |
| Dock canvas `drawDock()`, `toHangar()` | `index.html` ~L6912–6985 |
| Hangar markup / CSS | `index.html` ~L1166–1210 / ~L320–416, mobile @ ~L548 |
| Hangar render + buy handlers `renderHangar()` | `js/net.js` L435–685 |
| Export/import save (`v: 3`, base64 JSON) | `index.html` ~L7200 |
| Economy model & CI gate | `tools/econsim.js`, `docs/economy-audit.md` |
| Fun-curve markers (CI) | `README.md` L97–122, `docs/press-kit.html`, `tools/fun-scoreboard.mjs`, `docs/audit/fun-curve.json` |
| Server run intake | `supabase/migrations/20261107000000_daily_run_receipts.sql` (`private.submit_run_v2`) |
| Public standings stats allowlist | `supabase/migrations/20261111000000_standings_cursor.sql` L114–116 |

### 1.2 Alloy — earned, stored, trusted
* **Earned** (all client-side):
  * kill drops: 13.5% base drop chance (+2.2 pp per Scavenger level, pity after 12), 30% of misses drop an alloy
    shard worth `4 + floor(wave×0.7)` × run multipliers;
  * capital kill: +120 and 6 shards;
  * run end: `(alloyRun + score/140 + wave×6) × (1 + 0.05×Scavenger)`;
  * comets (sky) — 52% of rookie income at wave 4;
  * flight school +120 once.
* **Server faucet**: Daily Gauntlet medals, ledgered once per tier per UTC day in `private.daily_awards`. That's
  830/day on a weekday full house, 1,630 on Sundays, and +1,000 for a rare Wardenfall. Paid into the local wallet through
  `applyDailyResult()`, which is replay-safe via acks.
* **Stored**: `localStorage` only (`DB.set('meta', META)`). Cloud careers were removed with the deck (ADR 0005) and are
  planned again as **Gate 2 "cloud careers"** (Codex lane). Clearing the browser loses everything except a manual
  export code.
* **Trust**: no alloy validation anywhere; import writes `payload.meta` straight to storage (then `loadMeta`
  sanitises shapes, not amounts). `submit_run_v2` validates mode/day/score ≥ 1/wave ≤ 10000/stats < 4 KB only;
  verification is `'client-reported'`. **Implication: anything alloy can buy must be assumed forgeable, so it must not
  be able to buy ranked advantage.**

### 1.3 Income today (from `node tools/econsim.js`, calibrated, −3.3% anchor drift)
| Depth | Alloy / run | Alloy / min |
|---|---|---|
| wave 4 | 214 | 92 |
| wave 8 | 829 | 178 |
| wave 12 | 1,880 | 269 |
| wave 16 | 3,957 | 424 |
| wave 20 | 6,549 | 561 |
| wave 26 | 13,213 | 871 |
| wave 32 | 23,324 | 1,249 |

Milestones (sim, cheapest-first): first hull run ~25, everything owned run ~31; full collection is 35,350 (hulls
16,800 + refits 18,550), and paints 4,950 + sigils 5,500 make the whole shelf **45,800**.

### 1.4 The upgrade systems
* **Hulls** (0 / 1,400 / 2,600 / 5,200 / 7,600): genuine sidegrades with a distinct identity: lives, speed, hitbox, dmg,
  dash, bombs, grazeMul, **scoreMul** (Wraith ×1.6, Atlas ×0.92). This is the best system in the hangar.
* **Refits**, 6 tracks × 5 levels, global across hulls, linear costs (e.g. Ordnance `260 + 240·L`), 18,550 total:
  | Refit | Per level | Milestones |
  |---|---|---|
  | Plating | — | L3 +1 life, L5 +1 life |
  | Ordnance | +7% dmg; start weapon tier `1+floor(L/2)` | L4 +1 pulse |
  | Thrusters | +4.5% speed, +10% dash recharge, −5.5% dash cd | — |
  | Capacitor | — | L3 +1 dash charge, L5 regenerating shield |
  | Collector | +28% pickup radius | — |
  | Scavenger | +2.2 pp drop chance, +5% run-end alloy | — |
* **Weapons**: one bolt ladder (tiers 1–6, 1→7 lanes, seekers at max tier), raised only by in-run `gun` pickups
  and the Ordnance start tier. Death drops a tier. Seraph flies a heat-managed beam instead. **Players have zero weapon
  choices.**
* **Perks**: one **Sigil** slot, with 5 sigils (900–1,400) and a printed weakness each. Sigils are stripped in school and
  rush only, so they still apply on the Daily. In-run **Boons**: a 3-of-9 draft after each capital kill. This is good and
  stays untouched.
* **Mastery** (per hull): M1–M5 at 900/2,400/4,500/7,200/11,000 XP; rewards **+8% score**, +1 dash, salvage sight,
  +1s mark, **+15% score**. XP/run = `wave×11 + kills×0.17 + score/460 + runT×1.15`.
* **Cosmetics / honor**: paints (2 earned-only laurels), dock kill plaques (200…5,000 kills), Yard donations
  (5k/25k/100k honor), season and Wardenfall engravings.
* **PR #97** (Freebuff, open, CONFLICTING) adds an uncapped **Yard standing** ladder (10 ranks × 25,000 past
  Yardmaster, then stars) with dock-plate finishes. It also adds the spec `docs/specs/alloy-armory.md`, which proposes Layers 2–5:
  weekly order, armory modules, yard trials and fittings. That spec says *"approved 2026-11-10 by the owner"*, but issue
  #48 has no comment recording that approval, so the approval is treated as unconfirmed. The PR body says it was rebased onto main (head
  `7c78634`), but that head was never pushed. The branch is behind main, conflicts with it, and reuses the v4.64/v4.65
  cache numbering.

### 1.5 Hangar UX, measured (Playwright, Pixel 7 profile, main @ cd11007)
* The hangar is **one scroll column of 8 sections: 3,760 px tall on a Pixel 7 (≈4.5 screens)**. Refits start at
  y≈2,484, mastery at 2,944, and **Launch at 3,572**. Desktop is 2,368 px.
* **Bug: hull stat bars are invisible.** `.hull .bars i b` computes to **0 px height** (the `.hull b{display:block…}`
  rule wins), so Hull/Speed/Guns/Score bars render as empty grey lines on every hull card.
* Dock refit hot-spots are **22 px** tap targets, below the 44 px rule in `docs/specs/mobile-ux-v2.md`.
* Copy is vague: "hit measurably harder" and "much further out" show no numbers, no before→after and no stat compare.
* A purchase is a toast plus a sound. The dock doesn't react, nothing animates, and there's no "fitted" moment.
* Nothing tells the pilot what is affordable or what to buy next. There are no badges, and the game-over screen has no
  hangar nudge.
* "Reset progress" (`btnWipe`) resets only alloy/hulls/refits/feats/runs, then `saveMeta()` re-persists paints,
  sigils, mastery, donations and sky stats. The behaviour is partial and undocumented, and the overhaul must define it.
* Public standings allowlist `paint` ∈ 8 shop paints, so the earned laurels `oxblood`/`midnight` never show on
  `stats.html`/`pilot.html` (minor, separate).

### 1.6 Fairness — what the boards assume today
* Endless **and** Daily scores include career power: refits (damage, lanes, lives), mastery score bonus (+8% / +15%,
  pure grind), sigils, and hull scoreMul.
* The backlog's locked scope says **"Ranked Daily ignores career power"**, planned in Gate 4 (deterministic Daily: "no
  refits/mastery score bonuses/sigils/assistance"). The design bible says **"no hidden economy multiplier that changes
  board comparability."**
* Daily medals pay server alloy by **wave OR score**, so career power on the Daily also inflates the server faucet.

### 1.7 Pain points: why it isn't engaging
1. **No decisions.** Refits are linear and global, and Scavenger is always the correct greedy buy. There's no build to
   craft, so the hangar is a checklist.
2. **No weapon identity.** The one thing players feel every second (their guns) is the one thing they can't choose.
3. **Shallow perk layer.** One sigil slot and no loadouts or presets.
4. **No visible progression arc.** Everything sits in one list, nothing is gated or teased, and there's no "next goal" card.
5. **No purchase moment.** The dock is well rendered but inert. Spending alloy changes nothing on screen.
6. **Phone-hostile layout.** 4.5 screens of scroll, Launch at the bottom, 22 px targets, broken stat bars.
7. **Faucets are run-only.** No missions or contracts, and feats pay 0. Rookies live on comet luck (52% of income).
8. **Veteran vacuum.** A wave-26 run (13k) empties the 45.8k shelf in ~4 runs. #97 fixes that with a cosmetic ladder,
   but not with *play*.
9. **Mastery is grind → score.** It is the only power earned for time rather than skill, and it pollutes board
   comparability.
10. **Fragile saves.** Everything is local. A deeper hangar makes a cleared browser hurt more.

---

## 2. Design principles (the rules every phase must obey)

1. **Breadth, not height.** New systems are **sidegrades**: every power item prints its weakness. The *maximum*
   vertical power stays where today's maxed refits put it. Existing refits keep their exact numbers and prices (now
   "Core Systems").
2. **Ranked Daily flies standard issue for every new system from day one.** Weapon mods, modules and frames are
   stripped on `daily`, `rush`, `school` (and the range, except "Try it" previews). Legacy refits, sigils and mastery stay as
   they are until Gate 4 strips them all at once, so the Daily doesn't change twice.
3. **Endless is the "Open" board**, with a budgeted and transparent loadout (Decision 1). Each run carries a short
   `fit` code so boards can show the loadout.
4. **Alloy is the only currency.** No second coin, no loot boxes, no "chance at", no paid randomness, and no real money
   (guards G1/G2 from the #97 spec carry over).
5. **Nobody loses anything.** Alloy, hulls, refit levels, sigils, paints, mastery, plaques and honor all load
   identically. Old export codes (`v:3`) import.
6. **Every spend produces a moment:** a visible change on the dock, a sound, haptics and a stat delta.
7. **Phone-first, premium:** 44 px minimum targets, thumb-zone primary action, bottom sheets, safe-areas, reduced-motion,
   one-hand use.
8. **Keep the identity.** WRAITH stays WRAITH, graze/combo/risk stays the signature, and the existing art style,
   palette and fonts stay. No new `<script>` tags or build step, and `file://`/offline must keep working.

---

## 3. The overhaul

### 3.1 The hangar as a place: five bays around the docked ship
```
┌───────────────────────────────┐  sticky header 56px: ‹ back · HANGAR · ◆ 6,400 (animated)
│        DOCK STAGE (38vh)      │  ship on its pad · swipe ◀ ▶ through hulls (locked = silhouette + price)
│   [spots 44px, pulsing if     │  collapses to a 96px strip when the panel scrolls
│    an upgrade is affordable]  │
├───────────────────────────────┤
│  BAY PANEL (scrolls)          │  cards ≥ 56px tall, tap → bottom-sheet detail with stat compare
│                               │
│              [ LAUNCH · VESPER ▸ ]  sticky 64px primary button, right thumb zone
├───────┬───────┬──────┬───────┬───────┤
│ Ship  │Systems│ Arms │ Style │ Yard  │  bottom tab bar 56px + safe-area · gold dot = something new/affordable
└───────┴───────┴──────┴───────┴───────┘
```
* **Ship:** hull carousel and its Frame doctrine tree (3.5), mastery bar, service plaque.
* **Systems:** the 6 Core refits as a schematic, with each spot on the dock = one system. Level pips, **exact numbers**,
  milestone nodes (e.g. "Plating III: +1 spare hull") and before→after.
* **Arms:** Armory weapon patterns and mods (3.3) plus the Loadout (sigil + modules + presets) (3.4).
* **Style:** paints, plate finishes (#97), mastery cosmetics (3.6), dock showcase.
* **Yard:** contracts (3.7), standing/donations (#97), tour wall, records, export/import/reset.
* **Desktop (≥ 901 px):** left tab rail, centre dock, right detail column (no bottom sheet).
* **Landscape phone:** dock on the left 45%, panel on the right, tabs as a vertical rail.
* **Detail sheet** (reuses the existing `.sheet` + focus trap): a big preview, and **stat compare bars** for current vs
  this item with green/red deltas, the weakness line in red, then the actions *Buy & fit* (56 px primary), *Fit*, and
  *Try in range*.
* **Purchase moment `revealItem()`**: alloy counter ticks down over 400 ms, the matching dock spot flares gold, the ship
  does a small lift + thrust flare, a spark burst plays at the spot, then `AU.unlock()` and `buzz(20)`. The new stat chips flash.
  Under reduced-motion it's instant and text-only.
* **Next-goal card:** the top of the Ship bay shows the single best next goal ("Halcyon: 220 alloy away", "Vesper M3:
  1,100 XP → Frame row II"). The game-over screen adds "2 upgrades ready in the hangar".
* **IDs kept** for tests/automation: `#s-hangar`, `#btnBayLaunch`, `#btnRange`, `#btnBayBack`, `#btnExport`,
  `#btnImport`, `#btnWipe`, `#alloyN`, `#dockCanvas`, `#hullList`, `#upList`, `#sigilList`, `#paintList`,
  `#masteryList`, `#donateBox`, `#tourWall` (+ #97's `#standingBox`).

### 3.2 Core Systems (legacy refits, unchanged power)
The same 6 tracks, same 5 levels, same prices (18,550 total) and the same `META.refits`, so `econsim` doesn't drift.
Only the presentation changes: exact numbers per level, milestone nodes at the existing breakpoints, and a schematic
layout. Global across hulls as today.

### 3.3 Armory: weapon patterns with branching mods
A **pattern** reshapes how the existing `WEAPONS` ladder fires. The `WEAPONS` table itself is **not edited** (golden
parity in `packages/sim/tests/golden.test.ts`). A pattern is a descriptor applied inside `firePrimary()`. Each pattern
has **two branch mods**; you own any, and fit **one pattern + one of its mods per hull** (`META.arms[hullId]`).
Switching between owned items is free and instant, so respec is built in.

**Bolt hulls (Vesper, Halcyon, Atlas, Wraith)**
| Pattern | Unlock | Effect (vs Spread at same tier) | Mod A (price) | Mod B (price) |
|---|---|---|---|---|
| **Spread** (stock) | free | today's behaviour | *Wide fan*: lane angles ×1.35, dmg ×0.95 (1,200) | *Choke*: angles ×0.6, dmg ×1.06 (1,200) |
| **Rail** | 2,000 | keeps the `k = min(3, n)` centre-most of the tier's `n` lanes; per-lane dmg × (n / k) × 0.90; bolt speed ×1.25 | *Penetrator*: pierce 1, fire interval ×1.12 (1,400) | *Capacitor rounds*: every 6th volley ×2.5 dmg, interval ×1.05 (1,400) |
| **Scatter** | 2,000 | +2 outer lanes (angle ×1.6), bolt life 0.45 s (~460 px reach), per-lane dmg ×1.0 — strong only up close | *Graze feed*: each graze −10% fire interval for 1 s (stacks 3) (1,400) | *Buckshot*: +1 more lane, per-lane dmg ×0.9 (1,400) |
| **Seeker** | 2,500 | seekers from tier 3 every 7 volleys (today: max tier, every 5); main lanes dmg ×0.9 | *Hunter swarm*: 3 seekers/salvo at ×0.7 (1,600) | *Marked prey*: seeker hits mark target +15% dmg for 2 s (1,600) |

**Seraph (Prism lance):** pattern = Lance (stock), with three lens mods (fit one):
*Wide prism* width ×1.6, hitR ×1.4, damage ×0.85 · *Cold lens* heatDrain ×0.75, damage ×0.88 · *Overcharge*
damage ×1.2, heatDrain ×1.3, lockout +0.5 s, at **2,200 each**.

**Power-parity guard (unit-tested):** for tiers 3 and 6, compute single-target DPS and 7-target "crowd" DPS from the
tables. Every pattern+mod's `0.5·single + 0.5·crowd` must sit within **±10% of Spread**, and no item may beat Spread on
*both* axes. Scatter's short reach is its cost, and the test treats reach < 500 px as crowd ×1.0 only inside 460 px.
**Armory shelf: 24,300** (Spread mods 2,400 · Rail 4,800 · Scatter 4,800 · Seeker 5,700 · Lens 6,600).
**Dock preview:** in the Arms bay the docked ship fires ghost bolts in the fitted/previewed pattern (canvas only, no
sim). **Try in range** launches the test range with that pattern temporarily fitted (`GAME.rangeTrial`). Nothing is
scored or saved.

### 3.4 Loadout: sigil + modules + presets
* **Sigil slot:** today's 5 sigils, unchanged.
* **Module slot A** opens with your first module purchase. **Module slot B: 5,000 alloy.**
* **Modules:** the 6 from the #97 spec Layer 3 (Vector trim 1,200 · Salvage claw 1,300 · Bomb bay 1,400 · Reinforced frame
  1,500 · Wide barrels 1,600 · Focus lens 1,800 = 8,800). Each has a perk and a weakness, and the same entry shape as
  `SIGILS`. You can't fit the same module twice.
* **Presets:** 3 named loadout presets per hull (pattern + mod + sigil + modules + frame picks), free, one tap to swap.
  This replaces #97's "fittings" bundles (Layer 5). A preset is the build fantasy, and bundles were only a discount.
* **Strip rule:** modules are off in daily/rush/school/range. The card names the modes that ignore it.
* **Loadout shelf: 13,800.**

### 3.5 Frame doctrines: per-hull trees unlocked by Mastery
Each hull gets 3 rows, each with 2 options. **Row I unlocks at that hull's M1, Row II at M3, Row III at M5.** Prices:
Row I 800 / Row II 1,600 / Row III 3,200 *per option*. You can buy both options in a row and fit one per row, with
free swaps. Per hull that's 11,200; across 5 hulls, **56,000**. Mastery now *unlocks choices*, which gives every hull its own
journey.

| Hull | Row I (M1) | Row II (M3) | Row III (M5) |
|---|---|---|---|
| VESPER | *Duelist trim* +6% dmg, −1 pulse at launch ⟷ *Reserve trim* +1 pulse, −6% dmg | *Slipstream* dash recharge +15%, pickup radius −20% ⟷ *Salvage gimbal* pickup radius +30%, dash recharge −10% | *Second wind* once per run a lethal hit breaks into a shield instead, combo resets to ×1 ⟷ *Ace's nerve* combo window +0.5 s, −1 life at launch (min 1) |
| HALCYON | *Afterburn* speed +8%, hitbox +6% ⟷ *Trim profile* hitbox −6%, speed −6% | *Graze capacitor* grazeMul ×1.3, dmg −8% ⟷ *Hot guns* dmg +8%, grazeMul ×0.8 | *Lancer dash* dash hits foes it crosses for 3× bolt dmg, dash cd +15% ⟷ *Phase surge* dash i-frames +0.12 s, −1 dash charge |
| ATLAS | *Ablative skin* shield re-arms every 25 s, speed −5% ⟷ *Stripped plates* speed +8%, no start shield | *Flak skirt* pulse radius +25%, fire interval ×1.08 ⟷ *Broadside* +1 outer lane, per-lane dmg ×0.9 | *Bastion* +1 life, score ×0.95 ⟷ *Iron will* +1 pulse per capital kill, −1 life |
| WRAITH | *Ghost veil* hitbox −8%, graze radius ×0.9 ⟷ *Wide wake* graze radius ×1.15, hitbox +8% | *Night drive* +1 dash charge, speed −6% ⟷ *Reaper's tithe* +1 pulse per capital kill, −1 dash charge | *Gate echo* first death leaves a 3 s ghost then revives, score ×0.85 for the rest of the run ⟷ *Pure nerve* grazeMul ×1.25, shield pickups convert to 500 score |
| SERAPH | *Heat-sink fins* cooling ×1.2, dmg ×0.95 ⟷ *Hot prism* dmg ×1.06, cooling ×0.85 | *Refraction* beam chains to 1 foe within 120 px at 40% ⟷ *Focused core* +12% vs capitals, −10% vs others | *Sunline* during overdrive the beam widens ×1.5, lockout +0.5 s ⟷ *Cool head* lockout −0.5 s, dps ×0.92 |

Every option prints its weakness. Row III options touching `score` are the deliberate lever that keeps the Open
board honest.

### 3.6 Mastery M6–M10 (cosmetic) and the Founder's plate
* XP thresholds: M6 15,000 · M7 20,000 · M8 26,000 · M9 33,000 · M10 41,000 (M1–M5 unchanged).
* Rewards (no power): M6 dock decal · M7 contrail *shape* (ribbon/twin/spark: shape, not colour, so the ΔE wardrobe
  floor is untouched) · M8 hull title on your board row ("VESPER ACE") · M9 animated pad ring · M10 gold service
  stripe (a plate finish via #97's channel).
* **Founder's plate:** every save that has `runs > 0` before the migration gets a free "Founder" plate finish, a thank-you
  for existing pilots.

### 3.7 Contracts: the new faucet and the daily hook
* **3 daily contracts** (UTC day): Easy / Medium / Hard, drawn by a seeded pick from objectives the game already counts
  (graze N, reach wave N, capital kills, comets sighted, accuracy ≥ X with 300+ shots, fly hull H to wave N, no-pulse
  wave). Targets scale with **pilot tier** `T = clamp(floor(bestWave/5), 0, 6)`.
* Rewards: 80 / 120 / 180, plus a 100 "full board" bonus, all × `(1 + 0.5·T)`. That's **480/day at T0 and 1,920/day at
  T6.** One free reroll per day.
* **Weekly order** = #97 Layer 2 unchanged (one weekly objective, **700** once per week id, plus the rotating 2,400 finish).
* Scored Endless/Tour/Daily runs count. School, rush and range don't.
* Forward-only day/week ids, progress clamped to target, a claim pays once (guards G7/G9 from the #97 spec). It's
  client-side like all alloy, and abuse is bounded to honest-play earnings.

### 3.8 Economy sanity table
New one-time shelf: **Armory 24,300 + Loadout 13,800 + Frames 56,000 = 94,100** (plus #97's cosmetic/standing
sinks). Existing shelf 45,800 is unchanged. The table assumes 5 runs/day plus full contracts. It ignores the Daily Gauntlet
medals (+120…830/day) and skill growth, so it's conservative.

| Pilot profile | Depth | Alloy / run | Contracts / day (tier) | ≈ Alloy / day | Days to the new 94.1k shelf |
|---|---|---|---|---|---|
| Rookie | w4 | 214 | 480 (T0) | 1,550 | ~61 (realistically ~25 as skill climbs) |
| Developing | w8 | 829 | 720 (T1) | 4,865 | ~19 |
| Mid | w12 | 1,880 | 960 (T2) | 10,360 | ~9 |
| Strong | w16 | 3,957 | 1,200 (T3) | 20,985 | ~4.5 |
| Expert | w20 | 6,549 | 1,440 (T4) | 34,185 | ~2.8 |
| Veteran | w26 | 13,213 | 1,680 (T5) | 67,745 | ~1.4 (gated by mastery: ~20 deep runs to M5 on all 5 hulls) |

**Unlock pacing for a new pilot** (w4→w8 ramp): run 1–2 first contract payouts · run ~3 Vesper M1 → Frame row I
(800) · run ~5 first weapon mod (1,200) · run ~6–8 Halcyon (1,400) or first Core levels · run ~10 first new pattern
(2,000). That's **something to buy or unlock every 1–2 runs** in the first two sessions, against today's "first hull at run ~25".

**Contracts as % of income:** 69% of a rookie's day income comes from runs and 31% from contracts (intended:
it smooths comet dependency, audit §3b). At w26 contracts are 2.5% (veterans play for standing/trials/mastery
cosmetics).
**Guards:** contract daily max ≤ 2,000 (asserted), and no new item may change `score/140 + wave×6` or the drop
formula. `econsim` gains extraction plus assertions for every new table, and §6 is regenerated with
`node tools/econsim.js --write-doc`. The anchor stays within ±10% because income formulas are unchanged and contracts
are modelled as a separate line.

### 3.9 Fairness rule
* **Daily (ranked):** new gear stripped from day one. Gate 4 later strips legacy refits/sigils/mastery for everyone.
* **Endless (Open board):** loadouts allowed, but under the **power-budget cap** (no item raises the ceiling; parity
  tests), and every posted run carries `stats.fit` (e.g. `v:sp.wf|sg:needle|m:trim,claw|f:12a`), shown as a small
  loadout chip on board rows. Pure transparency, and it needs no migration to *submit* (stats is free-form ≤ 4 KB).
  A migration is needed only so `standings_page`/`pilot_dossier` echo `fit` publicly (Phase 7).
* **Tour / practice:** everything allowed.
* Mastery score bonus (+8/+15%) stays untouched in this overhaul, because removing it would lower existing
  pilots' scores. It's flagged for Gate 4.

### 3.10 Save-data migration (all phases)
* `META.schema`: absent ⇒ 1 (legacy). The overhaul writes `2`. `loadMeta()` stays the only parser and allowlists every new
  key, so unknown ids fall back to stock.
* New keys: `arms{hullId:{pat,mod}}`, `armsOwned[]`, `modules[]`, `loadout{hullId:{sigil,modA,modB}}`,
  `slotB:bool`, `presets{hullId:[…3]}`, `frames{hullId:{r1,r2,r3}}`, `framesOwned[]`, `contracts{day,list,prog,claimed,rerolled}`,
  `founder:bool`, plus #97's `plate`/`finishes`/`week`.
* Legacy refits load into Core Systems unchanged. `META.sigil` becomes `loadout[ship].sigil` for the current ship
  *and* stays readable (dual-write for one release so a rollback to v4.29.x still loads).
* Export payload `v:4`, and import accepts `v:3` and `v:4`. **Fixture test:** a real-shaped v3 save loads with identical
  alloy, hulls, refits, paints, sigils, mastery, plaques and honor.
* **Reset progress** gets explicit semantics and copy: resets alloy, hulls, refits, armory, modules, frames and contracts;
  keeps honor/standing/finishes (#97 G16), paints and mastery. Confirm text lists both.
* **Backup reminder:** after any purchase of 2,000+ alloy, and at most once per day, the hangar offers "Export a backup code" (dismissible). Saves stay device-local until Gate 2 cloud careers.
* **No Supabase migration** for Phases 1–6. Phase 7 needs one (approval required). Cloud careers remain Gate 2.

---

## 4. Phases (each one ships playable value)
| # | Issue | Value shipped | Supabase migration |
|---|---|---|---|
| 0 | Carry PR #97's standing ladder in as the first commits | uncapped standing ladder | no |
| 1 | Hangar shell: 5 bays, dock stage, sticky Launch, detail sheet + stat compare, revealItem, Core Systems numbers, stat-bar & tap-target fixes, schema v2 + export v4 | the hangar feels premium on phones | no |
| 2 | Armory: weapon patterns + mods + Seraph lenses, dock preview, Try in range, parity tests | first real weapon choices | no |
| 3 | Contracts board (3 daily) + Weekly order (#97 L2) + game-over nudges | daily reason to return, faster early unlocks | no |
| 4 | Loadout: modules (#97 L3), slot B, presets per hull | build-crafting | no |
| 5 | Frame doctrines (30 nodes), mastery-gated | per-hull journeys | no |
| 6 | Mastery M6–M10 cosmetics + Founder's plate + dock showcase | long tail + thanks to current pilots | no |
| 7 | Board transparency: `stats.fit` chip + standings allowlist (`fit`, laurel paints) | honest Open board | **yes** (additive; Fahad approval; Engineering applies) |

Later (not drafted): #97 Layer 4 Yard trials; cloud careers (Gate 2, Codex).

## 5. PR #97: decision
The standing ladder from #97 (derived standing, one new key `META.plate`) is carried into the overhaul as its first
commits, rebased onto current `main` with a unique cache stamp. #97 is closed as superseded once the overhaul lands.
Phase 1 places `#standingBox`/`#donateBox` in the Yard bay. `docs/specs/alloy-armory.md` is amended: Layer 2 → Phase 3,
Layer 3 → Phase 4, **Layer 5 fittings superseded by presets**, Layer 4 trials deferred. The spec's "approved by the
owner" line is unconfirmed; this design is the reference.

## 6. Process notes
* AGENTS.md/PLAYBOOK: builders only take `ready` + `agent:<lane>` issues in the **current gate**. This overhaul is
  new scope, so it is listed as "Track H: Hangar overhaul" in `docs/expansion/IMPLEMENTATION_BACKLOG.md`.
* Builder: Engineering builds every phase; the builder lanes do not claim Track H issues. The
  Phase 7 SQL is an additive migration file, and **it is applied to the live project only after Fahad approves**.
* Every PR runs the full AGENTS.md rule 4 battery, with a version + SW cache bump, a CHANGELOG entry, a NOTES entry, the
  selftest baseline updated (new `T()` count), a fun-curve row via `tools/fun-scoreboard.mjs` (README/press-kit markers
  intact), and `econsim --json` green with the regenerated §6.
* Don't touch `WEAPONS`/`HULLS` numeric tables (sim golden parity). Patterns and frames are modifiers.

## 7. Risks
* **Hangar density on phones:** solved by bays plus sheets, verified at 360×640 and 412×915 with Playwright screenshots.
* **Balance drift:** parity tests plus the econsim gate, and every number lives in one table.
* **Local-only saves with deeper sinks:** add an "Export backup" nudge after big purchases, and cloud careers come in Gate 2.
* **Scope creep:** each issue lists exact touchpoints and "out of scope".
* **`net.js` growth:** splitting it into `js/hangar.js` needs a new `<script>` (deadscan load-order). Allowed in Phase 1 only
  if deadscan/sw `CORE` and the manifest are updated in the same PR. Otherwise keep it in `net.js`.
