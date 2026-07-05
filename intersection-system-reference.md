# Intersection System — Developer Reference

Target file: `vanishing-point.html` (single-file HTML5 canvas game).
This document covers everything added on top of the base endless-runner game
to support **intersections**: cube-shaped junctions the player flies into,
looks around freely, and grapples out of through one of five true-size
tunnel doorways.

Read this before touching any of `EXITS`, `VARIANTS`, `EXIT_TYPES`, `TUBE_*`,
`TUN_*`, `SHAFT_*`, `BALCONY_*`, `GATE_*`, `HUB_*`, `COMMIT_*`, `CHAM_*`,
`S.gate`, `S.ix`, `S.variant`, `S.mode`, or any function whose name contains
`Hub`, `Gate`, `Commit`, `Crash`, `Tube`, `Tunnel`, `Shaft`, `Balcony`, or
`Chamber`.

> **Locomotion modes (see §11).** The corridor is only one of three locomotion
> types. `S.mode ∈ {"flat","climb","fall"}` selects a *skin* of the same
> engine: `flat` is the horizontal corridor; `climb`/`fall` are vertical
> shafts (looking up / down a tube, balconies instead of a lane grid). The
> whole gate→approach→hub→commit machine runs identically for all three —
> `S.mode` only changes what gets rendered and which exit *types* the next
> intersection offers. Set on commit exactly like `S.variant`.

---

## 1. Mental model

The base game is a 2D canvas doing a fake-3D run down an **enclosed tunnel**:
everything is projected with `x_screen = CX + x_world / z * FOV` (a pinhole
camera looking down a fixed forward axis). That system never changes
orientation — it only moves forward (`z` shrinks).

The tunnel comes in **4 variants** (`VARIANTS`: SERVICE / FURNACE / CRYO /
OVERGROWN — wall color, fog, per-surface brightness, lane-grid color,
ceiling strip, lamp palette). `S.variant` is the one you're running right
now; every intersection assigns a variant to each of its 5 exits
(`S.gate.exits`, all 4 represented, one repeats), and committing to an exit
**switches the world to that variant** (`tryCommit`).

Intersections need a *second*, independent camera system: one that can look
in **any direction** (yaw + pitch), because the player free-looks around
inside a cube. That system lives entirely inside functions named `*Hub*` and
uses its own projection (`toCam` / `projHub`), separate from the tunnel's
`projX` / `projY`. The two systems never mix math — but they are **kept in
lockstep at the seams**:

- **Entering**: the intersection is rendered as *real tunnel-space geometry*
  (`drawChamber`) long before the phase flips — the corridor walls literally
  end at `S.gate.z` and you look into the room. At the trigger, the hub
  camera starts from *exactly the tunnel camera's vantage point* (same
  position, FOV, and screen center) and glides to the cube center while the
  two renders crossfade. See §3.3.
- **Choosing**: each exit is a **trompe-l'œil render of the actual tunnel
  behind it** — the exact world cross-section (`±TUN_HW` wide, floor `CAM_Y`
  below the tube axis, ceiling `TUN_CEIL` above), painted with its
  destination variant's own walls, fog, lane grid, ceiling strip, and wall
  lamps (`drawHubTube`). The exit's `EXITS[i].col` appears ONLY as
  wayfinding UI: door frame, label, reticle, grapple line. The tunnel you
  see through a doorway is the tunnel you get.
- **Exiting**: the commit tween physically pushes the hub camera *through*
  the chosen doorway while the tunnel (already switched to the new variant)
  crossfades in underneath. The tube's floor-grid rungs are derived from
  `S.rungs` (offset by the camera push), and `HFOV` lands exactly on the
  live `S.fov` — so the preview's grid and the revealed tunnel's grid are
  the same lines through the fade. See §3.4.

Everything else (lamps, hoops, solid walls, the reticle, the eye-drift)
exists to make the hub read as a real 3D room instead of a flat icon.

---

## 2. Where things live (section banners in the file)

