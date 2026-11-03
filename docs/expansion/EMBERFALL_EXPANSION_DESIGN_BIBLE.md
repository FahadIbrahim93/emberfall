# Emberfall Gameplay Expansion Design Bible

**Status:** Planning only — no gameplay runtime changes are authorized by this document.  
**Version:** 1.0  
**Target slice:** Heliox Forge vertical slice  
**Existing runtime constraints:** classic scripts, no bundler, `file://` play, deterministic scored simulation, Supabase accounts/boards, bounds-checked rather than replay-verified scores. Current codebase constraints that gate any implementation are documented in `REALTIES.md`; gameplay implementation is not authorized by this document until Phase 0 (EXP-001–EXP-005) is approved **and** the monolith/`packages/sim`/typecheck situation has a real plan.

## 1. North-star fantasy

> Fly dangerously close to destruction, master the rules of hostile worlds, and prove your skill in a shared daily score attack.

Emberfall should remain a short-session, high-mastery cosmic arcade game. Expansion content must deepen decisions rather than turn the game into a menu-heavy content catalogue.

Every new system, planet, stage, plane, mission, and boss must answer three questions:

1. **What new decision does this create?**
2. **What is the player risking to gain?**
3. **How can another player understand, compare, or challenge this performance?**

If an addition cannot answer all three, it is not core expansion content.

## 2. Product pillars

### Pillar A — Close-call mastery

Near-misses, graze chains, combo preservation, and deliberate risk remain the signature. New systems may change how risk is expressed, but they must not replace this identity with passive upgrades or bullet-volume spectacle.

### Pillar B — Every world changes the rules

A solar system is not a background pack. Each system owns a gameplay verb:

| System | Primary verb | Player question |
|---|---|---|
| Emberfall Prime | Survive | Can I control the baseline combat loop? |
| Heliox Forge | Overheat | How much power can I extract before the arena burns me? |
| Noxara Rift | Bend | Can I route my movement through hostile gravity? |
| Cryovale | Momentum | Can I turn drift into control? |
| Verdant Abyss | Mutate | Which threats must I kill now before they evolve? |

### Pillar C — Short runs, deep mastery

Standard stages target 90–150 seconds. Daily missions target 2–5 minutes. A player should be able to learn one mechanic in a single session and spend many sessions optimizing it.

### Pillar D — Competitive clarity

Scores must be comparable only when the seed, content version, rules, plane restrictions, and verification status are clear. “Verified” is reserved for server re-simulation from seed plus inputs; current bounds-checked scores must not be relabeled.

### Pillar E — Readability before spectacle

Threats, bullets, objectives, hazards, and score opportunities must remain readable at mobile resolution and under reduced-motion settings. Visual intensity is not allowed to obscure the decision that caused success or failure.

## 3. World architecture

```text
Solar system
  └── Planet
        └── Stage
              └── Encounter sequence
                    ├── enemies
                    ├── hazards
                    ├── objective
                    ├── modifiers
                    ├── elite / mini-boss
                    └── boss or extraction event
```

### System contract

Each system must provide:

- one primary gameplay verb;
- one signature hazard;
- one enemy family;
- one mini-boss rule;
- one final boss rule;
- one palette and material language;
- one audio motif;
- one daily modifier family;
- one creator-friendly visual moment;
- one mobile performance budget.

### Planet contract

Each planet contains a six-stage authored route plus optional mastery variants:

1. introduce the planet rule safely;
2. combine the rule with known enemies;
3. add a tactical decision;
4. escalate pressure and add a route or objective choice;
5. deliver a mini-boss or high-stakes objective;
6. resolve with a boss or extraction event;
7. optional mastery variant after the base route is proven.

## 4. Planned systems

### Emberfall Prime — baseline system

Role: onboarding and reference rules.

- classic movement, firing, dashing, pulse, graze, and combo loop;
- no new system-wide hazard;
- used as the balance reference for planes and score comparisons.

### Heliox Forge — first production slice

Fantasy: an industrial solar foundry orbiting an unstable star.

Gameplay verb: **overheat**.

Rules:

- heat zones charge weapons and score multipliers;
- staying in heat too long causes heat damage or system instability;
- solar vents pulse on a readable cadence;
- certain enemies become more aggressive when overheated;
- the player chooses whether to bank a safe score or chase a hotter multiplier.

Visual language:

- orange-white stellar glare;
- blackened metal silhouettes;
- molten seams and orbital machinery;
- heat shimmer only at controlled, non-gameplay-obscuring intensity.

