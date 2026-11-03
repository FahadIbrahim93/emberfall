# Emberfall Expansion Implementation Backlog

**Status:** Planning only. Do not begin gameplay implementation until the Phase 0 exit criteria are approved.  
**Priority:** P0 blocks the vertical slice; P1 is required for the slice; P2 follows slice validation.

## 1. Phase 0 — design and measurement lock

### EXP-001 — Freeze expansion content vocabulary

**Priority:** P0  
**Owner:** Design + engineering  
**Depends on:** none

Define the canonical names and IDs for systems, planets, stages, hazards, enemy sets, objectives, planes, missions, modifiers, and bosses.

**Acceptance criteria**

- All planned content uses lower-kebab-case stable IDs.
- No display label is used as a persistence or leaderboard key.
- Deprecated IDs have a migration policy.
- IDs and version semantics are documented in `content-schema.json`.

### EXP-002 — Approve Heliox Forge design brief

**Priority:** P0  
**Owner:** Game design  
**Depends on:** EXP-001

Lock the system verb, stage arcs, heat rules, hazard telegraphs, mini-boss, Furnace Regent, and victory/failure states.

**Acceptance criteria**

- Each of HF-01, HF-02, and HF-03 has a distinct primary decision.
- Each mechanic has a safe introduction before escalation.
- Each stage has an authored score opportunity and a readable failure explanation.
- No stage depends on unreleased systems or unbounded procedural generation.

### EXP-003 — Define deterministic replay and verification contract

**Priority:** P0  
**Owner:** Engineering + backend  
**Depends on:** EXP-001

Specify seed, ruleset version, content version, input format, fixed-step behavior, digest, replay payload, verification states, retention, and rejection reasons.

**Acceptance criteria**

- The contract distinguishes `local`, `bounds-checked`, `replay-verified`, and `tournament-reviewed`.
- The UI never calls a bounds-checked score verified.
- A replay can be rejected for mismatched seed, content, ruleset, input digest, or impossible state.
- The current no-server behavior remains accurately documented until re-simulation ships.

### EXP-004 — Define telemetry and privacy contract

**Priority:** P0  
**Owner:** Product analytics + engineering  
**Depends on:** none

Define versioned events for boot, launch, first action, death, retry, stage completion, Daily entry, share, account, score post, and return visit.

**Acceptance criteria**

- No email, raw IP, or free-form user content is collected by gameplay events.
- Analytics failure is non-blocking.
- Events include game version, ruleset version, device class, and referrer category where privacy-safe.
- Retention and deletion policy is documented before collection begins.

### EXP-005 — Establish human playtest protocol

**Priority:** P0  
**Owner:** Research + design  
**Depends on:** EXP-002

Prepare moderated and unmoderated tests across desktop, Android touch, iOS touch, and low-end hardware.

**Acceptance criteria**

- At least 20 participants are recruited for the vertical slice gate.
- Tests measure comprehension, replay intent, perceived fairness, and share intent.
- Participants are segmented by prior arcade-game experience.
- Findings are written with observed evidence, not only opinions.

## 2. Phase 1 — content framework, no player-facing expansion yet

### EXP-006 — Implement data validation harness

**Priority:** P0  
**Owner:** Engineering  
**Depends on:** EXP-001

Add a validation-only tool for content JSON. This is not gameplay implementation; it validates IDs, references, durations, mission constraints, and version fields.

**Acceptance criteria**

- Invalid references fail with a path-specific error.
- Duplicate IDs fail.
- Stage durations and encounter times are validated.
- Daily missions reject non-deterministic or account-required definitions.
- The tool runs in CI without a runtime dependency in the game.

### EXP-007 — Add content registry seam without changing current behavior

**Priority:** P0  
**Owner:** Engineering  
**Depends on:** EXP-006

Create a data seam compatible with the current classic-script and `file://` load contract. Existing Emberfall Prime behavior must remain unchanged.

**Acceptance criteria**

- `file://` play still boots.
- Script load order remains `audio → sky → net → art → input → inline core`.
- `deadscan --check` passes.
- Existing simulation goldens remain byte/behavior stable.
- No runtime npm dependency is introduced.

### EXP-008 — Define stage event timeline representation

**Priority:** P0  
**Owner:** Engineering + design  
**Depends on:** EXP-006

Represent encounter sequences as validated data rather than scattered magic values.

**Acceptance criteria**

- Encounter ordering is deterministic.
- Every hazard and enemy set resolves to a known registry entry.
- Telegraph time is validated and exposed to tests.
- A stage can be inspected in a human-readable debug output.

### EXP-009 — Define plane stat and ability budget

**Priority:** P0  
**Owner:** Combat design  
**Depends on:** EXP-002

