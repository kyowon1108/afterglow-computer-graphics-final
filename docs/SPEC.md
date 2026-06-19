# SPEC — AFTERGLOW Integrated v3

This is the latest consolidated specification for AFTERGLOW. It merges the
current PRD, frozen conventions, implementation guide, v3 mechanics, and level
contract into one implementation-facing document.

For QA findings and user-reported issues, use `docs/QA_HANDOFF.md` separately.

## 1. Authority And Scope

| Item | Current decision |
|---|---|
| Runtime target | Desktop web browser |
| Framework | Vite + Three.js |
| Mobile UI | Out of scope |
| Primary camera | First-person free movement |
| Secondary cameras | `peek` and `third` |
| Gameplay truth | CPU deterministic solver and rules |
| Visual truth | Reads CPU solver state; no GPU readback for gameplay |
| Executable level truth | `src/game/levels.js` |
| Build gate | `npm run build` runs `npm run validate:levels` before Vite build |

If this integrated spec conflicts with older split documents, prefer this spec
for the current v3 build. `docs/CONVENTIONS.md` remains the naming/data-model
freeze, and `src/game/levels.js` remains the executable source for exact level
coordinates.

## 2. Product Definition

AFTERGLOW is a 3D grid-based light puzzle platformer. The player places and aims
emissive blocks so that CPU-computed direct and routed light makes floor tiles
walkable. The player then walks the lit route to the exact exit.

Core loop:

```text
pick block
-> place on socket
-> aim/rotate block or mirror
-> CPU SurfelGI-style solve
-> walk lit path
-> open required gates
-> reach exact exit
```

Technical honesty requirement:

- Say "CPU SurfelGI-style radiosity approximation."
- Do not claim DDGI.
- Do not claim physically exact SurfelGI.
- Relay mirrors and prisms are deterministic gameplay routing models, not a full
  physically accurate optical simulation.

## 3. Non-Goals

- Mobile or touch UI.
- GPU readback gameplay.
- DDGI probe-grid implementation.
- Scanner gameplay, horror exploration, cave escape, or legacy airplane game
  mechanics.
- Free block dropping; placement is socket-only.
- Full recursive/specular mirror simulation.

## 4. Architecture

| Layer | Responsibility | Files |
|---|---|---|
| Bootstrap/game loop | App state, level load, input handling, solve/apply/render loop | `src/main.js` |
| Input/camera | Key actions, pointer lock, drag-look fallback, camera modes | `src/core/input.js`, `src/core/cameraRig.js` |
| Gameplay rules | Sockets, gates, pathing, win condition, reset, exact-exit checks | `src/game/rules.js` |
| Level data | All authored level definitions and intended solution classes | `src/game/levels.js` |
| CPU light solver | Direct light, carried visual light, mirrors, prisms, bounce passes, walkability | `src/gi/SurfelSolver.js` |
| Continuous sampling | Player foot support, coyote/fall support | `src/gi/sampleField.js` |
| GI visuals | Tile/material updates from solver state | `src/gi/applyGI.js`, `src/world/tileMesh.js` |
| Entities | Player, emissive blocks, previews, exit | `src/entities/*` |
| Headless tests | Level contract, browser smoke, report captures | `scripts/*.mjs` |

The logic layer must remain deterministic and Node-importable where used by
`scripts/validate-levels.mjs`.

## 5. Data Model

Coordinates use XZ grid cells with Y-up world space.

```js
cell = { x, z }
worldX = (x - width / 2) * TILE_SIZE
worldZ = (z - height / 2) * TILE_SIZE
```

Authoring schema:

```js
{
  id, name, width, height,
  start: { x, z },
  exit: { x, z },
  interiorWalls: [{ x, z }],
  blocks: [{
    id,
    spawnCell: { x, z },
    colorKey: "white" | "red" | "green" | "blue",
    colorLocked,
    kind: "emitter" | "prism",
    emitDir: 0 | 45 | 90 | 135 | 180 | 225 | 270 | 315,
    coneDeg,
    state: "pickup" | "carried" | "placed",
    on: true
  }],
  sockets: [{ id, cell: { x, z }, allowedBlockIds }],
  mirrors: [{ id, cell: { x, z }, normalYaw, rotatable: true }],
  gates: [{ cell: { x, z }, gateColor, icon }],
  solutionActions: [],
  validateAsserts: [],
  intendedSolutionClass: {}
}
```

Frozen naming decisions:

| Concern | Current convention |
|---|---|
| Utility module | `src/core/math.js` |
| Camera modes | `fp`, `peek`, `third` |
| E action | pick/place only |
| Block state | `state: "pickup" | "carried" | "placed"` |
| Gate function | `hueMatchesGate(E, target)` |
| Normal maps | Visual-only; CPU solver uses geometric normals |
| Bounce surfels | Authored bounce/mirror surfaces, not arbitrary wall claims |

## 6. Direction And Rotation

All authored directions are degrees on the XZ plane and snap to
`ROTATE_STEP_DEG = 45`.

```js
fwd = { x: sin(rad), z: cos(rad) }
```

| deg | Direction |
|---:|---|
| 0 | south / +z |
| 45 | southeast |
| 90 | east / +x |
| 135 | northeast |
| 180 | north / -z |
| 225 | northwest |
| 270 | west / -x |
| 315 | southwest |

`yawToEmitDir(cameraYawRadians)` converts first-person camera yaw to this grid
direction convention. Camera-facing tests must map south/east/north/west to
`0/90/180/270`.

## 7. Light And GI Rules

### Block State

