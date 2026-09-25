# Sprite batch 001 — player fleet + the swarm line

*Status: **SPECIFIED, NOT GENERATED.** The Scenario MCP is not connected
to the authoring client at spec time (available servers: github, supabase
— checked via the connector search, 2026-09-26). The sequence below is
the exact contract for whoever (or whichever agent) runs it once the MCP
is attached. Pricing gate: **no paid `model_run` happens before its exact
payload has been priced with `dry_run: true` and the printed quote
accepted.***

## Why raster, and where it is allowed to appear

EMBERFALL's playfield ships are **pure canvas-path art** (js/art.js ART
v3): mirrored half-hull polygons, one cached gradient, recoloured per
palette, crisp at any density. That is a feature, not a gap — the
renderer can repaint every hull instantly when the palette switches.
Raster sprites therefore serve surfaces the path renderer does not
cover:

1. **UI / meta surfaces** — hangar ship-select portraits, the stats
   page, the deck's mirror boards, social/share cards.
2. **Promo / store art** — larger hero shots for the itch-style
   storefront page, release banners.
3. **Future cosmetic layers** — if a "hangar" meta screen lands, its
   art lives in PNG land, not path land.

**Never** in the live playfield renderer unless a future ADR says so.

## The ships (server.js: `SHIPS = vesper, halcyon, atlas, wraith, seraph`)

Five hulls exist as paths already. Batch 001 covers all five as
portrait-quality renditions of their established identities, plus the
swarm-line foe family.

### Art-direction contract (non-negotiable, mirrors ART v3's three rules)

- **One light, from above and slightly left** — lit rim on top, deep
  shadow along the belly, on every hull. No secondary light sources.
- **Friendlies are cold machined steel with ember accents; hostiles are
  black chassis under crimson carapace plate with a lit core.**
  Exact anchors from the game's CSS/art tokens:
  - void/deep space background: `#03050b`, carbon: `#080d1a`
  - steel ramp: `#f0f5ff → #ccd6ea → #93a1bb → #4a5570 → #222b40`
  - ember accent: `#ff8a2b`, amber `#ffb454`, hot `#ff5e2e`
  - hostile carapace: crimson `#ff2e55`, blood `#b3122f`, on near-black
    `#0a0409`–`#0b0610` chassis
- **Silhouette first** — must read as itself at 20px, in one colour.
  Test every output by downsizing to 20px before accepting.
- **Top-down / slight three-quarter, nose up**, consistent facing
  across the whole batch (the renderer draws them nose-up; portraits
  should match so the hangar reads as the same ships).
- No baked drop shadows, no glow halos, no scene background — flat art
  on transparent (or plain field if the pick lacks native alpha; the
  alpha edge gets checked either way per the skill's halo warning).
- **No text, no decals, no numbers** anywhere.

## Unblocking: attach the Scenario MCP

The MCP lives at `https://mcp.scenario.com/mcp` (Streamable HTTP); OAuth
is preferred — no credentials ever pass through the conversation. Attach
it in the client's MCP-server settings (the same place `github` and
`supabase` are connected), authorize once, then in a session:

1. connector search for scenario tools must return `teams_list`,
   `recommend`, `model_schema_get`, `model_run`, `jobs_wait`,
   `asset_display`, `asset_download`
2. run this spec's sequence top to bottom — the pricing gate is step 3
3. never paste a raw asset URL into chat; `asset_download` → `curl -L`

The four global skills (`scenario`, `scenario-game-assets`,
`scenario-sprite-animation`, `scenario-audio`) carry the full contracts
for every call in that list.

## The exact MCP sequence (per the scenario skill's core loop)

```
1. teams_list → projects_list          # resolve team_id + project_id ONCE, confirm the pair
2. recommend (capability txt2img, the style brief below) → read next_step.type;
   on proceed prefer specialty.model_id; model_schema_get the pick
   (check: native alpha? sample-count param? seed? cost_impact fields?)
3. PRICE GATE: model_run dry_run=true with the EXACT payload → print
   creativeUnitsCost × 5 (player) / × 4 (foe) → DO NOT proceed unless
   the total is acceptable; record it in the batch log below
4. Player batch: one model_run per ship (different subjects are separate
   runs; same wording template, only the subject varies), same seed if
   the schema has one, prompt-expansion flag pinned OFF
   → wait=false, jobs_wait (re-call with pending_job_ids on timeout)
5. Foe batch: same loop with the hostile wording
6. asset_display each result → reject off-silhouette / haloed / off-palette
7. asset_download format="png" per accepted asset (PNG keeps alpha)
8. Pixel-check at 20px (the silhouette test) + alpha-edge inspect
```

### Player wording template (subject is the only variable)

> "top-down starfighter portrait, nose up, cold machined steel hull,
> lit rim from above-left, ember-orange accent details, deep belly
> shadow, transparent background, single craft, no scene, no text,
> game asset"

- vesper: "sleek dart interceptor, narrow needle hull, twin short wings"
- halcyon: "graceful swept-wing cruiser, long tapered fuselage, elegant layered wings"
- atlas: "heavy broad-shouldered gunship, wide armored hull, blunt nose, stub wings"
- wraith: "angular stealth fighter, sharp forward-swept edges, faceted dark hull"
- seraph: "winged sacramental interceptor, dorsal fin lines, cathedral-like wing spars"

### Foe family wording — the swarm line (FOES: drone/mini/striker/weaver/splitter)

One family read: black chassis under crimson carapace plate, a single
lit core, insectile hard-shell geometry. Template:

> "top-down hostile attack drone, black chassis under crimson carapace
> armor plates, single lit crimson core, insectile hard-shell geometry,
> lit rim from above-left, transparent background, single craft, no
> scene, no text, game asset"

- drone: "small hexagonal beetle-form, compact rounded carapace"
- striker: "arrow-shaped predator with forward mandible plates"
- weaver: "wide triangular frame with thin antenna spines"
- splitter: "segmented body, visible split line down the center"
- (mini stays path-only: a 9px-radius foe never needs a portrait)

## Batch log (fill in as executed)

| Step | Result |
|---|---|
| team/project pair | — |
| picked model | — |
| dry_run quote (player ×5) | — |
| dry_run quote (foe ×4) | — |
| accepted / rejected | — |
| files → | `docs/sprites/batch-001/*.png` |

## Acceptance (before anything is committed)

- [ ] 9 PNGs (5 ships + 4 foes), transparent, no halos, palette-conformant
- [ ] every asset passes the 20px silhouette test
- [ ] consistent facing + light direction across all nine
- [ ] copyguard / deadscan untouched (assets are inert PNGs under docs/)
- [ ] full battery green; release notes mention the batch only as
      "portraits/docs", never as in-game art
