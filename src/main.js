import "./style.css";
import * as THREE from "three";
import { AppState, getState, setState } from "./core/appState.js";
import { loadRobot, loadTexSet } from "./core/assets.js";
import { initRenderer } from "./core/renderer.js";
import { CameraRig } from "./core/cameraRig.js";
import { Input } from "./core/input.js";
import { BOUNCE_VIEWS, RESPAWN_FADE_MS, SOLVE_MODES, TILE_SIZE, WALK_ON } from "./core/constants.js";
import { cellToWorld, sameCell } from "./core/math.js";
import { LEVELS } from "./game/levels.js";
import { checkPlayer, placeBlockOnSocket, resetBlocksToPickup } from "./game/rules.js";
import { sampleIrradianceAt } from "./gi/sampleField.js";
import { visible } from "./gi/visibility.js";
import { solve } from "./gi/SurfelSolver.js";
import { applyGI } from "./gi/applyGI.js";
import { DebugView } from "./gi/debugView.js";
import { Player } from "./entities/Player.js";
import { cycleColor } from "./entities/EmissiveBlock.js";
import { CommandStack } from "./game/commandStack.js";
import { initHud, updateHud } from "./game/hud.js";
import { hideModal, initOverlays, showGameComplete, showLevelComplete, showTitle, syncOverlays } from "./game/overlays.js";
import { printShotName } from "./report/capture.js";
import { makeMaterials } from "./world/materials.js";
import { buildLevel } from "./world/levelBuilder.js";

const canvas = document.getElementById("gameCanvas");
const { renderer, scene, resize, render, setOutlineObjects } = initRenderer(canvas);
const cameraRig = new CameraRig(canvas);
let levelIndex = 0;
let current = null;
const input = new Input(canvas, {
  onPointerDown(event) {
    if (getState() !== AppState.GAME || !current || cameraRig.isLocked) return false;
    if (pointerActionAvailable()) return false;
    if (!cameraRig.shouldRequestLock()) return false;
    event.preventDefault();
    return cameraRig.lock();
  }
});
const hud = initHud();
const crosshair = document.getElementById("crosshair");
const respawnFade = document.getElementById("respawnFade");
const textureOptions = { anisotropy: renderer.capabilities.getMaxAnisotropy() };
const [floorTex, wallTex, bounceTex, robotAsset] = await Promise.all([
  loadTexSet("floor_tile", textureOptions),
  loadTexSet("wall_rock", textureOptions),
  loadTexSet("bounce_panel", textureOptions),
  loadRobot()
]);
const textureSets = { floor: floorTex, wall: wallTex, bounce: bounceTex };
const materials = makeMaterials(textureSets);
const player = new Player(materials.player, robotAsset);
const debugView = new DebugView(scene);
scene.add(player.mesh);
scene.add(player.shadow);

const raycaster = new THREE.Raycaster();
const rayCenter = new THREE.Vector2(0, 0);
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const floorHit = new THREE.Vector3();
const projectedTarget = new THREE.Vector3();
const MAX_INTERACT_DISTANCE = 3.5;
const PICK_ASSIST_RADIUS = TILE_SIZE * 1.35;
const PICK_TOUCH_RADIUS = TILE_SIZE * 0.75;
const SOCKET_ASSIST_RADIUS = TILE_SIZE * 1.7;
const SOCKET_AIM_RADIUS = MAX_INTERACT_DISTANCE;
const ASSIST_SCREEN_RADIUS = 0.62;
const targetHighlight = new THREE.Mesh(
  new THREE.TorusGeometry(0.48, 0.025, 8, 48),
  new THREE.MeshBasicMaterial({ color: 0x6cffc3, transparent: true, opacity: 0.9, depthTest: false })
);
targetHighlight.visible = false;
targetHighlight.rotation.x = -Math.PI / 2;
scene.add(targetHighlight);

