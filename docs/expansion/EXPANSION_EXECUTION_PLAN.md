# Emberfall Full Expansion — Execution Plan & Working Guidelines

**Status:** Execution planning — this doc turns the bible, schema and backlog into an ordered build plan with per-task gates. It authorizes no gameplay implementation by itself.
**Version:** 1.0
**Companion docs (source of truth, in order of authority):**

1. `EMBERFALL_EXPANSION_DESIGN_BIBLE.md` — what the expansion is and is not.
2. `IMPLEMENTATION_BACKLOG.md` — the task list this plan sequences (EXP-001…EXP-020).
3. `content-schema.json` — canonical content vocabulary and validation contract.
4. `REALITIES.md` — current codebase constraints every task must respect.

Where docs disagree, the backlog's acceptance criteria and the bible win for expansion decisions; `REALITIES.md` wins for "can we even start."

---

## 0. TL;DR — the sequence

```text
M0  Phase-0 locks (design, replay contract, telemetry, playtest protocol)   ← EXP-001..005
M1  Framework seam + validation harness (no player-facing content)          ← EXP-006..009
M2  Heliox Forge vertical slice (3 stages + visual language)                ← EXP-010..013
M3  Six planes, one at a time (Aegis Warden, Vesper*, …)                    ← EXP-014
M4  Daily mission + competition beta (packages, tracking, share, replay)    ← EXP-015..018
M5  Balance + readability pass; 20-player validation gate                   ← EXP-019, EXP-020
    ── GATE: ship-or-stop decision. Heliox proves the framework. ──
M6  Heliox planet completion (HF-04..HF-06 + mastery variant)
M7  Noxara Rift — system 2 (same pipeline, cheaper now)
M8  Cryovale — system 3
M9  Verdant Abyss — system 4
M10 Full-expansion release gate (all-system DOO, press assets, release notes)
```

Nothing past M5 begins until the M5 gate decision is **proceed**. M6–M9 are
informed by the same pipeline, so each later system costs a fraction of Heliox.
Filling them all is the "full expansion"; shipping Heliox alone already satisfies
the bible's first-slice definition.

**Vesper*** — the bible's plane name collides with the existing hull `VESPER-01`
(`HULLS.vesper` in catalog/index.html). Renames are decided at M0 (§5.2).

---

## 1. Full-scope content inventory

This is everything a "finished" expansion contains. It is the reference list for
asset briefs, issue waves, and the final Definition of Done.

### 1.1 Systems

Each new system = 1 launch planet (6 authored stages) + optional mastery
variant + 1 enemy family + 1 hazard family + 1 mini-boss rule + 1 boss +
1 palette/material set + 1 audio motif + 1 daily modifier family.

| System | Verb | Signature hazard | Enemy family | Boss (draft) | Status |
|---|---|---|---|---|---|
| Emberfall Prime | survive | — (baseline) | existing catalog | Kuiper Gate capital (shipped) | shipped, balance reference |
| Heliox Forge | overheat | solar heat vents | forge drones/smelters | The Furnace Regent | M2–M6 |
| Noxara Rift | bend | gravity wells + timed rifts | rift-dwellers (TBD) | Rift Terminator (TBD) | M7 |
| Cryovale | momentum | ice drift + shatter | cryo swimmers (TBD) | Glacier sovereign (TBD) | M8 |
| Verdant Abyss | mutate | living spore growth | spore-life (evolving) | Abyss Bloom (TBD) | M9 |

Flagged: all boss/foe names beyond the Furnace Regent are drafts to be locked in
each system's design brief. No name ships without the brief gate.

### 1.2 Stages (authored route per planet)

Each planet follows the bible's 6-beat route: introduce → combine → tactical
decision → escalate+choice → mini-boss/high stakes → boss/extraction resolve.
Heliox's slice stages are beats 1–3; beats 4–6 extend the route at M6.

Heliox Forge planet (all authored already in brief form):

| Stage | Mode | Core decision | Status |
|---|---|---|---|
| HF-01 Solar Intake | survival | chase heat multiplier vs bank safe score | M2 |
| HF-02 Foundry Convoy | convoy | protect modules vs personal score | M2 |
| HF-03 Core Breach | extraction+boss | extraction lane vs heat-carrying multiplier; Furnace Regent 3 phases | M2 |
| HF-04 (draft: Sabotage Hunt) | hunt | find the saboteur among forge drones using heat tells | M6 (author at M5) |
| HF-05 (draft: Meltdown Cycle) | hazard | time the vent cycles, arena is the enemy | M6 (author at M5) |
| HF-06 (draft: Full Foundry Run) | relay→extraction | checkpoint chain then one extraction | M6 (author at M5) |

