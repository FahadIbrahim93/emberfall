# Heliox Forge human playtest protocol

**Status:** M0 deliverable for EXP-005 (issue #58). Prepared for the M5 / EXP-020 gate. This document is a protocol, **not a result**: no study has been run, no participants have been recruited, and no comprehension, fairness, replay or share claim is made until EXP-020 records real evidence.

**Design under test:** the Heliox Forge vertical slice — HF-01 Solar Intake, HF-02 Foundry Convoy, HF-03 Core Breach + The Furnace Regent — built to `HELIOX_FORGE_BRIEF.md` and `content-vocabulary.md`. The heat contract lives in the brief; this protocol tests whether players understand it, not whether its tunables are final.

**Depends on:** EXP-002 brief approval, a frozen slice build, and the EXP-004 privacy contract. If the brief, heat contract, or stage set changes, re-freeze this protocol and its materials before running the study. If the build changes mid-study, the study restarts with fresh participants.

## 0. Scope and non-claims

In scope:

- moderated and unmoderated sessions across desktop, Android touch, iOS touch and low-end hardware;
- at least 20 completed sessions, segmented by prior arcade experience;
- the four required measures: comprehension, replay intent, perceived fairness, share intent;
- evidence capture, coding and a findings report that M5 / EXP-020 can decide on.

Out of scope:

- running recruitment or the study now (human work, executed at M5);
- gameplay, balance, art or economy changes;
- a WCAG audit, a retention study, a statistical claim, or a verified-score claim;
- telemetry beyond the EXP-004 contract, third-party trackers, paid panels, new accounts, new keys or new services.

The protocol is free-tools-only and docs-only. Findings live outside the repo until they are de-identified and aggregated; the repo never contains participant names, callsigns, emails, voices, faces or account identifiers.

## 1. Questions

| ID | Question | Why it matters |
|---|---|---|
| RQ1 | After one HF-01 run, can a first-time player explain what heat does, what the warning is, and how to manage it? | The slice's core verb must be teachable without a wiki. |
| RQ2 | After the slice, do players choose another run or say they will return — without being prompted? | Replay is the point of a short-session arcade game. |
| RQ3 | Do deaths, convoy losses and boss failures read as consequences of visible rules and the player's decisions, not hidden randomness? | Perceived fairness is the difference between "hard" and "cheap". |
| RQ4 | Would players send a result to someone, and what would they send? | Sharing is the proposed social loop; intent is measurable before the feature exists. |
| RQ5 | Do these answers differ by arcade experience, input method or device class — and does low-end hardware break the experience? | A slice that only works for experts on fast desktops is not a vertical slice. |

Success is a pattern that holds across segments, not a single pooled average. Every result is reported with its denominator and segment.

## 2. The build under test

Before the first session, freeze and record:

- git commit SHA, visible version string, service-worker cache generation, and the enabled stage list;
- the build URL and whether it is hosted, `file://`, or framed;
- the heat contract values in force (HF-01/02/03), copied from the brief;
- the supported-browser/device list being tested.

Rules:

- one frozen build for the whole round; no deploys, hotfixes or live edits between sessions;
- a cold profile with no prior Emberfall storage; no account required; scores stay local;
- default settings, reduced motion off for the main run (a reduced-motion pass can be a separate, optional observation);
- no dev tools, no console, no mid-session debugging;
- if a participant uses an account, do not record the callsign, email or score; the moderator confirms the local board only;
- a technical failure that prevents play is recorded as a session failure, not as a design finding.

## 3. Participants, quotas and recruitment

### 3.1 Size

- **Minimum 20 completed sessions** for the EXP-020 analysis.
- Recruit **24–28** people to absorb no-shows; do not pad the analysis with incomplete sessions.
- A session counts only when consent is recorded, HF-01 is completed, and the exit measures are complete.
- Never replace a completed session to fit a quota, and never test the same person twice in the main round.

### 3.2 Quotas

The split mirrors the backlog's human-study matrix (6 experienced desktop + 6 casual desktop + 4 Android + 2 iOS + 2 additional low-end).

| Segment | Sessions | Moderated | Unmoderated |
|---|---:|---:|---:|
| Desktop / laptop, arcade-experienced | 6 | 4 | 2 |
| Desktop / laptop, casual or no arcade history | 6 | 3 | 3 |
| Android touch | 4 | 2 | 2 |
| iOS touch | 2 | 1 | 1 |
| Additional low-end hardware (desktop or mobile) | 2 | 1 | 1 |
| **Total** | **20** | **11** | **9** |

- "Low-end" means a device at or below 4 GB RAM or an older mid-range phone/desktop; the two additional low-end sessions must be **real devices**, not DevTools throttling. Emulation can supplement, never replace them.
- Desktop sessions should cover Chromium and Firefox; include at least one Safari session if a Mac is available. iOS sessions use Safari; Android sessions use Chrome.
- Every participant is assigned an experience segment, not just desktop rows. The desktop quotas above are fixed; for mobile, target at least two experienced and at least two casual/no-history participants across the four Android and two iOS sessions.

### 3.3 Experience screening

Ask before the session:

> How often do you play arcade games or shoot-'em-ups (games where you dodge patterns of bullets)?

| Segment | Definition |
|---|---|
| Arcade-experienced | Plays the genre monthly or more, or has 20+ hours in the last 12 months. |
| Casual | Plays games sometimes, but under 20 hours of arcade/shoot-'em-up play in the last 12 months. |
| No arcade history | Rarely or never plays the genre; may still play other games. |

Record the answer verbatim plus the category. Do not let a participant self-select "experienced" to be polite; the examples decide the category. Report per segment.

### 3.4 Recruitment

Free channels only, and only where promotion is welcome:

- the existing press-kit page and the public GitHub playtest issue form;
- the owner's community/Discord/forum contacts, local game jams or meetups;
- word of mouth from people who have not seen the brief or this protocol.

No paid ads, no purchased panels, no scraped contact lists, no cold DMs, no new accounts. Recruit explicitly for the missing device segments ("I need two iPhone players and two low-end Android players"), not just "20 people".

Offer no payment and no account. An optional "thanks" credit is allowed only with written consent. Do not trade scores, data or leaderboard placement for participation.

### 3.5 Exclusion

Exclude from the main round anyone who:

- worked on the slice, read the brief/protocol, or saw the stage designs;
- has already played the slice (they may join a later revision round, counted separately);
- is under 18 (see §7);
- cannot give informed consent.

## 4. Moderated sessions

11 of the 20 sessions are moderated. One participant, one moderator, no spectators. Remote sessions use the participant's screen share where possible.

### 4.1 Flow (40 minutes maximum)

| Minutes | Phase | What the moderator does |
|---:|---|---|
| 0–5 | Consent, screening, setup | Read the consent script, confirm 18+, device/input/experience, build SHA, recording choice. No game hints. |
| 5–10 | Baseline | "Play as you normally would. I won't help unless the controls break." Start at the title and let them find Heliox. Note time to first input and any navigation confusion. |
| 10–20 | HF-01, unaided | Note time to start, first deliberate heat route, deaths and causes, confusion moments, verbatim quotes, every help event. |
| 20–25 | Comprehension probes | Ask the §6.2 questions in order. Record the first answer; do not teach yet. |
| 25–35 | HF-02 and HF-03, free play | Note convoy module losses, repair-pickup decisions, bank-vs-carry choice, boss phase reads, deaths. |
| 35–40 | Exit measures | §6.3–§6.5, then the optional free-play observation. |

- If the participant dies twice in HF-01, end the run and move to the probes; do not coach a retry.
- If time runs short, prioritise HF-01 + probes + exit measures over HF-03; record what was skipped.
- After the exit measures, say: "The session is over; you're welcome to keep playing while I save my notes." Record whether they start another run within five minutes. Do not suggest a run, and do not count a run you suggested.

### 4.2 Moderator behaviour

- Think-aloud: "Tell me what you're noticing" or "What are you looking at?" Never "Do you see the heat bar?" or "Try going into the vent."
- Neutral probes only: "What happened there?", "What did you expect?", "Why did you choose that?" No praise for correct answers, no defence of the game, no "most players…".
- Record the first answer. "I don't know" is a valid answer.
- Help policy: controls only (which key/button, how to pause), 30 seconds maximum. Log every help event with a timestamp. A helped start does not count toward "started unaided".
- Do not explain heat, vents, banking, convoy integrity, boss phases or scoring before the exit measures. If the participant asks, say: "I'll explain after the questions; for now, play it the way you read it."
- Keep a visible clock; stop at 40 minutes even if the run is unfinished.

### 4.3 Recording

- Screen recording and audio are separately opt-in. A session with no recording is valid: notes + timestamps + verbatim quotes.
- If recording, capture the game screen and the participant's voice only; no camera, no desktop notifications, no personal files.
- Stop recording on request; delete on withdrawal.

## 5. Unmoderated sessions

9 of the 20 sessions are unmoderated. They broaden device coverage and reduce moderator bias, at the cost of weaker behavioural evidence.

### 5.1 Instructions (sent verbatim)

> Thanks for testing EMBERFALL's Heliox Forge slice. This should take about 20 minutes. Use a supported browser on the device you signed up with, and start from a fresh window. Play the Heliox stages for up to 15 minutes, then answer the questions before reading anything else. Don't look up guides or ask anyone for help. The build is frozen for this test. If something breaks, note it in the survey rather than fixing it.

Do not add explanations of heat, vents, banking or bosses. Include the build link, the device they must use, and the deadline.

### 5.2 What counts

A session counts only if the participant:

- completes HF-01 (reaches extraction or the stage's end state);
- answers every required survey item;
- reports device, input and experience;
- confirms they played the frozen build (build SHA shown on the page or in the instructions).

Sessions that fail these checks are recorded as incomplete and replaced, not silently included.

### 5.3 Instruments and evidence

- Same measures as §6, reworded for self-administration; no leading wording.
- Optional screenshot of the result screen (crop callsign/email); optional screen recording with explicit consent.
- Without a recording, label the evidence **self-report**. Do not claim observed behaviour from an unmoderated session.
- Free-text answers are kept verbatim (de-identified) for coding.
- If the existing public GitHub playtest form is used, tell participants their response is public and offer the private alternative (email the answers to the owner's published contact). Never submit a public form on someone's behalf.

## 6. Instruments

### 6.1 Screening and context

Record: age band (18–24, 25–34, 35–44, 45+), device model, OS/browser version, input (keyboard, gamepad, touch), screen size, low-end flag, experience segment, prior Emberfall exposure, reduced-motion setting, network type, build SHA, session date/method.

Do not record names, emails (unless the participant opts into the follow-up), callsigns, IP addresses or account IDs.

### 6.2 Comprehension probes (after HF-01, before any explanation)

Ask in this order. Record the first answer verbatim; score afterwards with the rubric.

1. "Walk me through what you were watching on the screen while you played." *(open; then)* "What did the orange bar do?"
2. "What happens when that bar reaches the top?"
3. "How would you get a higher score multiplier?"
4. "Tell me about the last time you lost a hull — what caused it?"

Optional follow-up if the answer is vague: "What told you that?" Do not ask "Did you notice the heat bar?" — that is leading.

Scoring (0/1/2):

| Probe | 2 — accurate | 1 — partial | 0 — absent/wrong |
|---|---|---|---|
| 1. Heat reward + risk | Names both the score/weapon benefit and the burn risk | Names one side | Bar is a mystery, timer or health only |
| 2. Overheat consequence | Hull loss **and** reset/invulnerability | Hull loss only | Wrong or "nothing" |
| 3. Higher multiplier | In-pulse routing / graze window, specific | "Stay hot" or vague | No idea |
| 4. Last hull loss | Names the cause and the visible cue | Names the cause, not the cue | Cannot connect the death |

Comprehension "accurate" = 2; "partial" = 1. Report accurate counts separately from partial counts. Flag **dangerous misconceptions**: heat only helps; the bar is health/timer; death cannot be connected to heat; the player believes the multiplier is random.

After the probes, a short debrief may explain the rule. Record whether the participant can restate it after the debrief; that measures teachability, not first-run comprehension, and is reported separately.

### 6.3 Perceived fairness

After every death or stage failure:

- "What caused that?"
- "Could you have seen it coming?"

Code cause: heat, foe, convoy/module, boss, environment, input/technical, unknown. Code readability: clear cue, telegraphed but missed, no cue, unsure.

Exit items (1–5, strongly disagree → strongly agree):

- "When I died, I understood why."
- "The game felt fair."
- "The difficulty came from my decisions, not from hidden rules."

Open: "Was there anything that felt unfair or random?" Record the event and timestamp. Do not argue or explain during the answer.

A **confirmed unfair event** requires a named event plus recording evidence of no readable cue (or a technical failure). An opinion without an event is reported as an opinion, never as a finding.

### 6.4 Replay intent

- **Behaviour:** did the participant start another run unprompted in the five-minute free-play window? (moderated), or report doing so (unmoderated)? Binary + timestamp.
- **Intent:** "I want to play another run right now." (1–5)
- **Open:** "What would make you play again tomorrow?"
- **Optional 48-hour follow-up** (separate consent): "Did you play again? What made you come back, or not?" Report the return rate only for those who opted in; it is not a retention claim.

Never merge behaviour and self-report. Never count a run the moderator suggested; log any suggestion as a protocol deviation.

### 6.5 Share intent

- "I would send this result to someone." (1–5)
- "What would you send, and to whom?" Code the reason: score/challenge, spectacle, identity/callsign, friend competition, none.
- Show the result/share surface only if the build has one; note whether it carries the correct "bounds-checked" label. This is a copy check, not a verified-score claim.
- Do not ask the participant to post publicly. Observe intent only.

### 6.6 Technical and accessibility observations

Record, without debugging mid-session: frame-rate drops or stutter, input lag, audio failures, touch targets, orientation, install/offline behaviour, `file://` behaviour if tested, readability at the device's real size, and any moment the participant cannot see a threat or telegraph.

This is not a WCAG audit. Accessibility observations are reported as observations, with the device and setting attached.

## 7. Consent, privacy and data handling

### 7.1 Consent script (read before anything is recorded)

> This is a playtest for a game prototype. It takes about 30–40 minutes. You must be 18 or older. Taking part is voluntary; you can skip a question, stop the session, or ask me to delete your recording at any time. I'll take notes, and with your permission record the screen and your voice. The recording stays private and is deleted within 30 days of the final report; notes with anything identifying you are deleted within 90 days. I won't post your score or use your account. Your feedback may appear in an aggregated, de-identified report. You can withdraw your data within 7 days by contacting me. Do you have any questions, and do you agree to take part?

Record consent (verbal on the recording or written). Separate consent for screen recording, audio, and the optional follow-up. A participant may consent to notes but not recording.

### 7.2 Data rules

- 18+ only; no minors, no guardian-consent exception in this round.
- No names, callsigns, emails, account IDs, IP addresses, faces or voices in the repo, findings, screenshots or shared notes.
- De-identify at capture: participant IDs `P01…P28`, device model only, no contact details in the evidence file.
- Recordings and identifying notes stay in the owner's private storage (not the repo, not a public drive); delete recordings within 30 days of the final report and identifying notes within 90 days. Aggregate, de-identified findings may be kept.
- Public feedback is public: say so before someone uses the GitHub form. Prefer private email for unmoderated answers unless the participant explicitly chooses the public form.
- No third-party analytics, no tracking pixels, no session-replay tools, no paid survey service, no new accounts or keys.
- If a session exposes a security or privacy problem, stop collecting that data and report it privately (see `SECURITY.md`); do not publish details.

## 8. Pilot

Run **two dry-run sessions** before the main round (one desktop, one phone). They do not count toward the 20 and are not analysed as participants.

The pilot checks:

- can a first-time player reach and finish HF-01 within the session budget?
- are the probes understandable without leading, and do they fit in five minutes?
- does the survey take under eight minutes?
- can the moderator capture timestamps without breaking the flow?
- does the build/SHA capture, recording, consent and private/public feedback path work?
- does a low-end device hold a playable frame rate?

Fix protocol and materials issues after the pilot; do not change the game build. Log every change and its reason. If the build changes, re-pilot.

## 9. Analysis

### 9.1 Within 24 hours of each session

Write a one-page summary: build, segment, device, stages reached, every death with cause, comprehension scores with verbatim answers, fairness events, replay behaviour and intent, share intent, technical issues, protocol deviations, and a confidence note.

### 9.2 Coding

- Freeze the rubric before session 1; version it. Never rescore earlier sessions silently after a rubric change.
- Two coders independently score comprehension and fairness for at least 25% of sessions (5 of 20). Report simple agreement; resolve disagreements by re-watching, not by voting. If a second coder is unavailable, label the study **single-coder** and lower confidence.
- Separate **observed** (recording/behaviour), **reported** (quote/rating) and **interpreted** (moderator inference) in every row.
- Keep disconfirming and negative cases. Report denominators per segment, not only totals.

### 9.3 Reporting

Descriptive statistics only: counts/denominators and median/IQR for 1–5 items. No p-values, no retention claims, no industry benchmarks, no causal claims from a convenience sample. Flag any segment with two or more participants hitting the same blocker as a **recurring segment blocker**.

The findings document is written at M5 as `docs/expansion/playtest-findings.md` (created only when real sessions exist; no placeholder data). It contains: method and deviations, de-identified participant table, per-segment results, evidence table (ID, timestamp, observation/quote), confirmed unfair events, technical issues, limitations, and the EXP-020 recommendation.

## 10. Gate inputs for EXP-020 (proposed; owner approves)

These thresholds are proposals for M0 owner sign-off, anchored to the backlog's human-study targets and the bible's slice definition. They are project targets, not industry benchmarks.

| Metric | Proceed | Revise | Stop |
|---|---|---|---|
| Started unaided within 30 s | ≥18/20 (no help) | 14–17/20 | <14/20 |
| Heat comprehension (probes 1+2 accurate) | ≥17/20 overall **and** ≥60% of casual/no-history participants | 12–16/20 overall, or casuals 50–59% | <12/20, or casuals <50% |
| Last hull loss explained (probe 4 accurate) | ≥16/20 | 12–15/20 | <12/20 |
| Replay intent (≥4/5) | ≥14/20, no segment <50% | 10–13/20, or one segment <50% | <10/20 |
| Unprompted second run (moderated only) | ≥7/11 moderated sessions | 5–6/11 | <5/11 |
| Fairness ("understood why", ≥4/5) | ≥15/20, no recurring segment blocker | 12–14/20, or one fixable recurring blocker | <12/20, or a confirmed unreadable-death pattern that redesign cannot fix cheaply |
| Share intent (≥4/5) | ≥11/20 with a specific reason | 6–10/20 | <6/20 |
| Technical | No supported device blocked; low-end playable (frame-time distribution reported) | One device class degraded but playable | A supported device cannot complete a run |

Rules:

- **Any** stop row blocks `proceed`.
- `proceed` requires every proceed row; it authorises the M6/M7 pipeline, not a public release.
- `revise` names the failing fixes and re-tests **six fresh participants** on the changed build. Revision participants do not count toward the original 20, and the original 20 are never re-scored as if they saw the new build.
- The bible §12 bar — "at least 20 human playtesters choose to replay without being prompted" — is reported as an exact count against the recruited pool. If fewer than 20 choose to replay, EXP-020 records that the bible criterion was not met, even if the table above reaches `proceed`. Do not lower the bible's bar to fit a threshold.
- The EXP-020 decision is a dated note in `IMPLEMENTATION_BACKLOG.md`: `proceed`, `revise` (with the fix list), or `stop` (with what was learned), plus the evidence link and any dissents.

## 11. Roles and timeline

| Role | Responsibility |
|---|---|
| Owner (Fahad) | Approves this protocol and thresholds, recruits, consents participants, stores data, signs the EXP-020 decision. |
| Moderator | Runs sessions, captures evidence, follows the script. If the moderator designed the slice, declare the bias in the findings. |
| Second coder | Independently scores at least 25% of sessions; owner or another agent. |
| EXP-019 owner | Turns confirmed design findings into a balance/readability fix list; does not change the protocol or re-score sessions. |

Timeline:

- **M0 (now):** protocol and materials only; no participants.
- **Before M5:** freeze the build; run the two-session pilot; owner approves the protocol/thresholds; recruit 24–28.
- **M5 / EXP-020:** run 20+ sessions over at most three weeks; analyse; write findings; record the decision.
- **After the decision:** `revise` → fix list + six fresh re-tests; `stop` → return to M0 with the evidence; `proceed` → M6.

## 12. Limitations to report

Convenience sample; 20 sessions is small; owner-recruited participants skew toward the owner's network; think-aloud changes attention; the moderator can bias answers despite the script; unmoderated sessions are self-report; devices and browsers fragment; novelty inflates first-session interest; 18+ only; one build at one point in time; no minors; no statistical power; not a WCAG audit; no verified scores. These go in the findings, not in a footnote.

## 13. Acceptance trace (issue #58)

| Acceptance criterion | Where this protocol satisfies it |
|---|---|
| At least 20 participants recruited for the vertical-slice gate (executed at M5 / EXP-020) | §3: 20 completed minimum, 24–28 recruited, quotas, recruitment channels. Execution is M5 human work. |
| Measures comprehension, replay intent, perceived fairness and share intent | §6.2–§6.5 instruments; §10 gate inputs. |
| Participants segmented by prior arcade-game experience | §3.3 screening and categories; §9 per-segment reporting; mobile segments included. |
| Findings written with observed evidence, not only opinions | §6.3 confirmed-event rule; §9 observed/reported/interpreted coding; §9.3 findings template. |
| Moderated and unmoderated tests across desktop, Android touch, iOS touch and low-end hardware | §3.2 quota matrix (11 moderated / 9 unmoderated, including low-end in both), §4, §5, §6.6. |
| Deliverable `docs/expansion/playtest-protocol.md` | This file. |

## 14. Change log

| Version | Date | Change |
|---|---|---|
| 1.1 | 2026-11-05 | Expanded from the M0 draft: planned unmoderated sessions across all four device classes, experience segmentation for every participant, consent/privacy and retention, screening and moderator scripts, evidence coding, pilot, findings template, and a proposed EXP-020 gate table for owner approval. |
| 1.0 | 2026-11-02 | Initial M0 draft (20 participants, quiz, exit survey, evidence rules, EXP-020 signals). |
