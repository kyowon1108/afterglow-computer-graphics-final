import { buildGrid } from "../world/floorGrid.js";
import { buildWalls } from "../world/walls.js";
import { cellKey, deepClone, hueMatchesGate, isAdjacent, sameCell } from "../core/math.js";
import { PALETTE } from "../core/constants.js";
import { solve } from "../gi/SurfelSolver.js";

function makeBlockedPanelCells(levelDef) {
  const blocked = new Set();
  for (const panel of levelDef.bouncePanels ?? []) {
    for (const cell of panel.cells ?? []) blocked.add(cellKey(cell));
  }
  for (const mirror of levelDef.mirrors ?? []) blocked.add(cellKey(mirror.cell));
  return blocked;
}

export function createLevelState(levelDef) {
  const def = deepClone(levelDef);
  const grid = buildGrid(def);
  const wallData = buildWalls(def);
  const blocks = def.blocks.map((block) => ({
    kind: "emitter",
    emitDir: 90,
    coneDeg: 50,
    ...block,
    initialColorKey: block.colorKey,
    initialEmitDir: block.emitDir ?? 90,
    initialConeDeg: block.coneDeg ?? 50,
    initialKind: block.kind ?? "emitter",
    cell: null,
    holder: null
  }));
  const mirrors = (def.mirrors ?? []).map((mirror) => ({ ...mirror, initialNormalYaw: mirror.normalYaw }));
  const level = {
    ...def,
    grid,
    walls: wallData.walls,
    wallSurfels: wallData.wallSurfels,
    surfels: [...grid.surfels, ...wallData.wallSurfels],
    blockedPanelCells: makeBlockedPanelCells(def),
    blocks,
    mirrors,
    playerCell: { ...def.start },
    mode: "GI",
    lastSolveMs: 0
  };
  solve(level, "GI");
  return level;
}

export function isPanelBlockedCell(level, cell) {
  const tile = level.grid.tileAt(cell);
  return tile?.blockedByPanel || level.blockedPanelCells?.has(cellKey(cell)) || false;
}

export function isPlayerNavigableCell(level, cell) {
  const tile = level.grid.tileAt(cell);
  return !!tile?.walkable && !tile.blockedByPanel && !isPanelBlockedCell(level, cell);
}

export function socketAcceptsBlock(socket, block) {
  return !socket?.allowedBlockIds?.length || socket.allowedBlockIds.includes(block.id);
}

export function allGatesOpen(level) {
  return (level.gates ?? []).every((gate) => {
    const tile = level.grid.tileAt(gate.cell);
    const target = PALETTE[gate.gateColor]?.rgb;
    return !!tile?.walkable && !!target && hueMatchesGate(tile.gameplayIrradiance ?? tile.irradiance, target);
  });
}

export function resetBlocksToPickup(level) {
  for (const block of level.blocks) {
    block.state = "pickup";
    block.cell = null;
    block.holder = null;
    block.colorKey = block.initialColorKey ?? block.colorKey;
    block.emitDir = block.initialEmitDir ?? block.emitDir;
    block.coneDeg = block.initialConeDeg ?? block.coneDeg;
    block.kind = block.initialKind ?? block.kind;
  }
  for (const mirror of level.mirrors ?? []) {
    mirror.normalYaw = mirror.initialNormalYaw ?? mirror.normalYaw;
  }
}

export function placeBlockOnSocket(level, blockId, socketId) {
  const block = level.blocks.find((b) => b.id === blockId);
  const socket = level.sockets.find((s) => s.id === socketId);
  if (!block || !socket) throw new Error(`Missing block/socket ${blockId}/${socketId}`);
  if (!socketAcceptsBlock(socket, block)) throw new Error(`Socket ${socketId} does not accept block ${blockId}`);
  block.state = "placed";
  block.cell = { ...socket.cell };
  block.holder = null;
  return block;
}

export function applyExpectedSolution(level) {
  resetBlocksToPickup(level);
  if (level.solutionActions?.length) {
    for (const action of level.solutionActions) {
      if (action.type === "color") {
        const block = level.blocks.find((item) => item.id === action.blockId);
        if (block) block.colorKey = action.colorKey;
      } else if (action.type === "place") {
        const block = placeBlockOnSocket(level, action.blockId, action.socketId);
        if (typeof action.emitDir === "number") block.emitDir = action.emitDir;
      } else if (action.type === "rotateMirror") {
        const mirror = level.mirrors?.find((item) => item.id === action.mirrorId);
        if (mirror) mirror.normalYaw = action.normalYaw;
      }
    }
    return;
  }
  const placements = new Map();
  for (const assert of level.validateAsserts ?? []) {
    for (const [bid, sid] of assert.afterPlace ?? []) placements.set(bid, sid);
  }
  for (const [bid, sid] of placements) placeBlockOnSocket(level, bid, sid);
}

export function pathExists(level, from = level.start, to = level.exit) {
  const start = level.grid.tileAt(from);
  const end = level.grid.tileAt(to);
  if (!start || !end || isPanelBlockedCell(level, from)) return false;
  const queue = [from];
  const seen = new Set([cellKey(from)]);
  const dirs = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ];
  while (queue.length) {
    const cell = queue.shift();
    if (sameCell(cell, to)) return true;
    for (const dir of dirs) {
      const next = { x: cell.x + dir.x, z: cell.z + dir.z };
      const key = cellKey(next);
      if (seen.has(key)) continue;
      if (!isPlayerNavigableCell(level, next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

export function noStrandingDuringSolution(level) {
  return level.blocks.every((block) => isAdjacent(block.spawnCell, level.start) || level.grid.tileAt(block.spawnCell)?.alwaysSolid || isPlayerNavigableCell(level, block.spawnCell));
}

export function checkPlayer(level, playerCell) {
  const tile = level.grid.tileAt(playerCell);
  const gatesOpen = allGatesOpen(level);
  const reachedExit = sameCell(playerCell, level.exit);
  return {
    tile,
    walkable: isPlayerNavigableCell(level, playerCell),
    reachedExit,
    gatesOpen,
    luminance: tile ? (tile.gameplayIrradiance ?? tile.irradiance) : { r: 0, g: 0, b: 0 }
  };
}