Establish the numeric budget and sidegrade rules for Aegis Warden, Vesper, Helix, Arclight, Nullwing, and Pioneer.

**Acceptance criteria**

- Every plane has one strength, one weakness, and one explicit mastery loop.
- No plane is more than the approved power budget outside its intended mode.
- Ability cooldown, resource, telegraph, and reduced-motion fallback are specified.
- Plane selection cannot silently alter score verification policy.

## 3. Phase 2 — Heliox Forge vertical slice

### EXP-010 — Build Heliox visual language prototype

**Priority:** P1  
**Owner:** Art + rendering  
**Depends on:** EXP-002, EXP-007

Create the Heliox palette, materials, heat vents, industrial silhouettes, and boss readability prototype.

**Acceptance criteria**

- Bullets, player, enemies, objectives, and hazards remain distinguishable at mobile resolution.
- Reduced-motion mode removes or simplifies motion without removing essential state.
- The signature star-flare moment does not obscure active threats.
- Renderer cost is measured using the existing performance method.

### EXP-011 — Build HF-01 Solar Intake

**Priority:** P1  
**Owner:** Gameplay engineering  
**Depends on:** EXP-008, EXP-010

Implement the first Heliox survival stage.

**Acceptance criteria**

- Heat is introduced safely, then escalates predictably.
- Heat reward and damage are visible before the player commits.
- Stage is deterministic under fixed seed and fixed inputs.
- Simulation tests cover heat gain, heat damage, vent cadence, and scoring.

### EXP-012 — Build HF-02 Foundry Convoy

**Priority:** P1  
**Owner:** Gameplay engineering  
**Depends on:** EXP-011

Implement convoy modules, damage states, repair decisions, and objective-integrity scoring.

**Acceptance criteria**

- Partial convoy failure is recoverable and clearly communicated.
- Objective integrity affects result scoring in documented ways.
- All convoy state is deterministic and replay-representable.
- Accessibility labels and post-run explanation exist for objective status.

### EXP-013 — Build HF-03 Core Breach and Furnace Regent

**Priority:** P1  
**Owner:** Gameplay engineering + boss design  
**Depends on:** EXP-011, EXP-012

Implement extraction escalation, rotating extraction lanes, mini-boss gate, and three-phase boss.

**Acceptance criteria**

- Each boss phase has a distinct telegraph and counterplay.
- All six plane archetypes can defeat the boss in principle; no single plane is mandatory.
- Extraction banking versus multiplier risk is explicit.
- Boss state is deterministic and covered by golden tests.

### EXP-014 — Implement six plane prototypes

**Priority:** P1  
**Owner:** Combat engineering  
**Depends on:** EXP-009, EXP-011

Implement the six planes one at a time, beginning with Aegis Warden and Vesper.

**Acceptance criteria**

- Every plane passes the shared movement, firing, damage, ability, and score contracts.
- Plane ability has a keyboard, touch, assistive, and reduced-motion path.
- No ability double-fires under pointer, keyboard, or assistive activation.
- Plane balance report includes stage win rate, score distribution, and failure reasons.

## 4. Phase 3 — Daily mission and competition beta

### EXP-015 — Generate versioned Daily packages

**Priority:** P1  
**Owner:** Backend/content systems  
**Depends on:** EXP-003, EXP-006, EXP-008

Define a Daily package with date, seed, ruleset, content version, stage, modifier, three missions, allowed planes, and verification policy.

**Acceptance criteria**

- Same package produces same encounter rules for all clients.
- A package is immutable once published, or has an explicit superseding version.
- Time-zone behavior is documented.
- A future Daily can be previewed without making it live.

### EXP-016 — Implement mission tracking and result explanation

**Priority:** P1  
**Owner:** Gameplay UI  
**Depends on:** EXP-015

Track mission progress and explain completion, failure, and reward state.

**Acceptance criteria**

- Mission progress is visible during play or in the immediate result.
- Guest players can play and complete missions locally.
- Posting a score is the only account-gated action.
- Mission rewards cannot grant ranked combat power.

### EXP-017 — Add challenge links and share cards

**Priority:** P1  
**Owner:** Product + web UI  
**Depends on:** EXP-015

Create a mobile-friendly result card and “Beat this run” challenge route.

**Acceptance criteria**

- A recipient can start the challenge without account creation.
- Share card includes seed/challenge ID, plane, score, wave/time, graze, combo, and verification state.
- Clipboard and native share paths both work where supported.
- The challenge route survives direct navigation and refresh.

### EXP-018 — Implement replay verification prototype

**Priority:** P1  
**Owner:** Backend + simulation engineering  
**Depends on:** EXP-003, EXP-011

Build a server or trusted worker re-simulation path for Daily scores.

**Acceptance criteria**

