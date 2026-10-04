# UI text inventory (mobile)

Every piece of text the game can put in front of the player, run through three questions,
in this order:

1. **Can this info be a symbol?** → **SYMBOL**: an icon, glyph, pip row, colour or motion
   replaces the words.
2. **If not, can a rework of the UI address it?** → **REWORK**: merge, move, show only on
   focus, show only the first time, or let the visual already on screen carry it.
3. **If not, is it relevant to the immediate game situation?**
   **KEEP**: it stays as text, at or above the [8 px cap floor](ui-legibility-floor.md).
   **CUT**: off the live screen. It goes to pause or objectives, to the one-time slides, or
   gets deleted.

This is a study only. No game code was changed. The source is
`sewerdiverdescentcity12.html`, which the 3D build inherits word for word. Sizes are as
rendered today: canvas text in **wpx** (world px; FONT3 is 5 wpx tall, and one wpx is
0.9–1.6 CSS px on phones), HTML text in CSS px. Most HTML text uses Courier New, whose
capitals are 0.57 of the font size.

## Findings that change the picture

- **The live HUD carries the most text that doesn't need to be there.** The top-right
  readout can stack **8 lines** of 8px text (depth, city, layer, mission, coins, MULE
  controls, infested, pollution). After triage it needs at most **3**: depth, the objective
  as icon + pips, and a row of state symbols. The `HP` and `OXYGEN` labels each take a
  7 wpx row above their bar. Putting a symbol beside each bar instead shrinks the HUD block
  from 38 to about 22 wpx.
- **Toasts are clipped today.** The toast is a single line (`white-space:nowrap`) at 11px
  with 2px letter spacing, so about 38 characters fit on a phone. Measured on an iPhone 13
  (390 CSS px): a 45-character toast spans −12…402 px, and an 86-character one spans
  −188…578 px. **37 of the 78 distinct toasts run off both edges of the screen.** Most of
  them restate something already visible, or teach something the one-time slides already
  teach.
- **One concept, many names.** Health is `HP` (HUD, mining) and `HULL` (valve and terminal
  minigames). Air is `OXYGEN`, `O2 HELD` and `AIR LINE`. Salvage is `SLV`, `salvage`,
  `slv` and `◈`. A single symbol per concept fixes this and saves space at the same time.
- **Keyboard words on a touch screen.** `press space to resume`, `press mine / space to try
  again`, `◂ ▸ choose line · F / space — ride · esc — stay`, the menu footers
  (`◀▲▼▶ move · ⛏/F select · ⚙ back`), and `F drill · space hook · X out` all name keys a
  phone doesn't have. Button captions and the keyboard hint line are already stripped on
  every layout. These are the ones that slipped through.
- **Dead text.** `TITLE_HTML`, the long eight-bullet "The dive" panel, is never shown.
  Nothing calls `setMode('title')`, and the boot intro hides the overlay. It needs no work.
- **Precedents already in the game.** The game already uses symbols in places: the air-line
  status chip beside the O₂ bar, the ☢ that flashes after environmental damage, the hull
  pips on the boat, vent and sensitivity pips, `◎` coins, `✚` patch kits, the stripped
  button captions, and the ✓ on fitted gear. Most of the proposals below reuse these.

## The symbol vocabulary

These are the symbols the proposals below rely on: one per concept, used the same way on
the HUD, in the minigames and in the menus. Most already exist in the code.

| Concept | Symbol | Exists? |
|---|---|---|
| Health | heart (`drawHeart`) | yes, unused on the HUD |
| Oxygen tank | bubble / tank (`tankIcon`) | yes (workshop) |
| On the air line | air-line chip | yes (HUD) |
| MULE battery | cell (`batIcon`) | yes (workshop) |
| Coins | `◎` | yes |
| Salvage | `◈` | yes (pack header) |
| Patch kit | `✚` / `medIcon` | yes |
| Pollution | ☢ (`drawRadSymbol`) | yes |
| Infested layer | nest / eye glyph | **new** |
| Objective kinds: hack / burst / vent | terminal / pod / valve glyph in their existing colours (cyan / lime / orange) | colours yes, glyphs **new** |
| Count of n | pip row | yes (pattern) |
| Locked / needs a deeper layer | padlock + layer pip | **new** |
| Done / maxed | ✓ | yes |
| Time left | shrinking bar or ring | **new** (today a `12.3s` number) |
| Deny / missing | red flash on the chip that is short + deny sound | sound yes |

