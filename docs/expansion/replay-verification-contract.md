# Deterministic replay & verification contract

**Status:** M0 deliverable for EXP-003 (issue #56). Defines the vocabulary ($1), payloads (§3), and rejection rules (§4) the M4 replay-verification prototype (EXP-018) will implement. It changes **no** current behavior: shipped boards stay exactly what they are today (bounds-checked, rate-limited — the honest state documented in `SECURITY.md`).
**Companion:** `REALITIES.md` §4 — verification is forward-looking; the UI vocabulary rules in this doc apply from the day this doc exists, however (§1).

## 1. Verification states (vocabulary)

| State | Meaning | Who may apply it | UI label |
|---|---|---|---|
| `local` | Device-only run; never posted | client on device | "Local run" |
| `bounds-checked` | Posted run validated by server-side bounds + rate limits, **not** re-simulated | server (existing `submit_score` RPC behavior) | "Bounds-checked" (always paired with the explanation "not replayed") |
| `replay-verified` | Server re-simulated the run from seed + input stream and reproduced the score and result state bit-identically | server, only when a completed verification record exists | "Replay-verified" |
| `tournament-reviewed` | replay-verified **and** a human reviewer accepted the record for a fixed-rules event | manual review process | "Tournament-reviewed" |

**Inviolable rules:**

1. Softer states do **not** get harder labels. A bounds-checked score may never display as "verified", "authentic", "validated" or equivalent (bible Pillar D; REALITIES §4). "Confirmed" is also forbidden unless the server state was `replay-verified` or `tournament-reviewed`.
2. Verification happens only server-side, re-simulating from `seed + inputs`. The client never chooses the authoritative score; it may submit *evidence*.
3. Existing endless/school/daily boards remain `bounds-checked` and labeled that way in UI and API responses, until their per-tier migration (behind the M4 work) actually ships.

Unlabeled boards are a **bug**: every new board/UI surface must carry at least the least-honest applicable label ("bounds-checked") before it goes live.

## 2. Ruleset and content versions

Every score claim binds these fields:

| Field | Source | Note |
|---|---|---|
| `seed` | run start (fixed-step RNG source) | 0 … 4294967295 |
| `rulesetVersion` | game ruleset integers (scoring/combat AI state version) | monotonically increasing; a mismatch invalidates |
| `contentVersion` | expansion content version pinned by the stage/daily package | Daily packages pin both, per schema `dailyPackage` |
| `inputFormatVersion` | input recording format version (§3.1) | monotonically increasing |
| `fixedStep` | sim step | must equal the shipped `STEP` constant (1/60s); the accumulator ceiling behavior remains unchanged |
| `verificationStatus` | server state (§1) | not client-chosen |

## 3. Replay wire format

### 3.1 Input recording (`inputFormatVersion: 1`)

The game records a fixed-step stream: for each sim step where *anything* changed, a record

```jsonc
{ "step": 412, "move": [48, 255], "keys": ["F", "P"] }
```

- `move`: quantized 0–255 each of dx / dy (closed when unchanged since prior record — a sparse stream, no per-step padding).
- `keys`: press events only, from a closed allowlist `F` (fire), `D` (dash), `B` (pulse), `A` (plane ability), `R` (bank/carry switch); the allowlist is itself part of the format version.
- The client-side recorder runs behind a feature flag (M4), never writes to disk silently, and caps total recorded size (config-driven; MAX ~250KB → ~50k change records, enough for a 10-minute run).

### 3.2 Digest

Input digest = SHA-256 hex, lowercase, over the canonical serialized form of the input stream (records joined by `\n`, big-endian quantized bytes, no whitespace). The digest is announced to the rounds API to detect truncated uploads; the verifier recomputes it from the full payload.

### 3.3 Replay payload

```jsonc
{
  "seed": 2570249431,
  "rulesetVersion": 2,
  "contentVersion": 3,
  "inputFormatVersion": 1,
  "fixedStep": 0.016667,
  "stageId": "hf-01-solar-intake",
  "planeId": "kestrel",
  "dailyId": "2026-11-03",        // optional: daily package rounds
  "input": { "digest": "a3f…", "count": 18322, "bytes": 217530 },
  "claimedScore": 1484320
}
```

Transport: submitted with the rounds through a `submit_daily_replay` RPC (M4 prototype; writes stay RPC-only and rate-limited like score posts; **payload size cap enforced** — oversized or garbage submissions take 413/rejection code `INVALID_PAYLOAD`).

## 4. Verification / rejection rules (server-side, M4)

The verifier re-runs the shipped sim ruleset for `stageId` on `seed` under the recorded inputs, then compares:

| Rejection | Code | Trigger |
|---|---|---|
| Mismatched seed | `RESEED_MISMATCH` | re-sim result state differs beyond a documented numerical envelope for the recorded run (checkpoint narration, item bullet) |
| Impossible content | `CONTENT_MISMATCH` | `contentVersion` not published, or retired/unknown IDs referenced (per `content-vocabulary.md` deprecation policy) |
| Wrong ruleset | `RULESET_MISMATCH` | `rulesetVersion` newer than the server's deployed ruleset binary |
| Corrupted stream | `DIGEST_MISMATCH` | recomputed digest ≠ stated digest; or malformed record / unknown key |
| Contradictory inputs | `IMPOSSIBLE_STATE` | any invariant broken: hostile state below bounds; score ∉ plausible min/max for the recorded seed; heat state outside ruleset envelope (e.g. heat > stage max with no pulse source alive); plane resources outside their budget |
| Oversized/truncated | `INVALID_PAYLOAD` | byte cap exceeded; digest length wrong; count mismatch |

### 4.1 Immutability, retention, review

- A verification decision is recorded once with `{dailyId, seed, digest, replayStatus, score, resultStateHash}` and never rewritten. Re-submission of the same digest yields the cached record, not a fresh re-sim, unless the ruleset/content version is genuinely different (then it is a different record).
- Rejections keep their reason code for 30 days for resubmission diagnosis, then aggregate data only.
- Accepted verifications retain the record indefinitely at the original versions; re-verification after a ruleset release recalculates into a **new** record, never edits the old one. Score posting status never changes retroactively (§1 rules — a score that was bounds-checked cannot become verified unless a tier migration explicitly says so).
- Tournament review: for top placements of a `tournament` tier event, a human accepts/rejects with a one-line reason; manual review **cannot** approve a `DIGEST_MISMATCH`/`IMPOSSIBLE_STATE` rejection (only the sim result decides truth).
- Privacy: replay payloads are gameplay inputs only. No system information, IP, callsign beyond the posting pilot is stored inside the payload itself.

## 5. Interim honesty (what the game says today)

Until EXP-018 ships re-simulation, **all posted scores are bounds-checked, labeled as such everywhere a score is shown** (boards, share cards, stats pages). Implementation notes for UI copy:

- A score line reads "bounds-checked (not replayed)" in a tooltip/sublabel on hover/info affordance and can be shortened to just "bounds-checked" when space is tight; "verified" is reserved for §1's harder states and may not appear.
- Share cards expose the `verificationPolicy` of their board context and may NOT carry a verified badge they didn't earn.
- Score-copy hygiene: when `tools/copyguard.js` gains expansion copy checks (M1), it must refuse the forbidden "verified" vocabulary on bounds-checked board surfaces.

## 6. Acceptance checklist for EXP-018 (the implementation)

- [ ] Server output is generated from seed + input stream, never client score.
- [ ] All §4 rejection codes fire in an integration test; digest output is byte-for-byte reproducible.
- [ ] Verification record immutable + auditable (`private` schema, SECURITY DEFINER same as today's write path).
- [ ] Board writes remain RPC-only and rate-limited; replay payload size cap enforced.
- [ ] Existing boards still labeled `bounds-checked` during the whole migration.
- [ ] UI copy meets §1/§5 rules; a copyguard check refuses "verified" vocabulary on the current board paths.
