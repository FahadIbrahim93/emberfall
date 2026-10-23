# Mobile UX v2 (v4.30)

Status: shipped in feat/mobile-ux-signin.

## Title (phone portrait, ≤900 px)
- Fits one screen at 360/393/412 px; `scrollWidth == innerWidth`.
- Top bar: pilot chip (left), Boards / What's new / Settings 44 px icon buttons (right).
- Wordmark: `clamp(2.2rem, min(13.5vw, 8.5vh), 4.4rem)`; grid columns use `minmax(0,1fr)`.
- Modes in a 2-column grid; one 68 px Launch CTA at the bottom (thumb zone).
- Short screens (≤740 / ≤640 px tall) drop lede/eyebrow, then subtitles.

## Touch HUD
- Dash 76 px bottom-right, Pulse 0.82× diagonally up-left; mirrored for left-handed.
- Cooldown ring (`--f`), count badge (`data-n`), `:active` glow; bottom centre kept clear.
- All controls inside `env(safe-area-inset-*)`; pause 48 px; wave timer moved to top on ≤600 px.

## References
Apple HIG Game controls (44 pt min, frequent actions near the thumb, visible press state);
thumb-zone guidance (primary action 64–80 dp); safe-area guidance (PlayCanvas, gamedesign.gg).

Desktop layout and all gameplay balance are unchanged.
