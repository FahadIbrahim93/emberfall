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

## Work order
1. Only work the **current gate** (the backlog says which is active). Never start a later gate early.
2. Inside a gate, take the **lowest-numbered open issue** that has label `ready` and no `agent:*` label.
3. No suitable issue? Stop. Don't invent work; comment "no ready issue" to Fahad instead.

## Labels
- `ready`: issue has clear acceptance criteria and can be built.
- `agent:freebuff`, `agent:openbot`, `agent:hermes`: who has claimed it.
- `in-review`: PR is open and waiting for review.
- `blocked`: needs a human decision (explain why in a comment).

## The loop (one issue at a time)
1. **Claim:** add your `agent:<you>` label and comment "Claimed by <you>. Plan: ..." (3–5 lines).
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
