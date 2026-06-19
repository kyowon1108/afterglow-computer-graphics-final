# MECHANICS v3 — Active Light Routing

This document locks the v3 design before implementation. It extends the existing CPU
SurfelGI-style approximation with deterministic directional-diffuse routing mechanics:
aimable emitters, rotatable mirrors, and prisms with additive color gates.

## Non-Negotiables

- `docs/CONVENTIONS.md` wins on naming/runtime conflicts. For this v3 task,
  this document supersedes the older level data/schema in `docs/LEVELS.md`;
  `docs/LEVELS.md` must be updated to match v3 before final signoff.
- Gameplay stays CPU deterministic and headless: `SurfelSolver.js`, `sampleField.js`,
  `levels.js`, `rules.js`, `math.js`, `visibility.js`, and `formFactor.js` remain
  Node-importable and DOM/Three-free.
- Carried light remains visual-only. It must not contribute to `gameplayIrradiance`,
  walkable floor, gates, mirrors, prism splitting, or validation paths.
- Solver runs on state changes only: place, rotate, color, pickup/undo/reset, level
  load, and debug mode change.
- Mirror floor cells are blocked: non-walkable in `sampleField`, non-navigable
  in `rules`, and collision boxes in `Player`. Placed block/prism sockets remain
  normal socket cells; authored levels keep prism sockets off the required route.
- Desktop FP only. Mobile/touch controls remain out of scope.

## Direction And Angle Convention

All authored angles are degrees on the XZ plane and snap to `ROTATE_STEP_DEG = 45`.

```js
fwd = { x: sin(rad), z: cos(rad) }
```

Therefore:

| deg | direction |
|---:|---|
| 0 | +z / south |
| 45 | southeast |
| 90 | +x / east |
| 135 | northeast |
| 180 | -z / north |
| 225 | northwest |
| 270 | -x / west |
| 315 | southwest |

The camera yaw is converted to this convention when placing a block via a tested
helper, `yawToEmitDir(cameraYawRadians)`. Required cardinal tests:

| camera facing | `CameraRig.getForwardXZ()` | emitDir |
|---|---|---:|
| south | `{x:0,z:1}` | 0 |
| east | `{x:1,z:0}` | 90 |
| north | `{x:0,z:-1}` | 180 |
| west | `{x:-1,z:0}` | 270 |

With the current `CameraRig` yaw convention, the helper is
`snapDeg(-cameraYawRadians * 180 / Math.PI)`.

## Constants

Add to `src/core/constants.js`:

```js
export const EMITTER_CONE_DEG = 50;
export const CONE_SOFT_DEG = 12;
export const MIRROR_GAIN = 1.25;
export const MIRROR_RECV_MIN = 0.05;
export const PRISM_SPREAD_DEG = 28;
export const ROTATE_STEP_DEG = 45;
```

Implementation helper:

```js
coneWeight(fromPos, toPos, dirDeg, coneDeg = EMITTER_CONE_DEG):
  if coneDeg >= 360 return 1
  fwd = { x: sin(dir), z: cos(dir) }
  toS = normalize({ x: to.x - from.x, z: to.z - from.z })
  inner = cos((coneDeg / 2) * DEG)
  outer = cos((coneDeg / 2 + CONE_SOFT_DEG) * DEG)
  return smoothstep(outer, inner, dot(toS, fwd))
```

## Data Model

```js
blocks: [{
  id,
  spawnCell: { x, z },
  colorKey: "white" | "red" | "green" | "blue",
  colorLocked?: true,
  kind: "emitter" | "prism",
  emitDir: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315,
  coneDeg: number,
  state: "pickup" | "carried" | "placed",
  on: true
}]

sockets: [{
  id,
  cell: { x, z },
  allowedBlockIds?: string[]
}]

mirrors: [{
  id,
  cell: { x, z },
  normalYaw: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315,
  rotatable: true
}]

gates: [{
  cell: { x, z },
  gateColor: "red" | "green" | "blue" | "yellow" | "magenta" | "cyan",
  icon: "triangle" | "square" | "circle" | "diamondFilled" | "hex" | "plus"
}]

solutionActions: [
  { type: "place", blockId, socketId, emitDir },
  { type: "rotateMirror", mirrorId, normalYaw },
  { type: "color", blockId, colorKey }
]

validateAsserts: [{
  label: string,
  mode: "DIRECT_ONLY" | "BOUNCE1" | "BOUNCE2" | "GI",
  afterPlace: [[blockId, socketId], ...],
  blockDirs?: [[blockId, deg], ...],
  blockColors?: [[blockId, colorKey], ...],
  mirrorAngles?: [[mirrorId, deg], ...],
  cell: { x, z },
  expected: boolean
}]
```