A symbol only works if the player learns it. Each one is taught once, in the slides that
already exist, and never changes meaning after that.

---

## 1. Live HUD (play mode, always on screen)

### Canvas bars (5 wpx FONT3)

| Text | When | Verdict | Treatment |
|---|---|---|---|
| `HP` above the HP bar | always | **SYMBOL** | Heart to the left of the bar, which moves up into the freed row. |
| `OXYGEN` above the O₂ bar | always | **SYMBOL** | Tank/bubble to the left. The air-line chip already sits on the right. |
| `BATTERY` above the MULE bar | piloting | **SYMBOL** | Cell icon to the left. The coil strip under it already has no label. |
| `NAV` above the minimap | map bought | **CUT** | The map is self-evident. A symbol isn't needed either. |

### HTML readout, top right (`#readout`)

| Text | Size | When | Verdict | Treatment |
|---|---|---|---|---|
| `120M` depth | 13px | always | **KEEP** | The one always-on number. Keep it big. |
| `OLD MIRE · CITY 1` | 8px | always | **CUT** | Not needed mid-swim. It already appears on pause and in the workshop header. |
| `L3/12 · <layer name>` | 8px | always | **SYMBOL + CUT** | The layer position becomes pips, or the bracket already on the minimap. The name shows once, as an entry card, when you cross into a new layer, and on pause. |
| `◆ <task> 1/3 · HACK` | 8px | mission active | **SYMBOL** | Objective-kind glyph in its colour, plus pips for 1/3. The task title moves to the objectives screen. |
| `◆ <exit> — control unit by the bulkhead` | 8px | all tasks done | **SYMBOL** | Gold ◆ + gate glyph. The minimap marker and the `AIRLOCK` sign already point there. |
| `◎ 120` coins | 10px | always | **CUT** | Coins only matter at a base. Show them in the workshop and pack, as they already are. |
| `✚3` patch kits | 10px | holding some | **KEEP** (symbol + number) | Already a symbol. |
| `▮CELL` spare cell | 10px | holding one | **SYMBOL** | Cell icon only; drop the word. |
| `◈ MULE · F drill · space hook · ↑ boost · X out` | 8px | piloting | **REWORK** | On touch it names keys you don't have. Swap the action buttons' icons while piloting. `updateActionLabels` already switches meanings, but the captions are hidden, so the icons have to carry it. |
| `⚠ infested layer` | 8px | layer has nests | **SYMBOL** | ⚠ + nest glyph in the state row. |
| `⚠ pollution` | 8px | polluted & off the line | **SYMBOL** | Green ☢, already drawn after environmental damage. |

### Floating context prompt (`#oreprompt`, 9px, button icon + verb)

| Verb | Verdict | Treatment |
|---|---|---|
| `MINE`, `DRILL`, `CRAFT` | **SYMBOL** | The button icon already shown (`ipMark`) says it. Drop the word. |
| `HACK`, `BURN`, `CRANK`, `RELEASE` | **SYMBOL** | The objective-kind glyph replaces the word. The mine button is always the one to press. |
| `ACTIVATE`, `PILOT`, `INSERT CELL` | **KEEP** | All use the overloaded clip button, so the verb disambiguates. Short, at the floor. |
| `DEAD MECH`, `BACK OFF` | **SYMBOL** | Dead cell / ✕ in red with a pulse. There's nothing to press, so it's a warning, not a prompt. |

### World signage (drawn in the world, 5 wpx)

| Text | Verdict | Treatment |
|---|---|---|
| `AIRLOCK` over the gate lever | **SYMBOL** | Door/lever glyph. Its grey, yellow and green states already tell the story. |
| `EXIT` over the transit gate | **SYMBOL** | Down-arrow gate glyph, matching the gold minimap marker. |
| `ACCESS` stencilled on the arch (2×) | exempt | Diegetic decoration, not information. |

## 2. Toasts (78 distinct, 11px, one line, top of screen)

Rule after triage: a toast is only for what must be read **now**, in at most about
three words plus a symbol. All toasts sit in `showMsg()`.

