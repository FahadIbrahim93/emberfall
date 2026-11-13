# Deployment

The game is static; Supabase project `rgmbexmodebegllahotc` supplies accounts and boards. No replay-verification server is deployed yet.

| Host | Public URL | Release path |
|---|---|---|
| Vercel | https://emberfall-game-two.vercel.app/ | Explicit promotion of a tested production-environment deployment |
| Pages | https://fahadibrahim93.github.io/emberfall/ | The retained artifact from successful main CI |

The Vercel public alias belongs to project **emberfall-game** (`prj_8qgnVQhyDTxSea2j53tGAVYwvOy0`), despite its name. The other linked project, **emberfall-game-two**, is retained. Automatic production domain assignment is disabled on both projects. Git integration builds may still run, but do not promote. Do not delete either project or move existing public origins: careers and sign-ins are stored per origin.

## Build and test one payload

```bash
npm ci --ignore-scripts
npm run test:release
npm run build:site
# Set EMBERFALL_SITE_ROOT=dist/site for CI-equivalent checks.
npm run test:browser
node tools/selftest-ci.js
npm run verify:site
```

CI sets `EMBERFALL_SITE_ROOT=dist/site` so browser and self-tests use the single prebuilt payload without rebuilding. Local harnesses build it first without that variable. Tests never serve the broader repository. Preview with `node tools/serve-static.mjs --release --port 8080`.

`dist/site/release-manifest.json` contains commit SHA, game version, sorted paths, MIME types, sizes and SHA-256 hashes, plus the deployment configuration hash. Packaging includes nested `js/vendor/supabase.js`, its license, fonts, icons and press assets. Missing references, modified assets, extra files and provenance mismatches fail verification. Tooling, dependencies and migrations are excluded. Missing scripts never fall back to HTML.

Successful CI retains `emberfall-site-<full SHA>` for 30 days. Pages downloads and verifies that artifact, then checks every published asset against it. Measurements are separate 14-day CI artifacts. Verification has read-only repository access and never commits measurement updates. Historical fun-curve updates use captured CI measurements in a reviewed PR.

## Vercel staging and promotion

After human merge and successful **main-push CI**, dispatch **Release or restore a tested payload** from `main`. Supply the CI run ID and full commit SHA. PR artifacts, foreign repositories, failed/incomplete runs and mismatched commits are rejected.

The `vercel-production` GitHub environment is restricted to `main` and requires owner review (configured 2026-11-04). `VERCEL_TOKEN` (scoped to the existing team/project) and `VERCEL_AUTOMATION_BYPASS_SECRET` live in that environment; they were set during the Gate 0 rehearsal. Never make previews public, and never put either secret in a command argument. No paid service is required.

The workflow downloads the retained artifact, converts it to [Build Output API v3](https://vercel.com/docs/build-output-api/configuration) without rebuilding, and uses pinned CLI `vercel@65.11.0` with `--prebuilt --prod --skip-domain`. It checks the staged manifest, every asset's bytes/MIME and the sign-in library. Leave **promote** false for rehearsal. Selecting **promote** promotes only after those checks, then verifies the public alias against the same manifest. Using a production-environment deployment avoids preview/production environment changes during promotion. See [staging domains](https://vercel.com/docs/cli/deploy#skip-domain) and [promotion](https://vercel.com/docs/cli/promote).

Install the pinned CLI without release credentials and with dependency install scripts disabled. Only the deploy/promote steps receive `VERCEL_TOKEN`, through their environment; never pass it in command arguments. `node tools/release-policy.mjs` and its negative regressions enforce this isolation. Deployment metadata records the source CI run and release SHA.

Rollback deployments must bind both `releaseCommit` and `githubCommitSha` to the artifact SHA, rather than the workflow checkout. Promotion uses `tools/promote-release.mjs`: explicit team/project API scope, READY production deployment checks, matching release/Git identities, and manual domain assignment preserved before/after promotion. This avoids CLI promotion's user lookup, which returned HTTP 404 for the configured scoped token during rehearsal. The public all-asset smoke check remains mandatory after acceptance.

The connected Vercel API can also stage the exact artifact without CI credentials: verify successful main CI provenance and every artifact hash first, upload only its files with SHA1/size checks, and create a production-environment deployment with automatic alias assignment disabled. This is not evidence that the credentialed CI workflow has run. Verify all staged HTTP assets before promotion and retain the same owner review requirement. Do not regenerate a broader repository build or disable Deployment Protection to obtain a passing check.

## Rollback rehearsal and recovery

Retain the previous successful main CI run ID/SHA before promotion. Restore it using the same workflow with that run ID/SHA, **promote=true** and **restore_pages=true**. Both hosts receive its retained bytes; no rebuild, main rewrite, origin migration or database change occurs. Each host has its own smoke check; investigate and restore the other host if one fails.

Gate 0 exited on 2026-11-05 after a rehearsed stage, promote, restore of the previous release on both hosts, and return to the current one. The workflow URLs are in the canonical backlog. Automated rollback still requires an unexpired CI artifact (30 days); download a required older artifact before it expires. Pre-manifest deployments cannot pass the contract.

## Supabase and portals

Add migrations under `supabase/migrations/`; never edit applied migrations or apply them live as an agent. Owner review/deployment are separate. Email redirect URLs must include the preserved Vercel and Pages origins. Only the publishable key in `js/mirror-public.js` ships. Cloud careers is the next persistence gate ([#115](https://github.com/FahadIbrahim93/emberfall/issues/115)); SMTP and account recovery remain open. Standings — the other work that was also called Gate 2 — shipped in v4.29.7 and is in production.

`npm run build:portal` produces `dist-portal.zip` with `index.html` at its root. CI separately checks the 20 MB limit and absence of Supabase, fly.dev and GitHub hosts. Portal scores stay local. This artifact is separate from the account-enabled web release.

Service-worker release isolation and update behavior remain pending distribution repairs in the backlog. The deployment pipeline does not establish those guarantees.
