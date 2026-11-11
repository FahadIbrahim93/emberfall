# Alloy armory — what alloy buys after the shelf empties

Status: **approved** 2026-11-10 by the owner — all five layers, modules follow the
sigil precedent, standing survives "Reset progress", the weekly contract is capped at
700 alloy. **Layer 1 (standing) is built** and ships as game v4.29.9 (cache
`emberfall-v4.65`); it closes #48 on merge. Layers 2–5 are re-homed in the hangar
overhaul (game v4.30.0, cache `emberfall-v4.66`): modules ship as specified, the weekly
contract is the Yard bay's weekly order (700 alloy), bundles become per-hull presets,
and boss trials are deferred. See Revision 3.

Supersedes nothing. Extends the hangar described in `docs/economy-audit.md` §6 and
replaces the open item in §5.1.

## Why

The one-time shelf totals **45,800 alloy** (hulls 16,800 · refits 18,550 · paints
4,950 · sigils 5,500) and the donation ladder cumulates to **100,000**. At wave 26 a
pilot earns ~12,488 per run, so the shelf empties in about four deep runs and every
later alloy flows into a ladder that ends at Yardmaster. Every sink is terminal, the
grid never changes, and a purchase produces no moment.

This design adds the four things the shop cannot do:

1. an uncapped ladder that turns surplus alloy into visible standing,
2. a rotation that gives a pilot a reason to look at the hangar next week,
3. a build axis (sidegrades) beside the existing sigil,
4. a way to spend alloy on **authored play** instead of numbers.

## Prices at a glance

Every price in this design, in one place. All figures are integer alloy and are
extracted by `tools/econsim.js`; the generated totals block in
`docs/economy-audit.md` §6 is the authoritative cross-check.

| Thing | Price | Limit | Repeatable |
|---|---|---|---|
| Standing rank (I–X) | 25,000 each | 10 ranks · 250,000 total | no |
| Legend star | 25,000 each | uncapped | yes |
| Weekly stock finish | 2,400 | one per week from a 4-item pool | every 4 weeks |
| Weekly contract payout | **+700** (income) | one claim per week id | weekly |
| Module | 1,200 · 1,300 · 1,400 · 1,500 · 1,600 · 1,800 | 6 modules · 8,800 total | no |
| Trial restore | 3,000 · 3,500 · 4,000 · 5,000 | 4 trials · 15,500 total | no (idempotent) |
| Fitting bundle | 85% of the **unowned** parts | 3 kits | no |
| Dock glow | free on fitting completion | 3 | no |

New one-time shelf: modules 8,800 + trial restores 15,500 = **24,300** on top of the
existing 45,800. Repeatable: weekly stock 4 × 2,400 = 9,600 to own the cycle, the
700/week contract, and the uncapped standing ladder above 350,000 lifetime donated.

## Layer 1 — Yard standing (built)

Standing is **derived from the honor ledger**, not stored:
`standingOf(donated) = max(0, floor((donated − 100000) / 25000))`. No new counter, no
migration; old saves, exported codes (`v: 3`) and imports produce standing
immediately.

| Rank | Name | At lifetime donated | Reward |
|---|---|---|---|
| I | Steward | 125,000 | — |
| II | Quartermaster | 150,000 | plate finish **Brass** |
| III | Dockmaster | 175,000 | — |
| IV | Yard Marshal | 200,000 | plate finish **Verdigris** |
| V | Keelwright | 225,000 | — |
| VI | Voidwright | 250,000 | plate finish **Obsidian** |
| VII | Gatewright | 275,000 | — |
| VIII | Starwright | 300,000 | plate finish **Aurum** |
| IX | Keeper of the Yard | 325,000 | — |
| X | Yard Legend | 350,000 | plate finish **Legend ember** |

- **Cosmetic channel: plate finishes, never hull paints.** `PLATE_FINISHES` holds
  `{id, name, hull, lit, at}` with the free `steel` at rank 0; `plateFinish()` resolves
  `META.plate` against owned rungs and falls back to `steel`. Only `META.plate`
  persists. The payload's self-test pins every hull-paint pair to CIE-Lab ΔE floors
  (normal 21 · protan 16 · deutan 14 · tritan 9); a numeric search showed additional
  hull paints can only clear those floors as near-duplicates of `night`/`midnight`.
  Plate metal sits on the dock, so the wardrobe invariant and its test stay intact.