| Group | Examples | Verdict | Treatment |
|---|---|---|---|
| Craft and buy confirmations (~15) | `bought 1× …`, `thruster pack fitted — faster swimming`, `O₂ tank V2 fitted · +20 max air`, `lens V1 ground — …`, `filter cartridge fitted · pollution down`, `cashed in salvage · +40 coin`, `air line extended to 120u` | **CUT** | The craft animation (`+1 · NAME`) and the card's ✓ already confirm it. |
| Denials (~17) | `need 30 coin`, `not enough parts — buy them above`, `not enough salvage — 12 needed`, `dock at a powered base to craft`, `move onto ore to mine it`, `get near the base or the dropped line to clip`, `no ore in the drill's reach`, `no patch kits`, `already at full health`, `filters maxed`, `you already own the MULE`, `floodlight already fitted`, `sector-nav already installed`, `you already have a scrappy robot` | **SYMBOL** | Deny sound plus a red flash on the chip that is short. The "already …" cases can't happen once the button is disabled (✓). The prompt only appears when an action is possible. |
| World state changes (~8) | `clipped to the air line`, `unclipped — the line stays where you dropped it`, `base online — air line live, clip on with ⚓`, `cell slotted — the MULE rumbles awake`, `stepped out — the MULE holds position`, `the MULE stomps in — battery at 80%`, `scrappy robot online — …`, `sector-nav online — minimap live on your HUD` | **SYMBOL** | The rope, the air-line chip, the battery bar and the minimap appearing already show it. Pulse the matching HUD symbol once. |
| Danger, act now (~12) | `vein destabilised — get clear before it blows`, `gas pocket blew — vein destroyed`, `it was no ore — the vines have you!`, `battery dead — the MULE seizes …`, `thruster burnt out — coil rebuilding`, `patch kit auto-applied — back from the brink`, `cell dead — the drill won't spin`, `cell spent — the spare slams in` | **KEEP, shortened** | 1–3 words + symbol: `⚠ GET CLEAR`, `✚ SAVED`, `▮ DEAD`. |
| Minigame outcomes (~6) | `TIMER OUT — the valve blows in your face!`, `TIMER OUT — the console arcs …`, `TIMER BUST — the sac ruptures on you!`, `SAC BURNED CLEAN — no blowback`, `valve left part-open …`, `backed off the sac — it is still live`, `link dropped — the node is still locked` | **CUT** | Duplicates the minigame's own big banner (`BLOWOUT`, `BREACH`, `RUPTURE`, `PURGED`). The "left open" cases become a symbol on the machine (still lit or pulsing). |
| Objective progress (~9) | `<task> — 2/3`, `<task> done — NEXT: <task>`, `ALL TASKS DONE — …`, `bulkhead released — descend`, `deck below is dry — flooding it now, stand by`, `panel needs 1× <item> to power the release`, `haul 1 <item> down here — built one layer up — …`, `new environment below — fabricate <suit> first`, `finale sector sealed — objective pending: …` | **REWORK** | Progress ticks a pip in the HUD objective row. "Needs X" shows the item icon with a ✕ inside the prompt bubble. Keep one short word for the moments: `▼ DESCEND`. |
| Pickups and flavour (~8) | `salvage · <name> (12 coin)`, `robot · <name> (…)`, `sawed the <eel> apart — this one's gone for good`, `the saw shreds the <x> — <y> spills out` | **SYMBOL** | Item icon + `◈12` floats up from the pickup, like the reward pop. |
| Teaching (~6) | `piloting the MULE — F drill · SPACE hook · hold ↑ boost · X exit · sealed: no O₂ drain`, `DV-8 "MULE" assembled — its battery bay is EMPTY. craft a cell …`, `⚠ infested layer — nests everywhere. the MULE's saw clears them for good`, `no pollution in this environment — filters matter deeper down`, `hazard seal V2 fitted — this layer bites less now`, `the transit gate is too tight for the MULE — step out (X) …`, `the MULE's hands are too big for that — step out (X) to work it` | **CUT** | This belongs in a one-time slide deck. The MULE has none yet; it would be the one new deck. The "too big / too tight" cases become a symbol on the prompt (MULE ✕). |
| Arrival (1) | `CITY 2 — <name> · 4 environments down there · deep cargo sold for 80 coin` | **REWORK** | A city title card, a moment worth a big name. Counts go to the city map, the sale becomes the coin float. |