const ghostPreview = new THREE.Mesh(
  new THREE.BoxGeometry(0.56, 0.56, 0.56),
  new THREE.MeshBasicMaterial({ color: 0x6cffc3, transparent: true, opacity: 0.48, depthWrite: false })
);
ghostPreview.visible = false;
scene.add(ghostPreview);

let solveModeIndex = SOLVE_MODES.indexOf("GI");
let bounceViewIndex = 0;
let debugVisible = false;
let solverDirty = false;
let lastFrameMs = performance.now();
let targetInfo = null;
const qaMode = new URLSearchParams(window.location.search).has("qa");

const commandStack = new CommandStack(() => markDirty());
const RESPAWN_FLASH_HOLD_MS = Math.min(120, Math.max(60, RESPAWN_FADE_MS * 0.25));
const overlays = initOverlays({
  onStart() {
    startGame();
  },
  onContinue() {
    if (getState() === AppState.GAME_COMPLETE) {
      levelIndex = 0;
      startGame();
    } else {
      hideModal(overlays);
      levelIndex += 1;
      if (levelIndex >= LEVELS.length) completeGame();
      else loadLevel(levelIndex);
    }
  }
});

function markDirty() {
  solverDirty = true;
}

function triggerRespawnFade() {
  if (!respawnFade) return;
  respawnFade.classList.add("respawnFade--active");
  window.setTimeout(() => respawnFade.classList.remove("respawnFade--active"), RESPAWN_FLASH_HOLD_MS);
}

function activeSolveMode() {
  const view = BOUNCE_VIEWS[bounceViewIndex];
  if (view === "DIRECT") return "DIRECT_ONLY";
  if (view === "BOUNCE1") return "BOUNCE1";
  if (view === "BOUNCE2") return "BOUNCE2";
  return SOLVE_MODES[solveModeIndex];
}

function disposeCurrent() {
  if (!current) return;
  setOutlineObjects([]);
  scene.remove(current.visuals.group);
  for (const light of current.visuals.lights) scene.remove(light);
  current = null;
}

function loadLevel(index) {
  disposeCurrent();
  levelIndex = index;
  const built = buildLevel(LEVELS[index], scene, materials);
  current = built;
  player.reset(current.level);
  commandStack.clear();
  solveModeIndex = SOLVE_MODES.indexOf("GI");
  bounceViewIndex = 0;
  current.level.playerCell = { ...player.cell };
  current.level.mode = activeSolveMode();
  cameraRig.setMode("fp");
  cameraRig.setYawPitch(-Math.PI / 2, -0.78);
  solve(current.level, current.level.mode);
  applyGI(current.level, current.visuals, 16);
  setState(AppState.GAME);
  cameraRig.snapTo(current.level, player);
  showTitle(overlays, false);
  hideModal(overlays);
}

function startGame() {
  loadLevel(0);
}

function completeLevel() {
  cameraRig.unlock();
  setState(AppState.LEVEL_COMPLETE);
  showLevelComplete(overlays, current.level);
}

function completeGame() {
  cameraRig.unlock();
  setState(AppState.GAME_COMPLETE);
  showGameComplete(overlays);
}

function blockSnapshot(block) {
  return commandStack.snapshot(block);
}

function refreshBlockViews() {
  for (const view of current.visuals.blockViews) {
    view.update(current.level, player);
    if (view.block.state === "carried" && cameraRig.mode === "fp") view.mesh.visible = false;
  }
}

function occupiedSocket(level, socket) {
  return level.blocks.some((block) => block.state === "placed" && sameCell(block.cell, socket.cell));
}

function socketAssistInfo(socket, maxDistance) {
  const pos = cellToWorld(socket.cell, current.level, 0);
  const dist = Math.hypot(pos.x - player.position.x, pos.z - player.position.z);
  if (dist > maxDistance) return null;
  if (!visible({ x: player.position.x, z: player.position.z }, pos, current.level.walls)) return null;
  return { pos, dist };
}