| Banner | Contains |
|---|---|
| top constants | `TUN_*`, `VARIANTS`, `rollExitVariants`, `GATE_*`, `HUB_*`, `COMMIT_*`, `IX_FOV`/`IX_CY` |
| `INTERSECTION / HUB — the 5 cube exits...` | `EXITS`, `CUBE_CORNERS`, `CUBE_EDGE_IDX`, `wrapAngle`, `lerpAngle`, `lookVec`, `perp`, `hubCamPos`, `toCam`, `updateHubProj`, `projHub` |
| `INPUT` | `tryCommit`, keyboard/pointer bindings for the hub |
| `UPDATE` | `stepTunnelWorld` (also used by the commit tween) |
| `GATE / HUB STATE MACHINE` | `updateGate`, `prepHub`, `enterHub`, `scrollDressing`, `updateHubLook`, `updateHub`, `updateCommit`, `finishCommit`, `startCrash`, `updateCrash`, `endRun`, `restartRun` |
| `RENDER` | `render()` dispatch, `renderTunnelScene` |
| `TUNNEL — the corridor` | `TUN_BANDS`, `tunShade`, `drawTunnel`, `drawChamber` |
| `HUB SCENE` | `renderHub`, `faceBasis`, `CHAM_GREY`/`chamShade`/`chamFog`, `drawHubCube`, `TUBE_BANDS`, `TUBE_LAMPS`, `drawHubTube`, `drawHubPortals`, `drawHubReticle` |
| `CHARACTER` | `drawCharacter(forceMode)` — hub-aware, see §7.6 |

---

## 3. The state machine

`S.phase` is the single source of truth. Exactly one of:

```
"dive"  →  "approach"  →  "hub"  →  "commit"  →  "dive"      (successful run)
                              ↳  "hub" → "crash" → "gameover" → (restart) → "dive"
```

### 3.1 `dive`
Normal endless-runner gameplay. `updateGate()` watches `S.distance` against
`S.nextGateDist`; when crossed, it spawns
`S.gate = { z: Z_FAR+6, exits: rollExitVariants() }`. From that moment
`drawChamber` renders the intersection at the end of the corridor (in tunnel
space, same `projX`/`projY`) — a distant room whose doorways glow in their
destination variants' signature colors.

### 3.2 `approach`
Triggered when `S.gate.z < GATE_APPROACH_Z` (11). Steering/boost/glide still
work (`flying()` returns true for `dive` and `approach`). Once, at the flip:
- `S.objects` is filtered to `o.z < S.gate.z - 0.5` — nothing may be left
  floating inside the room (near objects finish their pass naturally; spawns
  are already suppressed by the `S.gate.z < 16` guards).
- `prepHub()` resets `S.ix.yaw/pitch` to `0,0`, STRAIGHT pre-locked.

Rendering during `approach` is **pure tunnel rendering** — no hub overlay.
The five doorways are TRUE-SIZE (the tunnel cross-section) and the STRAIGHT
one shows its destination corridor — walls, lane grid, rungs, light strip —
rendered in tunnel space with the destination variant's parameters. Glow
ramps with the `anticip` factor as `gz` shrinks.

### 3.3 `hub`
Triggered when `S.gate.z < GATE_TRIGGER_Z` (2.4) — `enterHub()` runs. Built
around one idea: **one motion, two renderers, zero seam**.