## 3. Pop-ups over the play screen

| Text | Size | Verdict | Treatment |
|---|---|---|---|
| `COLLECTED` (reward pop tag) | 13px | **CUT** | The spinning icon pop already says it. |
| `<resource> ×2` (reward pop name) | 11px | **REWORK** | Show the name only the first time each kind is picked up. After that, icon + `×2`. |
| `+1 · <name>` / `FABRICATED · <name>` (craft animation) | 13px | **SYMBOL** | Icon pop + `+1`. The card you just tapped already names it. |

## 4. Minigames (full canvas, 5 wpx unless noted)

Every minigame opens with a slide deck that explains it. Text inside the game therefore
only needs to show **state**, not instructions.

### Shared gauges

| Text | Verdict | Treatment |
|---|---|---|
| `OXYGEN` / `AIR LINE` / `O2 HELD` | **SYMBOL** | Same tank and air-line symbols as the HUD. |
| `HP` (mining) / `HULL` (valve, terminal) | **SYMBOL** | The heart everywhere. This also fixes the naming split. |

### Mining (portrait: HTML header and footer + canvas; landscape: canvas dashboard)

| Text | Size | Verdict | Treatment |
|---|---|---|---|
| `<ore name>` + colour swatch (header) | 12px | **SYMBOL** | Ore icon or swatch only. The name doesn't change a dig decision. |
| `SENS` + 5 pips | 8px | **SYMBOL** | Radar glyph + the existing pips. |
| `VEIN 3/8` + bar | 10px | **SYMBOL** | Ore icon + bar. The number is optional. |
| `tap a tile to scan · tap again to dig` | 9px | **REWORK** | The mining deck teaches it. Show it during the first dig only. |
| `DIG` button | 11px | **SYMBOL** | Pick icon, the same as the mine button. |
| Landscape dashboard: `<ORE NAME>`, `SENS`, `VENTS` (`ctx.font` 8–9px, drawn in world space) | 8–9 wpx | **SYMBOL** | Same glyphs. These are also the only `ctx.font` text in the game. |

### Valve (crank)

| Text | Verdict | Treatment |
|---|---|---|
| `VALVE CTRL` title, `SECTOR GAS GRID`, `SERVO A3` | **CUT** | Flavour labels. The deck already named the machine. |
| `LIVE` + blinking dot | **SYMBOL** | The dot alone. |
| `12.3s` timer | **KEEP** → SYMBOL later | Urgent. Could become a draining bar, so no digits to read mid-action. |
| `BLED 40%` | **SYMBOL** | The pip row and the pressure dial already show it. |
| `42` PSI (3×) + `PSI` | **KEEP** number / **CUT** unit | The big number is the gauge; the unit adds nothing. |
| `IN` / `OUT` pipe ends | **CUT** | The flow dashes already show the direction. |
| `HOLD` / `ACTUATE` / `STANDBY` (2× button label) | **SYMBOL** | The button's green, red or grey state already says it. Swap the word for ▶ / ✕ / … |
| `FIRE ON GREEN   AVOID RED` (fades) → `FIRE ON GREEN` (stays) | **REWORK** | Keep the fading hint on the first attempt. Drop the line that stays. |
| `RELEASED` / `BLOWOUT` (3×) | **KEEP** | The outcome moment, already big. |

### Wall terminal (ICE break)

| Text | Verdict | Treatment |
|---|---|---|
| `ICE BREAK` / `MATCH GLYPH` phase title | **SYMBOL** | Two phase pips (ring → grid). |
| `ICE` + dot | **CUT** | |
| timer | **KEEP** → SYMBOL later | As for the valve. |
| `SIDES 2/4` / `GLYPH LOCKED` | **SYMBOL** | Pips filling, then a flash. |
| `YOUR GLYPH` over the reference | **REWORK** | Frame the reference glyph so it reads as "yours". |
| Hints: `MOVE TO THE LIT SIDE   SELECT`, `SELECT THE SHINING SIDE`, `FIND YOUR GLYPH   INPUT`, `MATCH THE GLYPH YOU BUILT` | **REWORK** | First attempt only, as for the valve. |
| Banners: `GLYPH LOCKED`, `LAYER CRACKED 2`, `SEQUENCE RESET`, `WRONG NODE — REBUILD` | **KEEP, shortened** | ✓ / ✕ flash + one word (`RESET`, `WRONG`). |
| `ACCESS` + `GRANTED` (3×) / `CONSOLE ARCS BACK` + `BREACH` (3×) | **KEEP** big word / **CUT** small line | |