`CommandStack` snapshots must include `state`, `cell`, `colorKey`, `emitDir`,
`kind`, and mirror `normalYaw` when rotations are undoable.

Gameplay hue uses pure additive RGB vectors; display hexes remain the accessible
Okabe-Ito-style colors. Mixed gate targets use the additive gameplay vectors:

```js
red = { r: 1, g: 0, b: 0 }
green = { r: 0, g: 1, b: 0 }
blue = { r: 0, g: 0, b: 1 }
yellow = { r: 1, g: 1, b: 0 }
magenta = { r: 1, g: 0, b: 1 }
cyan = { r: 0, g: 1, b: 1 }
```

`hueMatchesGate(gameplayIrradiance, targetRGB)` keeps its existing luminance,
chroma, and hue-dot thresholds. Hue dot is scale-invariant, so the mixed target
vectors do not need to be normalized.

## Solver Model

### Aimable Emitter

Placed non-prism blocks emit one directional-diffuse cone from their socket cell.
After height/cosine/distance/visibility, direct contribution is multiplied by
`coneWeight(lightPos, surfel.pos, block.emitDir, block.coneDeg)`.

`coneDeg >= 360` remains an escape hatch for validation probes only, not authored
levels.

### Prism

A placed `kind: "prism"` block behaves by color:

- `colorKey: "white"` emits three directional cones:
  - red at `emitDir`
  - green at `emitDir + PRISM_SPREAD_DEG`
  - blue at `emitDir - PRISM_SPREAD_DEG`
- `colorKey: "red" | "green" | "blue"` emits only that single color cone at
  `emitDir`.

This gives validation a clear "single color fails mixed gate, white split passes"
contract without adding new UI state beyond existing `Q` color cycling.

### Mirror

Each mirror has two solver objects:

- a blocked floor tile at `cell`, used only for navigation/collision;
- a mirror surfel at `cellToWorld(cell, WALL_SURFEL_HEIGHT)` with horizontal
  normal `angleToDir(normalYaw)`, used for receiving and re-emitting light.

Mirror receive is deterministic and pass-bounded:

1. pass 0 input is placed emitter/prism direct energy at the mirror surfel after
   cone and visibility weighting;
2. pass 1 input is only the mirror energy that landed on another mirror during
   pass 0.

If `luminance(recv) < MIRROR_RECV_MIN`, skip that mirror for that pass. Otherwise
the mirror re-emits `recv * mirror.albedo` as a directional-diffuse cone centered
on `normalYaw`, preserving hue. That contribution is gameplay energy and is added
to `directPlaced` before normal bounce/formFactor passes, so mirrored light can
create walkable floor, open gates, feed the next mirror pass, and feed one normal
bounce. The fixed two-pass cap prevents infinite mirror loops while allowing L3
to route through two mirrors.

## Controls

- `E` / left click: pick or place on sockets only. On place, the block's `emitDir`
  becomes the current camera yaw snapped to `ROTATE_STEP_DEG`.
- `[` / `]`: rotate selected object by `-ROTATE_STEP_DEG` / `+ROTATE_STEP_DEG`.
- Mouse wheel: same rotation while the game canvas has focus.
- Selected object:
  - held block first, rotating its `emitDir`;
  - otherwise the mirror under the crosshair within 4.0 world units and line of
    sight from the player camera.
- `Q`: cycle color for color-capable blocks. Blocks with `colorLocked: true`
  ignore color cycling. Prism uses white as RGB split and red/green/blue as
  single-color validation/debug states.
- `Z`: undo state, color, placement, block `emitDir`, and mirror `normalYaw`.
- `R`, `G`, `B`, `M`, `T`, `F1`, `V`, `N`, `Esc`: unchanged.

## Visual Readability

- Placed blocks show a cone preview on the floor in their current `emitDir`.
- Held blocks show a ghost cone in front of the player using snapped camera yaw.
- Mirrors show a floor arrow/ring aligned to `normalYaw`, with selection outline.
- Prism blocks use a triangular glass mesh and show three faint colored rays when
  white; single-color mode shows one colored cone.
- Gate icon/pattern remains non-color-only; mixed gates get distinct symbols:
  yellow `plus`, magenta `diamondFilled`, cyan `hex`.

## Level Redesign