function targetNearCrosshair(point, maxDistance = MAX_INTERACT_DISTANCE, maxRadius = ASSIST_SCREEN_RADIUS) {
  projectedTarget.set(point.x, point.y ?? 0, point.z);
  if (projectedTarget.distanceTo(cameraRig.camera.position) > maxDistance) return false;
  projectedTarget.project(cameraRig.camera);
  if (projectedTarget.z < -1 || projectedTarget.z > 1) return false;
  return Math.hypot(projectedTarget.x, projectedTarget.y * 0.75) <= maxRadius;
}

function socketVisual(socket) {
  return current.visuals.socketMeshes.find((mesh) => mesh.userData.socketId === socket.id && !mesh.userData.hitOnly) ?? current.visuals.socketMeshes.find((mesh) => mesh.userData.socketId === socket.id);
}

function blockVisual(block) {
  return current.visuals.blockViews.find((view) => view.block.id === block.id)?.mesh ?? null;
}

function cellTargetPoint(cell, y = 0.2) {
  const pos = cellToWorld(cell, current.level, y);
  return new THREE.Vector3(pos.x, pos.y, pos.z);
}

function nearestBlockTarget() {
  let best = null;
  let bestDist = Infinity;
  for (const block of current.level.blocks) {
    const cell = block.state === "pickup" ? block.spawnCell : block.cell;
    if (block.state === "carried" || !cell) continue;
    const pos = cellToWorld(cell, current.level, 0.36);
    const dist = Math.hypot(pos.x - player.position.x, pos.z - player.position.z);
    if (dist > PICK_ASSIST_RADIUS || dist >= bestDist) continue;
    if (dist > PICK_TOUCH_RADIUS && !targetNearCrosshair(pos, MAX_INTERACT_DISTANCE, 0.72)) continue;
    bestDist = dist;
    best = block;
  }
  if (!best) return null;
  const object = blockVisual(best);
  const cell = best.state === "pickup" ? best.spawnCell : best.cell;
  return { type: "block", block: best, object, point: object?.position?.clone() ?? cellTargetPoint(cell, 0.45) };
}

function nearestSocketTarget(maxDistance = SOCKET_ASSIST_RADIUS) {
  let best = null;
  let bestDist = Infinity;
  for (const socket of current.level.sockets) {
    if (occupiedSocket(current.level, socket)) continue;
    const assist = socketAssistInfo(socket, maxDistance);
    if (!assist || assist.dist >= bestDist) continue;
    bestDist = assist.dist;
    best = socket;
  }
  if (!best) return null;
  const object = socketVisual(best);
  return { type: "socket", socket: best, object, point: object?.position?.clone() ?? cellTargetPoint(best.cell, 0.08) };
}