### Biohazard sac (torch)

| Text | Verdict | Treatment |
|---|---|---|
| `BIO-INCINERATOR` title | **CUT** | |
| `LIVE` / `CLEAR` | **SYMBOL** | Dot colour. |
| `PURGE WINDOW` label + `12.3s` | **CUT** label / **KEEP** timer | |
| `STICK TO AIM · HOLD FIRE TO BURN` (fades) | **REWORK** | First attempt only. |
| `MOVE ONTO A PUP` / `ON TARGET — HOLD FIRE` / `BURNING` | **SYMBOL** | The reticle turns green on target; the flame shows it's burning. |
| `CONTAINMENT URN` under the vase | **CUT** | Decoration. |
| `PURGED` / `RUPTURE` (3×) | **KEEP** | |

### Boat run (U-552 pipe run)

| Text | Verdict | Treatment |
|---|---|---|
| `SLV 12` | **SYMBOL** | `◈ 12`. |
| `BOOST`, `TUBE` (wide screens only) | **SYMBOL** | Coil and torpedo glyphs, so the narrow layout gets them too. |
| `!` / `DRY` blink | **SYMBOL** | Bar flash; `DRY` becomes a dim, blinking bar. |
| `REAR` beside the chevrons | **CUT** | The red chevrons already say it. |
| Opening block, 4 lines: `THE STREAM CARRIES YOU`, `UP DOWN - FIRE FORWARD`, `FULL BOOST: ONE BURN, NO BRAKES`, `MINES DROP UP AND DOWN` | **CUT** | Word for word what the U-552 deck shows just before. |
| `GATE REACHED` / `HULL BREACHED` | **KEEP** | |

## 5. Base menus (game waits for the player)

Here "the immediate situation" is **the choice being made**: what it is, what it costs,
whether you can afford it, and what it does. Everything else goes behind focus or a tap.

### Workshop and shop (`#craft`)

