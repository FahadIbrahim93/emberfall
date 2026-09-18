# EMBERFALL — Meta-Economy Audit

*Post-convoy, post-SERAPH. Produced by `tools/econsim.js`, whose constants are
extracted live from source and whose behaviour model is calibrated on real
server telemetry (60 verified runs). Anchor: this pilot's actual career —
95 runs, 58,484 lifetime alloy (23,134 banked + 35,350 spent). The sim
replays that history at **−15.4% drift**, i.e. it under-predicts slightly:
every finding below is conservative.*

---

## 1. How pilots earn

Income decomposes into four streams (share of a run's alloy, by skill depth):

| Depth | /run | /min | Comets | Score | Drops+clears |
|-------|------|------|--------|-------|--------------|
| wave 4 | 214 | 92 | **52%** | 6% | 42% |
| wave 8 | 829 | 178 | 32% | 13% | 55% |
| wave 12 | 1,779 | 254 | 25% | 21% | 54% |
| wave 16 | 3,704 | 397 | 19% | 24% | 57% |
| wave 20 | 5,883 | 504 | 17% | 29% | 54% |
| wave 26 | 12,488 | 823 | 12% | 28% | 60% |
| wave 32 | 20,671 | 1,107 | 11% | 30% | 59% |

Findings:

- **Rookies live on the sky.** At wave 4, over half of all alloy is comet
  stargazer pay. The "the sky pays you for flying pretty" system is carrying
  the early game exactly as designed — but it also means a rookie who turns
  Sky traffic to *Sparse* nearly halves their income (a hidden, unintended
  difficulty axis: the setting reads as visual pacing, not economics).
- **The deep-run curve is steep but not broken.** wave 32 pays 3.5× wave 20
  per run, but takes 1.6× the minutes: per-minute rate climbs ~2.2× from
  wave 20 → 32. Skill is rewarded superlinearly yet hourly rates stay
  human-scale — no runaway.
- **The kill-drop floor works.** 13.5% base + pity ensures a wave-1 pilot
  still banks ~35 alloy from drops alone; nobody has a zero run.

## 2. Hull pricing vs. time-to-own

Hulls cost 0 / 1,400 / 2,600 / 5,200 / 7,600 (VESPER → SERAPH).

A skill-ramped career (waves growing to ~26 over the first 70 runs, greedy
cheapest-first spend) hits:

- **first hull: run ~7** when hull-focused (the sim's cheapest-first policy
  delays it to ~25 by buying refits first — real players buy the fun thing;
  both are healthy: Halcyon is a *choice*, not a gate)
- **all hulls owned: run ~31** (cheapest-first) — i.e. ~10–12 hours of play
- **full completion (all hulls + all refits): run ~31–35**, total spend
  35,350 alloy

Verdict: **hull pacing is healthy.** The Seraph premium (7,600 ≈ the last
third of the whole grind) lands for a steady pilot after ~20–25 runs of the
mid-game, and after this pilot's actual 95-run career there is only ~915
leftover bank at completion — the economy empties out right about when the
collection completes. That is textbook: a finish line, not a bottomless pit.

## 3. The two structural risks

### 3a. The veteran dead-zone (post-completion, pre-prestige)

At wave 26+, a pilot earns ~12,000/run with nothing left to buy. There is no
sink, no prestige, no season goal beyond leaderboard rank. Two sessions of
veteran play make every future alloy meaningless. **This is the single
biggest economy gap** — bigger than any pricing question.

### 3b. The rookie comet dependency (economic fragility, by way of a gift)

52% comet share at wave 4 means the early game is indirectly tuned by
`SKY_TRAFFIC` and the comet scheduler. Any future change to sky pacing
silently rebalances the early economy. It also means the convoy — which pays
nothing — is economically invisible (see §4). Fine now; document it, and if
sky cadence ever becomes player-facing economics, split the streams.

## 4. Feature-by-feature

**Relief convoy (pays 0):** correct and keep it that way. It is atmosphere
and the "the corridor still connects" story beat; its reward is the
*Ghost-watcher-class* feat and the moment. The sim shows the sky paying 17%
of mid-game income via comets alone; adding convoy pay would push sky
income past the point where ignoring the sky stops being viable.

**Golden comets (×10, 11% of sightings):** a wave-4 golden with blazing
style + STAR CHART pays ~520 alloy — **2.4 rookie runs** in one sighting.
Spectacular, memorable, and *fine*: it is rare (career expectation ~1 per
95 sightings… the anchor pilot has 15), stylistically gated (grazeHeat
×2), and self-limiting. Do not nerf; it is the economy's lottery ticket
and it is doing its job.

**STAR CHART (10-comet perk, +50% forever):** quietly the most valuable
permanent perk in the game — at the anchor pilot's 116 career comets it has
roughly doubled lifetime sky income. Correct that it arrives after ~10
runs; it makes stargazing a *build*.

**Feat rewards:** feats pay **0 alloy** across the board (24 trophies).
This is a *design decision* working as intended — feats are identity, not
income — **but** the audit flags one exception worth closing: *Flight
school pays 120 once* and is the only earned-alloy event outside runs.
Recommendation: leave feat payouts at zero (they'd double-dip with the
feat progression display); the economy has enough streams.

**Refit ladders:** 18,550 total, roughly linear (220→1,060 etc.). The
*Scavenger* (fortune) ladder is the only self-referential purchase — it
raises income ~30% at max (drop rate .135→.245, +25% run-end, +pity
sooner). It pays back in ~8–10 runs and is always the correct greedy buy
after the first hull. No change needed; it is the economy's engine, and
its cost curve already prices it fairly.

## 5. Recommendations (concrete, ordered)

1. **Cap the veteran vacuum — add a prestige sink.** Post-completion,
   convert surplus alloy into a visible career stat or a small permanent
   perk ladder (e.g. "Yard donations": 5,000/25,000/100,000 lifetime
   alloy → cosmetic trail / callsign plate / title). Pure sink, zero
   balance risk, closes §3a. *Effort: small. Impact: high.*
2. **Decouple rookie income from sky settings.** Either (a) floor the
   comet pay at its Standard-cadence value when Sky traffic is Sparse, or
   (b) move 10% of rookie income into the guaranteed drop floor
   (ALLOY_PICK wave-1 amount 4 → 5). Option (b) is one line and
   imperceptible at high waves. *Effort: one line. Impact: removes a
   hidden failure mode.*
3. **Publish the hull ladder as an intent, not an accident.** The
   cheapest-first sim reaches hulls at run ~25; hull-focused pilots at
   ~7. Both fine — but consider a one-time "+500 alloy" first-hull
   subsidy via the existing feat system (e.g. Gatecrasher pays its first
   time) to make the intended pacing explicit. *Effort: small.*
4. **Deep-run per-minute ceiling is fine; do not touch the curve.** The
   1,107/min at wave 32 vs 92/min at wave 4 is the correct skill slope.
   No change.
5. **Keep convoy pay at zero and goldens at ×10.** Both are doing their
   structural jobs (atmosphere / lottery). Re-audit only if sky share
   ever exceeds ~25% at any single depth.
6. **Re-run this audit after any change:** `node tools/econsim.js` —
   constants are extracted from source, so a tuned game that breaks the
   extraction or the anchor drift (>±25%) fails loudly.

*Model provenance: kills/wave = 1.66·w^1.09 (fits w5, w12, w32 buckets
simultaneously); score/kill = −0.86w²+58.8w−45.7 (combo-inflated, concave);
35 s/wave; death wave pays half kills, no clear bonus. Anchor replay
−15.4%; residual drift is daily-mutator and combo variance, all of which
raises real income above the model — findings are conservative.*
