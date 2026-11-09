# Emberfall expansion — content vocabulary

**Status:** M0 deliverable for EXP-001 (issue #57). Approved here = the vocabulary for all expansion content.
**Validates against:** `content-schema.json` (`expansion-content-v1`).
**Rule taken from the backlog:** IDs are stable, lower-kebab, never display labels; leaderboard/persistence keys use IDs only.

## 1. ID rules

1. IDs match the schema pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 2–64 chars.
2. IDs are stable forever. If a concept is replaced, it gets a **new** ID; the old ID is retired, never re-purposed (deprecation policy, §4).
3. **Namespace prefixes** for expansion content, to never collide with the shipped Solar Tour catalog (`mercury`, `venus`, … world ids; `vesper`, `halcyon`, `atlas`, `wraith`, `seraph` hull ids; the shipped hazard names `flare`, `cloudbank`, `storm`, `gravity`, `frost`, `haze`):
   - `hf-…` Heliox Forge, `nr-…` Noxara Rift, `cv-…` Cryovale, `va-…` Verdant Abyss.
   - Shipped content keeps its ids as-is; only its *systems/planes* receive new expansion-category ids below.
4. ids must be unique **across all namespaces and all shipped tables**. The EXP-006 validator enforces cross-table uniqueness.
5. Display names are free text; only the id is persisted or sent to boards.

## 2. Collision decisions (locked)

| Collision | Decision |
|---|---|
| Bible plane "Vesper" vs shipped hull `VESPER-01` (`HULLS.vesper`) | Plane renamed: id **`kestrel`**, display **KESTREL**. The VESPER-01 hull keeps its id and name. |
| Noxara's gravity-verb hazard vs shipped hazard `gravity` (Jupiter, Kuiper Gate) | New hazards get their own ids: **`nr-wells`** (gravity wells) and **`nr-rifts`** (timed rift corridors). They must read differently from the shipped magnet-field `gravity` hazard (Noxara wells pull movement with visible outlines and timed entry/exit instead of the shipped hazard's static arena pull). |

## 3. Canonical ID registry

### 3.1 Systems

| id | Display | Verb | Status |
|---|---|---|---|
| `emberfall-prime` | Emberfall Prime | survive | shipped baseline (governs what the 8 shipped worlds are heroic about) |
| `heliox-forge` | Heliox Forge | overheat | M2–M6 |
| `noxara-rift` | Noxara Rift | bend | M7 |
| `cryovale` | Cryovale | momentum | M8 |
| `verdant-abyss` | Verdant Abyss | mutate | M9 |

### 3.2 Planets

| id | System | Display | Status |
|---|---|---|---|
| `heliox-forge-prime` | heliox-forge | Foundry Ring (name tunable in the system brief) | M2–M6 |
| `noxara-rift-prime` | noxara-rift | TBD at M7 brief | M7 |
| `cryovale-prime` | cryovale | TBD at M8 brief | M8 |
| `verdant-abyss-prime` | verdant-abyss | TBD at M9 brief | M9 |

Mastery variants extend a stage with `-mastery` suffix reserved ids (`hf-03-core-breach-mastery`, …), registered when that stage's brief is approved.

### 3.3 Stages (Heliox locked; others drafted at their briefs)

| id | Display | Mode | Status |
|---|---|---|---|
| `hf-01-solar-intake` | Solar Intake | survival | M2 (brief locked) |
| `hf-02-foundry-convoy` | Foundry Convoy | convoy | M2 (brief locked) |
| `hf-03-core-breach` | Core Breach | extraction + boss | M2 (brief locked) |
| `hf-04-sabotage-hunt` | Sabotage Hunt (provisional) | hunt | M6 (brief pending) |
| `hf-05-meltdown-cycle` | Meltdown Cycle (provisional) | hazard | M6 |
| `hf-06-full-foundry-run` | Full Foundry Run (provisional) | relay → extraction | M6 |
| `nr-01…nr-06` | TBD at M7 brief | TBD | M7 |
| `cv-01…cv-06` | TBD at M8 brief | TBD | M8 |
| `va-01…va-06` | TBD at M9 brief | TBD | M9 |

### 3.4 Hazards

| id | System | Note |
|---|---|---|
| `flare`, `cloudbank`, `storm`, `gravity`, `frost`, `haze` | shipped | existing world hazards, unchanged |
| `hf-heat-vents` | heliox-forge | solar vent pulses; the HF-01 mechanic |
| `nr-wells` | noxara-rift | gravity wells — decided distinct from shipped `gravity` (§2) |
| `nr-rifts` | noxara-rift | timed rift entry/exit corridors |
| `cv-ice-drift` | cryovale | preserved drift + friction model |
| `va-spore-growth` | verdant-abyss | living routes opening/closing (seeded) |