Noxara Rift planet (route drafts, locked at M7 brief):

| Beat | Draft mode | Core decision |
|---|---|---|
| N-01 | survival | learn well-pull without being consumed |
| N-02 | hazard | route through rift currents vs straight lines |
| N-03 | hunt | decoys split across two rift zones |
| N-04 | convoy | steer wells to protect a courier |
| N-05 | relay | chain timed rift exits |
| N-06 | boss | boss rule TBD (must own "bend") |

Cryovale planet (route drafts, locked at M8 brief): survival → relay (ice slalom)
→ hazard (avalanche shatter) → convoy (icebreaker escort) → extraction →
boss (momentum rule TBD). Key design constraint: momentum must remain
deterministic — no drift randomness (see §5.4).

Verdant Abyss planet (route drafts, locked at M9 brief): survival → hunt (target
the evolving nest) → hazard (spore bloom recursion) → convoy (bio-courier) →
extraction → boss (mutation rule TBD). Evolution state must be a pure function
of seed + player actions (§5.4).

Total authored content at completion: **24 stages + 4 mastery variants, 4 boss
fights, 4 mini-boss rules, 4 enemy families, 4 hazard families, 4 palettes,
4 audio motifs.** All cataloged in validated data (§5.3).

### 1.3 Planes (six sidegrades)

Bible §7 names them; EXP-009 locks budgets. Rollout order: Aegis Warden →
Vesper* → Helix → Arclight → Nullwing → Pioneer.

| # | Plane (draft) | Signature ability | Resource | Notes |
|---|---|---|---|---|
| 1 | Aegis Warden | near-miss → brief armor | charge | good vs convoys/objectives |
| 2 | Vesper*** | mark target; kill refunds dash fragment | dash-fragment | name TBD, collision with VESPER-01 |
| 3 | Helix | orbiting drones, energy budget | energy | weak direct fire |
| 4 | Arclight | chain reaction across marked foes | charge | good vs crowds |
| 5 | Nullwing | short phase shift, strict cooldown | energy | expert mobility |
| 6 | Pioneer | stabilize/repair objective | objective-integrity | objective specialist |

Open decision to lock at M0 (§5.2): how planes relate to existing hulls
(HULLS table) — parallel plane axis vs hull class rework.

### 1.4 Daily mission & competition layer

- Versioned Daily packages: date, seed, stage, modifier, 3 missions, allowed
  planes, verification policy (schema `dailyPackage`).
- 7 mission classes tracked (survival/precision/priority/protection/efficiency/
  restriction/exploration).
- Share cards + "Beat this run" challenge URLs, guest-playable, account only
  for posting.
- Leaderboard tiers, honestly labeled: local / bounds-checked (current) /
  replay-verified (M4 prototype) / tournament-reviewed.
- Replay verification prototype: server/worker re-simulation from seed + inputs
  (EXP-018). Until it exists, no `verified` label touches current boards.

### 1.5 Telemetry & measurement

Versioned events for boot, launch, first action, death, retry, stage completion,
Daily entry, share, account, score post, return visit (EXP-004 contract first,
implementation after M1). Non-blocking on failure; no PII; retention policy
documented before collection begins.

---

## 2. Milestones — goals, tasks, exit criteria

Each milestone ends with a gate that must be green locally **and** in CI.

### M0 — Phase-0 locks (design & measurement) — EXP-001…005

Exit criteria:

- [ ] Content vocabulary frozen (IDs, version semantics, collision policy). EXP-001
- [ ] Heliox brief approved: verbs, stage arcs, heat rules, telegraphs,
      mini-boss, Furnace Regent, victory/failure states. EXP-002
- [ ] Replay/verification contract written; UI language audit passed (no
      "verified" on bounds-checked). EXP-003
- [ ] Telemetry + privacy contract written; retention documented. EXP-004
- [ ] Playtest protocol ready (20 participants, metrics, segmentation). EXP-005
- [ ] The three naming/naming-collision decisions locked (§5.2).