| Text | Size | Verdict | Treatment |
|---|---|---|---|
| `WORKSHOP` / `SCRAP SHOP` header | 13px | **CUT** | The tabs below already say `CRAFT` / `SHOP`. |
| `OLD MIRE · CITY 1 · DEPTH 120M · <layer> · <suit>` | 9px | **CUT** | Not part of any choice here. It's on pause. |
| Tabs `CRAFT`, `SHOP · 120` (with icons) | 10px | **KEEP** | `◎` instead of the bare number. |
| Division labels under the icons: `Cargo`, `Mixer`, `Fab Bay`, `Air Line`, `O₂ Gear`, `Seals`, `Lens`, `Patch`, `Mech` / `Dealer`, `Parts`, `Machines`, `Outfit`, `Mech Lab`, `Exchange` | 10px | **REWORK** | Icons only in the grid. The focused cell's name goes in one caption line, at the floor. |
| `◂ <division title>` back row | 11px | **SYMBOL** | `◂` + the division icon. |
| `resources · in stock`, `parts aboard` panel headers | 9px | **CUT** | The chips (icon + have/need) explain themselves. |
| Resource chips: icon + have / need | 9px | **KEEP** | Already symbol + numbers. Raise them to the floor. |
| Next-base panel: `next base · power-on` + `haul 1× <item> — this layer's #2 composite — down to the dead base below to power it on` | 9–10px | **SYMBOL** | A symbol sentence: `[item 0/1] ▼ [dead base]`, then ✓ when it's powered. |
| Card name (`O₂ tank V2`, `Battery cell`, …) | 12px | **KEEP** | This is the choice. |
| Card detail in grey (`+20 max air`, `−5% air drain`, `heals 2 · max 5 · 3 aboard`, `have 2 · 15 coin`) | 9px | **SYMBOL** where it's an effect (`+20 [tank]`, `✚2`), otherwise **REWORK** | Show it on the focused card only, like the pack's detail dock. |
| Cost chips: icon + **name** + have/need + `◂` | 10px | **SYMBOL** | Drop the name; it's in the focused-card detail. `◂` (carried down from above) becomes a small up-arrow pip. |
| Card buttons: `Mix`, `Fit`, `Build`, `Grind`, `Make`, `Cell`, `Call`, `Buy`, `Sell`, `Extend`, `Cash in` | 11px | **REWORK** | The on-device confirm button already acts on the focused card. The card shows its state (affordable glow / ✓ / locked) instead of a verb. |
| `FITTED`, `BUILT`, `OWNED`, `STOWED 1/1`, `MAXED`, `✓` | 9px | **SYMBOL** | ✓ (and `1/1` pips). |
| Locked rows: `◂ O₂ tank V3 — descend to this environment's layer 3 to spec it` | 10px | **SYMBOL** | Padlock + layer pip `3`. |
| Explanations (`gearnote`): `each version draws on one layer of this environment — V1 …`, `the top (#3) composite from each of this environment's 4 layers — …`, the MULE status paragraph and its long rules paragraph, `one of each fitting per environment — …` | 10px | **CUT** | Behind a `?` on the division, or into the base-terminal deck. The MULE status numbers (battery %, cap, coil, hook) become the focused card's detail. |
| Empty states: `hold's empty — go crack some outcrops and snag mixer canisters`, `no salvage aboard — grab the glinting scrap out in the dark`, `no mech aboard — build the DV-8 "MULE" in the SHOP's machine bay`, `no base on this level`, `no suit line to fabricate right now — …` | 11px | **SYMBOL** | Ghosted icon of what's missing + where to get it (pick / scrap glyph). |
| "Maxed" lines: `air line maxed · 160u`, `patch kits full (5)`, `seal V2 fitted for this layer ✓`, `lens fully focused … · beam +40%` | 12px | **SYMBOL** | ✓ MAX on the card. |
| Footer `◀▲▼▶ move · ⛏/F select · ⚙ back` | 8px | **CUT** on touch | The on-screen pad and the confirm/back buttons are the legend. Keep it in PC mode. |

### Pack (`#inv`)

| Text | Size | Verdict | Treatment |
|---|---|---|---|
| `PACK` title | 13px | **SYMBOL** | Pack icon (it's the pack button's own). |
| `resources & gear — tap an item` | 9px | **CUT** | |
| `◎ 120` | 12px | **KEEP** | |
| Section headers `Gear`, `⬡ Resources`, `◈ Salvage` | 9px | **SYMBOL** | Keep the glyphs, drop the words. |
| Cell quantity badges | 10px | **KEEP** | Numbers. Raise them to the floor. |
| Detail dock: `<name> ×3` | 12px | **KEEP** | Inspecting is the action. |
| Detail dock sub: `Raw ore · T2`, `Mixer fluid · T1`, `12 coin each`, `Restores 2 HP · auto-applies if you'd die` | 9px | **SYMBOL** | Kind glyph + tier pips, `◈12`. The patch-kit line goes into the field manual. |
| Dock hint: `refine at a base mixer`, `fabricate gear at a base`, `sell at the SHOP tab` | 9px | **SYMBOL** | The icon of where it's used (mixer / fab / shop). |
| `hold's empty — crack outcrops and grab mixer canisters out in the dark` | 11px | **SYMBOL** | As in the workshop. |
| `tap an item to inspect it` | 10px | **CUT** | Selection already defaults to the first item, so this is almost never reached. |
| `Use` (patch kit) | 11px | **SYMBOL** | `✚`. |
| Footer `◀▲▼▶ move · ⛏/F use · ▤ close` | 8px | **CUT** on touch | |

### Transit grid (city map)