function raycastTarget() {
  if (!current) return null;
  if (player.heldBlockId) {
    const nearbySocket = nearestSocketTarget();
    if (nearbySocket) return nearbySocket;
  }
  if (!player.heldBlockId) {
    const nearbyBlock = nearestBlockTarget();
    if (nearbyBlock) return nearbyBlock;
  }
  const blockTargets = current.visuals.blockViews.filter((view) => view.block.state !== "carried").map((view) => view.mesh);
  const objects = [...blockTargets, ...current.visuals.socketMeshes];
  raycaster.setFromCamera(rayCenter, cameraRig.camera);
  raycaster.far = MAX_INTERACT_DISTANCE;
  const hits = raycaster.intersectObjects(objects, false);
  let socketHit = null;
  for (const hit of hits) {
    const blockId = hit.object.userData.blockId;
    if (blockId) {
      if (player.heldBlockId) continue;
      const block = current.level.blocks.find((item) => item.id === blockId);
      if (block && block.state !== "carried") return { type: "block", block, object: hit.object, point: hit.point };
    }
    const socketId = hit.object.userData.socketId;
    if (socketId) {
      const socket = current.level.sockets.find((item) => item.id === socketId);
      if (socket && player.heldBlockId && !occupiedSocket(current.level, socket) && socketAssistInfo(socket, MAX_INTERACT_DISTANCE)) return { type: "socket", socket, object: socketVisual(socket), point: hit.point };
      if (socket && !socketHit) socketHit = { type: "socket", socket, object: socketVisual(socket), point: hit.point };
    }
  }

  if (player.heldBlockId && raycaster.ray.intersectPlane(floorPlane, floorHit)) {
    const distance = floorHit.distanceTo(cameraRig.camera.position);
    if (distance <= MAX_INTERACT_DISTANCE) {
      let best = null;
      let bestDist = Infinity;
      for (const socket of current.level.sockets) {
        if (occupiedSocket(current.level, socket)) continue;
        const pos = cellToWorld(socket.cell, current.level, 0);
        const d = Math.hypot(floorHit.x - pos.x, floorHit.z - pos.z);
        if (d < bestDist && d <= TILE_SIZE * 1.1) {
          bestDist = d;
          best = socket;
        }
      }
      if (best && socketAssistInfo(best, MAX_INTERACT_DISTANCE)) {
        const object = socketVisual(best);
        return { type: "socket", socket: best, object, point: floorHit.clone() };
      }
    }
  }
  if (player.heldBlockId) return nearestSocketTarget() ?? forwardSocketTarget();
  return nearestBlockTarget() ?? socketHit;
}

function forwardSocketTarget() {
  const forward = cameraRig.getForwardXZ();
  let best = null;
  let bestScore = -Infinity;
  for (const socket of current.level.sockets) {
    if (occupiedSocket(current.level, socket)) continue;
    const assist = socketAssistInfo(socket, SOCKET_AIM_RADIUS);
    if (!assist) continue;
    const pos = assist.pos;
    if (!targetNearCrosshair(pos, SOCKET_AIM_RADIUS)) continue;
    const dx = pos.x - player.position.x;
    const dz = pos.z - player.position.z;
    const dist = assist.dist;
    if (dist < 0.15) continue;
    const dot = (dx * forward.x + dz * forward.z) / Math.max(dist, 1e-5);
    if (dot < 0.18) continue;
    const score = dot - dist * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = socket;
    }
  }
  if (!best) return null;
  const object = socketVisual(best);
  return { type: "socket", socket: best, object, point: object?.position?.clone() ?? cellTargetPoint(best.cell, 0.08) };
}

function updateTargeting() {
  targetInfo = raycastTarget();
  setOutlineObjects(targetInfo?.object && !targetInfo.object.userData.hitOnly ? [targetInfo.object] : []);
  targetHighlight.visible = !!targetInfo;
  ghostPreview.visible = false;
  crosshair.classList.toggle("crosshair--target", !!targetInfo);
  if (!targetInfo) return;

  const targetPosition = targetInfo.object?.position ?? targetInfo.point;
  targetHighlight.position.copy(targetPosition);
  targetHighlight.position.y = Math.max(0.12, targetPosition.y + 0.08);
  if (targetInfo.type === "socket") {
    const held = current.level.blocks.find((block) => block.id === player.heldBlockId);
    const valid = !!held && !occupiedSocket(current.level, targetInfo.socket);
    ghostPreview.visible = true;
    ghostPreview.material.color.set(valid ? 0x6cffc3 : 0xff4c38);
    ghostPreview.position.copy(targetPosition);
    ghostPreview.position.y = 0.42;
  }
}

function updateCrosshairSafety() {
  if (!current) return;
  const forward = cameraRig.getForwardXZ();
  const sampleX = player.position.x + forward.x * TILE_SIZE * 1.2;
  const sampleZ = player.position.z + forward.z * TILE_SIZE * 1.2;
  const ahead = sampleIrradianceAt(current.level, sampleX, sampleZ);
  crosshair.classList.toggle("crosshair--solid", ahead >= WALK_ON);
  crosshair.classList.toggle("crosshair--void", ahead < WALK_ON);
}

