# Agent playbook — how Hermes, OpenBot and Freebuff work on Emberfall

Source of truth for *what* to build: `docs/expansion/IMPLEMENTATION_BACKLOG.md` (Gates 0–7).
Source of truth for *rules*: `AGENTS.md`. This file is *how* to work.

## Roles
| Who | Does |
|---|---|
| Codex (planner) | Keeps the backlog current, turns the next gate items into GitHub issues with acceptance criteria. |
| Freebuff, OpenBot, Hermes (builders) | Pick one ready issue, implement it, open a PR. |
| Engineering (Grok Bot) | Reviews PRs, checks CI and previews, applies approved migrations. |
| Fahad | The only one who merges and approves production releases. |

## Lanes (who takes which work)
| Agent | Label | Lane |
|---|---|---|
| Codex (Astra model) | `agent:codex` | Hardest work: Gate 2 (accounts/DB safety, bigint, cloud saves + conflicts), Gate 3 (sim extraction), Gate 4 (deterministic Daily), Gate 5 (server verification / anti-cheat), Gate 7 schema. Also writes every gate's issues. |
| Freebuff | `agent:freebuff` | Gameplay and controls: Gate 1 player bugs (e.g. #79, reward idempotency), Gate 6 controls (remapping, touch sensitivity, left-handed, retry flow, HUD). |
| OpenBot | `agent:openbot` | Visuals and content: Gate 6 visual polish (hit/death feedback, telegraphs, contrast, menus), Gate 7 Heliox art/audio after Codex lands the schema. |
| Hermes | `agent:hermes` | Docs and outreach: CHANGELOG/README/press-kit after merges, playtest notes (#58), X post drafts for Fahad's approval. No game logic. |

Codex pre-labels issues with the lane's `agent:*` label when it writes them. Builders take only issues carrying their own label (plus `ready`). Gate 3 must merge before Gate 4, 5 and 7 build work starts.

## Work order
1. Only work the **current gate** (the backlog says which is active). Never start a later gate early. Track H (the hangar overhaul) is built by Engineering, not by the builder lanes; do not claim its issues.
2. Inside a gate, take the **lowest-numbered open issue** with labels `ready` and your own `agent:<you>`.
3. No suitable issue? Stop. Don't invent work; comment "no ready issue" to Fahad instead.

## Labels
- `ready`: issue has clear acceptance criteria and can be built.
- `agent:freebuff`, `agent:openbot`, `agent:hermes`: who has claimed it.
- `in-review`: PR is open and waiting for review.
- `blocked`: needs a human decision (explain why in a comment).

## The loop (one issue at a time)
1. **Claim:** comment "Claimed by <you>. Plan: ..." (3–5 lines).
2. **Sync:** `git fetch origin && git switch -c issue-<n> origin/main`.
3. **Build:** smallest change that meets the acceptance criteria. Stay inside the issue's scope.
4. **Test:** run every check in AGENTS.md rule 4. Add a regression test for each bug you fix.
5. **Rebase before PR:** `git fetch origin && git rebase origin/main`. Fix conflicts by hand, keeping main's work.
6. **PR:** title `<type>(<area>): <what>`, body has `Closes #<n>`, what changed, how you tested,
   and anything left undone. Add label `in-review`.
7. **Update the backlog** line for that item in the same PR (status + PR link). Nothing else in it.
8. **Stop.** Don't merge. Don't start a second issue until the first PR is merged or you are told to.

## Stop and ask (comment on the issue, label `blocked`) if
- The change needs a database migration, new secret, new account, or paid tool.
- It would touch accounts, leaderboards, scores, release workflows or deploy settings beyond the issue.
- CI fails for a reason outside your change.
- The issue is unclear or conflicts with AGENTS.md.

## Never
Push to `main` · merge · force-push · "take theirs" merges · promote/deploy production ·
change Vercel/Supabase/GitHub settings · commit secrets · remove accounts/leaderboards ·
add `server.js`/deck/Fly/Docker · touch other people's repos.
