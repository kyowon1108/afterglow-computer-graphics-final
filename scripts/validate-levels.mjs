import { LEVELS } from "../src/game/levels.js";
import { applyExpectedSolution, createLevelState, noStrandingDuringSolution, pathExists, placeBlockOnSocket, resetBlocksToPickup } from "../src/game/rules.js";
import { solve } from "../src/gi/SurfelSolver.js";
import { sampleIrradianceAt } from "../src/gi/sampleField.js";
import { WALK_OFF, WALK_ON } from "../src/core/constants.js";
import { cellToWorld, isAdjacent, sameCell } from "../src/core/math.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sampleCell(level, cell) {
  const pos = cellToWorld(cell, level, 0);
  return sampleIrradianceAt(level, pos.x, pos.z);
}

function assertSample(level, cell, predicate, message) {
  const sampled = sampleCell(level, cell);
  assert(predicate(sampled), `${message}; sampled=${sampled.toFixed(3)}`);
}

function findWalkablePath(level, from = level.start, to = level.exit) {
  const queue = [{ cell: from, path: [from] }];
  const seen = new Set([`${from.x},${from.z}`]);
  const dirs = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ];
  while (queue.length) {
    const { cell, path } = queue.shift();
    if (sameCell(cell, to) || Math.max(Math.abs(cell.x - to.x), Math.abs(cell.z - to.z)) <= 1) return path;
    for (const dir of dirs) {
      const next = { x: cell.x + dir.x, z: cell.z + dir.z };
      const key = `${next.x},${next.z}`;
      if (seen.has(key)) continue;
      const tile = level.grid.tileAt(next);
      if (!tile || !tile.walkable) continue;
      seen.add(key);
      queue.push({ cell: next, path: [...path, next] });
    }
  }
  return null;
}

function assertContinuousPath(level) {
  const path = findWalkablePath(level);
  assert(path, `L${level.id}: no walkable path for continuous sampling`);
  for (let i = 1; i < path.length; i++) {
    const a = cellToWorld(path[i - 1], level, 0);
    const b = cellToWorld(path[i], level, 0);
    for (let step = 0; step <= 6; step++) {
      const t = step / 6;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const sampled = sampleIrradianceAt(level, x, z);
      assert(sampled >= WALK_OFF, `L${level.id}: continuous path dips below WALK_OFF between ${path[i - 1].x},${path[i - 1].z} and ${path[i].x},${path[i].z}; sampled=${sampled.toFixed(3)}`);
    }
  }
}

function assertOneBlockLocalPool() {
  const openRoom = {
    id: 99,
    name: "Open Scarcity Probe",
    width: 16,
    height: 16,
    start: { x: 1, z: 1 },
    exit: { x: 14, z: 14 },
    interiorWalls: [],
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 8, z: 8 } }],
    bouncePanels: [],
    gates: [],
    validateAsserts: []
  };
  const level = createLevelState(openRoom);
  resetBlocksToPickup(level);
  placeBlockOnSocket(level, "b1", "s1");
  solve(level, "GI");
  const walkable = level.grid.surfels.filter((s) => s.walkable).length;
  assert(walkable >= 8 && walkable <= 36, `Open scarcity probe: one placed block should make a local pool, got ${walkable}/${level.grid.surfels.length}`);
  return { walkable, total: level.grid.surfels.length };
}

function validateLevel(levelDef) {
  const level = createLevelState(levelDef);
  assert(level.grid.tileAt(level.start)?.alwaysSolid, `L${level.id}: start is not alwaysSolid`);
  assert(level.grid.tileAt(level.exit)?.alwaysSolid, `L${level.id}: exit is not alwaysSolid`);

  for (const block of level.blocks) {
    const spawnTile = level.grid.tileAt(block.spawnCell);
    assert(isAdjacent(block.spawnCell, level.start) || spawnTile?.alwaysSolid, `L${level.id}: ${block.id} spawn is not accessible`);
  }

  for (const check of level.validateAsserts) {
    resetBlocksToPickup(level);
    for (const [bid, sid] of check.afterPlace) placeBlockOnSocket(level, bid, sid);
    solve(level, check.mode);
    const tile = level.grid.tileAt(check.cell);
    assert(tile, `L${level.id}: assert cell missing ${check.cell.x},${check.cell.z}`);
    assert(tile.walkable === check.expected, `L${level.id}: ${check.mode} ${check.cell.x},${check.cell.z} expected ${check.expected}, got ${tile.walkable}; lum=${tile.irradiance ? JSON.stringify(tile.irradiance) : "n/a"}`);
  }

  if (level.id === 2) {
    resetBlocksToPickup(level);
    placeBlockOnSocket(level, "b1", "s1");
    solve(level, "DIRECT_ONLY");
    assertSample(level, { x: 2, z: 4 }, (sampled) => sampled < WALK_OFF * 0.9, `L2: DIRECT_ONLY must not light bounce entry`);
    solve(level, "GI");
    assertSample(level, { x: 2, z: 4 }, (sampled) => sampled >= WALK_ON * 1.1, `L2: GI bounce must light entry`);
  }

  if (level.id === 3) {
    resetBlocksToPickup(level);
    placeBlockOnSocket(level, "b1", "s1");
    solve(level, "BOUNCE1");
    assertSample(level, { x: 9, z: 3 }, (sampled) => sampled < WALK_OFF, `L3: BOUNCE1 must not reach final entry`);
    solve(level, "GI");
    assertSample(level, { x: 9, z: 3 }, (sampled) => sampled >= WALK_ON, `L3: GI/BOUNCE2 must reach final entry`);
  }

  if (level.id === 4) {
    resetBlocksToPickup(level);
    placeBlockOnSocket(level, "b1", "s1");
    solve(level, "GI");
    assertSample(level, { x: 4, z: 3 }, (sampled) => sampled < WALK_ON, `L4: one block must not complete the additive bridge`);
    placeBlockOnSocket(level, "b2", "s2");
    solve(level, "GI");
    assertSample(level, { x: 4, z: 3 }, (sampled) => sampled >= WALK_ON, `L4: two blocks must complete the additive bridge`);
  }

  if (level.id === 5) {
    resetBlocksToPickup(level);
    placeBlockOnSocket(level, "b1", "s1");
    solve(level, "GI");
    assertSample(level, { x: 9, z: 3 }, (sampled) => sampled < WALK_OFF, `L5: white-only must not open the green gate`);
    placeBlockOnSocket(level, "b2", "s2");
    solve(level, "GI");
    assertSample(level, { x: 9, z: 3 }, (sampled) => sampled >= WALK_ON, `L5: green block must open the gate`);
  }

  applyExpectedSolution(level);
  solve(level, "GI");
  assert(pathExists(level), `L${level.id}: final path does not reach exit`);
  assertContinuousPath(level);
  assert(noStrandingDuringSolution(level), `L${level.id}: expected solution can strand the player`);
  const walkable = level.grid.surfels.filter((s) => s.walkable).length;
  assert(walkable < level.grid.surfels.length, `L${level.id}: GI solution floods every floor tile (${walkable}/${level.grid.surfels.length})`);
  return level;
}

const openProbe = assertOneBlockLocalPool();
console.log(`PASS Open Scarcity Probe: ${openProbe.walkable}/${openProbe.total} floor tiles walkable`);

for (const level of LEVELS) {
  const validated = validateLevel(level);
  const walkable = validated.grid.surfels.filter((s) => s.walkable).length;
  console.log(`PASS L${validated.id} ${validated.name}: ${walkable}/${validated.grid.surfels.length} floor tiles walkable`);
}