| State | Light behavior | Gameplay effect |
|---|---|---|
| `pickup` | No emitted light | None |
| `carried` | Short-range visual direct light only | Cannot make walkable floor, open gates, feed mirrors, or satisfy validation |
| `placed` | Full gameplay direct light and routing | Can create walkable floor, feed mirrors/prisms/bounce, and open gates |

### Direct Light

Placed emitters contribute directional-diffuse direct light from the socket cell
using height, cosine, distance falloff, visibility, and cone weight.

Carried light is stored separately as `directCarried` and is excluded from
`gameplayIrradiance`.

### Mirrors

Mirrors are blocked floor cells plus horizontal routing surfels. They receive
placed light, then re-emit directional-diffuse light along `normalYaw`. Mirror
routing is pass-bounded so it can support a two-mirror puzzle without infinite
loops.

### Prism

A placed `kind: "prism"` block behaves by color:

- `white`: split into red, green, and blue cones around `emitDir`.
- `red`, `green`, `blue`: emit a single cone of that color.

This is a deterministic gameplay model for mixed gates.

### Bounce And Modes

The solver computes:

- `directPlaced`
- `directCarried`
- `bounce1`
- `bounce2`
- `gameplayIrradiance`
- `visualIrradiance`

Gameplay modes exclude carried light:

| Mode | Visual combination | Gameplay combination |
|---|---|---|
| `DIRECT_ONLY` | placed direct + carried direct | placed direct |
| `BOUNCE1` | placed direct + carried direct + bounce1 | placed direct + bounce1 |
| `BOUNCE2` / `GI` | placed direct + carried direct + bounce1 + bounce2 | placed direct + bounce1 + bounce2 |

## 8. Walkability, Gates, And Completion

- Start and exit cells are always solid.
- Ordinary floor is walkable when gameplay luminance passes `WALK_ON`, with
  hysteresis down to `WALK_OFF`.
- Gate floor is walkable only when `hueMatchesGate(gameplayIrradiance, target)`
  passes luminance, chroma, and hue-dot thresholds.
- Locked gate cells are non-navigable for path validation.
- Mirror/panel cells are non-walkable/collidable.
- Placed block socket cells remain normal socket cells and should not block the
  authored route.

Completion requires all of the following:

1. Player is on the exact `level.exit` cell.
2. Every authored gate is open.
3. Player is not holding a block.
4. Player is grounded and not falling.

## 9. Controls

| Input | Behavior |
|---|---|
| WASD / Arrow keys | Move |
| Mouse | First-person look through pointer lock, with drag-look fallback |
| E / left click | Pick block or place held block on matching socket |
| Mouse wheel / `[` / `]` | Rotate held block; otherwise rotate aimed mirror |
| Q | Cycle held block color if not `colorLocked` |
| Z | Undo block/mirror command |
| R | Reset current level |
| G | Toggle GI/direct solve mode |
| B | Toggle DIRECT/BOUNCE1/BOUNCE2/FINAL debug view |
| M | Peek camera |
| T | Third-person camera |
| F1 / V / N | Debug views |
| C | Capture helper |
| Esc | Pause/title overlay behavior |

## 10. Levels

| Level | Name | New verb | Required current solve |
|---:|---|---|---|
| 1 | 첫 빛: 방향 맞추기 | Aimable emitter | Place locked white `b1` on `s1`, aim east. |
| 2 | 모퉁이 돌리기 | Rotatable mirror | Place locked white `b1` east, rotate `m1` to `0`. |
| 3 | 두 거울로 잇기 | Two-mirror route | Place locked white `b1` east, rotate `m1` to `90`, `m2` to `315`. |
| 4 | 흰빛에서 노랑으로 | Prism split + mixed gate | Place white prism `p1` on `s1`, aim east, open yellow via red+green split. |
| 5 | 잔광, 마젠타 | Red/blue mix + mirror | Place locked red `b1` on `s1`, locked blue `b2` on `s2`, rotate `m1` to `225`. |

Level validation is not based on visual inspection. Every level defines an
`intendedSolutionClass`, and exhaustive validation enumerates placements,
directions, colors, and mirror angles. Any winning configuration outside the
intended class is a build failure.

## 11. Validation Requirements

Required commands:

```bash
npm run validate:levels
npm run smoke:interactions
npm run build
npm run capture:report
```

Expected validation properties:

- authored angles snap to `ROTATE_STEP_DEG`;
- wrong aim, wrong mirror, wrong color, and wrong prism mix assertions fail;
- correct solution actions create a continuous exact start-to-exit path;
- carried light never creates a start-to-exit path or opens mixed gates;
- all winning exhaustive configurations are inside `intendedSolutionClass`;
- every level has at least one intended win;
- final bypass count is `0` for every level.

## 12. Report Requirements

`REPORT.md` must remain honest and course-facing:

- explain the CPU SurfelGI-style approximation;
- include direct-only, bounce, and final GI comparisons;
- include emissive blocks, BRDF/cosine/falloff, texture/UV/normal-map evidence,
  robot animation, surfel debug, color mixing/gates, and final completion;
- use `public/report-captures/*.png` generated by `npm run capture:report`.

## 13. Split Document Map

The older split docs remain useful for detail and history:

| Document | Role after integration |
|---|---|
| `docs/SPEC.md` | Latest integrated current spec |
| `docs/QA_HANDOFF.md` | QA status, active findings, manual test focus |
| `docs/CONVENTIONS.md` | Frozen naming/data-model decisions |
| `docs/MECHANICS_v3.md` | Detailed active-routing and anti-cheese design lock |
| `docs/LEVELS.md` | Level schema and solve summary |
| `docs/PRD.md` | Product rationale and acceptance framing |
| `docs/IMPLEMENTATION_GUIDE.md` | File-level implementation detail |