| Text | Size | Verdict | Treatment |
|---|---|---|---|
| `TRANSIT GRID`, `CITY 1 → CITY 2` | 15 / 10px | **KEEP** the title / **SYMBOL** the route | `1 → 2` with a city glyph. |
| City names on the map nodes (SVG) | 9px | **KEEP** | This is the choice. Selected name only? It needs a size check. |
| `<city name>` (info) | 13px | **KEEP** | |
| `4 environments · 16 layers · a suit line at every environment` | 10.5px | **SYMBOL** + **CUT** | Environment and layer pips. "A suit line at every environment" is always true, so cut it. |
| `new down there: <archetype>` | 10.5px | **KEEP** | The reason to pick a line. |
| `finale: <finale>` | 10.5px | **KEEP** | |
| `RIDE THE GRID → <name>` / `stay` | 12 / 11px | **REWORK** | `RIDE ▸` / `◂`. The name is already shown just above. |
| `◂ ▸ choose line · F / space — ride · esc — stay` | 9.5px | **CUT** on touch | |

### Dry dock

| Text | Size | Verdict | Treatment |
|---|---|---|---|
| `DRY DOCK`, `<city> → <city>` | 15 / 10px | **KEEP** the title / **SYMBOL** the route | |
| `the yard hauled the boat out at the far intake` | 10px | **CUT** | Flavour. |
| `SALVAGE 40 (+12 this run)` | 11px | **SYMBOL** | `◈ 40 (+12)`. |
| Upgrade names (`FASTER TORPEDOES`, `TORPEDO SPLASH`, `RELOAD SPEED`, `BOOST RECHARGE`, `MINE DEFENSE SYSTEM`, `MINE BAY CAPACITY`, `HULL REINFORCEMENT`) | 11.5px | **KEEP** | The choice. |
| Level pips | — | already a symbol | |
| Cost `12 slv` / `FITTED` | 10px | **SYMBOL** | `◈ 12` / ✓. |
| Blurb + `now <value>` | 9.5px | **REWORK** | Focused row only. Keep `now → next`, cut the blurb or move it into the U-552 deck. |
| `ENTER <city> →` + `4 environments · 16 layers · unspent salvage rides with you` | 11.5 / 9.5px | **KEEP** the button / **CUT** the line | |
| `▴ ▾ choose · F / space — fit or enter` | 9.5px | **CUT** on touch | |

## 6. Pause, objectives, end screens

The pause and objectives screens are **where cut information goes**. City, layer name,
deepest depth and the full task list all live here, so they can go from the HUD with
nothing lost.

| Text | Size | Verdict | Treatment |
|---|---|---|---|
| `PAUSED` | 22px+ | **KEEP** | |
| `dive suspended · depth 120m · deepest 300m` | 12px | **KEEP** | Its natural home. |
| `<city> · city 1 · layer 3/12` (+ add the layer name cut from the HUD) | 12px | **KEEP** | |
| `progress is saved — close the tab any time and pick up right here` | 12px | **KEEP** | Reassurance right where it's needed. Could shorten to `✓ saved`. |
| Boat pause: `transversal held · 40% down the main to <city>`, `hull 3/5 · salvage aboard 12`, `the crossing is not saved — …` | 12px | **KEEP**, symbols for the numbers | |
| `press space to resume` | 12–16px | **REWORK** | Wrong on touch. Use a ▶ resume button. |
| `abandon dive & start fresh` | 11px | **KEEP** | A destructive action deserves words (and a confirm). |
| Objectives screen: `SECTOR OBJECTIVES`, `<city> · CITY 1 · LAYER 3/12 · <name>`, `tasks in this layer` | 19px+ / 10–12px | **KEEP** | |
| Task rows: ✓/▶/• + title + ` · HACK TERMINAL ×3` + `1/3` | 10–13px | **KEEP** title / **SYMBOL** kind | The kind glyph in its colour. The legend row then goes. |
| Lock line `◇ <exit> — locked until every task above is cleared` / `◆ all tasks done — the <exit> panel takes 1× <item> to throw` | 11px | **KEEP**, shortened | Padlock / item icon. |
| Legend `HACK terminal · BURST spore pod · VENT valve` | 11px | **CUT** | Covered by the kind glyphs, once they're taught. |
| `press F / space / esc to close`, `close panel` | 12–16 / 11px | **REWORK** | One ✕ button. |
| Win: `THE CORE`, `you reached the bottom in the DIVE MECH`, `depth 900m · the works fall silent below you` | 24px+ / 12px | **KEEP** | The story moment. |
| Lose: `OUT OF AIR` / `BOILED` / … + one-line cause + `you dived 300m — 12 levels deep · city 1 (<name>)` | 24px+ / 12–13px | **KEEP** | The cause line teaches what killed you. |
| `press mine / space to try again` / `… to dive again` | 12–16px | **REWORK** | Wrong on touch. Use a button. |

