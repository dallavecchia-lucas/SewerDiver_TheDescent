# Toast rewrite: draft for approval

**Status: draft. Nothing in the game has changed yet.** Mark any row you disagree with,
and the rest gets applied as written.

Applies step 1 of [ui-text-inventory.md](ui-text-inventory.md). There are 80 `showMsg()`
calls on 79 lines of `sewerdiverdescentcity12.html`; line numbers below refer to that file.

## The budget

- **Size:** toasts go from 11px regular to **14px bold**, which puts them on the
  [8 px cap floor](ui-legibility-floor.md) with real strokes.
- **Length:** **at most 26 characters**, symbol included. Courier New is monospaced at
  0.6 em, so at 14px with the current 2px tracking each character takes 10.4 CSS px. The
  narrowest phone canvas (small Android, 318 CSS px) leaves 292 px inside the toast's
  padding, which fits 28 characters. 26 leaves a margin.
- **No dynamic names.** Resource, task and suit names run up to 26 characters on their own,
  so they can't sit inside a toast. Numbers are fine. City names (23 max) are the one
  exception, and only on their own.
- **Symbols**, all already used somewhere in the game: `✕` can't, `⚠` danger, `◆` objective,
  `▼` go down, `◈` salvage, `▮` cell, `✚` patch kit, `⚓` air line.

### The one style change

```css
.toast{font-size:14px;font-weight:bold;
  max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;}
```

The 26-character rule keeps every toast on screen. The `max-width` + ellipsis is a safety
net, so a future long toast gets trimmed instead of running off both edges.

## Discovery: 31 toasts are already invisible

The toast sits at `z-index:4` inside `#stage`. The workshop and shop panel (`#craft`,
z 6), the pack (`#inv`, z 7) and the dry dock (`#drydock`, z 60) cover the whole stage at
90–96% opacity. I checked in the browser: with each panel open, the element at the toast's
centre is the panel, not the toast.

So every toast fired from a menu action has never been seen. It also lingers for its
2.2 s, so it can flash up stale right after you close the menu. Removing these changes
nothing the player sees today, except that the stale flash goes.

## A. Play-screen toasts (49 calls, visible today)

`→` = new text (≤ 26). **DROP** = removed, with what already shows it.

### Objectives and progression

| Line | When | Now | New |
|---|---|---|---|
| 3367 | a task step done, more to go | `<task title> — 2/3` | `◆ TASK 2/3` |
| 3370 | layer's last task done | `ALL TASKS DONE — the control unit by the bulkhead is online` | `◆ ALL DONE · GO TO AIRLOCK` |
| 3371 | finale layer's last task done | `ALL TASKS DONE — the transit gate will take you` | `◆ ALL DONE · GATE OPEN` |
| 3372 | a task done, next one starts | `<task> done — NEXT: <task>` | `◆ DONE · NEXT TASK` (the HUD names it) |
| 3381 | airlock thrown, dry deck below | `deck below is dry — flooding it now, stand by` | `▼ FLOODING · STAND BY` |
| 3390 | bulkhead opens | `bulkhead released — descend` | `▼ DESCEND` |
| 3399 | airlock thrown without the next suit | `new environment below — fabricate the <suit> first` | `✕ NEED THE SUIT · FAB BAY` |
| 3403 | airlock thrown without its part | `panel needs 1× <item> to power the release` | `✕ NEEDS #1 COMPOSITE` |
| 4562 | dead base powered on | `base online — air line live, clip on with ⚓` | `⚓ BASE ONLINE` |
| 4563 | tried to power a base without its part | `haul 1 <item> down here — built one layer up — to power this base` | `✕ NEEDS #2 COMPOSITE` |
| 5408 | arrived in a new city | `CITY 2 — <name> · 4 environments down there · deep cargo sold for 80 coin` | `▼ <CITY NAME>` (counts are on the map and the pause screen) |
| 5441 | swam into an infested layer | `⚠ infested layer — nests everywhere. the MULE's saw clears them for good` | `⚠ INFESTED LAYER` |
| 5479 | reached the finale gate with tasks left | `finale sector sealed — objective pending: <task>` | `✕ GATE SEALED · TASKS LEFT` |

