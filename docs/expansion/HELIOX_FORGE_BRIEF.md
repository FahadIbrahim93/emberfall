# Heliox Forge — system design brief

**Status:** M0 deliverable for EXP-002 (issue #54). This brief locks the Heliox vertical slice (HF-01…HF-03) and drafts the M6 route extension (HF-04…HF-06). Numbers marked **T** are starting tunables, adjusted only through the EXP-019 balance pass.
**Vocabulary:** `content-vocabulary.md` — system `heliox-forge`, planet `heliox-forge-prime` ("Foundry Ring", display final at EXP-019), hazards `hf-heat-vents`, boss `furnace-regent`, mini-boss `hf-smelter-warden`.
**Pipeline:** stages are authored as validated data (EXP-008 timelines) and live in the registry seam chosen at M1 (execution plan §5.1); sim tests and goldens cover heat gain, cadence, convoy integrity, and boss state (EXP-011…013 criteria).

## 0. Locked design summary

- **Verb:** overheat. Heat is the arena's leverage: it charges your score and weapons, and it burns you.
- **Decision spine:** every stage asks "how hot do you dare to run?" in a different form — proximity (HF-01), protection (HF-02), carrying (HF-03).
- **Safe-introduction rule:** each mechanic debuts telegraphed, harmless or deeply forgiving, then escalates on a fixed cadence.
- **Failure honesty:** every stage's result screen states the cause of death and the risk the player took.

## 1. The heat contract (mechanic rules, M2-locked)

All values **T** (tunables in validated content data; algorithm shape is fixed at M2 so sim+game agree):

| Rule | Value | Effect |
|---|---|---|
| Heat meter | `0–100 HF-HEAT` | HUD bar; contrast filtering never hides it |
| In active vent pulse | +18/s | score multiplier window; weapons overcharge (+15% damage **T**) |
| Heat decay (outside pulses) | −8/s | passive cooldown |
| Heat crossing 100 | triggered once per crossing with 1.0s invuln | lose 1 hull point, heat resets to 60; play a distinct vent-burn SFX (the damage is telegraphed by the rising bar; no instant-death from an undisplayed state) |
| Vent pulse windows | 3s active, every 7s **T**; 2.0s telegraph before each pulse | vent ring pre-glow + rising tone; cadence is seeded per run, never random per pulse |
| Overcharged enemies | forge hounds gain aggression when `playerHeat > 60` | faster approach, same firepower; telegraphed by hound glow shift |
| Graze-multiplier rule | grazing within a 1.2s active pulse window: +0.1× floor 1.2, cap 2.5× | score only; multiplier falls back to 1.0 after 3s outside all windows; HUD shows current tier and its decay timer |
| Determinism | vent cadence from run seed; multiplier state from seed+inputs | re-simulate reproduces exactly |

UI language: the stage HUD labels this exactly once per stage ("HEAT charges your score — overheat and you burn"). Instruction copy never calls it verified, ranked or purchasable.

## 2. HF-01 — Solar Intake (survival, 100s)

```text
Mode:       survival
Decision:   route through heat pulses for multiplier vs bank a safe lane
Arc (s):    0–15 one marked vent, no enemies; 15 vent pulse #1 safe (no cost yet);
            20–45 forge drones from out-of-vent lanes, first wave;
            45 graze-tutorial beat: first multiplier tier reachable only in-pulse;
            60 pulse cadence doubles (7s → 4.5s T);
            75 first heat-seeking hound (glow telegraph, enters roaring);
            90 final drone wave; 100 extraction gate opens (fly in to bank)
Telegraphs: vent pulse ring 2.0s pre-glow; hound entry 1.5s horn; drone lane
            edge-stream 1.0s
Score edge: sustained in-pulse play reaches ~2.5× but stacks heat to burn
            threshold 2–3 times → the high route visibly risks hull hits
Failure read: "Burned out at heat 100" vs "Hull lost to <foe>" — the death
            card names heat damage explicitly when it is the cause
Readability: worst case = triple pulse overlap + hound; test in EXP-010 at
            360px equivalent; reduced-motion keeps a solid bar + outline pulse
```

Success criteria (EXP-011): first-timers get the heat reward before lethal heat; veterans route through pulses deliberately; read at max multiplier.

## 3. HF-02 — Foundry Convoy (convoy, 140s)

```text
Mode:       convoy
Decision:   intercept drone lanes vs escort near the modules; chase repair
            pickups in risk zones
Arc (s):    0 convoy enters: 3 modules, each 6 HP (T), moving a fixed, seeded
            lane; 20 drone attack lanes begin (edge-stream telegraphs);
            45 vent pulses cut across the convoy route (escort must dip out);
            70 repair pickups spawn inside the hottest pulses (+2 module HP,
            personal heat cost);
            95 smelter-warden locks onto the centre module: damage-locked
            until interrupted — interrupt by luring it into two pulse
            windows (it overheat-trips at heat-equivalent 2 pulses, T);
            120 modules hold → lane 2 extraction opens; failure → narrower
            lane 3 extraction with lower multiplier and extra waves
Multiplier: integrity ≥100% ×1.25 · ≥66% ×1.0 · ≥33% ×0.85 · >0% ×0.7 (T)
            letter scores post (post-run card shows both integrity and the
            multiplier it produced, per stage through final gate)
Telegraphs: warden lock: 1.5s scanning beam then permanent lock beam until
            trip; drone lane streams: 1.0s edge-glow; vent cuts 2.0s pre-glow
Failure read: exactly which module fell and which action damaged the run's
            score — the post-run card itemises per-module HP and the chosen
            integrity multiplier
```

Success criteria (EXP-012): partial failure recoverable; save-vs-score tension real; integrity affects scoring in documented ways, all replay-representable.

## 4. HF-03 — Core Breach (extraction + boss, 180s)

```text
Mode:       extraction → boss
Decision:   bank early at the first extraction lane vs carry through risk
            for the higher stage multiplier before the filter drop
Arc (s):    0 enter the core chamber; collect the volatile core at 5s;
            carried core: constant +10/s heat (T) while held;
            10–70 lanes rotate between two choices every 8s (2.5s telegraph,
            lane A/B names flash + color tint);
            40–75 smelter-warden seals one lane per rotation (seal telegraph
            1.5s; the warden is passable but only if you route around);
            75 bank-node: drop the core at the safe terminal → standard
            extraction ends here at stage multiplier 1.0×;
            else carry: +0.25× per successful risky lane up to +1.0×;
            95 drop-claim: Furnace Regent descends (1.5s approach with
            gathering flare; the arena briefly clears);
            95–180 boss fight (below)
Telegraphs: lane seals, warden approach, boss phases all ≤2.5s and doubled
            in HUD (icon + colour + audio tone per EXP-013 criteria)
Failure read: heat-cause vs boss-cause named; carrying risk quantified
            ("you banked +0.75× by refusing the safe terminal")
```

## 5. Furnace Regent — boss rules (locked)

Three phases, each introduced by animation + audio stinger + HUD banner (bible §6 criteria). Boss state is deterministic and golden-tested (EXP-013).

| Phase | Rule | Vulnerability window | Telegraph |
|---|---|---|---|
| P1 Cooling armor | armor closes; player shots ricochet (visibly fizzle) unless inside a pulse window | only during active vent pulses (3s windows) | armor plates slide in (1.5s) with a descending sheen + audio drop tone |
| P2 Reactor windows | armor opens every 8s; core exposed 2.0s per window; carries heat penalty: player's passive heat decay halves | window open = bright core glow + rising arpeggio; closing = thud + plate clank | 2.5s pre-open pulse outline on the plates that will lift |
| P3 Regent's arena | phase P2 windows keep cycling AND arena gains permanent slow heat-drift (+2/s passive heat even outside pulses, T); adds a lane-sealing sweep every 12s (weeping sweep = move lanes or bank) | same windows + sweep-lock windows | sweep edge-glow 2.0s; unique audio layer change (dispatches a distant alarm-pulse) |

Counterplay: P3 punishes players who treat it as P2; the sweep forces crossing hazards on a cadence instead of camping one lane. Boss defeated when core HP (T, ~1000 effective) reaches 0 across any mix of windows. No plane archetype is mandatory: Aegis Warden trades multiplier for sustain, Kestrel double-bursts P2 windows, Helix perches drones at window ranges, Arclight clears lane-sweep adds, Nullwing phases through sweeps, Pioneer repairs... nothing (boss has no objective to repair) but gets an out-of-window trick: bank-node micro-harvest T.

Boss metrics (EXP-013 acceptance): every plane archetype wins in principle (sim victory tests; no plane mandatory), phase changes communicated in 3 channels, high-score route visibly riskier not secretly better.

## 6. HF-04…HF-06 — drafted for the M6 route extension

Drafted per the execution plan §1.2 and booked for brief-approval at M5 (they are NOT in the M2 slice):

- **HF-04 — Sabotage Hunt (hunt, ~120s):** locate the saboteur drone among forge decoys; the real one over-greets to heat pulses (a 1.5s glow bloom during vent pulses is the tell). Decision: fast multi-pulse sweeps vs slow patrol-and-compare.
- **HF-05 — Meltdown Cycle (hazard, ~120s):** the foundry ring cycles meltdown phases; arena density is the enemy (drone lanes thinner, vent behavior harsher, damage windows longer); scoring rewards correct routing honour across 3 sequential arenas.
- **HF-06 — Full Foundry Run (relay → extraction, ~200s):** checkpoint chain through the three rings, then one extraction with the HF-03 bank rule; mastery variant adds: all three systems on the run with the highest tier multiplier.

## 7. Audio recipe (heliox motif)

- System motif: low industrial drone + bell sheen (MUSIC voice at menu + in-run ambient layer).
- Per-mechanic SFX: vent pulse rising tone; heat-crossing burn bark; warden lock screech + trip whine; boss plate clank + core arpeggio; sweep alarm sub-pulse.
- All synthetic voices (audio.js pattern), no files; death voice per forge-foe class mapped in `DEATH_VOICE`.

## 8. Approval checklist (EXP-002 acceptance)

- [x] Each of HF-01/02/03 has a distinct primary decision (§2–§4).
- [x] Each mechanic's safe introduction precedes escalation (§2–§4 arcs).
- [x] Each stage has an authored score opportunity and a readable failure explanation.
- [x] No stage depends on unreleased systems or unbounded procedural generation; all lists and cadences are seeded.
- [ ] Human sign-off on this brief (the "approve" half of EXP-002 — recorded when the M0 PR merges).

Numbers marked **T** are starting tunables; their final values are the EXP-019 balance pass's job, not a design change.