All levels are solvable by place + aim/rotate + walk, never by carry-walk. The
first socket in each level is within 4.0 world units of start/spawn/already-lit
ground, preserving the reach rule from `docs/LEVELS.md`.

### Round 1 Anti-Cheese Design Lock

This section is the implementation contract for the hardening pass. The level
objects below replace the older snippets and must be synchronized into
`src/game/levels.js` and `docs/LEVELS.md`.

#### Global completion invariant

A level can complete only when all of the following are true:

- the player is on the exact `level.exit` cell (`sameCell(playerCell, level.exit)`);
- every authored gate is open according to gameplay energy, not visual energy;
- the player is not holding a block;
- the player is grounded and not falling.

Validation pathfinding follows the same exact-exit rule. A BFS succeeds only when
it reaches `level.exit`; it never treats exit-adjacent cells as success. Locked
gate cells are non-navigable. Gated levels additionally fail validation if any
configuration reaches the exact exit while `allGatesOpen(level) === false`.

#### Exhaustive negative validation contract

`scripts/validate-levels.mjs` enumerates the full reachable configuration space:

- each injective assignment of blocks to sockets for all placement cardinalities
  from `0` through `min(blocks.length, sockets.length)`;
- `emitDir` for every placed block in `{0,45,90,135,180,225,270,315}`;
- `colorKey` for every block/prism in `{white,red,green,blue}`;
- `normalYaw` for every mirror in `{0,45,90,135,180,225,270,315}`.

For each configuration, validation resets the level, applies the placement,
colors, directions, and mirror angles, solves in `GI`, then computes:

```js
win = pathExists(level, level.start, level.exit) && allGatesOpen(level)
```

Every winning configuration must match the level's `intendedSolutionClass`.
`winning && !isIntended(config)` is a build failure and reports the level id plus
the bypass config. Every level must have at least one intended win. The final
reported bypass count is the number of winning configs outside the intended class
and must be `0` for every level.

#### Intended solution class schema

Each level defines a serializable `intendedSolutionClass` consumed by validation.
The class is stricter than "some path exists"; it encodes that the authored verb
was used.

```js
intendedSolutionClass: {
  requireAllBlocksPlaced?: boolean,
  placements?: [{ blockId, socketId }],
  socketRoles?: [{ socketId, kind, colorKey, emitDir }],
  blockDirs?: [{ blockId, emitDir }],
  blockDirSets?: [{ blockId, allowedEmitDirs }],
  blockColors?: [{ blockId, colorKey }],
  mirrorAngles?: [{ mirrorId, normalYaw }]
}
```

`placements` are block-id-specific. `socketRoles` are role-specific and allow
equivalent block ids only when the gameplay concept truly is "this socket must
produce this color/direction." L5 uses block-specific placements plus socket
`allowedBlockIds`, so swapped sockets are not player-reachable.

`blockDirSets` are allowed only when exhaustive validation proves the alternatives
are genuine aim tolerances inside the same verb, not a different route. L5 uses a
small direction set because the compact magenta setup has three valid cone
overlaps; all of them still require locked red/blue sockets and `m1.normalYaw=225`.

#### Geometry lock

The level geometry must enforce a single lit route instead of relying on the exit
adjacency shortcut. Coordinates below are the exact target design for `levels.js`
and `docs/LEVELS.md`.

| Level | Geometry requirement |
|---:|---|
| 1 | Open teaching lane is allowed. Exact-exit plus the intended aim class prevents the old adjacent-cell shortcut from being considered success. |
| 2 | `m1={4,1}` and exact exit `{5,4}` are close enough for the relay to light a connected corner path only at `m1.normalYaw=0`. Exhaustive validation must prove all other emitter/mirror angle pairs fail. |
| 3 | Walls `{2,3}` and `{3,3}` block the lower direct route. `m1={4,1}` with `normalYaw=90` feeds `m2={6,1}`; `m2.normalYaw=315` then lights a connected southwest route to exact exit `{6,4}`. Either mirror wrong breaks the route. |
| 4 | Place the yellow gate as the sole cell before exact exit `{5,2}`. No interior walls are needed because exact-exit + all-gates-open validation makes `{4,2}` the required bottleneck; exhaustive validation proves no side approach wins with the gate locked. The prism socket is off the route at `{2,3}`; only a white prism aimed east overlaps red+green on `{4,2}`. |
| 5 | Put the magenta gate directly before exact exit and wall off side approaches with `{6,3}` and `{6,5}`. `b1` and `b2` are color-locked tutorial blocks; `s1` accepts only `b1` and `s2` accepts only `b2`, so red is the direct role and blue is the relay role. Blue routes through `m1.normalYaw=225` so red+blue overlap on the magenta gate. |

