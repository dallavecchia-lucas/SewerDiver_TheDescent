# SEWER DIVER — The Flooded Theatre (3D web build)

The handheld game, unchanged, but its screen is now a curved CRT faceplate holding a tiny
theatre of flat plastic props. The props hover magnetically at real depths, with no sticks
or strings, and the whole bulb is flooded with the same sewer water the diver swims in.

**Play:** open `../sewerdiverdescent3d.html` in a browser. It is one self-contained file
(~1.4 MB) with no external requests. It runs on WebGPU where available and falls back to
WebGL2 automatically, using the same shaders.

## The four tricks, and where they live

| Trick | What it does | Code |
|---|---|---|
| Hovering plastic theatre + shadow play | The game draws onto 6 plastic plates at real depths: back cloth 0 mm, scenery 11, rock 20, actors 27.5, foreground 41 (kept empty: edge props read as junk stuck to the glass), card flat 44.5; a proscenium frame at 48; the glass at 62. A texture-space ray tracer lights every plate texel with area lights (room key light through the glass, the diver's lantern, every glow in the game). Each shadow ray is tested exactly against every plate's alpha, so a shadow's softness and offset grow with the gap between caster and receiver. Plates have real thickness (lit side walls on cut edges), a satin clear-coat, and bright paint behaves as edge-lit translucent acrylic. Each plate rides its own magnetic hover spring, and water knocks nudge it. | `passes.js` (irradiance, compose), `gpu.js` (`shadow`, `plateHit`), `scene.js` |
| Flooded screen | A 3D stable-fluids solver (velocity / silt / dye / heat) fills the box. The diver's wake, dashes, creature wakes, mining puffs, vents (buoyant heat), sludge (dye), floods, the sub's stream, the sliding plates and the device's own shake all stir it. Water colour, absorption and murk follow the current tier's palette and pollution. GPU silt specks drift with the flow, breaths rise as real bubbles that cling to the glass, and the inner glass films over with grime in dirty water. There is no waterline: the murk sells it. The HUD is the set's own green on-screen display, seen through the flooded glass: currents drag it, heat shimmer bends it, the water softens it and grime dims it. | `fluid.js`, `particles.js`, `water.js`, `passes.js` (volume, final) |
| Liquid optics | Each eye ray refracts air → glass → water through a spherical faceplate (R = 210 mm in portrait; a landscape view gets a flatter, squarer face with a rim as deep at the sides as at the top, so the bulge stays subtle and the picture keeps its edges and corners). Plates look about 9% bigger at the centre (15% at the back cloth), with Fresnel room reflections, a total-internal-reflection rim, lateral dispersion near the rim, and heat/current shimmer. Prompts and taps are mapped back through the same optics. | `optics.js` (`fitTube`), `gpu.js` (`glassRay`, `bulbRadius`), `index.js` (input mapping) |
| Tilt-shift | A Scheimpflug-tilted focal plane through the diver's row. The circle of confusion is computed per pixel from the true 3D hit point, then a gather bokeh with near-field spill is applied. Autofocus racks to the diver; on menus and minigames the focus lies on the card. | `passes.js` (cocTile, dof), `index.js` |

Head-coupled parallax: moving the mouse over the screen, or tilting a phone (gyroscope;
iOS asks for permission on the first tap), shifts the eye a few millimetres. The gaps
between plates and their shadows move live.

## How the port works

The legacy game (`../sewerdiverdescentcity12.html`) stays the single source of truth for
gameplay. `scripts/sync-legacy.mjs` extracts its markup, the FRGen sprite generator and the
game IIFE, then applies a short list of mechanical seams. Each seam must match exactly, or
the sync aborts. The seams:

- make the global `ctx` routable. `sw(k)` points it at plate *k* of the atlas, so **no
  draw function was rewritten**
- divert additive (`lighter`) radial glows to an emissive plate, and tag every glow with
  its plate (glows become real lights)
- replace the painted murk/lantern overlay with real lights, and print the HUD (bars, readouts, toasts, prompts) into the flooded glass
- route sub-mode drawing to plates
- send minigame taps back through the glass optics
- expose a read-only bridge (getters) so the theatre can read live game state

Intro, menus and minigames still draw to the old flat canvas. The theatre shows that canvas
on the **card flat**, a backlit panel that glides in magnetically in front of the stage.

After updating the legacy build: `npm run sync && npm run build`.

## Develop

```
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ + publishes ../sewerdiverdescent3d.html
npm run smoke        # headless end-to-end on WebGL2 and WebGPU (needs the build)
```

URL switches: `?flat` (original 2D game), `?webgl` (force the WebGL2 backend),
`?quality=ultra|high|mobile|low`, `?debug` (fps / backend overlay),
`?view=compose|irr|vol|coc|fluid|velocity|albedo|hud` (inspect a buffer),
`?lights=key,lantern,glows` (isolate light groups).

`dev/shadowtest.html` is a synthetic scene: the same bar on three plates over a light back
cloth, key light only. It shows that shadow softness and offset grow with the caster's
distance (`?head=-5.5` / `?head=5.5` shows the head-coupled parallax).

## Quality

Tiers (`quality.js`) scale shading resolution, light samples, the fluid grid, speck count
and DOF taps. All four tricks stay on at every tier. A frame-time governor lowers the render
scale when frames run long and raises it again when there is headroom.

## Known limits

- Verified headless on SwiftShader (CPU) only: both backends compile and run every pass
  without errors, but real-GPU frame rates still need checking on actual phones and
  desktops. `?debug` shows fps, backend and tier.
- Pinned to three r184: r185+ passes a texture-view `swizzle` that Chrome 141-era
  browsers reject.
- The legacy boot intro advances per frame, so on a device rendering far below 60 fps it
  plays slower (tap to skip, as before).