function vectorSnapshot(vector) {
  if (!vector) return null;
  return { x: vector.x, y: vector.y, z: vector.z };
}

function targetSnapshot() {
  if (!targetInfo) return null;
  return {
    type: targetInfo.type,
    blockId: targetInfo.block?.id ?? null,
    socketId: targetInfo.socket?.id ?? null,
    point: vectorSnapshot(targetInfo.point)
  };
}

function installQaSnapshot() {
  if (!qaMode) return;
  window.__AFTERGLOW_QA__ = {
    snapshot() {
      return {
        appState: getState(),
        levelIndex,
        modalHidden: overlays.modal.classList.contains("hidden"),
        modalTitle: overlays.modalTitle.textContent,
        player: {
          cell: { ...player.cell },
          position: { x: player.position.x, y: player.position.y, z: player.position.z },
          heldBlockId: player.heldBlockId,
          ground: { ...player.ground }
        },
        camera: {
          mode: cameraRig.mode,
          yaw: cameraRig.yaw,
          pitch: cameraRig.pitch,
          isLocked: cameraRig.isLocked,
          pointerLockUnavailable: cameraRig.pointerLockUnavailable,
          lockPending: cameraRig.lockPending,
          position: vectorSnapshot(cameraRig.camera.position)
        },
        target: targetSnapshot(),
        ui: {
          crosshairClassName: crosshair.className,
          ghostVisible: ghostPreview.visible,
          targetHighlightVisible: targetHighlight.visible,
          respawnFadeActive: respawnFade?.classList.contains("respawnFade--active") ?? false
        },
        level: current
          ? {
              id: current.level.id,
              name: current.level.name,
              width: current.level.width,
              height: current.level.height,
              start: { ...current.level.start },
              exit: { ...current.level.exit },
              mode: current.level.mode,
              blocks: current.level.blocks.map((block) => ({
                id: block.id,
                state: block.state,
                colorKey: block.colorKey,
                spawnCell: { ...block.spawnCell },
                cell: block.cell ? { ...block.cell } : null
              })),
              sockets: current.level.sockets.map((socket) => ({ id: socket.id, cell: { ...socket.cell } })),
              walkableCells: current.level.grid.surfels.filter((surfel) => surfel.walkable).map((surfel) => ({ ...surfel.cell }))
            }
          : null
      };
    }
  };
}

function handlePickPlace() {
  targetInfo = raycastTarget();
  const level = current.level;
  const held = level.blocks.find((block) => block.id === player.heldBlockId);
  if (!held) {
    if (targetInfo?.type !== "block") return;
    const { block } = targetInfo;
    const before = blockSnapshot(block);
    block.state = "carried";
    block.cell = null;
    block.holder = "player";
    player.heldBlockId = block.id;
    const after = blockSnapshot(block);
    commandStack.push(block, before, after);
    markDirty();
    return;
  }

  if (targetInfo?.type !== "socket" || occupiedSocket(level, targetInfo.socket)) {
    player.mesh.scale.set(1.12, 0.88, 1.12);
    setTimeout(() => player.mesh.scale.set(1, 1, 1), 120);
    return;
  }
  const { socket } = targetInfo;
  const before = blockSnapshot(held);
  placeBlockOnSocket(level, held.id, socket.id);
  player.heldBlockId = null;
  const after = blockSnapshot(held);
  commandStack.push(held, before, after);
  markDirty();
}

function pointerActionAvailable() {
  const target = raycastTarget();
  if (target?.type === "block") return true;
  return target?.type === "socket" && !!player.heldBlockId && !occupiedSocket(current.level, target.socket);
}