### 3.5 Enemy families (set ids)

| id | System | Status |
|---|---|---|
| `hf-forge-caste` | heliox-forge | drones, hounds, smelters (individual foe ids land in content data with the M2 sim work) |
| `nr-rift-caste` | noxara-rift | provisional at M7 |
| `cv-cryo-caste` | cryovale | provisional at M8 |
| `va-spore-caste` | verdant-abyss | provisional at M9 |

### 3.6 Bosses and mini-bosses

| id | Display | System | Status |
|---|---|---|---|
| `furnace-regent` | The Furnace Regent | heliox-forge | **locked** in the HF-03 brief |
| `hf-smelter-warden` | Smelter Warden (mini-boss) | heliox-forge | **locked** in HF-02/HF-03 briefs |
| `nr-terminator` | Rift Terminator (draft) | noxara-rift | M7 brief |
| `cv-glacier-sovereign` | Glacier Sovereign (draft) | cryovale | M8 brief |
| `va-abyss-bloom` | Abyss Bloom (draft) | verdant-abyss | M9 brief |
| `nr-…`, `cv-…`, `va-…` mini-bosses | TBD | TBD | system briefs |

### 3.7 Planes

| id | Display | Role | Status |
|---|---|---|---|
| `aegis-warden` | Aegis Warden | defensive-control | M0 vocabulary |
| `kestrel` | KESTREL (was "Vesper") | precision-assassin | M0 vocabulary |
| `helix` | Helix | drone-control | M0 vocabulary |
| `arclight` | Arclight | chain-reaction | M0 vocabulary |
| `nullwing` | Nullwing | phase-mobility | M0 vocabulary |
| `pioneer` | Pioneer | objective-specialist | M0 vocabulary |

Shipped hulls (`vesper`, `halcyon`, `atlas`, `wraith`, `seraph`) keep their ids; plane ids live in their own namespace and must never be used as hull keys.

### 3.8 Mission classes and modifier families

| id | Group | Status |
|---|---|---|
| `msn-survival`, `msn-precision`, `msn-priority`, `msn-protection`, `msn-efficiency`, `msn-restriction`, `msn-exploration` | mission classes (bible §8) | locked |
| `fam-heat`, `fam-bend`, `fam-drift`, `fam-mutate` | daily modifier families, one per system | family ids locked; individual modifiers named with Daily packages (EXP-015) |

### 3.9 Objectives

| id | System | Status |
|---|---|---|
| `obj-convoy-module` | heliox-forge | locked (HF-02) |
| `obj-volatile-core` | heliox-forge | locked (HF-03) |
| `obj-marked-target` | generic (hunt stages) | locked |
| `obj-checkpoint` | generic (relay stages) | locked |
| `obj-repair-pickup` | heliox-forge | locked (HF-02) |
| later system objectives | `nr-obj-…`, `cv-obj-…`, `va-obj-…` | registered at their briefs |

## 4. Version semantics and deprecation policy

- **`schemaVersion`** stays `expansion-content-v1`. Additive field changes bump only the registry docs; making an id/type/field *different* requires a new `expansion-content-v2` schema file plus a migration note — never a silent edit.
- **Per-system `version`** (schema `solarSystem.version`): starts at 1; incremented with any stage/rule change a player could perceive; Daily packages pin the version they accept (`rulesetVersion`, `contentVersion` per schema).
- **Deprecation:** an id is marked `status: retired` in this doc, keeps its last-known content version, and any still-referencing content **fails the EXP-006 validator** — the fix is new ids, not renames. Renames in live data are treated as corruption by the sim goldens (same discipline as today's parity tests).
- **Superseded Daily packages** are never mutated: a new `dailyId` (date + version suffix if needed) replaces them in rotation (EXP-015).

## 5. Validator contract (what EXP-006 checks against this file)

- Every id used by any content object must appear in this registry (or be added with its brief in the same PR).
- Cross-table uniqueness (stage ids, hazard ids, foe set ids, plane ids).
- No bare display strings inside `*Id` fields (schema pattern enforces casing; the validator catches reuse).
- A reference to a retired id fails with the path of the referencing object.

New content enters this registry through its design brief PR — a stage, hazard, foe set, boss, plane or modifier is not "shippable content" until it has an id here.