"#1 / #2 composite" is the game's own name for these parts (title text, workshop notes). A
later step can swap it for the item's icon in the prompt bubble.

### Danger and consequences

| Line | When | Now | New |
|---|---|---|---|
| 3964 | "ore" turns out to be a vine trap | `it was no ore — the vines have you!` | `⚠ VINES! IT WAS A TRAP` |
| 6552 | backed out of a mining dig | `vein destabilised — get clear before it blows` | `⚠ GET CLEAR!` |
| 6630 | dig hit the third gas vent | `gas pocket blew — vein destroyed` | `✕ VEIN BLEW` |
| 5099 | patch kit saved you from death | `patch kit auto-applied — back from the brink` | `✚ PATCH KIT SAVED YOU` |

### Air line, mining, base

| Line | When | Now | New |
|---|---|---|---|
| 5490 | pressed mine with nothing in reach | `move onto ore to mine it` | `✕ NOTHING TO MINE` |
| 5495 | unclipped | `unclipped — the line stays where you dropped it` | **DROP**: the air-line chip turns amber and the rope end stays where you left it. The field manual teaches this. |
| 5497 | clipped on | `clipped to the air line` | **DROP**: the chip turns cyan and the rope connects. |
| 5498 | pressed clip, too far | `get near the base or the dropped line to clip` | `✕ TOO FAR FROM THE LINE` |
| 6507 | pressed craft away from a base | `dock at a powered base to craft` | `✕ NO POWERED BASE HERE` |
| 5524 | picked up salvage | `salvage · <name> (12 coin)` | `◈ +12` |
| 4034 | the robot picked up salvage | `robot · <name> (12 coin)` | `◈ +12 · ROBOT` |
| 5102 | Q with no kits (keyboard) | `no patch kits` | `✕ NO PATCH KITS` |
| 5102 | Q at full HP (keyboard) | `already at full health` | `✕ HP FULL` |
| 5105 | patch kit used | `patch kit used · +2` | `✚ +2 HP` |

5102 and 5105 also fire from the pack's Use button, where the pack hides them (see B).
They're kept short for the keyboard path.

### MULE