function handleInput() {
  if (getState() !== AppState.GAME || !current) return;
  if (input.consumeAction("mouse0")) handlePickPlace();
  if (input.consumeAction("e")) handlePickPlace();
  if (input.consumeAction("q")) {
    const held = current.level.blocks.find((block) => block.id === player.heldBlockId);
    if (held) {
      const before = blockSnapshot(held);
      cycleColor(held);
      const after = blockSnapshot(held);
      commandStack.push(held, before, after);
      markDirty();
    }
  }
  if (input.consumeAction("z")) {
    if (commandStack.undo(current.level)) {
      const carried = current.level.blocks.find((block) => block.state === "carried");
      player.heldBlockId = carried?.id ?? null;
      markDirty();
    }
  }
  if (input.consumeAction("r")) {
    resetBlocksToPickup(current.level);
    player.reset(current.level);
    current.level.playerCell = { ...player.cell };
    solveModeIndex = SOLVE_MODES.indexOf("GI");
    bounceViewIndex = 0;
    current.level.mode = activeSolveMode();
    cameraRig.setMode("fp");
    commandStack.clear();
    markDirty();
  }
  if (input.consumeAction("g")) {
    solveModeIndex = solveModeIndex === SOLVE_MODES.indexOf("GI") ? SOLVE_MODES.indexOf("DIRECT_ONLY") : SOLVE_MODES.indexOf("GI");
    current.level.mode = activeSolveMode();
    markDirty();
  }
  if (input.consumeAction("b")) {
    bounceViewIndex = (bounceViewIndex + 1) % BOUNCE_VIEWS.length;
    current.level.mode = activeSolveMode();
    markDirty();
  }
  if (input.consumeAction("m") || input.consumeAction("p")) cameraRig.togglePeek();
  if (input.consumeAction("t") || input.consumeAction("o") || input.consumeAction("f")) cameraRig.toggleThird();
  if (input.consumeAction("f1")) debugVisible = !debugVisible;
  if (input.consumeAction("v")) debugView.setSurfels(!debugView.showSurfels);
  if (input.consumeAction("n")) debugView.setNormals(!debugView.showNormals);
  if (input.consumeAction("c")) printShotName({ appState: getState(), levelIndex, solveMode: current.level.mode, debugVisible });
  if (input.consumeAction("escape")) {
    cameraRig.unlock();
    setState(AppState.TITLE);
    showTitle(overlays, true);
  }
}

function update(dtMs) {
  if (!current) return;
  handleInput();
  const cellChanged = player.update(dtMs, current.level, input, cameraRig);
  if (player.justRespawned) triggerRespawnFade();
  current.level.playerCell = { ...player.cell };
  if (cellChanged) {
    if (player.heldBlockId) markDirty();
    player.commitSolverCell();
  }
  if (solverDirty) {
    current.level.playerCell = { ...player.cell };
    solve(current.level, current.level.mode);
    solverDirty = false;
  }
  refreshBlockViews();
  cameraRig.update(current.level, player);
  updateTargeting();
  updateCrosshairSafety();
  applyGI(current.level, current.visuals, dtMs);
  debugView.group.visible = debugVisible || debugView.showSurfels || debugView.showNormals;
  debugView.draw(current.level);
  const status = checkPlayer(current.level, player.cell);
  if (status.reachedExit && status.walkable && player.position.y >= -0.05 && !player.heldBlockId && getState() === AppState.GAME) {
    if (levelIndex === LEVELS.length - 1) completeGame();
    else completeLevel();
  }
  updateHud(hud, {
    inGame: getState() !== AppState.TITLE,
    levelIndex,
    totalLevels: LEVELS.length,
    level: current.level,
    cameraMode: cameraRig.mode,
    solveMode: current.level.mode,
    bounceViewIndex,
    player,
    debugVisible,
    debugText: current.visuals.debugText,
    appState: getState()
  });
}

function loop(nowMs = performance.now()) {
  const dtMs = Math.min(nowMs - lastFrameMs, 50);
  lastFrameMs = nowMs;
  if (getState() !== AppState.TITLE) update(dtMs);
  syncOverlays(overlays, getState());
  render(cameraRig.camera);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", () => resize(cameraRig.camera));
showTitle(overlays, true);
installQaSnapshot();
loop();
