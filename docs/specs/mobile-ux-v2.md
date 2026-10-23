# Mobile UX v2 (shipped)
Standards: Apple HIG game controls (44pt min, frequent actions near the thumbs, menus at the top, visible press states), Material 48dp targets, thumb-zone guidance (64–80dp primary actions, bottom-centre kept clear).
- Title (phone portrait): a 12-column grid via display:contents. Top bar: pilot chip + 3 icon buttons (52px). The h1 uses clamp(2.2rem,min(13.5vw,8.5vh),4.4rem). Modes 2×2 plus Daily. LAUNCH is 68px at the bottom.
- HUD (coarse pointer): Dash 76px bottom-right with a conic cooldown ring (--f) and a charge badge (data-n). Bomb is 0.82× and sits up-left. Pause is 48px. Lefty mode mirrors the layout.
- Sign-in: OTP input with autocomplete=one-time-code, a resend cooldown, and explain() error mapping in js/cloud.js.
Verified with no overflow at 360/393/412/768/1280.
