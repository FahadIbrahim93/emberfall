# Human playtest protocol — Heliox vertical slice

**Status:** M0 deliverable for EXP-005 (issue #58). Prepared for the M5 gate (EXP-020). The protocol is authored now; **recruiting and running 20 humans is human work** — the M5 decision records `proceed / revise / stop`.

## 1. What we are testing

The Heliox Forge vertical slice (HF-01 Solar Intake, HF-02 Foundry Convoy, HF-03 Core Breach + Furnace Regent) built to the locked brief (`HELIOX_FORGE_BRIEF.md`). Success gate = bible §12's slice definition, measured by people, not sim numbers.

**Primary question:** after HF-01, do players *understand and choose to chase* the heat rule — and do they want to run it again?

## 2. Participants (n = 20)

| Segment | n | Note |
|---|---|---|
| Arcade-experienced desktop | 6 | plays shmups/arcade/spacern shooters monthly or more |
| Casual desktop | 6 | games sometimes, no arcade genre history |
| Android touch | 4 | at least 1 low-end Android (≤4GB RAM) |
| iOS touch | 2 | at least 1 older phone model |
| Low-end hardware extra | 2 | desktop or mobile, weakest device available |

Recruitment: friends/community/local game jams; no compensation requirement beyond thanks. Per bible Pillar D the test board is `local` — nobody's score leaves the device.

## 3. Sessions

### 3.1 Moderated (targets: all 20)

One 25-minute session per participant, screen-recorded (with consent):

| Phase | Minutes | What observer records |
|---|---|---|
| Setup | 3 | nothing — plain launch, no hints |
| cold play HF-01 | 8 | **time to first deliberate heat-route**; actions narratable; comments verbatim |
| question check-in | 2 | comprehension quiz (§4) |
| free play HF-02 + HF-03 | 10 | correct mechanic use, death-cause reads, convoy decisions, lane banking |
| exit survey | 2 | replay intent, fairness, share intent (§4 scale) |

Script rules: no steering except clarifying controls; note first-answer, not discussed-answer for every quiz.

### 3.2 Unmoderated fallback

For participants who cannot sit live: a build link + the same exit survey + voluntarily recorded gameplay. Unmoderated sessions count only if they complete ≥2 stages and both surveys.

## 4. Instruments

### 4.1 Comprehension quiz (after HF-01)

1. "Show me where you'd stand to raise your score multiplier, and tell me why." (heat zones; graze rule)
2. "What happens if the heat bar stays past 100?" (burns one hull)
3. "How did you escape the last wave?" (free recall — looks for any mention of vent routing)

Scored: pass/pass/recall. Comprehension gate = ≥60% pass rate on #1 and #2 combined for casuals, ≥85% overall.

### 4.2 Instruments for the exit survey

5-point scale, one answer each (record per segment):

- second-run intent: "I want to run Heliox again for a better score."
- fairness: "When I died, I understood why."
- share intent: "I would post this / share this run result."
- difficulty curve: "The stages got more comfortable as I played." (reverse-scored, tuned copy)
- comprehension check: "I can explain the heat rule to another player."

Observed behavior echoes: actual second runs during the session (does the player self-select a second run before being asked?), and an asked-but-not-instrumented share probe.

## 5. Evidence and reporting rules

- Every finding cites **observed evidence** (timestamped-video moments, verbatim quotes, action counts, survey rows). A claim without evidence is not recorded.
- The findings doc is written per-segment before the aggregate report, with bias flags noted (bring-a-friend bias, etc.).
- Failures are captured as fixable items: any stage in which ≥40% of its deaths happen where the player does not understand the mechanic → the stage brief's "failure read" fails and EXP-019 owns the fix.
- Measurement of "player stopped where": telemetry (EXP-004, behind its contract) + records.

## 6. Gate rule for EXP-020 (M5)

| Metric | Proceed | Revise | Stop signal |
|---|---|---|---|
| replay intent (≥4/5) | ≥70% overall, no segment <50% | 50–70% | any segment <50% |
| heat comprehension (quiz #1+#2) | ≥85% pass overall | 60–85% | casuals <60% |
| fairness (≥4/5) | ≥75% | 60–75% | any knowledge gap: ≥40% unexplained deaths |
| share intent (≥4/5) | ≥55% | 30–55% | <30% |
| actual self-selected second run | ≥60% of desktop sessions | 40–60% | <40% |

`proceed` → M6/M7 pipeline authorized. `revise` → named fixes recycle at M2 (per-stage-fix list against the stage briefs; re-run only the failing probes). `stop` signal → any single stop-signal row, or the decision that the slice needs redesign — the plan returns to M0 with what was learned.

The decision (**proceed / revise / stop**) is recorded as a dated note in `IMPLEMENTATION_BACKLOG.md`'s EXP-020 entry — a decision, not a vibe.
