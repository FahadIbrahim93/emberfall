# Decision pack — P0-8 (LICENSE + privacy note)

> **For the Director.** This file prepares your P0-8 decisions; nothing here is
> law until you commit the choice. Per SSOT §0.6 / §7, an agent may prepare
> this pack but only you can decide. Each section is a pick + a one-line
> reason. When you've chosen, say the word and the agent commits the matching
> LICENSE/privacy files — or edit this file and mark your picks.

## 1. Code license — pick ONE

| Option | You get | You give up | Fits because |
|---|---|---|---|
| **A. Proprietary (all rights reserved)** | Max control; Steam release needs nothing extra; no one can ship your code | No outside contributors; forks/PRs are legally void | You plan to sell on Steam (P5) and want clean exclusivity |
| **B. Source-available (e.g. BUSL-1.1 or PolyForm Noncommercial)** | Code stays public & auditable; others can't undercut you commercially | Extra license text to maintain; some contributors refuse | You want the transparency story *and* the store |
| **C. OSS (GPL-3.0 or AGPL-3.0)** | Real community contributions; good will | Anyone (incl. competitors) can ship derivatives under the same terms; AGPL covers the server too | Community-building beats commercial lock-in for you |

**Agent recommendation (informational, not a decision):** B — the project's
identity is *auditable honesty*, and BUSL keeps the Steam path clean.
**Your pick:** ____________

## 2. The fonts are already a legal commitment

`fonts/` ships Michroma + Chakra Petch under the **SIL Open Font License 1.1**
(license-cleared either way — OFL allows embedding/redistribution; keep the
OFL.txt alongside them). Whichever license you pick, the OFL files stay
separately licensed; that's normal and must be noted in the LICENSE or README.

## 3. Privacy note — draft for your sign-off

The deck stores, per registered pilot: a **callsign**, a **scrypt password
hash + unique salt** (never the password), **session token hashes**, **scores
and run telemetry** (checkpoint arcs), and **cloud-save profile data** (alloy,
hulls, refits, feats, settings). The SQLite file lives **only on the host you
deploy `server.js` to**; the static GitHub Pages build stores nothing outside
the player's own browser (localStorage). No analytics, no ads, no third-party
requests — the client suite proves the zero-third-party-request property on
every commit. DELETE requests don't exist yet: registered pilots who want their
data gone currently need the operator to remove their row(s) from the DB.

Checklist for your sign-off (each ~1 minute):

- [ ] Pick the license (above)
- [ ] Approve or edit the privacy note text
- [ ] Decide: EU/UK pilots on the self-hosted deck → does a simple "data stays
      on the host, contact the operator for deletion" paragraph satisfy you
      (GDPR-lite), or do you want a real DPA-style page?
- [ ] Decide whether to add an in-game "delete my account" button (small
      server endpoint + confirm dialog) before launch — recommended before P5

**When you're done:** reply with your picks; the agent lands LICENSE, OFL.txt
for fonts, and PRIVACY.md in the next PR (still P0-8's scope).