Signature moment: the star flares behind a collapsing foundry ring while the player chooses an extraction lane.

### Noxara Rift — prototype only after Heliox validation

Gameplay verb: **bend**.

- gravity wells alter movement vectors;
- rifts create timed entry and exit points;
- projectile paths may curve in marked zones;
- route choice is more important than raw enemy count.

### Cryovale — concept

Gameplay verb: **momentum**.

- ice fields preserve drift;
- turning becomes a resource;
- frozen targets shatter into secondary threats;
- safe stopping is difficult but predictable.

### Verdant Abyss — concept

Gameplay verb: **mutate**.

- ignored enemies evolve into more dangerous forms;
- living routes grow or close;
- target priority becomes the central skill;
- visual beauty must never hide bullet readability.

## 5. Stage taxonomy

A stage must have one dominant mode, one secondary complication, and one clear result state.

### Survival

Escalating waves, combo preservation, resource management, and a final escalation. This is the baseline mode.

### Convoy

Protect a moving objective. Players can leave the convoy to intercept a threat, but objective integrity affects rewards and the final encounter.

### Hunt

Locate and destroy a high-value target among decoys and support threats. The target should change location or behavior based on player choices.

### Hazard

The arena is the main enemy. Enemy density is lower, but timing, routing, and hazard reading are more demanding.

### Relay

Reach timed checkpoints with route choices and optional score gates. Combat supports movement rather than replacing it.

### Extraction

Collect a valuable objective, then survive a changed escape route. The player chooses when to bank the run versus risk a higher multiplier.

### Boss

A dedicated encounter with readable phases, one memorable rule, environmental interaction, and a clearly signposted mastery opportunity.

## 6. Heliox Forge three-stage vertical slice

The vertical slice is deliberately small. It must prove the system verb, one new enemy family, one hazard family, one plane identity, one competitive mission, and one satisfying resolution before more planets are built.

### Stage HF-01 — Solar Intake

**Mode:** Survival  
**Purpose:** Teach heat as opportunity and danger.  
**Target duration:** 90–120 seconds.

Encounter arc:

1. safe opening with one marked heat vent;
2. basic forge drones enter outside the vent lane;
3. player can graze near the vent for a temporary score multiplier;
4. vent pulses become more frequent;
5. first heat-seeking enemy appears with a clear telegraph;
6. extraction gate closes after the final wave.

Success criteria:

- first-time players understand that heat increases reward before taking lethal heat damage;
- experienced players can intentionally route through heat for score;
- the screen remains readable during the maximum multiplier state.

### Stage HF-02 — Foundry Convoy

**Mode:** Convoy  
**Purpose:** Introduce protection, target priority, and partial failure.  
**Target duration:** 120–150 seconds.

Encounter arc:

1. convoy enters with three modules;
2. forge drones attack from lanes with clear threat priority;
3. solar vents cut across the convoy route;
4. optional repair pickups appear in risk zones;
5. an elite smelter enemy locks onto the convoy until interrupted;
6. convoy integrity determines the final score multiplier and extraction route.

Success criteria:

- saving the convoy and chasing personal score create a real decision;
- losing one module is recoverable and understandable;
- the player receives a precise post-run explanation of objective performance.

### Stage HF-03 — Core Breach

**Mode:** Extraction / boss  
**Purpose:** Deliver the vertical slice climax and prove the system’s signature spectacle.  
**Target duration:** 150–210 seconds.

Encounter arc:

1. player enters the foundry core and collects a volatile core;
2. heat level rises continuously while carrying it;
3. extraction lanes rotate between two readable choices;
4. mini-boss seals one lane and creates a close-call opportunity;
5. player chooses to bank at a safe route or continue for a higher multiplier;
6. boss, **The Furnace Regent**, enters for three phases;
7. successful extraction resolves the run with a score breakdown.

Boss rule:

> The Furnace Regent alternates between cooling armor and exposed reactor windows; heat zones make the reactor vulnerable but also damage the player.

Success criteria:

- the boss rule is understandable without reading a wiki;
- phase changes are communicated by animation, audio, and HUD state;
- the high-score route is visibly riskier, not secretly more efficient;
- the boss can be defeated by every viable plane archetype.

## 7. First six new planes

New planes are sidegrades with distinct decision profiles. None may become a mandatory best-in-slot choice for all modes.

