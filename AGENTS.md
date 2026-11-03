
## Grok Bot handoff (standing rules)

On every session start:
1. Read `TASKS-FROM-GROKBOT.md` in the repo root.
2. Do the open `[ ]` items under `## Open` in order. Use free models only: GLM 5.3 Flash or DeepSeek V4.1 Flash. Never use Space Bunny.
3. Run the project's tests/build if available (see package.json scripts).
4. Mark each finished item `[x]` (or add `BLOCKED: <reason>`).
5. Write/overwrite `RESULTS-FOR-GROKBOT.md` with: date and time (Asia/Dhaka), per-task summary, files changed, test/build output, open questions.

Hard rules:
- Never `git push`, never commit to `main`, never force-push.
- Never sign up for anything or add paid services.
- Never change the WRAITH ship's Bengali class label.
- Work on a branch named `freebuff/<short-task>` and leave changes uncommitted there for Engineering to review.