- `enterHub()` captures the handoff state: `entryZ0 = S.gate.z`,
  `fovAtEnter = S.fov`, `charX0` (runner's screen x), copies
  `S.gate.exits → S.ix.tubeVariants` and `S.variant → S.ix.entryVariant`,
  clears `S.objects`, zeroes `enterT`/`entryK`.
- Every frame, `updateHub(dt)` eases `S.ix.entryK` 0→1 over `HUB_ENTRY_DUR`
  (0.75s) and drives `S.gate.z` from `entryZ0` down to **−R** (the mouth
  passes behind the camera). That single eased value feeds:
  - the hub camera's back-offset (`hubCamPos`: `back = gate.z + R`);
  - the tunnel underlay's chamber geometry (same `S.gate.z`), scrolled in
    lockstep via `scrollDressing(prev − new)` (rungs + dust only);
  - the projection handoff (`updateHubProj`): `HFOV`: `fovAtEnter → IX_FOV`,
    `HCY`: `HORIZON → IX_CY`;
  - the render crossfade (tunnel underneath, hub at `alpha = entryK`);
  - the eye-drift ramp (`HUB_EYE_DRIFT * entryK` — frame 1 matches the
    tunnel camera exactly, §4.4);
  - look-input damping and the character blend (runner pose → floating);
  - the timer hold (countdown starts at `entryK ≥ 1`).
- After the glide: world motion frozen, rendering 100% `renderHub()`.
- `S.gate` stays alive parked at `z = −R`; `tryCommit()`/`restartRun()`
  clear it.
- The **entry tube** (back face) renders the tunnel you came from, in
  `S.ix.entryVariant` — but only once `entryK ≥ 0.95` (while the camera is
  still inside it, its opaque mouth-punch would black out the view).
- Aiming at a doorway "turns its lights on": surfaces, grid, and strip
  brighten (the `lit` factor in `drawHubTube`, eased by `lockT`).

### 3.4 `commit`
Triggered by `tryCommit()` (Space / GRAPPLE) when `S.ix.locked >= 0`.

`tryCommit()` immediately, in the same frame:
- Sets the tween targets (`startYaw/Pitch` → `targetYaw/Pitch`).
- Captures `S.ix.commitBack = gate.z + R` (non-zero only if fired mid-glide).
- **Switches the world**: `S.variant = S.ix.tubeVariants[chosenExit]` —
  before priming, so everything spawned/rendered under the tween is already
  the destination tunnel.
- **Primes the tunnel**: clears `S.gate`, centers the player, zeroes spawn
  accumulators/speed, pre-spawns wall lamps (now in the new variant's
  palette).

`updateCommit(dt)`: tweens yaw/pitch (shortest path), ramps
`S.speed`/`S.fovKick`, calls `stepTunnelWorld(dt)` unconditionally from the
start — the tunnel is alive before it's visible.

Render side:
- the camera pushes **through the doorway and down the tube** (push reaches
  `R + 1.8`; bands whose corners pass behind the camera drop via null-guard);
- `HFOV = lerp(IX_FOV, S.fov, te)` and `HCY → HORIZON` — the hub lens lands
  *exactly* on the tunnel's live lens at te=1;
- the chosen tube's floor-grid rungs use `d = rungZ + pushOff − R`, i.e. the
  world's own `S.rungs` offset by the push — preview grid and revealed grid
  are the same lines, scrolling in phase across the crossfade;
- the chosen tube draws last, gets wind-streaks and lamp-fade (`te`); the
  other four dim out; the tunnel crossfades in from `COMMIT_FADE_START`
  (0.30), roughly as the camera passes the mouth.

`finishCommit()` flips `S.phase = "dive"`, scores, schedules the next gate.
It resets nothing — `tryCommit`/`updateCommit` already left the world
correct. (The old post-exit `gridTint` is gone: the grid *is* the new
variant's color now.)

### 3.5 `crash` / `gameover`
Timer expiry → `startCrash()` (red flash, shake, burst — a deliberate impact
effect, not a transition; keep it a hard flash). ~1.15s → `endRun()`.
`restartRun()` resets everything (including `S.variant = 0`) → `"dive"`.

---

## 4. Coordinate systems & math primitives

### 4.1 Tunnel space
`projX(x,z)`, `projY(y,z)`, `scaleAt(z)` — fixed forward axis, camera only
translates (`S.cameraX`). Corridor cross-section: `±TUN_HW` wide, floor at
`−CAM_Y`, ceiling at `+TUN_CEIL`. `drawChamber` lives here too.

### 4.2 Hub space
The hub camera has a **position** (`hubCamPos()`) and a **rotation**
(`S.ix.yaw/pitch`).

- **`lookVec(yaw, pitch)`** → current facing; `(0,0,1)` = STRAIGHT. Dotted
  against `EXITS[i].dir` for lock detection (`updateHubLook`, ≥ 0.93).
- **`hubCamPos()`** → camera world position per phase (drift / entry-back /
  commit-push). Extracted from `toCam` so `drawHubCube` can backface-cull
  solid walls (`dot(camPos, n) > R` → skip face).
- **`toCam(v)`** → subtract `hubCamPos()`, inverse-rotate. `+Z` = ahead.
- **`projHub(v)`** → perspective divide with the **live** lens `HFOV`/`HCY`
  (set per frame by `updateHubProj()`). Returns `null` behind the camera —
  **every caller must null-check** (`.some(p=>!p)` patterns).
- **`faceBasis(n)`** → `[u, v]` orthonormal frame. For the three horizontal
  exits `v = (0,−1,0)` (down), so tube verticals are expressed as +v = down:
  floor at `+CAM_Y`, ceiling at `−TUN_CEIL`. For up/down exits there's no
  physical floor — the grid lands on the +v wall of the shaft; expected.
- **`wrapAngle` / `lerpAngle`** → wrap / shortest-path lerp. Full 360° on
  both axes is intentional (§8).

### 4.3 EXITS and VARIANTS
```js
EXITS[i] = { key, dir, yaw, pitch, label, col }   // 5 directions
VARIANTS[k] = { name, wall, dark, bright:{floor,wall,ceil},
                grid, sig, strip, lamps }          // 4 tunnel materials
```
- `EXITS[i].dir` is the lock-detection truth; `yaw/pitch` are the commit
  tween target (`yaw:null` on up/down = keep current yaw).
- **`EXITS[i].col` is wayfinding UI only** — door frame, label, reticle,
  grapple line, HUD. It must NOT tint tube interiors; those are painted by
  the destination variant (explicit instruction, 2026-07-04).
- `VARIANTS[k].sig` drives doorway glows (chamber + hub mouth breath) and
  the variant name under each label.
- The entry tube (back face, `dir (0,0,−1)`) renders `S.ix.entryVariant`
  with a plain grey frame; non-selectable (not in `EXITS`).

### 4.4 The eye-drift (why exits used to look flat)
With the eye at the exact cube center, every tube's axis passes through it,
so pure rotation cannot produce parallax. The fix: the camera drifts
`HUB_EYE_DRIFT` (0.32) toward `lookVec` every frame. The aimed tube stays
clean; every other doorway skews into genuine off-axis perspective. **The
single most important trick in the hub system.**

Two handoffs prevent pops:
- **Entry**: drift scales by `entryK` (frame 1 = tunnel camera exactly).
- **Commit**: drift + leftover `commitBack` fade over the first ~40%
  (`fade = max(0, 1−te*2.5)`) before the exit-push takes over. If you raise
  `HUB_EYE_DRIFT`, re-check this handoff.

---

## 5. Constants — what to tune for what

| Constant | Value | Controls |
|---|---|---|
| `TUN_HW` / `TUN_CEIL` / `CAM_Y` | `2.35*LANE_W` / `1.15` / `1.0` | The tunnel cross-section — **also the doorway/tube cross-section** (true-size trompe-l'œil). Changing these changes both. |
| `VARIANTS` | 4 entries | Everything material: walls, fog, brightness, grid, strip, sig, lamps. Both renderers read it — never fork a color into one renderer only. |
| `TUN_GREY` / `TUN_DARK` | greys | Neutral chamber fixtures + chamber fog (the room itself is variant-neutral so the doorways pop). |
| `GATE_APPROACH_Z` / `GATE_TRIGGER_Z` | `11` / `2.4` | Phase-flip depths (see §3.2/§3.3). |
| `GATE_CHAMBER_R` | `2.15` | Cube half-extent; tube depths measured from `R`; entry glide parks `gate.z` at `−R`. |
| `HUB_EYE_DRIFT` | `0.32` | Parallax strength (§4.4 handoffs). |
| `HUB_TIMER` / `HUB_ENTRY_DUR` | `15.0` / `0.75` | Decision time / entry-glide length (one knob moves camera, crossfade, lens, character, input-damping together). |
| `COMMIT_DUR` / `COMMIT_FADE_START` | `0.58` / `0.30` | Launch tween length / where the tunnel starts fading in (≈ as the camera passes the mouth). Push depth is the `R + 1.8` in `hubCamPos`. |
| `IX_FOV`, `IX_CY` | `165`, `VH*0.47` | Hub lens at rest. Live values are `HFOV`/`HCY` — **new hub-space code must use those**. During commit `HFOV` lands on the live `S.fov`. |
| `TUBE_BANDS` / `TUBE_END` | `[0.03 … 27]` | Depth rings for tube wall bands / how deep the preview tunnel recedes. |
| `TUBE_LAMPS` | 4 entries | Deterministic wall lamps per tube (`d`, `side`, `y`, `len`) — the off-axis parallax props; they mirror `drawPillar` fixtures. |

> Historical note: tubes used to be small colored bores (`TUBE_HW 0.62 →
> 0.4`, "exits read as 75% of the face"). That decision was **overridden by
> explicit instruction (2026-07-04)**: doorways are now the tunnel's true
> cross-section (~63% of face width) and render the destination tunnel
> itself. Don't shrink them back to abstract tubes.

---

## 6. Other data structures

### 6.1 `S.gate`
`{ z, exits }` — depth + the 5 per-exit variant indices (`rollExitVariants`:
all 4 variants present, one repeats). `null` when no intersection is
pending. Suppresses spawns once `z < 16`. Lifecycle extends into the hub
phase: entry glide eases it to `−R`, where it parks until
`tryCommit()`/`restartRun()`. `hubCamPos` reads it every frame. Code that
fabricates a gate by hand (tests) should include `exits`; renderers fall
back to `[0,1,2,3,0]` if missing.

### 6.2 `S.variant` / `S.ix`
`S.variant` — index into `VARIANTS`; the world tunnel's current material.
Set by `tryCommit` (chosen exit's variant) and `restartRun` (0).

```js
ix: {
  yaw, pitch, locked, lockT,        // look + lock (lockT also eases the door "lights-on")
  timer,                            // countdown (held until entryK hits 1)
  enterT, entryK,                   // entry-glide progress (see §3.3)
  entryZ0, fovAtEnter, charX0,      // handoff captures at the trigger
  commitBack,                       // leftover entry-back if committed mid-glide
  tubeVariants,                     // per-exit variant indices (copy of gate.exits)
  entryVariant,                     // variant of the tunnel you came in through
  chosenExit, commitT,
  startYaw/Pitch, targetYaw/Pitch,
  crashT
}
```

### 6.3 `TUBE_LAMPS`
Module const: 4 deterministic lamps per tube (same layout every tube/every
intersection). Each `{ d, side, y, len }` mounts a housing+glow fixture on a
tube wall — same construction as the world's `drawPillar`, so the preview
furnishing is honest. They fade out with `te` during commit (they aren't
world-scrolled, so they hand off to the world's own lamps).

---

## 7. Function reference

### 7.1 `updateGate(dt)`
Owns `dive → approach → hub`; rolls `exits` at gate spawn. All approach
visuals read `S.gate.z`/`S.gate.exits` directly.

### 7.2 `prepHub()` / `enterHub()`
Split deliberately: pose reset early (approach start) vs. handoff capture at
the trigger. Don't merge.

### 7.3 `updateHubLook(dt)`
Rotation + lock check. Rotation speed scales with `entryK`; the pointer-drag
handler applies the same scale.

### 7.4 `tryCommit()` / `updateCommit(dt)` / `finishCommit()`
See §3.4. Success effects → `finishCommit()`; world-reset/priming (and the
variant switch) → `tryCommit()`.

### 7.5 `stepTunnelWorld(dt)` / `scrollDressing(d)`
Shared world stepping / entry-glide dressing scroll (rungs + dust by raw
delta, no spawns/collisions).

### 7.6 `drawCharacter(forceMode)`
`"hub"` or `"tunnel"`. Hub pose blends from the runner's screen position by
`entryK` on the way in, back toward it by `te` during commit. The tunnel
scene skips its character while `S.phase==="hub"`.

### 7.7 `render()` dispatch
```
dive / approach          → renderTunnelScene() only
hub, entryK < 1          → renderTunnelScene() + renderHub() at entryK alpha
hub / crash / gameover   → renderHub() only
commit                   → renderHub() alone until COMMIT_FADE_START,
                            then renderTunnelScene() + renderHub() at (1-fade)
```
Plain `globalAlpha` overlays. If a transition looks like a hard cut, check
the *world state* being revealed first (the "primed before visible"
pattern).

### 7.8 `drawTunnel()` / `drawChamber(gz)`
Tunnel space, both driven by `VARIANTS[S.variant]` (corridor) and
`S.gate.exits` (doorways). `drawTunnel`: four fog-banded surfaces, corner
edges, hoop seams at `S.rungs`, ceiling strip; surfaces stop at `gate.z`.
`drawChamber`: neutral-grey room + five TRUE-SIZE doorways built with the
same `faceBasis` corner math as the hub tubes (pixel-agreement at the
crossfade); the STRAIGHT doorway renders its destination corridor (bands,
lane grid, rungs, strip) beyond the far wall; the other four get
hole + sig-colored glow + rim. Handles `gz < 0` (camera inside during the
glide).

### 7.9 `drawHubCube()` / `drawHubTube()` / `drawHubPortals()` / `drawHubReticle()`
All hub-space, all through `projHub`. `drawHubCube`: solid neutral walls
(4×4 sub-quads, per-quad distance fog, checker, backface-culled against
`hubCamPos`) + wireframe accents. `drawHubTube(dir, aim, locked, dim, vIdx,
rungOff, te)`: mouth punch (destination fog dark), opaque variant wall
bands, corner guide edges, lane grid + rungs (world-locked via `rungOff`,
static for the entry tube) + hoop seams, ceiling strip, `TUBE_LAMPS`,
commit wind-streaks, sig mouth breath, aim frame + label + variant name
(drawn just inside the door's top edge — the DOM HUD owns the space above).
`drawHubPortals`: entry tube first (skipped while `entryK < 0.95`), then
exits with the chosen one last; computes each tube's `rungOff` (fwd during
glide: `−(gate.z + 2R)`; chosen during commit: `pushOff − R`; else `−R`).

---

## 8. Known constraints — read before "fixing" these

- **Solid shaded fills with fog sell depth** — never outline-only. Keep the
  per-surface brightness differential (`VARIANTS[k].bright`).
- **The eye-drift is required** (§4.4) — geometry, not taste.
- **Full 360° rotation is intentional** on both yaw and pitch.
- **The crash flash is not a transition crossfade** — keep it a hard flash.
- **No positional camera offset without a fade/reset plan by end of
  `commit`** (`hubCamPos` currently: drift, entry-back, commit-push — each
  has an explicit handoff).
- **Doorways are TRUE-SIZE and trompe-l'œil-honest.** The tube interior must
  be painted from the same `VARIANTS` entry the world tunnel will use, with
  the same cross-section constants. Any new corridor feature (grid change,
  new prop, strip change) must be added to `drawHubTube` and `drawChamber`
  too, or the preview lies and the exit seam breaks.
- **`EXITS[i].col` never tints tunnel interiors** — wayfinding UI only.
- **New hub-space code must use `HFOV`/`HCY`, not `IX_FOV`/`IX_CY`** — the
  lens is animated at both seams.
- **`drawChamber` and the hub renderers must stay visually paired** — same
  neutral room grey (`CHAM_GREY`), same doorway corner math, same variant
  params. The entry seam works because at the trigger frame the two renders
  are the same picture through two projections.

---

## 9. Quick recipes

**Doorway/tunnel size** → `TUN_HW`/`TUN_CEIL`/`CAM_Y` (world and preview
change together — that's the contract).
**Deeper/shallower previews** → `TUBE_BANDS`/`TUBE_END`.
**Add/retint a variant** → edit `VARIANTS` (one entry drives corridor +
preview + chamber glows + labels). Adding a 5th variant: `rollExitVariants`
currently rolls `[0..3] + one repeat` — update it.
**Change wayfinding colors** → `EXITS[i].col` (frame/label/reticle/grapple).
**More/fewer preview lamps** → `TUBE_LAMPS`.
**Decision time / entry pacing / exit pacing** → `HUB_TIMER` /
`HUB_ENTRY_DUR` / `COMMIT_FADE_START`+`COMMIT_DUR` (push depth: `R + 1.8`
in `hubCamPos`).
**Parallax aggression** → `HUB_EYE_DRIFT` (re-check §4.4 handoffs).
**Add a 6th exit** → extend `EXITS`; verify `faceBasis` gives a sane frame;
lock/render/commit loop over `EXITS`; `rollExitVariants` must return one
more entry.

---

## 10. After any change, verify

1. `node -e "new Function(require('fs').readFileSync('vanishing-point.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1])"`
   — syntax check. Without node: load the page, `window.__vp` exists iff the
   script ran; check the console.
2. Approach: the room is visible as real geometry well before the trigger;
   all five doorways are true-size; the STRAIGHT doorway shows its
   destination corridor with the right variant grid color; the room contains
   no gameplay objects.
3. Entry: corridor → room reads as one continuous camera flight; no pop at
   the phase flip; wall motion doesn't freeze until the room is opaque.
4. In the hub: each doorway clearly shows a DIFFERENT tunnel where assigned
   (check the variant name under each label); aiming brightens that tunnel;
   off-axis doorways skew with the eye-drift; looking straight back shows
   the tunnel you came from in its own variant.
5. Commit to each exit type once: no flash or pop; you fly through the
   doorway INTO the previewed tunnel; the revealed world tunnel is the same
   variant (grid color, walls) as the preview; rungs cross the fade in
   phase.
6. Timer expiry: crash → gameover → restart returns a clean `dive`
   (SERVICE variant, `flat` mode, no leftover `S.gate`, `locked`, `entryK`,
   `mode`, or speed).

---

## 11. Vertical shafts — CLIMB / FALL modes

### 11.1 The one idea
A tube viewed straight along its axis is the **same pinhole projection**
whether it runs forward, up, or down. So a shaft is the corridor *re-skinned*,
not a second engine. `S.mode ∈ {"flat","climb","fall"}` picks the skin; the
gate/approach/hub/commit state machine is untouched. Four things differ by
mode:
1. **Cross-section content** — balconies on the 4 walls instead of a floor
   lane-grid.
2. **Vanishing-point Y** (`shaftVPY()`) — shifted up (`SHAFT_VP_UP`) for CLIMB,
   down (`SHAFT_VP_DOWN`) for FALL. This is what sells "looking up/down a
   tube." Eased back to `HORIZON` near a gate (`shaftGateBlend`) and eased *in*
   from `HORIZON` on entry (`S.modeT` settle) so the commit crossfade — which
   converges on `HORIZON` — never pops.
3. **Player pose** — CLIMB reaches up with the grapple line to the shaft VP;
   FALL flies with wings always deployed (`S.wing→1`).
4. **Exit types** offered at the next intersection (the orientation rule).

### 11.2 Shaft projection
`sprojX(a,d)` / `sprojY(b,d)` mirror `projX/projY` but subtract the camera pan
(`S.shaftCamA/B`, the lagged follow of the player's cross-section position
`S.shaftA/B`) and use `shaftVPY()` for the vertical vanishing point. Cross-
section is the SAME box as the corridor: `a∈[-TUN_HW,TUN_HW]`,
`b∈[-CAM_Y,TUN_CEIL]` (b up-positive). Near a gate both the pan and the VP ease
to the flat values so `drawChamber` (drawn in `projX/projY` space) stays
continuous — that's how the shaft→intersection approach reuses all the gate
machinery for free.

### 11.3 The orientation rule (`EXIT_TYPES` / `exitTypeFor`)
Which tube TYPE each exit leads into depends on the mode you ARRIVED in (player
always faces fwd in the hub; entry tube stays at the back):

| mode \ exit | fwd    | up    | down  | left | right |
|-------------|--------|-------|-------|------|-------|
| flat        | flat   | climb | fall  | flat | flat  |
| fall        | fall   | climb | flat  | flat | flat  |
| climb       | climb  | fall  | flat  | flat | flat  |

Rolled at gate spawn as `S.gate.types = rollExitTypes(S.mode)` (alongside
`exits`/variants). Copied to `S.ix.tubeTypes` in `enterHub` (+ `entryMode`).
`tryCommit` sets `S.mode = S.ix.tubeTypes[chosenExit]` and `S.modeT` (1 for
flat, 0 for a shaft so the VP eases in).

### 11.4 The tube is a ROUND cylinder (concept-art rework, 2026-07-05)
Radius `TUN_R`. Cross-section point from `polar(ang, rad)`. The diver moves
**freely in 2D** anywhere in the disc (`updateShaftPlayer` clamps
`hypot(shaftA,shaftB) ≤ TUN_R*0.9`) — not locked to lanes like the corridor.
`drawShaft` renders the wall as a **radial funnel** (filled discs near→far,
each farther/smaller/darker disc overpainting the center) + circumferential
ring seams + `SHAFT_PIPES` (the climbable conduits, warm tan supply / cool
steel data lines, with clamp brackets) + wall panels + a VP end-glow. No flat
walls, no lane grid.

### 11.5 Balconies (hexagonal platforms) + pipe-climbing
`{ type:"balcony", d, ang, rin, aw, w, grabbed, seed }` — a big **hexagonal
platform** jutting inward from the wall at angle `ang` to inner radius `rin`
(modelled on the concept's interlocking triangular masses). `drawBalcony`
draws an extruded slab, panelled deck, bright inner rail (grab edge), and
**tiny figures for scale**. `spawnBalconyLevel(z)` emits 1–3 spread around the
tube (never >3) so they interlock. They stream toward the camera
(`stepShaftWorld`).
Two ways up, **both score-only / no fail this pass** (user decision):
- **Grapple a balcony** — reach its inner nose (`balconyAnchor`) within
  `BALCONY_GRAB` → grabbed, combo/score/pull (`sfxCollect`).
- **Climb the pipes** — hug the wall past `PIPE_CLIMB_R` near a `SHAFT_PIPES`
  angle → `S.climbing`, steady score + upward assist + sustains combo; the
  pipe highlights.

### 11.6 Rendering / input
- `renderTunnelScene` branches by `S.mode`: `drawShaft` + `drawShaftDust` +
  `drawBalcony` for shafts, else the corridor path. The gate is handled via
  `drawChamber` exactly like the corridor.
- `drawCharacter` gained a `"shaft"` framing (projects the diver at
  `sproj(shaftA,shaftB,Z_CHAR)`, pose by mode).
- Input: in shaft mode L/R/U/D drive `S.input.rot*` (full 2D cross-section
  steer); boost still speeds travel. `updateShaftPlayer` handles steering (disc
  clamp) + pose + the `S.modeT` settle + the pan un-panning near a gate.

### 11.7 Trompe-l'œil shaft previews (user requirement)
`drawHubTube` takes a `type` arg. For `climb`/`fall` it swaps the floor lane-
grid for `TUBE_BALCONIES` — big **hexagonal** platforms placed radially
(`ang`), the same hex as `drawBalcony` (the hub preview tube is still a box,
but the balconies read it as a shaft) — and draws uniform ring seams instead of
a bright floor rung. The label gains `▲ CLIMB` / `▼ FALL`. `drawHubPortals`
passes `S.ix.tubeTypes[i]` (entry tube: `S.ix.entryMode`). `drawChamber`'s
up/down doorways get angular balcony-rail hints (`facePt`) so the approach
reads as a shaft too. **Any new shaft feature must be added to `drawShaft`
AND the `drawHubTube` preview branch AND `drawChamber`'s hints**, or the
preview lies — same contract as the corridor/variant parity.

### 11.8 Constants
`TUN_R` (=TUN_HW) — round tube radius. `SHAFT_PIPES` / `PIPE_WARM`/`PIPE_COOL`
— the climbable conduits. `PIPE_CLIMB_R` (TUN_R*0.6) — wall-hug climb radius.
`polar(ang,rad)` → `(a,b)`. `SHAFT_VP_UP` (VH*0.40) / `SHAFT_VP_DOWN` (VH*0.50)
— mild shaft VPs (the round tube reads best near-centered). `BALCONY_GAP`
(4.2) — depth between levels. `BALCONY_GRAB` (0.6) — auto-latch radius.
`S.modeT` settle — the `dt/0.8` in `updateShaftPlayer`/`updateCommit`.

### 11.9 v3 — scale, organic control, walkable balconies, pipe-climb (2026-07-05)
Playtest pass against concept art. Big changes:
- **Scale.** The world is ~2× bigger so the player feels small: `TUN_HW`
  (=5·LANE_W), `TUN_R`, `TUN_CEIL` up ~2×; `CAM_Y`/floor kept so the runner's
  feet stay on the floor (sprite anchor is decoupled). Object/balcony spacing +
  sizes scaled to match. **The hub scaled too** (`GATE_CHAMBER_R`=4.5,
  `HUB_EYE_DRIFT`=0.66, `GATE_APPROACH_Z`/`TRIGGER_Z`, commit push `R+3.8`) —
  or the true-size (`TUN_HW`) doorways overflow the cube. Keep
  `TUN_HW < GATE_CHAMBER_R`.
- **No void = camera-pan clamp** (`PAN_MAX`). `updateShaftPlayer` clamps the
  camera pan radially so the tube edge never leaves the screen; past the clamp
  the diver slides off-centre toward the wall/pipe. Plus a full-viewport base
  fill in `drawShaft` as a safety net.
- **Gentle fall + per-mode speed** in `update()`: FALL ≈0.36× drift, CLIMB gated
  by the pipe (0 when `S.climbBlocked`), WALK 0, flat unchanged.
- **Organic flat movement.** The 3-lane snap is gone: analog `playerX` from held
  L/R (`S.input.rotL/rotR`); collisions are positional (`|o.x-playerX|`), spawns
  scatter across the wide floor. `moveLane`/`laneTarget` are dead.
- **FALL → land on a balcony → WALK sub-mode.** `stepShaftWorld` (fall) lands
  when the diver is over a deck as it crosses `Z_HIT` → `enterWalk`. `S.mode==
  "walk"`: `S.walkT` swings the camera from the frozen shaft (crossfade) to a
  flat horizon **deck** view (`drawBalconyWalk`, its own local flat camera —
  floor + rails + far drop-rail). Walk analog (`walkX` strafe, `walkZ` forward);
  step off the far edge (`walkZ>DECK_LEN`) → `walkExiting` swings back → FALL.
  Decks are sized (`DECK_LEN`/`DECK_HW`) for future enemies.
- **CLIMB = pipe-locked lane-switch.** `S.climbPipe` indexes `SHAFT_PIPES`;
  `updateShaftPlayer` eases the diver to that pipe's wall position and hops to
  the angular neighbour on an L/R tap (edge-detected via `_climbPrevL/R`).
  `stepShaftWorld` sets `S.climbBlocked` when a balcony's angular span covers the
  current pipe just above → ascent halts at the underside until you hop to a
  clear pipe. Free-drift climbing is gone.
- **Round hub previews.** `drawHubTube` delegates climb/fall exits to
  `drawHubShaftTube`: a circular mouth + cylindrical funnel + `SHAFT_PIPES` +
  hex `TUBE_BALCONIES` (a port of `drawShaft` into the tube-local `pt()`).
  Flat exits keep the box corridor. `drawChamber` up/down doorways get angular
  balcony-rail hints.

### 11.10 Known constraints
- **Shaft = re-skinned corridor.** Don't fork a second projection lineage; the
  gate/hub/commit machine must keep operating on `z`=depth-along-tube.
- **VP continuity is load-bearing.** `shaftVPY` must ease to `HORIZON` near a
  gate AND in from `HORIZON` on entry, or the commit/approach crossfades pop.
- **Shaft surfaces are near-uniform** (no dominant bright floor) — that's what
  reads as "vertical tube" vs "floored corridor."
- **Score-only shafts** — there is deliberately no crash path inside a shaft
  yet; if you add one, it's a new feature, not a bug fix.
