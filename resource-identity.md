# Resource identity: colour and shape rules

Every layer has **3 minerals** (ore in the walls, ids `tNr{a,b,c}`) and **3 floating resources**
(pickups in the water, ids `tNm{a,b,c}`). An environment is 4 layers, so it holds 12 minerals and
12 floats. Before this rework, a layer's three floats were the same FRGen form in the same hue
(±15°) and ignored their resource colour. Minerals reused the same three hues on all four layers,
so layer 1's minerals and layer 3's looked the same.

The planner is `riPlanEnv` in `sewerdiverdescentcity12.html` (block "RESOURCE IDENTITY"). It runs
once per environment, and `applyCityVariant` hands each layer its slice.

## Rule 1: the colours come from the environment's palette

The palette is read from the environment's own coat *after* the city variant has tinted it:

| Source | Weight |
|---|---|
| `pal.accent` | 3 |
| the 3 authored `palHues` | 2.5 each |
| `pal.acc2`, `pal.moss`, `kelp[1]` | 2 |
| `kelp[0]` | 1.5 |
| `pal.pipeL`, `pal.hi`, `pal.base`, `rock`, `water[0]` | 1 |

The coat's colours are dark (they paint walls and water), so each one keeps its **hue** and is
lifted to a lightness a resource can be read at. This is done in OKLab, the perceptual space, so
equal distances look equally different:

- a chromatic colour becomes three swatches: **bright** (L 0.75), **deep** (L 0.62) and **pale**
  (L 0.88, half the chroma)
- a grey or steel colour becomes one tinted **neutral** silver (L 0.86)
- any two coat colours more than 60° apart on the hue wheel also give their **midpoint** hue (both
  midpoints when they are nearly opposite). That is a mix of two palette colours, so it stays on
  palette. This is what stops a two-hue coat from producing only two colours.

Near-duplicates merge and pool their weight. An environment ends up with 7 to 26
swatches.

## Rule 2: within a layer, colours are as far apart as the palette allows

"The same colour" means an OKLab distance under **0.09** (about 40° of hue at resource chroma).
Lightness counts at 0.35×, so a shade of a hue (deep vs bright orange) still counts as that hue
and never passes as a different colour.

All 24 resources of the environment are coloured together. A clash costs, from most to least:

1. two of the **same kind in the same layer** (minerals or floats): 60. These want at least 1.8×
   the threshold between them, not just enough to pass it.
2. a mineral against a float **in the same layer**: 14
3. two of the same kind in **neighbouring layers**: 8 (6 when further apart)
4. a mineral against a float in different layers: 1

Re-using a swatch at all costs a little (4 for the same kind, 1.5 across kinds). That spreads the
colours over the whole palette instead of cycling the same three on every layer. Characteristic
coat colours (high weight) are preferred slightly. A greedy pass and then a local search settle
the plan. It takes about 3 ms per environment.

## Rule 3: when colours run out, the shape changes radically

Two resources of a kind that look like the same colour (within 1.5× the threshold, so "close"
already counts) must have silhouettes from **different families**, not just different shapes. Inside
a layer, the three shapes always differ.

**Minerals**: 9 shapes in 8 families (`RI_ORE_FAM`)

| Family | Shapes | Reads as |
|---|---|---|
| mass | chunk | a solid irregular lump |
| cubic | cubes | stepped axis-aligned blocks, no diagonals |
| spike | crystal, spire | a crown of shards / one tall obelisk |
| round | glob | a soft blob with drips |
| ring | geode | a shell cracked open on a bright crystal hollow |
| scatter | nodules | 4–6 separate pebbles with gaps between them |
| strata | slab | stacked layers |
| seam | vein | a thick zigzag line climbing the face |

**Floating resources**: the 14 FRGen forms in 8 families (`RI_FLOAT_FAM`)

| Family | Forms |
|---|---|
| tube | canister, vial, cell |
| orb | bulb, jelly, sac, bag |
| ring | coil |
| block | brick, core |
| drum | barrel |
| twin | pod |
| shard | crystal |
| sheet | cloth |

The archetype's own `shapes` and `float` are its **signature** forms and are preferred when
nothing forbids them.

## Rendering

- Floats are drawn in their planned form and their `RES` colour: `FRGen.make(key, variant, seed,
  {form, col})`. Highlights mix toward white rather than multiply, so a light colour keeps its hue.
- Every menu, pack and shop icon is a render of the in-world sprite, never separate art. A float's
  icon is its FRGen sprite (`floatSVG`). A mineral's icon is the exact ore tile `drawOre` blits,
  rock base included, read back pixel by pixel (`oreGridSVG` → `canvasRects`). Salvage icons are
  the water's nugget (`scrapBody`). Refined goods have no world sprite, so they keep their drawn
  icons.
- Refined goods (`tNf*`) wear a pale tint of the mineral they are pressed from (`riRefined`).
- The plan is deterministic per (city, environment, `RUN_SEED`). Each dive re-rolls the small
  jitter, and saves need no new data: `THEME[n].floatForms` and `oreShapes` are saved with
  `THEME`, and saves made before this change fall back to the environment's own FRGen form.

## Audit (all 65 environments, in the variant each one first appears with)

| Check | Result |
|---|---|
| Pairs that look like the same colour and share a silhouette family | **0** |
| Layers whose 3 minerals include two of the same colour | 9 of 260 |
| Layers whose 3 floats include two of the same colour | 10 of 260 |
| Typical distance between a layer's two closest colours | 0.164 (1.8× the threshold) |
| Different colours used per environment (out of 24 resources) | median 15, minimum 7 |

The same-colour pairs inside a layer all come from coats that are a single hue family. One example
is Radioactive under the *Smoldering* variant, which is entirely violet. There the shapes carry
the difference, as Rule 3 intends.

## Study sheet

`resource-identity-study.html` draws every environment's palette and its 4 × (3 + 3) resources with
the game's own code. Regenerate it after changing the planner, FRGen or the ore engine:

```
cd web3d && npm run study
```