- **The ladder never closes.** Past rank X every further 25,000 alloy is a Legend
  star ("Yard Legend +2"), so a fully completed career always has a visible next goal
  — #48's first acceptance criterion.
- **Hangar block** (`#standingBox`): rank glyph, progress bar, cumulative donated,
  next finish, and the exact remainder to the next step. The donate button charges
  only that remainder through the shared `askConfirm`, and a new rank arrives already
  worn.
- **Dock plate** engraves `◆ <roman rank>` in the worn finish; a pilot's own board row
  carries the same mark beside the ✦ honor mark. Finishes are dock-local: they do not
  ride run stats, so no schema change and no claim about other pilots seeing them.
- **Reset keeps** honor, standing and finishes, and the confirm copy says so.
- **Economy:** `STANDING` (10 ranks) and `STANDING_STEP` are extracted; the ladder is
  reported as its own 250,000 line in §6. It adds no income, so the historical anchor
  is untouched.

## Layer 2 — Weekly yard order

- `weeklyIndex()` = whole weeks since a fixed Monday epoch, UTC. Pure, testable, no
  wall-clock dependency inside the function.
- **Stock:** one rotating finish per week from a four-item pool at **2,400 alloy**,
  repeating every four weeks so nothing is permanently missable. The four are
  dock-plate metals (`week-*` finishes), owned through `META.finishes`; the finish
  grid shows a price on sold entries and a rank on earned ones.
- **Contract:** one objective per week, drawn only from counters the game already
  records, so no new run field and no change to the `submit_run_v2` stats contract:

  | Objective | Target |
  |---|---|
  | Graze rounds | 120 in the week |
  | Reach a wave | wave 10 |
  | Destroy capital ships | 3 |
  | Finish a Daily run | 1 |

- The claim pays **700 alloy once per week id**. `META.week.id` only moves forward and
  `META.week.prog` is clamped to the objective's target, so changing the clock cannot
  pay twice and a forged week can at best earn what honest play earns.
- Hangar: a compact card row — "Yard order · week N", the rotating finish with its
  price, and the contract's progress/claim button. Copy states the four-week cycle.
- **Guards:** `WEEKLY_ALLOY = 700` is asserted `≤ 900`; stock price is asserted
  `≥ 2,000`, so a week's contract can never buy the week's stock outright (2,400 >
  700) and the rotation is not self-funding.

## Layer 3 — Armory modules

One module slot beside the sigil, with the same lifecycle, card shape and strip rule.

| id | Name | Alloy | Perk | Weakness |
|---|---|---|---|---|
| `trim` | Vector trim | 1,200 | +18% speed | −1 dash charge |
| `claw` | Salvage claw | 1,300 | +45% pickup radius | −8% damage |
| `bay` | Bomb bay | 1,400 | +1 pulse | −1 hull |
| `frame` | Reinforced frame | 1,500 | +1 hull | −10% speed |
| `barrels` | Wide barrels | 1,600 | +1 gun lane | +12% fire interval |
| `lens` | Focus lens | 1,800 | +20% damage | −25% dash recharge |

- Entry contract per module: `{id, name, slot: 'module', cost, perk, weakness,
  apply(), allowed(m), comboK}` — the same shape as `SIGILS`, so the same strip line,
  the same card markup and the same tests apply.
- **Strip rule (sigil precedent, unchanged):** `GAME.rush || GAME.school` → no module.
  The Daily joins that list when Gate 4 lands, and the card names the modes that
  ignore it.
- Exactly one worn module (`META.module`) and an owned set (`META.modules`), selectable
  independently of the worn sigil.
- **Total: 8,800 alloy** across six modules, asserted by econsim.

## Layer 4 — Yard trials

The first kill of each capital drops a wreck on scored flights only (the same guard as
mastery). Restoration is irreversible and opens a fixed-seed rematch.

| Trial | Boss | Restore | First-clear finish |
|---|---|---|---|
| `trial-dread` | Dreadnought | 3,000 | **Dread plate** |
| `trial-matriarch` | Matriarch | 3,500 | **Matriarch plate** |
| `trial-tyrant` | Tyrant | 4,000 | **Tyrant plate** |
| `trial-warden` | Gate Warden | 5,000 | **Warden plate** |

