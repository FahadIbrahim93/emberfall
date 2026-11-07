# Telemetry & privacy contract

**Status:** M0 deliverable for EXP-004 (issue #55). Defines the versioned event vocabulary, privacy boundaries, and retention policy for expansion-era gameplay measurement. **It ships measurement, not collection** — no event is emitted until the implementation (M1, behind EXP-004/EXP-006 criteria) lands and the retention policy below is the live state, not an aspiration.
**Companion:** `REALITIES.md` §4 (honesty), `SECURITY.md` (production architecture), `docs/LEADERBOARD-AND-ACCOUNTS.md` (what accounts are).

## 1. Hard privacy boundaries (binding before any event schema detail)

1. **No email, no raw IP, no free-form user content is ever collected by gameplay events.** Callsigns appear only in the posting-pilot context and are escaped/allowlisted at every boundary, exactly like the existing board surfaces.
2. **No opt-out leakage:** telemetry failure is non-blocking (fire-and-forget queue, hard per-session cap, silent drop never pauses gameplay or saving). Nothing on the scored path ever waits for analytics.
3. **No account joining.** Analytics sessions use a random per-session id, never the auth user id and never a stable device fingerprint. An analytics session cannot be joined to a Supabase account by the client's own data.
4. **Guests are first-class.** A guest session (the default) produces the same event flow; the absence of an account is a field, not a gap.
5. **Offline/file:// and portal builds emit nothing** — event emission requires a live hosted build with an http(s) origin (the `file://` contract is untouched; PRIVACY is preserved for downloaded play).
6. Referrers are recorded only as a coarse privacy-safe category (§2.3), never the raw URL.

## 2. Event schema (`eventFormatVersion: 1`)

### 2.1 Common envelope fields

| Field | Type | Note |
|---|---|---|
| `ev` | string enum (§2.2) | one name from the frozen list |
| `v` | integer | `eventFormatVersion` |
| `game` | string | game version string (`tools/release.mjs stamp` source of truth) |
| `ruleset` | integer | ruleset version (see replay contract §2) |
| `dev` | enum | device class: `desktop`, `android`, `ios`, `lowend`, `other` (coarse classification only, no fingerprinting) |
| `sess` | uuid | random per-session id (no persistence) |
| `d` | object | event-specific data (closed per event in §2.2) |

Every payload field is from a closed enum or a bounded counter; no strings that can carry user content are accepted by any event in this list.

### 2.2 Event list (frozen; additive names require `eventFormatVersion` 2)

| Event | Bounded data fields (closed) |
|---|---|
| `boot` | `mode:any none` — boot happened; carries `sw` (bool: service-worker path) only |
| `launch` | `mode` in {`endless`,`school`,`daily`,`expansion-stage`,`rush`} |
| `first_action` | `t_seconds` (0–999), `mode` |
| `death` | `mode`, `stage_id` (registry id or `none`), `cause` in {`hull`,`heat`,`hazard`,`core`,`none`}, `wave` (0–999), `t_seconds` |
| `retry` | `mode`, `attempt` (1–20) |
| `stage_complete` | `stage_id`, `t_seconds`, `graze` (0–9999), `peak_combo` (0–9999), `score` (bounds-checked client value or null), `multiplier_tier` (1–8) |
| `daily_entry` | `daily_id` (content-vocabulary id patterns), `results_kind` in {`play`,`review`} |
| `share` | `card_kind` in {`daily`,`stage`,`pilot`}, `path` in {`clipboard`,`native`,`link`} |
| `account` | `action` in {`signin`,`signup`,`signout`,`callsign_set`}, `result` in {`ok`,`fail`} |
| `score_post` | `board` in {`endless`,`daily`}, `result` in {`ok`,`rate_limited`,`failed`}, `verified` bool (server's actual answer, not a wish) |
| `return_visit` | `gap_days` in {`same_day`,`next_day`,`2-6_days`,`7-30_days`,`month_plus`} |

### 2.3 `referrer` category

`referrer` is a separate coarse enum on `launch` only: one of `direct`, `link`, `search`, `social`, `challenge` (arrived via a "Beat this run" URL), `unknown`. Never a URL, never a host list.

## 3. Transport and failure behavior

- One endpoint, one POST per event batch (queued ≤ 6 events per batch, flushed on `visibilitychange`/`pagehide`, max one flush per 10s).
- Client queue is capped (32 events); on overflow the **oldest** events drop. Gameplay and saving never touch the queue.
- Any transport failure (offline, non-2xx, timeout) marks the session cold and retries at most twice at the next batch boundary. Nothing logs locally.
- Transmission only in hosted builds (`https` on the game's origins). Feature-disabled by default in the shipped PWA until the endpoint contract is deployed (M1 decision recorded in the implementation PR).

## 4. Retention & deletion

| Data | Retention | Deletion |
|---|---|---|
| Raw events (session-level) | rolling 180 days | drop on the schedule; a healthy deletion must produce the same aggregates |
| Aggregates (per-day, per-stage, per-mission cohort counts) | 3 years | none (not personal — no session ids survive aggregation) |
| Raw session ids | rolling 180 days (same as raw events) | gone with raw events |

Deletion policy honored **before collection begins** (backlog EXP-004 acceptance). No gameplay telemetry is retained beyond §4's schedule, and no secondary copy outside the analytics storage is produced (no crash logs, no error trackers, no third-party analytics SDKs — zero-runtime-dependency stays true).

## 5. What this telemetry is for (and not)

Measures: the funnel the bible's slice-gate cares about (boot → launch → first action → death → retry → stage completion → daily entry → share → score post → return), the stage where players stop, comprehension-adjacent outcomes (mission completion vs abandonment), device-class performance sanity.

Does **not** measure: individual players' identities, social graphs, precise devices, debates, purchases (none exist), anything required for score verification (replay verification uses §3.3's payload, never telemetry), anything paid/rewarded (mission rewards are cosmetic — measurement of reward-claiming stays in `share`/`score_post` results only).

## 6. Implementation acceptance (EXP-004 → M1 work)

- [ ] Every emitted event matches the §2.2 field sets exactly (a schema-validating sim test is authoritative).
- [ ] A deadscan/copyguard walk proves no string event field exists outside the frozen option text.
- [ ] Analytics failure injection (offline/fake 500) cannot stall boot, saving, or score submission under self-test.
- [ ] Retention deletion runs as a scheduled job in the analytics storage (not manual).
- [ ] This document precedes any event emission in code; the event list does not grow without `eventFormatVersion` bump and a registry note.
