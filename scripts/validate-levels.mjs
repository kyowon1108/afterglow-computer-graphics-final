import { LEVELS } from "../src/game/levels.js";
import { allGatesOpen, applyExpectedSolution, createLevelState, isPlayerNavigableCell, pathExists, placeBlockOnSocket, resetBlocksToPickup, socketAcceptsBlock } from "../src/game/rules.js";
import { solve } from "../src/gi/SurfelSolver.js";
import { sampleIrradianceAt } from "../src/gi/sampleField.js";
import { visible } from "../src/gi/visibility.js";
import { PALETTE, ROTATE_STEP_DEG, TILE_SIZE, WALK_OFF, WALK_ON } from "../src/core/constants.js";
import { cellKey, cellToWorld, hueMatchesGate, isAdjacent, sameCell, yawToEmitDir } from "../src/core/math.js";

const MAX_INTERACT_DISTANCE = 4.0;
const DIRS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 }
];
const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
const MIXED_GATES = new Set(["yellow", "magenta", "cyan"]);

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

function formatPath(path) {
  return path.map((cell) => `(${cell.x},${cell.z})`).join(" -> ");
}

function assertSnappedAngle(value, label) {
  assert(Number.isFinite(value), `${label}: missing angle`);
  assert(value % ROTATE_STEP_DEG === 0, `${label}: ${value} is not snapped to ${ROTATE_STEP_DEG}`);
}

function assertAuthoredSchema(levelDef) {
  for (const block of levelDef.blocks) {
    assert(block.kind === "emitter" || block.kind === "prism", `L${levelDef.id}: ${block.id} invalid kind ${block.kind}`);
    assertSnappedAngle(block.emitDir, `L${levelDef.id}: ${block.id}.emitDir`);
    assert((block.coneDeg ?? 0) > 0 && block.coneDeg < 360, `L${levelDef.id}: ${block.id} authored coneDeg must be < 360`);
  }
  for (const mirror of levelDef.mirrors ?? []) assertSnappedAngle(mirror.normalYaw, `L${levelDef.id}: ${mirror.id}.normalYaw`);
}

function assertYawMapping() {
  assert(yawToEmitDir(0) === 0, "yawToEmitDir south/yaw0 should be 0");
  assert(yawToEmitDir(-Math.PI / 2) === 90, "yawToEmitDir east should be 90");
  assert(yawToEmitDir(Math.PI) === 180, "yawToEmitDir north should be 180");
  assert(yawToEmitDir(Math.PI / 2) === 270, "yawToEmitDir west should be 270");
}

