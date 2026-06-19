# LEVELS — AFTERGLOW v3

This document is the implementation-facing level contract for the v3 active light
routing build. `src/game/levels.js` is the executable source of truth; this file
summarizes the schema and the intended solve for review.

## Coordinate Rules

- `cell = { x, z }`, with `x` increasing east and `z` increasing south.
- `worldX = (x - width / 2) * TILE_SIZE`, `worldZ = (z - height / 2) * TILE_SIZE`.
- Start and exit cells are always solid. Failure assertions target entry/path
  cells, not the always-solid exit itself.
- First sockets and rotatable mirrors must be reachable within 4.0 world units
  from a currently solid stance.

## Schema

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
    state: "pickup",
    on: true
  }],
  sockets: [{ id, cell: { x, z }, allowedBlockIds }],
  mirrors: [{ id, cell: { x, z }, normalYaw, rotatable: true }],
  gates: [{ cell: { x, z }, gateColor: "red" | "green" | "blue" | "yellow" | "magenta" | "cyan", icon }],
  solutionActions: [
    { type: "place", blockId, socketId, emitDir },
    { type: "rotateMirror", mirrorId, normalYaw },
    { type: "color", blockId, colorKey }
  ],
  validateAsserts: [{ label, mode, afterPlace, blockDirs, blockColors, mirrorAngles, cell, expected }]
}
```

## Level Plan

| Level | Name | New verb | Required solve |
|---:|---|---|---|
| 1 | 첫 빛: 방향 맞추기 | Aimable emitter | Place `b1` on `s1` while facing east; wrong aim misses the bridge. |
| 2 | 모퉁이 돌리기 | Rotatable mirror | Place east-facing locked-white emitter, rotate `m1` from `270` to `0` south. |
| 3 | 두 거울로 잇기 | Two-mirror chain | Place east-facing locked-white emitter, rotate `m1` to `90` and `m2` to `315`, routing through both mirrors. |
| 4 | 흰빛에서 노랑으로 | Prism split + mixed gate | Place white prism on `s1`; red+green split opens the yellow gate. Red-only and wrong aim fail. |
| 5 | 잔광, 마젠타 | Mirror + magenta mix | Place locked red `b1` on `s1`, locked blue `b2` on `s2`, rotate `m1` from `270` to `225`; L5 accepts a small aim-tolerance set documented in `MECHANICS_v3.md`. |

## Validation

`npm run validate:levels` must pass all of the following:

- authored angles snap to `ROTATE_STEP_DEG`;
- authored cones are non-omni (`coneDeg < 360`);
- `yawToEmitDir` cardinal mappings are correct;
- wrong aim/wrong mirror/wrong color assertions fail;
- correct `solutionActions` produce a continuous exact start-to-exit path;
- exhaustive negative validation reports zero winning configs outside each level's `intendedSolutionClass`;
- mirrors and panels are non-walkable/collidable;
- carried blocks never create a start-to-exit path and never open mixed gates;
- the open-room scarcity probe remains local rather than flooding the whole map.
