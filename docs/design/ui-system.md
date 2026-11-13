# UI system — "One Deck"

Status: **Shipped** in v4.31.0 on 2026-11-14 ([PR #111](https://github.com/FahadIbrahim93/emberfall/pull/111)), with a settings-open fix in the same release. This document owns the shell's design system (tokens,
primitives, states, settings IA, focus and input contract). It is the reference
for `css/ui.css` and is gated by `tools/ui-audit.js`.

The hangar's own design lives in [hangar-overhaul.md](hangar-overhaul.md); this
document is the layer *around* it: the title, settings, the modal stack, the
pause and game-over surfaces, and the shared primitives they all use.

## Why this exists

The shell grew in three generations — v3 arcade chrome, the v4.29 "one button
system" built for accounts and boards, and the v4.30 five-bay hangar. Each was
locally reasonable; together they left two token vocabularies, two `.btn`
declarations, four tab idioms, thirteen card idioms, three dialog
implementations and two focus traps. `css/ui.css` is the consolidation layer:
it does not repaint the game, it gives every menu the same skeleton.

## Rules

1. **One component, one implementation.** When a primitive lands, the rule set
   it replaces is deleted in the same change. No parallel systems.
2. **Colour comes from tokens.** Accent tints are derived from the live palette
   (`color-mix()` over `--ember` / `--amber` / `--crimson`), so Ember, High
   contrast, Deuteranopia and Tritanopia repaint the chrome as well as the
   field. `tools/ui-audit.js` fails on a hardcoded ember in the system layer.
3. **Readability floor.** No informational text below 11 px; no interactive
   target below 44×44. The floor is a token (`--target`), not a habit.
4. **One focus contract.** Unclipped shapes use the outer ring
   (`--ui-focus`); clipped-corner shapes use the inset ring
   (`--ui-focus-inset`), because `clip-path` clips outlines.
5. **One modal stack.** `js/input.js` owns `MODAL_IDS`, Escape and Tab. A new
   dialog is not finished until it is in that list — the audit enforces it.
6. **Destructive actions confirm**, and the button says what it destroys.
7. **Motion is optional and shared.** Three durations, two easings, one
   class-based reduced-motion path that mirrors the OS preference.

## Tokens

| Group | Tokens | Notes |
|---|---|---|
| Type | `--fs-micro` 11 · `--fs-label` 12 · `--fs-body` 13 · `--fs-ui` 15 · `--fs-title` 20 · `--fs-h2` 26 | rem against the 16 px root, so these are real px figures |
| Space | `--s1` 4 … `--s6` 32 | from the v4.29 layer, reused rather than renamed |
| Ink | `--ink` · `--ink-2` ≈5.1:1 · `--ink-3` ≈6.6:1 | `--dimmer` (2.6:1) is a disabled **fill** only, never text |
| Palette | `--ember --amber --gold --crimson --aether --mint --violet` + `--good` | owned at runtime by `bindSegment('segPal')` |
| Derived | `--ui-wash (-2)` · `--ui-line (-soft)` · `--ui-danger-wash` · `--ui-ok-wash` | `color-mix()` so they follow the palette |
| Surface | `--ui-surface` · `--ui-sunken` · `--surface-2` · `--hair` | one sheet, one sunken well |
| Focus | `--ui-focus` · `--ui-focus-inset` | |
| Motion | `--dur-1` 90 · `--dur-2` 160 · `--dur-3` 260 · `--ease` · `--ease-em` | menus never exceed 260 ms |
| Geometry | `--clip-card` · `--clip-screen` · `--target` 44 | faceted, never rounded |

## Primitives

- **Surface** — `.screen` (page-level modal) and `.sheet` (account/boards). One
  scrim, one card, one header rhythm, `max-height: 100dvh - 32px`.
- **Button** — `.btn` with `.key` (primary), `.ghost`, `.warn` (destructive),
  plus `.sm` / `.lg` / `.icon` and `busy` / `disabled`.
- **Tabs** — `.tab`, `.btab`, `.hg-tab` keep their layouts and share state,
  focus and 44 px target rules; `aria-selected` and `.on` are equivalent.
- **Segmented** — `.seg` is a radiogroup (`bindSegment` adds roles, roving
  tabindex and arrow/Home/End keys). It wraps in a grid instead of crushing
  five difficulty names into one 190 px column.
- **Switch** — `.sw`: a 52×32 track inside a real 44 px button.
- **Slider** — native range at 44 px with an `<output>` readout and
  `aria-valuetext`.
- **Chip** — `.chip` (+ `.ok` / `.warn` / `.off`) for fit codes, ranks, caps
  and ownership. State is always text plus colour.
- **Cards** — the thirteen legacy idioms keep their grids and share the state
  contract: selected, locked, owned/fitted, unaffordable, capped.

## Settings IA

Five sections, one job each, 56 px rows, a live value, a one-line hint, and a
single "Restore defaults" that never touches progress:

1. **Audio** — master, music, effects.
2. **Display** — quality, frame cap, sky traffic, scanlines, grain, flashes,
   shake, daily ghost, FPS.
3. **Controls** — difficulty, auto-fire, left-handed, larger buttons, button
   size and opacity, vibration.
4. **Accessibility** — visual style (with palette swatches), high-vis bullets,
   hitbox, **reduce motion** (new; seeded from the OS preference).
5. **Footer** — "changes save automatically" + restore defaults (confirmed).

`CFG_DEFAULTS` is captured before `loadCfg()`, so reset cannot drift from the
shipped defaults. Every control still registers a paint in `SETTING_PAINTS`,
which the reset replays — the same contract `boot()` uses.

## Input contract

- **Keyboard** — Tab and arrows inside menus, Enter/Space to activate, Escape
  to pop the top modal, `P` pause, `M` mute, `F` fullscreen.
- **Touch** — 44 px minimum, primary action in the thumb zone, bottom-sheet
  account surface, safe-area insets.
- **Gamepad** — flight is wired; full menu navigation is planned (see the
  overhaul roadmap) and is the largest remaining input gap.
- **Screen readers** — one dialog at a time, `aria-modal`, trapped focus,
  `role="switch"`/`radio` with real checked state, live regions for feedback.

## Verification

`node tools/ui-audit.js` (in `check.sh`) checks token resolution, the ember
literal ban, the type floor, `!important` containment, modal registration and
cascade order. Pixel promises — 44 px targets at 390×844 and 1440×900, computed
contrast, no horizontal overflow, one trap per surface — belong in
`tests/ui-system.spec.js` and `tests/a11y-surfaces.spec.js`.

## Not in this layer

Gameplay, balance, economy, scoring, hosting, the Supabase schema, the golden
simulation tables, and the game's art direction. The palette, fonts, clip
geometry and the WRAITH name are fixed points.