These wall choices are not trusted by inspection. They are accepted only when the
exhaustive validator reports zero winning configs outside the intended class.

### Authoritative v3 Level Objects

```js
// L1 - Aim
{
  id: 1,
  name: "첫 빛: 방향 맞추기",
  width: 9,
  height: 4,
  start: { x: 1, z: 1 },
  exit: { x: 6, z: 1 },
  interiorWalls: [],
  blocks: [{ id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", colorLocked: true,
    kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }],
  sockets: [{ id: "s1", cell: { x: 3, z: 1 } }],
  mirrors: [],
  gates: [],
  intendedSolutionClass: {
    requireAllBlocksPlaced: true,
    placements: [{ blockId: "b1", socketId: "s1" }],
    blockDirs: [{ blockId: "b1", emitDir: 90 }]
  }
}

// L2 - Mirror corner
{
  id: 2,
  name: "모퉁이 돌리기",
  width: 8,
  height: 7,
  start: { x: 1, z: 2 },
  exit: { x: 5, z: 4 },
  interiorWalls: [],
  blocks: [{ id: "b1", spawnCell: { x: 2, z: 2 }, colorKey: "white", colorLocked: true,
    kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }],
  sockets: [{ id: "s1", cell: { x: 2, z: 2 } }],
  mirrors: [{ id: "m1", cell: { x: 4, z: 1 }, normalYaw: 270, rotatable: true }],
  gates: [],
  intendedSolutionClass: {
    requireAllBlocksPlaced: true,
    placements: [{ blockId: "b1", socketId: "s1" }],
    blockDirs: [{ blockId: "b1", emitDir: 90 }],
    mirrorAngles: [{ mirrorId: "m1", normalYaw: 0 }]
  }
}

// L3 - Two mirror chain
{
  id: 3,
  name: "두 거울로 잇기",
  width: 10,
  height: 7,
  start: { x: 1, z: 2 },
  exit: { x: 6, z: 4 },
  interiorWalls: [{ x: 2, z: 3 }, { x: 3, z: 3 }],
  blocks: [{ id: "b1", spawnCell: { x: 2, z: 2 }, colorKey: "white", colorLocked: true,
    kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }],
  sockets: [{ id: "s1", cell: { x: 2, z: 2 } }],
  mirrors: [
    { id: "m1", cell: { x: 4, z: 1 }, normalYaw: 270, rotatable: true },
    { id: "m2", cell: { x: 6, z: 1 }, normalYaw: 270, rotatable: true }
  ],
  gates: [],
  intendedSolutionClass: {
    requireAllBlocksPlaced: true,
    placements: [{ blockId: "b1", socketId: "s1" }],
    blockDirs: [{ blockId: "b1", emitDir: 90 }],
    mirrorAngles: [
      { mirrorId: "m1", normalYaw: 90 },
      { mirrorId: "m2", normalYaw: 315 }
    ]
  }
}

// L4 - Prism yellow gate
{
  id: 4,
  name: "흰빛에서 노랑으로",
  width: 10,
  height: 5,
  start: { x: 1, z: 2 },
  exit: { x: 5, z: 2 },
  interiorWalls: [],
  blocks: [{ id: "p1", spawnCell: { x: 2, z: 2 }, colorKey: "white",
    kind: "prism", emitDir: 90, coneDeg: 90, state: "pickup", on: true }],
  sockets: [{ id: "s1", cell: { x: 2, z: 3 } }],
  mirrors: [],
  gates: [{ cell: { x: 4, z: 2 }, gateColor: "yellow", icon: "plus" }],
  intendedSolutionClass: {
    requireAllBlocksPlaced: true,
    placements: [{ blockId: "p1", socketId: "s1" }],
    blockDirs: [{ blockId: "p1", emitDir: 90 }],
    blockColors: [{ blockId: "p1", colorKey: "white" }]
  }
}

// L5 - Red direct + blue reflected magenta gate
{
  id: 5,
  name: "잔광, 마젠타",
  width: 11,
  height: 7,
  start: { x: 1, z: 3 },
  exit: { x: 6, z: 4 },
  interiorWalls: [{ x: 6, z: 3 }, { x: 6, z: 5 }],
  blocks: [
    { id: "b1", spawnCell: { x: 2, z: 3 }, colorKey: "red", colorLocked: true,
      kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true },
    { id: "b2", spawnCell: { x: 2, z: 4 }, colorKey: "blue", colorLocked: true,
      kind: "emitter", emitDir: 90, coneDeg: 50, state: "pickup", on: true }
  ],
  sockets: [
    { id: "s1", cell: { x: 2, z: 3 }, allowedBlockIds: ["b1"] },
    { id: "s2", cell: { x: 2, z: 5 }, allowedBlockIds: ["b2"] }
  ],
  mirrors: [{ id: "m1", cell: { x: 5, z: 5 }, normalYaw: 270, rotatable: true }],
  gates: [{ cell: { x: 5, z: 4 }, gateColor: "magenta", icon: "diamondFilled" }],
  intendedSolutionClass: {
    requireAllBlocksPlaced: true,
    placements: [
      { blockId: "b1", socketId: "s1" },
      { blockId: "b2", socketId: "s2" }
    ],
    blockDirSets: [
      { blockId: "b1", allowedEmitDirs: [45, 90] },
      { blockId: "b2", allowedEmitDirs: [90, 135] }
    ],
    blockColors: [
      { blockId: "b1", colorKey: "red" },
      { blockId: "b2", colorKey: "blue" }
    ],
    mirrorAngles: [{ mirrorId: "m1", normalYaw: 225 }]
  }
}
```