- The trial run is forced-hull, boss-only, three-minute cap, with a seed derived from
  the trial id (never the wall clock). It launches through the existing rush-style
  path with `GAME.school = true` plus `GAME.trial = id`, so ghosts, boards, mastery
  and alloy payouts are all bypassed.
- Local best in `META.trialBest[id]`; nothing posts; copy labels it practice.
- Hangar: "Yard trials" list — wreck state, restore button behind `askConfirm`, then
  "Fly trial" and the local best.
- **Guards:** restore is idempotent (paying twice for one wreck must be impossible),
  pays no alloy back, and the trial itself pays nothing — the whole 15,500 is a pure
  sink, and the first-clear cosmetic is earned, never sold.

## Layer 5 — Fittings

Three bundles, each naming one paint, one module and one sigil that already exist:

| Fitting | Parts | Full price | Bundle (85%) |
|---|---|---|---|
| Foundry kit | crimson 650 + barrels 1,600 + glasswing 900 | 3,150 | 2,678 |
| Deep-range kit | glacier 650 + lens 1,800 + hawksight 1,400 | 3,850 | 3,273 |
| Yard-issue kit | slate 300 + frame 1,500 + rampart 900 | 2,700 | 2,295 |

- The bundle charges **only for parts not already owned** and rounds once:
  `Math.round(0.85 × sum(unowned))`. Owning crimson and glasswing but not barrels
  makes the foundry kit 1,360.
- **Guard:** `bundlePrice ≤ sum(parts)`, asserted by econsim. Bundles discount existing
  prices, so they add no net sink; they exist to convert a stalled collection into a
  decision, not to discount the shelf.
- Completing a fitting (all three parts owned) unlocks a dock-glow colour — cosmetic,
  local, derived from existing ownership arrays, no new persistence.
- No new cosmetics and no new price list: every part already has a reviewed price and
  a reviewed colour.

## Guards

Consolidated. Each row is a rule the implementation must satisfy and a place it is
enforced; a change that cannot satisfy one needs a new revision of this document.

| # | Guard | Rule | Enforced by |
|---|---|---|---|
| G1 | No new currency | Alloy is the only coin; nothing here mints a second one | design review |
| G2 | No randomised paid outcome | No loot boxes, no paid pulls, no "chance at" copy | copyguard review |
| G3 | Daily stays vanilla | No module, trial or fitting buff on a ranked Daily | strip rule; Gate 4 |
| G4 | Bounds-checked, not verified | Scores are never described as verified or cheat-proof | copyguard |
| G5 | Colourblind floor | Every new cosmetic is a **plate finish**; finishes must differ under normal/protan/deutan/tritan | in-game ΔE suite |
| G6 | No negative balance | A purchase refuses when `META.alloy < price`; alloy never clamps to − | `T()` invariant |
| G7 | Weekly payout cap | `WEEKLY_ALLOY = 700`, asserted `≤ 900`; one claim per week id | econsim + `T()` |
| G8 | Rotation not self-funding | Stock 2,400 > weekly 700 | econsim assertion |
| G9 | Forward-only claim | `META.week.id` only increases; `prog` clamped to target | `loadMeta` + `T()` |
| G10 | Standing is derived | No standing ledger, no migration; only `META.plate` persists | `standingOf()`, loadMeta |
| G11 | Finish allowlist | `META.plate`/`finishes` must resolve or fall back to `steel` | `plateFinish()`, loadMeta |
| G12 | Bundle never overcharges | `bundlePrice ≤ sum(parts)`; unowned parts only | econsim assertion |
| G13 | Trials are a pure sink | Restore is irreversible, idempotent, pays no alloy; fixed seed | `askConfirm` + tests |
| G14 | Strip rule | Modules off in rush/school (and Daily at Gate 4) | `allowed(m)` |
| G15 | Sanitised saves | Every new `META` key allowlisted in `loadMeta()` | `T()` legacy-save cases |
| G16 | Reset keeps progress that was bought | Honor, standing and finishes survive reset, and copy says so | reset test |
| G17 | Confirm and escape | Every irreversible spend uses `askConfirm`; every dynamic string uses `esc()` | deadscan XSS audit |
| G18 | Load contract intact | `file://`, offline, zero dependencies, no new `<script>` tag, no build step | deadscan + release checks |
| G19 | Model stays honest | Every price above is extracted by econsim; a price change regenerates §6 in the same change | `econsim --json` drift gate |

