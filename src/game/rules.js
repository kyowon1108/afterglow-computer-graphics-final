import { buildGrid } from "../world/floorGrid.js";
import { buildWalls } from "../world/walls.js";
import { deepClone, isAdjacent, sameCell } from "../core/math.js";
import { solve } from "../gi/SurfelSolver.js";

export function createLevelState(levelDef) {
  const def = deepClone(levelDef);
  const grid = buildGrid(def);
  const wallData = buildWalls(def);
  const blocks = def.blocks.map((block) => ({ ...block, initialColorKey: block.colorKey, cell: null, holder: null }));
  const level = {
    ...def,
    grid,
    walls: wallData.walls,
    wallSurfels: wallData.wallSurfels,
    surfels: [...grid.surfels, ...wallData.wallSurfels],
    blocks,
    playerCell: { ...def.start },
    mode: "GI",
    lastSolveMs: 0
  };
  solve(level, "GI");
  return level;
}

export function resetBlocksToPickup(level) {
  for (const block of level.blocks) {
    block.state = "pickup";
    block.cell = null;
    block.holder = null;
    block.colorKey = block.initialColorKey ?? block.colorKey;
  }
}

export function placeBlockOnSocket(level, blockId, socketId) {
  const block = level.blocks.find((b) => b.id === blockId);
  const socket = level.sockets.find((s) => s.id === socketId);
  if (!block || !socket) throw new Error(`Missing block/socket ${blockId}/${socketId}`);
  block.state = "placed";
  block.cell = { ...socket.cell };
  block.holder = null;
  return block;
}

export function applyExpectedSolution(level) {
  const placements = new Map();
  for (const assert of level.validateAsserts ?? []) {
    for (const [bid, sid] of assert.afterPlace ?? []) placements.set(bid, sid);
  }
  resetBlocksToPickup(level);
  for (const [bid, sid] of placements) placeBlockOnSocket(level, bid, sid);
}

export function pathExists(level, from = level.start, to = level.exit) {
  const start = level.grid.tileAt(from);
  const end = level.grid.tileAt(to);
  if (!start || !end) return false;
  const queue = [from];
  const seen = new Set([`${from.x},${from.z}`]);
  const dirs = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ];
  while (queue.length) {
    const cell = queue.shift();
    if (sameCell(cell, to) || (end.alwaysSolid && Math.max(Math.abs(cell.x - to.x), Math.abs(cell.z - to.z)) <= 1)) return true;
    for (const dir of dirs) {
      const next = { x: cell.x + dir.x, z: cell.z + dir.z };
      const key = `${next.x},${next.z}`;
      if (seen.has(key)) continue;
      const tile = level.grid.tileAt(next);
      if (!tile || !tile.walkable) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

export function noStrandingDuringSolution(level) {
  return level.blocks.every((block) => isAdjacent(block.spawnCell, level.start) || level.grid.tileAt(block.spawnCell)?.alwaysSolid || level.grid.tileAt(block.spawnCell)?.walkable);
}

export function checkPlayer(level, playerCell) {
  const tile = level.grid.tileAt(playerCell);
  const reachedExit = sameCell(playerCell, level.exit) || Math.max(Math.abs(playerCell.x - level.exit.x), Math.abs(playerCell.z - level.exit.z)) <= 1;
  return {
    tile,
    walkable: !!tile?.walkable,
    reachedExit,
    luminance: tile ? tile.irradiance : { r: 0, g: 0, b: 0 }
  };
}