## Validation Additions

`scripts/validate-levels.mjs` must add:

- assert all authored block/mirror angles are multiples of `ROTATE_STEP_DEG` unless
  explicitly using a prism split offset internally;
- assert authored level blocks use `coneDeg < 360`; omni is only allowed in local
  validation probes;
- assert `yawToEmitDir` cardinal cases: south 0, east 90, north 180, west 270;
- assert first socket is placeable from start/spawn/already-lit ground within 4.0
  world units;
- assert every `rotateMirror` solution action has a reachable lit/solid stance
  within 4.0 world units and line of sight;
- apply `blockDirs`, `blockColors`, and `mirrorAngles` in `validateAsserts`;
- wrong-angle asserts for L1/L2/L3/L4/L5;
- wrong-color/mixed-gate asserts for L4/L5;
- apply `solutionActions`, solve in GI, assert `pathExists(start -> exact exit)`,
  and assert no solution step strands the player behind a blocked mirror/prism
  route;
- use exact-exit success in every validation path helper, including continuous
  path sampling and carried-light cheese checks;
- enumerate all injective placement cardinalities from `0` through
  `min(blocks.length, sockets.length)` so a level cannot pass by requiring an
  unplaced pickup block to be ignored;
- create a fresh `createLevelState(levelDef)` for each exhaustive configuration,
  or equivalently clear all solver/walkable/visual/hysteresis state before
  solving. Reusing a solved level without clearing `walkable`/`wasWalkable` is
  invalid because hysteresis can leak prior config state;
- compare each winning exhaustive config against the serializable
  `intendedSolutionClass` field, including role-based socket checks where used;
- respect socket `allowedBlockIds` and block `colorLocked` when defining the
  player-reachable config space;
- existing scarcity probe;
- existing carried-light cheese assertion;
- carried prism/emitter cannot open L4/L5 mixed gates from any player cell, with
  and without the other expected placed lights.

## Implementation Inventory

- `constants.js`: new directional constants and mixed palette entries.
- `math.js`: `degToRad`, `normalize2`, `smoothstep`, `snapDeg`, `angleToDir`,
  `coneWeight`, optional `colorKey` helpers.
- `floorGrid.js`: mirrors mark floor surfels `blockedByPanel=true` like bounce panels.
- `walls.js`: mirror surfels are bounce/mirror-capable wall surfels with `normalYaw`.
- `SurfelSolver.js`: split placed/carried direct, prism emitter expansion, mirror
  re-emit pass, gameplay/visual combine unchanged in principle.
- `rules.js`: blocked mirror cells are non-navigable.
- `levels.js`: replace old five levels with v3 data.
- `main.js`/`input.js`: bracket/wheel rotation, selected mirror, place captures yaw,
  Q color for prism/emitter, solver dirty only on state change.
- `commandStack.js`: snapshots include direction/color/mirror angle.
- `levelBuilder.js`/visual entities: mirror meshes/arrows, prism mesh, cone previews.
- `tileMesh.js`: mixed gate icons/colors.
- `capture-report.mjs`/`smoke-interactions.mjs`: update routes to v3 mechanics.
- `REPORT.md`: update theory mapping and honest wording.