| Plane | Role | Strength | Weakness | Signature ability | Best expression |
|---|---|---|---|---|---|
| Aegis Warden | Defensive control | shield stability and convoy protection | lower peak multiplier | converts successful near-misses into brief armor | survive objective stages without abandoning the convoy |
| Vesper | Precision assassin | target burst and dash response | low health and low error tolerance | marks a target; marked destruction refunds a dash fragment | Hunt and boss phase optimization |
| Helix | Drone control | swarm management and lane denial | weaker direct fire | deploys orbiting drones with a limited energy budget | Survival and hazard routing |
| Arclight | Chain reaction | efficient crowd clearing | reduced single-target boss damage | projectile chains across marked enemies | combo maintenance and route planning |
| Nullwing | Phase mobility | hazard traversal and emergency escape | low pulse capacity | short phase shift with strict cooldown timing | expert hazard and extraction play |
| Pioneer | Objective specialist | convoy, relay, and extraction efficiency | lower pure combat output | stabilizes or repairs an objective at personal resource cost | objective mastery and team-like solo play |

### Plane acceptance principles

Every plane must have:

- a silhouette readable at 32px equivalent width;
- a one-sentence tutorial explanation;
- one strength and one weakness visible in the hangar;
- at least two viable stage types;
- a score strategy that rewards skill rather than grind;
- a reduced-motion-safe ability presentation;
- a deterministic simulation implementation;
- no hidden economy multiplier that changes board comparability.

## 8. Daily mission system

Each day produces a deterministic, versioned challenge.

### Daily package

- one seed;
- one stage or stage sequence;
- one primary modifier;
- three optional missions;
- one leaderboard identity;
- one shareable result card;
- one newcomer-safe lane and one expert lane when difficulty requires it.

### Mission classes

| Class | Example | Measures |
|---|---|---|
| Survival | finish without Pulse | resource discipline |
| Precision | perform 12 successful grazes | risk control |
| Priority | destroy three marked elites | target selection |
| Protection | finish with all convoy modules | objective awareness |
| Efficiency | defeat the boss within a time band | execution |
| Restriction | use a named plane or weapon family | mastery breadth |
| Exploration | reach an optional score gate | route courage |

### Daily mission rules

- mission text must describe the condition precisely;
- mission progress must be visible during or immediately after the run;
- missions must be deterministic from the Daily package;
- missing a day must never permanently destroy a monthly reward path;
- mission rewards are cosmetic, prestige, or profile identity—not ranked combat power;
- the Daily must remain playable without an account; posting requires account identity.

## 9. Competition and sharing

### Leaderboard tiers

1. **Local / practice:** no submission and no competitive claim.
2. **Public bounds-checked:** current system behavior; clearly labelled as bounds-checked.
3. **Verified Daily:** reserved for server re-simulation from seed plus inputs.
4. **Tournament:** verified replay, fixed rules, manual review for top placements.

### Share card contract

A completed Daily result should expose:

- pilot callsign or “Guest Pilot”;
- system, planet, stage, and Daily ID;
- plane;
- score;
- wave or completion time;
- graze count;
- peak combo;
- objective integrity where relevant;
- percentile or rank only when calculated from the same ruleset;
- verification status;
- “Beat this run” challenge URL.

No share card may imply a score is verified when it was only bounds-checked.

## 10. Visual and audio direction

Every system receives one palette, one material language, one hazard silhouette family, one boss silhouette, one audio motif, and one screenshot-worthy climax. Background spectacle must yield to bullets, objectives, and hazard telegraphs. The existing performance budget is a design input: backdrop bakes are expensive, sky work is keyed, DPR is clamped, and auto-quality must remain the safety net.

## 11. Expansion anti-goals

Do not:

- ship multiple systems before one system proves replay value;
- add generic procedural stages with no authored decision;
- make new planes strictly stronger;
- use random punishment instead of readable rules;
- introduce a new currency for every system;
- call a score verified before replay re-simulation exists;
- let particle density hide threats;
- break file:// play, classic-script load order, or the no-runtime-dependency contract.

## 12. Definition of a successful first slice

Heliox Forge is ready for broader production only when:

- new players can explain heat risk after one stage;
- each of its three stages creates a different decision;
- all six planned planes are not required to access or win the slice;
- the Daily mission can be replayed deterministically;
- result sharing works on a mobile browser;
- simulation, browser, self-test, accessibility, and performance gates pass;
- at least 20 human playtesters choose to replay without being prompted;
- stage-level analytics can show where players stop and why.