### M1 — Framework, no player-facing expansion — EXP-006…009

Exit criteria:

- [ ] Validation harness runs in CI over content JSON (path-specific errors,
      dup IDs, duration/mission checks, no runtime dependency). EXP-006
- [ ] Content registry seam exists without changing current behavior:
      `file://` boots, classic load order intact, `deadscan --check` green,
      sim goldens stable, zero runtime npm deps. EXP-007
- [ ] Stage event timeline is validated data (deterministic ordering, known
      registry entries, telegraph exposed to tests, human-readable dump). EXP-008
- [ ] Plane stat/ability budget sheet approved (all six planes; sidegrade
      rules; reduced-motion fallback; no verification-policy change per plane). EXP-009
- [ ] TypeScript typecheck gate decision implemented (§5.5).
- [ ] Telemetry events implemented behind the contract (non-blocking).

### M2 — Heliox vertical slice — EXP-010…013

Exit criteria:

- [ ] Visual language prototype passes readability at mobile resolution;
      reduced-motion safe; signature flare moment measured within backdrop
      bake budget. EXP-010
- [ ] HF-01 ships: heat introduced safely, deterministic, sim tests cover
      gain/damage/cadence/scoring. EXP-011
- [ ] HF-02 ships: convoy modules, partial-failure recovery, integrity-based
      result scoring with a post-run explanation, all a11y labels. EXP-012
- [ ] HF-03 ships: extraction escalation, rotating lanes, mini-boss gate,
      Furnace Regent 3 phases, every plane archetype beats it in principle,
      boss state golden-tested. EXP-013
- [ ] New content is in the registry seam as validated data; parity/golden
      tests updated for new tables (§5.3).

### M3 — Six planes — EXP-014

Order: Aegis Warden → Vesper* → Helix → Arclight → Nullwing → Pioneer. One
PR per plane.

Exit criteria per plane:

- [ ] Shared movement/firing/damage/ability/score contracts pass.
- [ ] Ability has keyboard, touch, assistive and reduced-motion paths; no
      double-fire on any activation.
- [ ] Balance report: stage win rate, score distribution, failure reasons.
- [ ] Silhouette readable at 32px-equivalent width; one-sentence tutorial line;
      strength/weakness visible in hangar.

### M4 — Daily + competition beta — EXP-015…018

Exit criteria:

- [ ] Daily package generator + preview; immutable or superseded versions;
      documented timezone behavior; same package = same rules everywhere. EXP-015
- [ ] Mission tracking with in-run/post-run progress; missions playable as
      guest; only score-posting is account-gated; rewards cosmetic/prestige. EXP-016
- [ ] Share card + challenge route; recipient starts without an account;
      direct navigation + refresh survive. EXP-017
- [ ] Replay verification prototype rejects seed/content/ruleset/digest/
      impossible-state mismatches; result immutable; bounds-checked labeling
      stays honest. EXP-018

### M5 — Balance, readability, and the 20-player gate — EXP-019, EXP-020

Exit criteria:

- [ ] Balance pass against sim distributions + playtest data: no dominant
      strategy unless intentionally labelled; experts find a high-risk route;
      mobile stays within budget. EXP-019
- [ ] 20-person study executed; segmented results; findings with evidence;
      recorded **proceed / revise / stop** decision. EXP-020

**M5 is the expansion's first real risk gate.** A "stop" or "revise" outcome
recycles into the next Heliox iteration at M2; the remaining systems do not
begin.

### M6–M9 — Systems 2–4 + Heliox completion (gated, pipeline proven)

For each of M6 (HF-04..06 + mastery) / M7 (Noxara) / M8 (Cryovale) / M9
(Verdant):

- [ ] System brief approved (same brief template, §4).
- [ ] Palette/material + silhouettes + audio motif produced (asset checklist §4).
- [ ] Stages authored as data, validated, deterministic.
- [ ] Mini-boss + boss implemented with golden tests.
- [ ] Readability + performance audit per stage.
- [ ] Daily modifiers for the system registered.
- [ ] Release gate re-run (§7 checklist) for the system.

Bible anti-goal enforcement: **one system must prove replay value before the
next starts.** M7 begins only after Heliox shows sustained rerun engagement
(daily participation, retry rate) and no reverted balance regressions.

### M10 — Full-expansion release gate — Definition of Done (§8) fully checked