| Line | When | Now | New |
|---|---|---|---|
| 4073 | cell ran out, spare auto-loaded | `cell spent — the spare slams in` | `▮ SPARE CELL IN` |
| 4078 | cell ran out, no spare | `battery dead — the MULE seizes where it stands. bring it a fresh cell` | `▮ MULE DEAD · NEEDS CELL` |
| 4083 | slotted a cell into a dead MULE | `cell slotted — the MULE rumbles awake` | **DROP**: the burst, and the prompt flipping from INSERT CELL to PILOT. |
| 4084 | tried to wake it with no cell | `the MULE is dead — craft a battery cell at any workshop (MECH bay)` | `✕ NEEDS CELL · WORKSHOP` |
| 4091 | climbed in | `piloting the MULE — F drill · SPACE hook · hold ↑ boost · X exit · sealed: no O₂ drain` | `PILOTING · NO AIR DRAIN` (the keys are wrong on touch; no air drain is the fact you can't see) |
| 4106 | hook missed | `hook found no purchase within 60u` | `✕ HOOK OUT OF REACH` |
| 4155 | boost burnt out | `thruster burnt out — coil rebuilding` | **DROP**: the coil strip under the battery already blinks amber, "so a dead thruster is never a surprise". |
| 4186 | drill pressed, cell dead | `cell dead — the drill won't spin` | `▮ CELL DEAD` |
| 4187 | tried a task machine from the MULE | `the MULE's hands are too big for that — step out (X) to work it` | `✕ STEP OUT TO USE` |
| 4188 | drill pressed, no ore near | `no ore in the drill's reach` | `✕ NO ORE IN REACH` |
| 4199 | saw kill dropped salvage | `the saw shreds the <eel> — <scrap> spills out` | **DROP**: the scrap visibly spills and glints. |
| 4200 | saw kill, no drop | `sawed the <eel> apart — this one's gone for good` | **DROP**: the kill is visible; "gone for good" is teaching. |
| 4207 | climbed out | `stepped out — the MULE holds position` | **DROP**: you see yourself step out. |
| 4213 | MULE at the transit gate | `the transit gate is too tight for the MULE — step out (X) to ride the grid` | `✕ STEP OUT TO ENTER` |
| 4217 | MULE picked up salvage | `salvage · <name> (12 coin)` | `◈ +12` |

### Minigame exits (each has its own outcome banner)

| Line | When | Now | New |
|---|---|---|---|
| 6778 | backed out of a valve | `valve left part-open — the pressure is still up` | **DROP**: you chose to leave, and the valve still pulses. |
| 6805 | valve timer ran out | `TIMER OUT — the valve blows in your face!` | **DROP**: `BLOWOUT` banner + HP loss. |
| 7014 | backed out of a terminal | `link dropped — the node is still locked` | **DROP** |
| 7066 | terminal timer ran out | `TIMER OUT — the console arcs in your face!` | **DROP**: `BREACH` banner + HP loss. |
| 7261 | backed out of a sac | `backed off the sac — it is still live` | **DROP** |
| 7298 | sac burned clean | `SAC BURNED CLEAN — no blowback` | **DROP**: `PURGED` banner. |
| 7300 | sac timer bust | `TIMER BUST — the sac ruptures on you!` | **DROP**: `RUPTURE` banner, then the eruption in front of you. |

## B. Menu toasts (31 calls, never visible) → all DROP

These fire while the workshop, shop, pack or dry dock covers the toast. Dropping them
removes nothing from the screen. What does give feedback in menus today: the craft
animation (`+1 · NAME` / `FABRICATED · NAME`), the card flipping to ✓, and `craftDeny()`
shaking the card.

| Lines | What they said |
|---|---|
| 4999, 5001, 5006, 5011, 5014, 5020, 5024, 5027, 5047 (4 variants), 4529 | Craft and buy confirmations: air line extended, salvage cashed in, O₂ tank / regulator fitted, bought 1×, lens ground, seal fitted, patch kit stowed, MULE upgrades, suit equipped |
| 6018, 6023, 6049, 6050, 6051 | Shop builds: filter fitted, sector-nav online, robot / floodlight / thruster fitted |
| 4116 (2 variants), 6055 | MULE called over / MULE assembled |
| 5013, 5043, 6016, 6020, 6040, 8210 | `need N coin`, `not enough salvage — N needed` |
| 6013, 6014, 6019, 6042, 6043, 6044, 6045, 6046 | `no pollution in this environment — …`, `filters maxed`, `… already installed / fitted / own`, `not enough parts — buy them above` |

## Tally

| | Calls |
|---|---|
| Rewritten (play screen) | 35 |
| Dropped, shown by something already on screen | 14 |
| Dropped, never visible (menus) | 31 |
| **Total** | **80** |

After this, the longest toast is 26 characters. Today 37 distinct toasts are longer than a
phone screen.

## Follow-ups this surfaced (not part of this change)

- **The MULE's "battery bay is EMPTY" warning has never been seen** (6055, fires inside the
  shop). Today the only hint is the MULE status note in the workshop's Mech bay, and the
  `DEAD MECH` prompt when you swim up to it. It deserves a symbol on the MULE itself, such
  as an empty-cell icon over the frame.
- **Some "can't afford" paths have no feedback at all** (6016, 6020, 6040, 6046 return
  without `craftDeny()`). They're effectively unreachable because those buttons are
  disabled, but the deny shake should be the single "can't" signal everywhere.
- **Later steps can replace several rewrites with symbols:** objective progress → HUD pips;
  `◈ +12` → a floating number at the pickup; the `✕ NEEDS …` lines → the item's icon in the
  prompt bubble.
- **Enforcement:** the legibility audit can grow a check that fails on any literal toast
  string over 26 characters, so the rule holds as new toasts get added.
