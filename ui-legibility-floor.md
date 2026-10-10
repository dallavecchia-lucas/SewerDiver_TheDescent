# UI legibility floor (mobile first)

The first rule of the mobile UI pass. Everything else (what to show, where, how big) is
built on top of it.

## The rule

> **Text the player needs to read has a cap height of at least 8 CSS px, and strokes at
> least 1 CSS px thick, on the smallest supported phone.**

The rule applies everywhere: the canvas HUD, the 3D glass HUD, the minigames, every HTML
panel (map, inventory, refinery, tutorials, pause) and in both portrait and landscape.

It is measured in **cap height** (the height of a capital letter) rather than `font-size`,
because the game mixes two very different fonts: a 3×5 pixel font and Courier New. The same
`font-size` gives them very different cap heights. Cap height is what the eye actually reads.

Only these are exempt: hardware decoration printed on the bezel (`.bm-name`, `.bm-mk`,
`.scr-label`) and the developer panel (`#dev*`). If a label carries information, it is not
decoration.

### Why 8 CSS px

- A phone CSS px is about 1/150 to 1/165 inch, so 8 CSS px is about 1.3 mm. Held at
  30 to 35 cm, that is about 13 to 15 arcminutes. That is the smallest size readable at a
  glance, without squinting.
- It matches the platforms' own minimum text sizes: iOS's smallest text style (11 pt SF,
  cap ≈ 7.8 px) and Material's (12 sp Roboto, cap ≈ 8.5 px).
- It is a **floor**, not a target. It is meant for the least important text on screen.
  Numbers read mid-action (HP, O₂, depth, prompts) should sit above it. Tiers above the
  floor are the next step.

### What it means for each font

| Font | Floor | Note |
|---|---|---|
| `FONT3` pixel font (`pxText`, `pxTextC`, glyphs 5 px tall) | **≥ 1.6 CSS px per font pixel** | The stroke is one font pixel, so the stroke rule passes automatically. |
| `pxTextXL` | same: `scale × 5 × css-per-world-px ≥ 8` | Already large in practice. |
| Courier New (HTML, cap = 0.571 em) | **`font-size` ≥ 14px**, and `clamp()` lower bounds ≥ 14px | Regular-weight strokes are hairlines (well under 1 CSS px at 14px), so small text must be **bold**. Android has no Courier New and falls back to another monospace font, so check there by eye. |
| The base terminal's monospace stack (`.cy`: SF Mono, Menlo, Roboto Mono, Droid Sans Mono, DejaVu Sans Mono; caps ≥ 0.70 em) | **`font-size` ≥ 12px** | Used only inside the CRAFT/SHOP deck. 12px gives a cap of 8.4px or more on phones. Windows falls back to Consolas (0.64 em), but desktop screens are not the floor's target. `npm run legibility` checks `.cy` rules against 12px. |
| `ctx.font` on the world canvas | not allowed for informational text | It scales with the world canvas, so its real size changes on every device. |

## Where we stand (audit, 4 Oct 2026)

`cd web3d && npm run legibility` measures the legacy build (the single source of truth for
gameplay) in real in-browser phone viewports, with the browser's bars showing, and lists
every violation. It exits with code 1 while anything fails, so it can later gate the build.

### The canvas HUD fails on every phone

Portrait locks the view at 352 world px tall, so a world pixel is whatever the canvas height
divided by 352 happens to be:

| Viewport (CSS px) | Canvas | View (world px) | CSS px / world px | FONT3 cap now |
|---|---|---|---|---|
| iPhone SE, Safari 375×548 | 333×317 | 370×352 | 0.90 | **4.5 px** |
| Small Android, Chrome 360×640 | 318×411 | 272×352 | 1.17 | **5.8 px** |
| iPhone 13/14, Safari 390×664 | 348×433 | 284×352 | 1.23 | **6.2 px** |
| iPhone Pro Max, Safari 430×740 | 388×463 | 296×352 | 1.32 | **6.6 px** |
| Pixel 7, Chrome 412×839 | 370×562 | 232×352 | 1.60 | **8.0 px** (just under) |
| iPhone 13 landscape 844×340 | 486×292 | 458×276 | 1.06 | **5.3 px** |

All 65 `pxText` / `pxTextC` call sites draw at 1×, and every one of them is below the floor on
every phone tested. At 2× they would pass everywhere, but the size would range from
9 px (iPhone SE) to 16 px (Pixel 7). The cause is that text is locked to the world-pixel
grid, and the world-pixel size changes with the device.

### HTML overlays: 95 CSS rules and 43 inline styles below 14px

The most common sizes are 9px (cap 5.1) and 10px (cap 5.7). The smallest visible text is
8px: `.mnav`, `.msens .msl`, the tutorial and briefing `.t2` headers, `#oreprompt`'s
`.ip-key`, and most lines of the HUD readout (inline styles). Run the script for the full
list. The resource chips (9px) and the pack's sub-labels (9px) are the densest offenders.
The control captions (`.lbl`, `.jhint`, `.kbdhint`) are hidden on every layout, so the
audit skips them.

Which of these texts should exist at all is triaged in
[ui-text-inventory.md](ui-text-inventory.md).

## Implications for the next step

1. **Decouple text from the world grid.** Draw HUD text on its own layer, at screen
   resolution, with a font pixel set to `max(1.6 CSS px, …)` and snapped to whole device
   pixels. The text keeps the 3×5 pixel look, but it has the same physical size on every
   phone and no longer jumps between 1× and 2×. The 3D build already has a separate HUD
   canvas (`web3d/src/theatre/sheets.js`), which today is only sized to the world view.
   The alternatives are worse: forcing 2× world-px text wastes space on big phones, and
   clamping the world scale shows fewer tiles on small phones.
2. **Raise every HTML size to the floor, and fix the space with layout, not with smaller
   text.** Fewer words, icons in place of labels, and secondary detail behind a tap.
3. **Then define the tiers above the floor** (glance numbers, prompts, titles) and
   decide what earns a permanent spot on screen.