- [ ] All 24 stages + variants across 4 systems.
- [ ] All 6 planes balanced against the M5 report.
- [ ] Daily system covers all 4 systems with a modifier family each.
- [ ] Rollback path proven for a bad Daily package/content version.
- [ ] Press/creator assets regenerated **from the released build**.
- [ ] Release notes state verification status honestly (bounds-checked vs
      verified per board).

---

## 3. Authoring cadence (design briefs)

Each system brief is one doc; locks per stage: mode, decision, encounter arc,
telegraph times, score opportunity, failure explanation, and the system's verb
rules. Template per stage (110 seconds ± 10% target):

```text
STAGE BRIEF — <id> "<name>"
Mode:            <survival|convoy|hunt|hazard|relay|extraction|boss>
Decision:        <one sentence — the choice a player actually makes>
Arc (s):         0–15 safe intro | … | final event
Telegraphs:      <hazard/enemy tells, seconds>
Score edge:      <the riskier route and its visible multiplier>
Failure read:    <what the death screen explains>
Determinism:     <seeded inputs; no wall-clock or Math.random>
Readability:     <worst-case visual state; reduced-motion note>
```

Brief acceptance = EXP-002 pattern: distinct decision per stage, safe
introduction before escalation, authored score opportunity, readable failure,
no reliance on unreleased systems or unbounded procedural content.

---

## 4. Asset production plan (all procedural code — no binary files)

Reality anchor (REALITIES §1): the game ships zero runtime files for art/audio.
"Assets" are code:

- **Sprite/art tables** — `js/art.js`: `HULL_ART`, `FOE_ART`, `BOSS_ART`
  (+ `PICK_*` maps). New content means new table entries + palette constants.
- **Sky/backdrops — `js/sky.js`** — keyed bakes, DPR clamped; new systems need
  their own palette/silhouette set with a bake-time budget (< 8 ms).
- **Audio is synthesised** — `js/audio.js`: `DEATH_VOICE` per-foe mapping,
  `MUSIC` motif table, plus SFX voices for new abilities/hazards.
- **UI/palette** — `index.html` inline `<style>`: panels/buttons/fonts unchanged
  in feel; new content uses the existing design system.

### 4.1 Per-system asset checklist (applies to each of M2, M6–M9)

- [ ] Palette (5-slot schema palette: background/primary/accent/threat/objective)
      as hex constants, meeting WCAG-distinguishable threat vs objective.
- [ ] Material language: palette-driven fills/strokes consistent with existing
      STEEL module approach in art.js.
- [ ] Enemy family silhouettes: readable at 32px; per-foe `FOE_ART` entry +
      `DEATH_VOICE` entry in audio.js.
