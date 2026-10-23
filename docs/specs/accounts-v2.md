# Accounts v2 — quick sign-in, pilot profile, boards refresh

Status: in build (branch `feat/accounts-v2`). Builds on v4.28.0 "Guest Pass" (PR #30).
Free tiers only: Supabase Auth (free plan, built-in email), Google OAuth (free), Vercel Hobby.

## Why (audit, 2026-10-23)
- The account panel exists in v4.28.0 but sits in the right-hand sidebar; on phones it is
  ~850 px down, below the whole title menu, and the boards hide in a fifth "Global" tab.
- The splash ("tap or press any key to arm") hides the title until the first input.
- The service worker serves `js/*.js` cache-first: a returning visitor's first load after a
  deploy pairs the new `index.html` with the old modules (version skew) until a reload.
- Client uses only the publishable key (`js/mirror-public.js`); no service-role key anywhere.
- Auth: email (confirm required) and anonymous are on; Google is off; password-only sign-in.

## Auth
- **Email code / magic link** (`signInWithOtp`, `shouldCreateUser: true`): one field, one
  button. The same email carries a link and a 6-digit code (`verifyOtp type:'email'`), so it
  works inside installed PWAs where links open in another browser. Password sign-in stays as
  a secondary "Use a password" option for existing accounts.
- **Google** (`signInWithOAuth({provider:'google'})`): button stays **hidden** until
  `GET /auth/v1/settings` reports `external.google = true` (same gate as X, PR #26).
- **Guest play** needs no session. On the first callsign save after sign-up, the device's
  local Endless best is offered once to the board via `submit_score` (stats tag
  `src:'guest'`); the server bounds and rate limits apply as for any run.
- Anonymous Supabase sessions stay refused by the RPCs and hidden from the views.

## Profile
- Callsign (3–16, `A-Z 0-9 _ -`, unique case-insensitive) via `set_callsign`.
- Avatar: one of the five hull icons (`vesper, halcyon, atlas, wraith, seraph`), drawn with
  the game's own hull art — no uploads, no storage. Saved by the new `set_avatar` RPC.
- Stats: worldwide Endless best and rank, today's Daily best, runs posted.
- Edit callsign / avatar, sign out. Opens from a title-screen "pilot chip" and the account panel.

## Leaderboard
- Tabs: **Daily** (today's UTC seed) and **All-time** (Endless), top 50 each.
- "Your rank" row pinned under the list when signed in and outside the top 50
  (count of pilots strictly ahead, `Prefer: count=exact`, no extra RPC).
- Avatar icon next to each callsign. Reads stay on the public views (RLS select-only);
  writes only through `submit_score` / `set_callsign` / `set_avatar` (security definer,
  bounds 1..10,000,000, 6/min and 300/day per pilot).

## UI/UX
- Title: compact pilot chip at the top of the menu (above Launch) — visible above the fold
  on phones — showing callsign+avatar or "Guest · Sign in"; a "Boards" button opens the
  Global tab.
- After a run: the existing non-blocking "Sign up to post this score" strip; no modal.
- Mobile-first: 44 px touch targets, inputs `inputmode`/`autocomplete` set, no horizontal scroll.
- Art: existing panels, `.btn`/`.up` buttons, Michroma/Chakra Petch, amber/aether palette.
  The plane name stays **WRAITH**.

## Migration
`supabase/migrations/20261023000300_profile_avatar.sql` — additive: nullable
`profiles.avatar` with a check, column select grant, `set_avatar` RPC. No drops, no
changes to existing columns, RPCs or views.