- Server output is generated from seed plus input stream, not client score.
- Ruleset/content mismatch is rejected.
- Verification result is immutable and auditable.
- Existing bounds-checked boards remain clearly labelled during migration.

## 5. Phase 4 — measurement and release gate

### EXP-019 — Run Heliox balance and readability pass

**Priority:** P1  
**Owner:** Design + QA  
**Depends on:** EXP-011, EXP-012, EXP-013, EXP-014

Use playtest data and simulation distributions to tune heat, convoy integrity, boss windows, plane budgets, and score multipliers.

**Acceptance criteria**

- No stage has a dominant single strategy unless intentionally labelled.
- New players understand the primary rule after one stage.
- Expert players identify at least one high-risk/high-reward route.
- No mobile device class falls outside the performance budget.

### EXP-020 — Vertical slice human validation

**Priority:** P0 release gate  
**Owner:** Product  
**Depends on:** EXP-005, EXP-019

Run the agreed 20-player study and decide whether Heliox proceeds to full production.

**Acceptance criteria**

- At least 20 players complete the test protocol.
- Results include first-action, first-stage completion, second-run intent, comprehension, fairness, and share intent.
- Findings are segmented by device and experience.
- Product decision is recorded: proceed, revise, or stop.

## 6. Technical and QA acceptance checklist

### Determinism and simulation

- [ ] New scored math uses the run-seeded RNG only.
- [ ] Cosmetic FX use the separate non-scoring stream.
- [ ] Same seed + same inputs produces the same score and result state.
- [ ] Fixed-step accumulator ceiling remains intact.
- [ ] New hazards, objectives, abilities, and bosses have invariant tests.
- [ ] Golden replay fixtures cover normal, edge, and failure paths.
- [ ] Practice/rush rules do not leak into verified Daily rules.

### Content integrity

- [ ] Every ID validates against `content-schema.json`.
- [ ] Duplicate IDs and missing references fail before runtime.
- [ ] Every encounter has a telegraph and a readable counterplay.
- [ ] Every stage has a clear objective and result state.
- [ ] Daily packages are immutable/versioned.
- [ ] Mission text exactly matches tracking behavior.

### Load and architecture

- [ ] `file://` play boots.
- [ ] Classic-script order is unchanged.
- [ ] Modules remain load-time pure.
- [ ] `deadscan.js --check` passes.
- [ ] No runtime npm dependency is introduced.
- [ ] Service-worker cache generation is bumped for payload changes.
- [ ] Portal build and static deployment payload remain valid.

### Input and accessibility

- [ ] Keyboard activation fires abilities exactly once.
- [ ] Pointer/touch activation fires abilities exactly once.
- [ ] Assistive activation works without pointerdown.
- [ ] Touch controls remain at least 44px.
- [ ] Focus order is logical in stage, mission, result, and share surfaces.
- [ ] Reduced-motion mode preserves gameplay state communication.
- [ ] High-contrast and color-blind palettes preserve threat/objective distinction.
- [ ] Screen-reader labels expose canvas purpose, stage state, mission state, and result state.

### Performance

- [ ] Desktop target is 60fps.
- [ ] Supported mobile minimum is agreed and measured, with 30fps as the hard floor for the slice.
- [ ] Entity and particle counts remain within system budgets.
- [ ] Backdrop bake is keyed and never repeated unnecessarily.
- [ ] DPR clamp and auto-quality remain active.
- [ ] Heat, convoy, and boss effects do not create uncontrolled fill or particle growth.
- [ ] Real-device thermal test is completed on at least one Android and one iOS device.

### Competition and security

- [ ] Client never chooses the authoritative score.
- [ ] Verification status is explicit in API, UI, and share cards.
- [ ] Challenge URLs validate allowed IDs and versions.
- [ ] Board writes remain RPC-only and rate-limited.
- [ ] Callsign and share metadata are escaped and allowlisted.
- [ ] Replay payload limits prevent oversized or abusive submissions.
- [ ] Top tournament scores receive manual review or replay verification.
- [ ] No secret/service-role key ships to the client.

### Product and release

- [ ] Human playtest results are recorded.
- [ ] Funnel events are versioned and privacy-reviewed.
- [ ] Daily participation, retry, share, and challenge conversion are measurable.
- [ ] The result screen explains why the run ended and what to try next.
- [ ] A rollback path exists for a bad Daily package or content version.
- [ ] Press/creator assets are generated from the actual released build.
- [ ] Release notes state whether scores are bounds-checked or verified.

## 7. Definition of done for gameplay coding start

Gameplay coding may begin only after EXP-001 through EXP-005 are approved, the schema is reviewed, the Heliox three-stage brief is signed off, the replay/verification status language is accepted, and the QA checklist has named owners. The first code milestone must be a framework seam and validation harness—not a large batch of enemies or art.