- [ ] Mini-boss silhouette + rule iconography.
- [ ] Boss: silhouette, phase color shifts (animation + audio + HUD, per
      bible's HF-03 criteria), distinct per 3 phases.
- [ ] Hazard family visuals: telegraph shape + timing embedded; reduced-motion
      variant specified (blink/outline instead of travel).
- [ ] Audio motif: one-phrase synth hook for menu + in-run ambience; ability
      SFX per new mechanic; no new audio files.
- [ ] Sky/backdrop variant: bake-keyed, measured cost, auto-quality fallback.
- [ ] Signature moment: one screenshot-worthy climax that never obscures
      threats (governance: pass/fail by screenshot review).
- [ ] Daily modifier family icon + share-card colorway.

### 4.2 Planes (M3) asset checklist per plane

- [ ] `HULL_ART`-style silhouette readable at 32px-equivalent width.
- [ ] Ability VFX with reduced-motion fallback written into art constants.
- [ ] Ability SFX synth voice (audio.js) + cooldown/error feedback sound.
- [ ] Hangar card: one-line strength, one-line weakness, no numbers hidden.
- [ ] Death voice mapping (audio.js `DEATH_VOICE`) for any unique hull class.

### 4.3 UI asset work (M4)

- [ ] Share card layout (mobile-first, works on real phones).
- [ ] Mission tracker HUD element + post-run mission breakdown.
- [ ] Daily results "Beat this run" deep-link renderer.
- [ ] Leaderboard tier badges with honest labels (`bounds-checked` vs
      `replay-verified` vs `tournament-reviewed`).
- [ ] Stats screen additions (daily streaks) without breaking low-DPI layout.

---

## 5. Engineering guideline — architecture decisions to lock

### 5.1 Where new content lives (the seam decision) — EXP-007/008

Constraints: `file://` boot, classic script order
`audio → sky → net → art → input → inline core`, no bundler, no runtime deps,
`package/sim` goldens stay green.

Decision to be made and recorded at M1 among:

- **A. New classic data script** (e.g. `js/content-expansion.js`) loaded before
  the inline core. Pros: real data files, dead-simple file:// story. Cons: adds
  a script tag + needs load-order acceptance test; SW payload grows.
- **B. Keep appending to index.html tables** (status quo for STAGES/FOES/HULLS),
  with the sim extracting/parity-testing as today. Pros: zero seam work; Cons:
  the monolith grows; "registry as data" stays aspirational.
- **C. Hybrid:** competitive-scored content (stages, foes, planes) goes through
  option A's registry; cosmetic/backdrop content stays inline.

Recommended: **C**, with EXP-007's acceptance tests as the gate. Whatever is
chosen gets recorded in ARCHITECTURE.md and `content-schema.json` docs; every
later wave assumes it.

Parity discipline: whatever the source of truth, `packages/sim` mirrors it and
`tests/golden*.test.ts` pins every field for shipped content — same discipline
the current HULLS/FOES/WEAPONS/STAGES goldens enforce. New tables ship with
their golden test in the same PR, or the PR does not merge.

### 5.2 Naming, namespace, and collisions (locks at M0, EXP-001/009)

- IDs: lower-kebab, stable, no display labels as keys (schema pattern).
- **Collision 1 (flagged):** plane "Vesper" vs existing hull `VESPER-01`
  (`HULLS.vesper`). The plane gets a new name at M0 before any code. Draft
  suggestion for the precision-assassin plane to replace "Vesper":
  `Kestrel` (any name keeping the silhouette/mark ability; final call in the
  EXP-009 budget sheet).
- **Collision 2 (flagged):** Noxara's new "gravity" hazard verb vs the existing
  per-world `haz: 'gravity'` (Jupiter/ Kuiper Gate). Noxara brief must name the
  new hazard distinctly (e.g. `wells` / `rifts`) and state how it reads
  differently from the existing magnet field pull.
- Plane vs hull relationship (§1.3): planes are sidegrade *planes* with active
  abilities — decide explicitly whether they are a new user-facing axis
  alongside hull licenses or a hull-class redesign. Recommended: new axis with
  `boardPolicy` per schema, since hull licenses are economy-gated and planes
  should start unlocked-if-skilled (keeps Pillar D comparability).

### 5.3 Content integrity gates (every content PR)

- [ ] JSON validates against `content-schema.json` (EXP-006 harness in CI).
- [ ] No duplicate IDs; every reference resolves.
- [ ] Telegraph times present and exposed to sim tests.
- [ ] Determinism: new scored math uses the run-seeded RNG stream only; FX use
      the separate non-scoring stream; fixed-step accumulator ceiling intact.
- [ ] Golden fixtures added for each new table (normal, edge, failure paths).
- [ ] `real-device` perf note: entity/particle counts inside budget; backdrop
      bake keyed; auto-quality untouched.

### 5.4 Determinism rules for new mechanics

| Mechanic | Deterministic rule to enforce |
|---|---|
| Heat (Heliox) | vent cadence seeded; multiplier window seeded; heat damage is pure function of state |
| Convoy integrity | damage events are replay-representable state; repair drains fully determined by action log |
| Gravity bending | well field = pure function of seed + positions; projectile curve is recomputable |
| Momentum (Cryovale) | drift friction deterministic per surface; no random grip resets |
| Mutation (Verdant) | enemy evolution is a pure seeded function of (seed, kills-in-order, time) |

### 5.5 TypeScript policy (locks at M1)

Options: (a) add `tsc --noEmit` to CI if expansion adds TS content; (b) keep
TS documentation-only and never add TS to shipping paths. The honest current
state is (b); REALITIES §3 flags it. Decision is made at M1 and recorded in
REALITIES (strike the line once true).

### 5.6 Score/verification integrity (every gate, not just M4)

- Client never chooses the authoritative score.
- Board writes stay RPC-only + rate-limited; no direct table writes.
- Callsign/share metadata escaped + allowlisted.
- Replay payload size limits enforced.
- UI/share cards keep the vocabulary of EXP-003 exactly.

---

## 6. Working conventions for every task

- **One issue at a time.** Branch `issue-<n>`; PR links the issue
  (`Closes #<n>`); small and on-topic.
- **Per-PR gate list (all green before requesting merge):**
  `bash check.sh`, `node deadscan.js --check`, `node tools/copyguard.js`,
  `node tools/econsim.js --json`, `npm run test:sim`, `npm run test:browser`,
  `node tools/selftest-ci.js`, `node tools/validate-content.js` (once EXP-006 lands).
- **Never merge, never push to `main`; a human merges.**
- **Version + SW cache generation** bumped the way CHANGELOG entries do on
  every payload-affecting change.
- **No secrets**; client uses only the publishable Supabase key.
- **Plane name stays WRAITH.** Existing art style/palette rules hold for new
  content.
- Sim <-> index.html goldens are updated or created every time a mirrored
  table changes — a PR that changes gameplay tables without golden updates is
  structurally incomplete.
- Docs (README/ARCHITECTURE/CHANGELOG) updated in the same PR as behavior
  changes they describe.

---

## 7. Release & rollback

- Every wave ships behind a content version (`contentVersion` in schema);
  UI can render an older-content fallback if a new version fails validation.
- Daily packages immutable or superseded; rollback = switch pointer, never
  mutate history.
- Feature-flag per system: a not-yet-gating system (e.g. verify-replay) can be
  shipped dark and flipped by version.
- Service Worker cache bump on payload change; press kit regenerated from the
  released build only.

---

## 8. Definition of Done — full expansion

1. All 4 new systems shipped with 6-stage planets + mastery variants, using
   the shared registry seam (§5.1 decision implemented).
2. 6 planes pass plane budget + a11y + balance-report criteria.
3. Daily system live across all 4 systems, deterministic, guest-playable,
   honest verification labels; replay-verification prototype at minimum
   carries the "verified Daily" tier for a pilot cohort.
4. Telemetry funnel measured end to end (participation, retry, share, challenge
   conversion) with the privacy contract honored.
5. Full-expansion QA checklist (backlog §6) — every box checked by its named
   owner, including real-device thermal tests.
6. 20-player Heliox gate validated the slice; replay value held for 4+ weeks of
   dailies (M10 evidence).
7. Docs complete: bible updated with ship-states; ARCHITECTURE records the
   seam; CHANGELOG entries per wave; release notes state verification status.

---

## 9. Honest scale & risks

- Heliox's three stages + six planes + daily + verification is already the
  biggest project this 9k-line monolith has absorbed. Plan for the slice alone
  to be a multi-week effort with CI discipline; the full four-system expansion
  is months, and it should **not** be attempted as one branch — waves of small
  PRs are the repo's working reality (§6).
- The three biggest soft spots, in order:
  1. **Sim/ship seam** (REALITIES §2) — M1 closes it or the whole plan is
     built on drift.
  2. **Verification honesty** (REALITIES §4) — the replay-verified tier must
     not be promised before it exists; UI language audit at every wave.
  3. **CI stability** — the duplicate-run and Playwright-cache fixes (#51/#52)
     should land before M2 begins; a flaky gate undermines a 20-stage build.
- Watch the two mode-heaviness anti-goals: no currency-per-system (§ eco), no
  proc-gen stages without authored decisions.

---

## 10. How this plan is tracked

Backlog EXP tasks stay canonical. This plan adds only sequencing + assets +
guidelines. Execution mapping:

- M0 issues → EXP-001..005 (+ §5.2 decisions).
- M1 issues → EXP-006..009 (+ §5.5 typecheck, §5.1 seam decision, telemetry impl).
- M2 issues → EXP-010..013 (per stage/boss, one PR each, goldens included).
- M3 issues → 6 plane issues (EXP-014).
- M4 issues → EXP-015..018.
- M5 issues → EXP-019, EXP-020.
- M6–M9 issues → one brief per system + per-stage issues + per-asset issues
  (checklist §4), gated by M5's recorded decision.
- M10 → release-gate issue closing the DoD.

Issue titles follow `area: task` (e.g. `expansion: freeze content vocabulary
(EXP-001)`), and each issue body links the EXP task and the checklist section
of this plan. One issue at a time per the repo convention; PRs carry the gate
list from §6.