## Where the code goes

| Concern | Home |
|---|---|
| `STANDING`, `PLATE_FINISHES`, `MODULES`, `TRIALS`, `WEEKLY_POOL` | inline core, beside `PAINTS`/`SIGILS`/`DONATIONS` |
| `standingOf()`, `standingNextAt()`, `plateFinish()`, `weeklyIndex()`, `weeklyStock()` | inline core, pure helpers next to `honorOf()` |
| apply/strip for the worn module | `configurePlayer()` beside the sigil apply |
| render + buy handlers | `js/net.js`, inside `renderHangar()` |
| prices and counts | `tools/econsim.js` extraction, assertions and the generated §6 block |

No new `<script>` tag, so `deadscan`'s load-order check is untouched. Splitting shop
rendering into `js/armory.js` remains a deliberate later refactor (it changes the load
contract), not part of this work.

## State and migration

New persisted keys on `META`, all sanitised in `loadMeta()` against allowlists:

| Key | Shape | Sanitisation |
|---|---|---|
| `plate` | finish id | shipped v4.30 — must exist in `PLATE_FINISHES`; else `steel` |
| `finishes` | owned finish ids | filter to known ids; earned rungs need not be listed |
| `module` | module id or `''` | must exist in `MODULES` |
| `modules` | owned module ids | filter to known ids; `''` always present |
| `wrecks` | `{bossId: 1}` | allowlisted boss ids only |
| `trials` | restored trial ids | allowlist |
| `trialBest` | `{id: {score, wave}}` | integer clamp, ≥ 0 |
| `week` | `{id, claimed, prog}` | integers; claim forward-only; progress clamped |

`standing` is derived, never stored. `exportSave` bumps the payload version to `4` and
still accepts `3`.

## Board policy (stated in the UI and in docs)

- Paints and plate finishes are cosmetic; finishes are dock-local and never ride a run.
- Modules are power-swaps with a printed weakness, like sigils: allowed in Endless and
  Tour, stripped from rush boards, drills and the practice range, and stripped from the
  Daily when Gate 4 ships.
- Trials never post and never pay alloy.

## Purchase moment

Every successful purchase calls one shared `revealItem(name, swatch)`: dock canvas
flash, the existing `AU` sting, the note "`<name>` fitted to the yard", auto-wear.
Reuses existing audio and note plumbing; no new animation system.

## Economy summary

- One-time: modules **8,800** + trial restores **15,500** = **24,300**, on top of the
  existing **45,800** shelf.
- Standing: **250,000** to Yard Legend (100,000 existing ceiling + 10 × 25,000), then
  uncapped at 25,000 per star.
- Rotation: **9,600** to own the four-week cycle, plus **700/week** income that cannot
  buy the week's stock.
- Effect: the meaningful spend horizon roughly doubles and stops having an end, while
  income is untouched, so the historical anchor stays inside its drift band.

The audit totals in `docs/economy-audit.md` §6 are generated by `tools/econsim.js` and
already include the standing line; a price change here requires
`node tools/econsim.js --write-doc` in the same change.

## Testing

Per PR, the full AGENTS.md battery: `bash check.sh`, `node deadscan.js --check`,
`node tools/copyguard.js`, `node tools/econsim.js --json`, `npm run test:sim`,
`npm run test:browser`, `node tools/selftest-ci.js`, plus the SW cache bump, version
stamp and CHANGELOG entry.

New `T()` invariants:

- standing derivation is monotonic, plate grants are idempotent, Legend stars keep
  climbing past the tenth rank,
- every finish resolves through `plateFinish()`; a locked or unknown id falls back to
  `steel`,
- every module has perk and weakness text and a positive cost,
- exactly one module applies, and none applies in rush/school,
- `weeklyIndex()` is monotonic and stock is stable for a given id,
- claim only moves forward; a replayed claim pays nothing,
- trial restore is idempotent and pays nothing back,
- no purchase can drive `META.alloy` negative,
- fitting price never exceeds the sum of its parts.

New Playwright cases:

- rank up standing: the finish unlocks, is worn, and the dock plate shows the rank,
- buy a module: alloy drops, it equips, and a rush launch flies without it,
- weekly claim pays once and not again for the same week id,
- restore a trial and fly it; progress touches neither boards nor mastery,
- "Reset progress" keeps honor, standing and finishes and says so.

`tools/econsim.js` grows extraction and assertions for `STANDING_STEP`, `STANDING`
(10 ranks, 250,000 ladder), `MODULES` (count 6, total 8,800), `TRIALS` (count 4, total
15,500), `WEEKLY_ALLOY` (≤ 900) and the rotating stock price (≥ 2,000). Existing
exact-count assertions are updated in the PR that changes the table they describe.

## Rollout

| PR | Scope | Depends on |
|---|---|---|
| 1 | Standing + plate finishes + dock plate + hangar block + audit totals + econsim standing — **closes #48** | — (built, v4.30.0) |
| 2 | Weekly yard order (rotation stock, contract, week ledger) | 1 |
| 3 | Armory modules (table, UI, apply/strip, tests) | cloud careers |
| 4 | Yard trials (wrecks, restore, fixed-seed rematch) | 3 |
| 5 | Fittings + dock glow | 3 |

Cloud careers gate PRs 3–5: device-local careers currently lose every purchase when
storage is cleared, and deeper sinks should not land before the save path does. PRs 1–2
are cheap, reversible and independent.

Each PR is one issue, branch `issue-<n>`, `Closes #<n>`, human review and merge.

## Risks

- **Board comparability drift.** Modules add a second power axis to Endless. Mitigation:
  the sigil precedent, a printed weakness on every module, and the Daily strip at
  Gate 4. If the owner prefers, modules can be unranked-only with no design change.
- **Rotation and clock manipulation.** The contract is local-only; the forward-only week
  id bounds abuse to one claim per real week.
- **Finish proliferation.** Fourteen finishes by the last layer. Keep the finish grid on
  one row-per-rung layout and re-run the ΔE check whenever a finish is added; a finish
  that cannot be told apart under any vision model is not shippable.
- **Hangar density.** Two new blocks on phones. Verify 360 px stacking and 44 px
  targets; the confirm-focus pattern from `tests/confirm-focus.spec.js` still applies.
- **net.js growth.** Shop rendering approaches ~800 lines. Splitting it into
  `js/armory.js` is a deliberate later refactor, not part of this work.

## Definition of done

A pilot who owns every hull, refit, paint and sigil still sees at least one visible next
goal after every purchase; no purchase changes Daily comparability; the economy model
extracts every new price and keeps the anchor inside its drift band; and the hangar's
spend produces a flight, a plate or a rank — not just a number.

## Revision log

**Revision 1 — 2026-11-10, layer 1 as built.** The ladder is unchanged (ten ranks at
25,000 past the 100,000 ceiling, uncapped stars), but its reward is **plate finishes,
not hull paints**. The payload's self-test pins every hull-paint pair to CIE-Lab ΔE
floors under protan, deutan and tritan vision (normal 21 · protan 16 · deutan 14 ·
tritan 9); a numeric search showed extra hull paints can only clear those floors at
near-black and near-white extremes that read as duplicates of `night` and `midnight`.
Standing therefore pays five dock-plate metals at ranks II/IV/VI/VIII/X, stored as one
allowlisted `META.plate` id and drawn on the dock plate.

**Revision 2 — 2026-11-10, this document.** Recorded layer 1 as shipped in v4.30.0
(status, real ids, `PLATE_FINISHES`, `META.plate`, doc line and board marker), moved
every later cosmetic reward onto the same finish channel for the G5 guard (weekly
stock and trial first-clears were previously specified as hull paints, which the ΔE
floor forbids), added the consolidated price and guard tables, and replaced the stale
notes about audit totals with the generated-block procedure.

**Revision 3 — 2026-11-11, hangar overhaul.** Layer 1 shipped as v4.29.9 when PR #97 was
rebased onto main (the v4.30.0 label above it in Revision 2 predates the rebase). The
owner folded the remaining layers into the hangar overhaul (#100): modules and the
second slot ship in the Systems bay; the weekly contract is the Yard bay's weekly order
and its stock is a plate finish (the finish channel, per the G5 guard); bundles are
superseded by three presets per hull; boss trials are deferred. Gear flies on Endless
and Tour only and is clamped to the legacy ceiling there.