function reachableCells(level, from = level.start) {
  const queue = [from];
  const seen = new Set([cellKey(from)]);
  while (queue.length) {
    const cell = queue.shift();
    for (const dir of DIRS) {
      const next = { x: cell.x + dir.x, z: cell.z + dir.z };
      const key = cellKey(next);
      if (seen.has(key)) continue;
      if (!isPlayerNavigableCell(level, next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen;
}

function findWalkablePath(level, from = level.start, to = level.exit) {
  const queue = [{ cell: from, path: [from] }];
  const seen = new Set([cellKey(from)]);
  while (queue.length) {
    const { cell, path } = queue.shift();
    if (sameCell(cell, to)) return path;
    for (const dir of DIRS) {
      const next = { x: cell.x + dir.x, z: cell.z + dir.z };
      const key = cellKey(next);
      if (seen.has(key)) continue;
      if (!isPlayerNavigableCell(level, next)) continue;
      seen.add(key);
      queue.push({ cell: next, path: [...path, next] });
    }
  }
  return null;
}

function assertContinuousPath(level) {
  const path = findWalkablePath(level);
  assert(path, `L${level.id}: no walkable path for continuous sampling`);
  for (const cell of path) assert(isPlayerNavigableCell(level, cell), `L${level.id}: path crosses blocked cell ${cell.x},${cell.z}`);
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

function targetReachable(level, targetCell) {
  const target = cellToWorld(targetCell, level, 0.2);
  const seen = reachableCells(level);
  for (const surfel of level.grid.surfels) {
    if (!seen.has(cellKey(surfel.cell))) continue;
    if (!isPlayerNavigableCell(level, surfel.cell)) continue;
    const stance = cellToWorld(surfel.cell, level, 0.2);
    const dist = Math.hypot(target.x - stance.x, target.z - stance.z);
    if (dist <= MAX_INTERACT_DISTANCE && visible(stance, target, level.walls)) return true;
  }
  return false;
}

function applyBlockOverrides(level, check) {
  for (const [bid, colorKey] of check.blockColors ?? []) {
    const block = level.blocks.find((item) => item.id === bid);
    assert(block, `L${level.id}: missing block for color override ${bid}`);
    block.colorKey = colorKey;
  }
  for (const [bid, emitDir] of check.blockDirs ?? []) {
    const block = level.blocks.find((item) => item.id === bid);
    assert(block, `L${level.id}: missing block for direction override ${bid}`);
    block.emitDir = emitDir;
  }
  for (const [mid, normalYaw] of check.mirrorAngles ?? []) {
    const mirror = level.mirrors?.find((item) => item.id === mid);
    assert(mirror, `L${level.id}: missing mirror for angle override ${mid}`);
    mirror.normalYaw = normalYaw;
  }
}

function applyAction(level, action) {
  if (action.type === "place") {
    const block = placeBlockOnSocket(level, action.blockId, action.socketId);
    if (typeof action.emitDir === "number") block.emitDir = action.emitDir;
    return;
  }
  if (action.type === "rotateMirror") {
    const mirror = level.mirrors?.find((item) => item.id === action.mirrorId);
    assert(mirror, `L${level.id}: missing solution mirror ${action.mirrorId}`);
    mirror.normalYaw = action.normalYaw;
    return;
  }
  if (action.type === "color") {
    const block = level.blocks.find((item) => item.id === action.blockId);
    assert(block, `L${level.id}: missing solution block ${action.blockId}`);
    block.colorKey = action.colorKey;
  }
}

function assertSolutionActions(levelDef) {
  const level = createLevelState(levelDef);
  resetBlocksToPickup(level);
  solve(level, "GI");
  for (const action of level.solutionActions ?? []) {
    if (action.type === "place") {
      const socket = level.sockets.find((item) => item.id === action.socketId);
      assert(socket, `L${level.id}: missing solution socket ${action.socketId}`);
      assert(targetReachable(level, socket.cell), `L${level.id}: socket ${action.socketId} is not reachable before placement`);
    } else if (action.type === "rotateMirror") {
      const mirror = level.mirrors?.find((item) => item.id === action.mirrorId);
      assert(mirror, `L${level.id}: missing solution mirror ${action.mirrorId}`);
      assert(targetReachable(level, mirror.cell), `L${level.id}: mirror ${action.mirrorId} is not reachable before rotation`);
    }
    applyAction(level, action);
    solve(level, "GI");
  }
  assert(pathExists(level), `L${level.id}: final path does not reach exit after solutionActions`);
  assertContinuousPath(level);
}

function setCarried(level, block) {
  resetBlocksToPickup(level);
  block.state = "carried";
  block.cell = null;
  block.holder = "player";
}

function solveWithCarriedAt(level, cell) {
  level.playerCell = { ...cell };
  solve(level, "GI");
}

function carriedSegmentFeasible(level, from, to) {
  const a = cellToWorld(from, level, 0);
  const b = cellToWorld(to, level, 0);
  solveWithCarriedAt(level, from);
  for (let step = 0; step <= 5; step++) {
    const t = (step / 5) * 0.5;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (sampleIrradianceAt(level, x, z) < WALK_OFF) return false;
  }
  solveWithCarriedAt(level, to);
  for (let step = 0; step <= 5; step++) {
    const t = 0.5 + (step / 5) * 0.5;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (sampleIrradianceAt(level, x, z) < WALK_OFF) return false;
  }
  return true;
}

function findCarriedPath(level, from = level.start, to = level.exit) {
  const queue = [{ cell: from, path: [from] }];
  const seen = new Set([cellKey(from)]);
  while (queue.length) {
    const { cell, path } = queue.shift();
    if (sameCell(cell, to)) return path;
    for (const dir of DIRS) {
      const next = { x: cell.x + dir.x, z: cell.z + dir.z };
      const key = cellKey(next);
      if (seen.has(key)) continue;
      solveWithCarriedAt(level, next);
      if (!isPlayerNavigableCell(level, next)) continue;
      if (!carriedSegmentFeasible(level, cell, next)) continue;
      seen.add(key);
      queue.push({ cell: next, path: [...path, next] });
    }
  }
  return null;
}

function assertNoCarryTraversal(levelDef) {
  for (const blockDef of levelDef.blocks) {
    const level = createLevelState(levelDef);
    const carried = level.blocks.find((block) => block.id === blockDef.id);
    setCarried(level, carried);
    const path = findCarriedPath(level);
    if (path) throw new Error(`L${level.id}: carried ${carried.id} creates a start-to-exit path: ${formatPath(path)}`);
  }
}

function applySolutionExcept(level, excludedBlockId) {
  resetBlocksToPickup(level);
  for (const action of level.solutionActions ?? []) {
    if (action.blockId === excludedBlockId) continue;
    applyAction(level, action);
  }
}

function assertCarriedCannotOpenMixedGates() {
  for (const levelDef of LEVELS.filter((level) => level.gates?.some((gate) => MIXED_GATES.has(gate.gateColor)))) {
    for (const carriedDef of levelDef.blocks) {
      const level = createLevelState(levelDef);
      applySolutionExcept(level, carriedDef.id);
      const carried = level.blocks.find((block) => block.id === carriedDef.id);
      carried.state = "carried";
      carried.cell = null;
      carried.holder = "player";
      for (const surfel of level.grid.surfels) {
        solveWithCarriedAt(level, surfel.cell);
        for (const gateDef of level.gates.filter((gate) => MIXED_GATES.has(gate.gateColor))) {
          const gate = level.grid.tileAt(gateDef.cell);
          const energy = gate.gameplayIrradiance ?? gate.irradiance;
          assert(!hueMatchesGate(energy, PALETTE[gateDef.gateColor].rgb), `L${level.id}: carried ${carried.id} opens ${gateDef.gateColor} gate at player cell ${surfel.cell.x},${surfel.cell.z}`);
        }
      }
    }
  }
}

function cartesian(options) {
  return options.reduce((sets, values) => sets.flatMap((set) => values.map((value) => [...set, value])), [[]]);
}

function reachablePlacementAssignments(levelDef) {
  const assignments = [];
  const blocks = levelDef.blocks;
  const sockets = levelDef.sockets;
  function visit(index, used, pairs) {
    if (index >= blocks.length) {
      assignments.push([...pairs]);
      return;
    }
    visit(index + 1, used, pairs);
    const block = blocks[index];
    for (const socket of sockets) {
      if (used.has(socket.id)) continue;
      if (!socketAcceptsBlock(socket, block)) continue;
      used.add(socket.id);
      pairs.push([block.id, socket.id]);
      visit(index + 1, used, pairs);
      pairs.pop();
      used.delete(socket.id);
    }
  }
  visit(0, new Set(), []);
  return assignments;
}

function colorOptions(block) {
  return block.colorLocked ? [block.colorKey] : ["white", "red", "green", "blue"];
}

function configMatchesIntended(levelDef, config) {
  const intended = levelDef.intendedSolutionClass;
  if (!intended) return false;
  const placements = new Map(config.placements);
  if (intended.requireAllBlocksPlaced && placements.size !== levelDef.blocks.length) return false;
  for (const item of intended.placements ?? []) {
    if (placements.get(item.blockId) !== item.socketId) return false;
  }
  for (const role of intended.socketRoles ?? []) {
    const blockId = [...placements.entries()].find(([, socketId]) => socketId === role.socketId)?.[0];
    if (!blockId) return false;
    const block = levelDef.blocks.find((candidate) => candidate.id === blockId);
    if (role.kind && block?.kind !== role.kind) return false;
    if (role.colorKey && config.colors.get(blockId) !== role.colorKey) return false;
    if (typeof role.emitDir === "number" && config.dirs.get(blockId) !== role.emitDir) return false;
  }
  for (const item of intended.blockDirs ?? []) {
    if (config.dirs.get(item.blockId) !== item.emitDir) return false;
  }
  for (const item of intended.blockDirSets ?? []) {
    if (!item.allowedEmitDirs.includes(config.dirs.get(item.blockId))) return false;
  }
  for (const item of intended.blockColors ?? []) {
    if (config.colors.get(item.blockId) !== item.colorKey) return false;
  }
  for (const item of intended.mirrorAngles ?? []) {
    if (config.mirrors.get(item.mirrorId) !== item.normalYaw) return false;
  }
  return true;
}

function formatConfig(config) {
  const pairs = (values) => [...values.entries()].map(([id, value]) => `${id}:${value}`).join(",");
  return `placements=${JSON.stringify(config.placements)} dirs=${pairs(config.dirs)} colors=${pairs(config.colors)} mirrors=${pairs(config.mirrors)}`;
}

function assertExhaustiveIntendedOnly(levelDef) {
  const blockDirCombos = cartesian(levelDef.blocks.map(() => ANGLES));
  const blockColorCombos = cartesian(levelDef.blocks.map(colorOptions));
  const mirrorCombos = cartesian((levelDef.mirrors ?? []).map(() => ANGLES));
  const placementAssignments = reachablePlacementAssignments(levelDef);
  let wins = 0;
  let bypasses = 0;
  let lockedGateWins = 0;

  for (const placements of placementAssignments) {
    for (const dirValues of blockDirCombos) {
      for (const colorValues of blockColorCombos) {
        for (const mirrorValues of mirrorCombos.length ? mirrorCombos : [[]]) {
          const level = createLevelState(levelDef);
          resetBlocksToPickup(level);
          const config = {
            placements,
            dirs: new Map(),
            colors: new Map(),
            mirrors: new Map()
          };
          for (let i = 0; i < level.blocks.length; i++) {
            const block = level.blocks[i];
            block.emitDir = dirValues[i];
            block.colorKey = colorValues[i];
            config.dirs.set(block.id, block.emitDir);
            config.colors.set(block.id, block.colorKey);
          }
          for (let i = 0; i < (level.mirrors ?? []).length; i++) {
            const mirror = level.mirrors[i];
            mirror.normalYaw = mirrorValues[i];
            config.mirrors.set(mirror.id, mirror.normalYaw);
          }
          for (const [blockId, socketId] of placements) placeBlockOnSocket(level, blockId, socketId);
          solve(level, "GI");
          const gatesOpen = allGatesOpen(level);
          const win = pathExists(level, level.start, level.exit) && gatesOpen;
          if (!gatesOpen && pathExists(level, level.start, level.exit)) lockedGateWins++;
          if (!win) continue;
          wins++;
          if (!configMatchesIntended(levelDef, config)) {
            bypasses++;
            throw new Error(`L${levelDef.id}: bypass winning config outside intended class: ${formatConfig(config)}`);
          }
        }
      }
    }
  }
  assert(wins > 0, `L${levelDef.id}: exhaustive validation found no intended winning config`);
  assert(bypasses === 0, `L${levelDef.id}: ${bypasses} bypass configs`);
  assert(lockedGateWins === 0, `L${levelDef.id}: ${lockedGateWins} exact-exit paths with locked gates`);
  return { wins, bypasses, checked: placementAssignments.length * blockDirCombos.length * blockColorCombos.length * (mirrorCombos.length || 1) };
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
    blocks: [{ id: "b1", spawnCell: { x: 2, z: 1 }, colorKey: "white", kind: "emitter", emitDir: 90, coneDeg: 360, state: "pickup", on: true }],
    sockets: [{ id: "s1", cell: { x: 8, z: 8 } }],
    bouncePanels: [],
    mirrors: [],
    gates: [],
    validateAsserts: []
  };
  const level = createLevelState(openRoom);
  resetBlocksToPickup(level);
  placeBlockOnSocket(level, "b1", "s1");
  solve(level, "GI");
  const walkable = level.grid.surfels.filter((s) => s.walkable).length;
  assert(walkable >= 8 && walkable <= 40, `Open scarcity probe: one placed block should make a local pool, got ${walkable}/${level.grid.surfels.length}`);
  return { walkable, total: level.grid.surfels.length };
}

function validateLevel(levelDef) {
  assertAuthoredSchema(levelDef);
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
    applyBlockOverrides(level, check);
    solve(level, check.mode);
    const tile = level.grid.tileAt(check.cell);
    assert(tile, `L${level.id}: assert cell missing ${check.cell.x},${check.cell.z}`);
    assert(tile.walkable === check.expected, `L${level.id}: ${check.label ?? check.mode} ${check.cell.x},${check.cell.z} expected ${check.expected}, got ${tile.walkable}; gameplay=${JSON.stringify(tile.gameplayIrradiance)}`);
  }

  assertSolutionActions(levelDef);
  applyExpectedSolution(level);
  solve(level, "GI");
  assert(pathExists(level), `L${level.id}: final path does not reach exit`);
  assert(allGatesOpen(level), `L${level.id}: expected solution leaves a gate locked`);
  assertContinuousPath(level);
  const exhaustive = assertExhaustiveIntendedOnly(levelDef);
  const walkable = level.grid.surfels.filter((s) => s.walkable).length;
  assert(walkable < level.grid.surfels.length, `L${level.id}: GI solution floods every floor tile (${walkable}/${level.grid.surfels.length})`);
  level.exhaustive = exhaustive;
  return level;
}

assertYawMapping();
const openProbe = assertOneBlockLocalPool();
console.log(`PASS Open Scarcity Probe: ${openProbe.walkable}/${openProbe.total} floor tiles walkable`);

for (const level of LEVELS) {
  const validated = validateLevel(level);
  assertNoCarryTraversal(level);
  const walkable = validated.grid.surfels.filter((s) => s.walkable).length;
  console.log(`PASS L${validated.id} ${validated.name}: ${walkable}/${validated.grid.surfels.length} floor tiles walkable; exhaustive wins=${validated.exhaustive.wins}, bypass=${validated.exhaustive.bypasses}, checked=${validated.exhaustive.checked}`);
}

assertCarriedCannotOpenMixedGates();
console.log("PASS carried-light cheese assertions");
