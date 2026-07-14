# Progression & Crafting Reference — per-environment resource economy

Implemented in `sewerdiverdescentcity12.html`. Formalizes the notebook design: every
environment is 4 layers (a–d), every layer carries 3 **ore** types (O1–O3, mined), 3
**floating** types (F1–F3, mixer fluids), and 3 **composites** — `(Fn + On)` in notebook
notation, the Mixer's existing "refined" recipe (2× ore + 1× floating of the same slot).

## Resource roles per layer

| Slot | Ore / Floating | Composite `(F+O)` |
|---|---|---|
| **#1** | O₂ regulator / O₂ tank | Bulkhead panel toll · half of a hazard seal |
| **#2** | — | Base power (layer below) · lens grind · other half of a seal |
| **#3** | — | Suit (one from each of the env's 4 layers) |

## Items

All versions are **per environment**: each new environment offers V1–V4 again from *its*
layers. Versions fit sequentially (V2 needs V1). Item Vn draws on layer n (a=1 … d=4).

| Item | Where | Cost (Vn = layer n of current env) | Effect per version |
|---|---|---|---|
| O₂ tank | Workshop · O₂ Gear | 5× floating #1 | +18 max air (`TANK_STEP`) |
| O₂ regulator | Workshop · O₂ Gear | 5× ore #1 | −5% air drain (floor ×0.4 total) |
| Lens | Workshop · Lens | 1× composite #2 | beam +10% (cumulative) |
| Hazard seal | Workshop · Seals | 1× composite #1 + 1× composite #2 of the layer stood on | big pollution cut on that layer (`SEAL_R`) |
| Suit | Workshop · Fab Bay | 1× composite **#3** from each of the env's 4 layers | next environment's suit (unchanged stats) |

## Gates

- **Bulkhead control panel** — quest completion still arms it; throwing it now also eats
  **1× the layer's composite #1**, once (`layerMissions[n].bulkPaid` rides the save, so a
  save caught mid-animation can't charge twice).
- **Base activation** — every base eats **1× composite #2 of the layer directly above it**;
  at an environment boundary that's the previous environment's layer-d composite. The only
  base with nothing above is env-1 layer-a of each city — it spawns online (unchanged).

## Pollution scoping (unchanged engine, now consistent everywhere)

Environment 1 is pollution-free (`ambientAt`), so its counters don't exist there: seals
start in environment 2, and the coin-bought **filter cartridge** is only offered/purchasable
from environment 2 down. Tank and regulator are *not* pollution items and exist in env 1.

## Coin economy after the move

Coins now only buy convenience: scrap dealer, parts & machines, sector-nav map, filter
cartridges (env 2+), and the resource exchange. Progression items (tank, regulator, lens,
seal, suit, gates) are 100% resource-crafted.

## Balance knobs (all in one place)

- `O2_TANK_COST` / `O2_REG_COST` (5 each) — raw-resource item costs
- `o2TankCost/o2RegCost/lensCost/sealCost/bulkToll` — recipe shapes
- Composite demand per layer at baseline: #1 ×2 (bulkhead + seal), #2 ×3 (base + lens + seal),
  #3 ×1 (suit) → ≈ 12 ore + 6 floating per layer on top of tank/regulator mats. If a layer
  feels grindy, first candidate is dropping the seal to composite #1 only.

## Save compatibility

Save version stays v3. New `player` fields: `o2tank`, `o2reg`, `lensUpg` (env-index →
`[V1..V4]` flags). Legacy saves migrate on load: old `oxyUpg` regulators become env-0
regulators, `lanternLevel` maps to env-0 lens flags; coin-bought `tankBonus` air is kept.