## 7. One-time slide decks

These are the field manual (4 slides), base-terminal guide (3), mining rig (3),
valve (3), wall terminal (3), biohazard sac (3) and U-552 pipe run (4).

Verdict: **KEEP.** They exist to be read, they appear right before you need them, and the
player sets the pace. They are also the **destination** for the teaching toasts and
explanations cut above. The MULE is the one feature with no deck.

Rework inside them:

- Body lines are at the floor's edge or below it (`.bi-line` 10.5px, `.tut-sub` 10px,
  `.bi-rdesc` 9.5px). Aim for one short line per slide and let the animated canvas do the
  explaining.
- The `.t2` sub-headers (`FIELD MANUAL`, `QUICK GUIDE`, `ICE BREAK`, …) are 8px decoration,
  so **CUT** them.
- The small canvas labels inside the demos (`SAFE` / `VENT`, `BUILT`, `MATCH` / `FIND IT`,
  `OPEN` / `ICE`) are 5 wpx inside an already shrunk demo canvas. Check their size once the
  decks get reworked.
- `SKIP ▸`, `◂ BACK`, `NEXT ▸`, `START ▸`, `DIVE IN ▸` are controls, so **KEEP**, or use
  arrows only.

## 8. Boot, bezel, desktop, dev

| Text | Verdict | Note |
|---|---|---|
| Boot: `BIOCRAFTED STUDIOS PRESENTS`, `SEWER DIVER`, `THE DESCENT` (2–3×) | **KEEP** | Big already. |
| Boot: `TAP TO CONTINUE` (**1×**, 5 wpx) | **KEEP** | The only instruction on screen. It needs to clear the floor (2×). |
| Boot: `FIRST TIME HERE` + `YES` / `NO` | **KEEP** | |
| Bezel: `SEWER DIVER` brand, `SD·1`, `PWR`, `DESCENT UNIT` | exempt | Hardware decoration. |
| `II` pause button | already a symbol | |
| `ABORT` caption under the back button in minigames | **SYMBOL** | The orange abort icon already says it; it's the one caption the strip rule leaves on. |
| PC mode legend and bindings panel | out of scope | Desktop only, never shown on touch. |
| Dev panel | exempt | |

---

## Tally

142 inventory rows (each toast group and each repeated label counted once), by the first
verdict in the row:

| Verdict | Rows | Mostly |
|---|---|---|
| **SYMBOL** | 53 (37%) | HUD labels, gauge names, state words, cost and state tags, denials |
| **KEEP** | 40 (28%) | depth, timers, outcome words, choice names, the pause and end screens, the decks. Several are "keep, shortened". |
| **CUT** | 27 (19%) | flavour titles, duplicate banners, teaching toasts, city/layer lines on the HUD |
| **REWORK** | 16 (11%) | first-time-only hints, focus-only detail, button verbs, keyboard prompts |
| exempt / out of scope | 6 (4%) | bezel decoration, PC mode, dev panel |

On the **live play screen** alone (HUD, prompt, world signs, toasts), only the depth
number, the patch-kit count, three clip-button verbs and the shortened danger toasts
remain as text.

The text that survives is mostly big already (depth, outcome banners, titles) or lives on
screens where the player stops to read (menus, pause, decks). So the floor costs little
space where it matters: the live HUD shrinks while its type gets bigger.

## Suggested order (smallest change, biggest win)

1. ~~**Toasts.**~~ **Done** ([ui-toast-rewrite.md](ui-toast-rewrite.md)): cut and
   shortened to fit one line, at 14px bold.
2. **HUD labels → symbols**, and slim the readout to 3 lines. Small drawing changes, all on
   the live screen.
3. **Keyboard words on touch** (`press space`, menu footers, map hints). Mostly CSS
   `.pconly` toggles, which already exist.
4. **Minigame state words → symbols**, and first-attempt-only hints.
5. **Menu focus-detail rework** (workshop cards, dry dock). The largest change, so do it
   last.
