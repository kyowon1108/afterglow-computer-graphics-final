import "./style.css";
import * as THREE from "three";
import { AppState, getState, setState } from "./core/appState.js";
import { loadRobot, loadTexSet } from "./core/assets.js";
import { initRenderer } from "./core/renderer.js";
import { CameraRig } from "./core/cameraRig.js";
import { Input } from "./core/input.js";
import { BOUNCE_VIEWS, RESPAWN_FADE_MS, ROTATE_STEP_DEG, SOLVE_MODES, TILE_SIZE, WALK_ON } from "./core/constants.js";
import { cellToWorld, degToRad, rotateDeg, sameCell, yawToEmitDir } from "./core/math.js";
import { LEVELS } from "./game/levels.js";
import { checkPlayer, placeBlockOnSocket, resetBlocksToPickup, socketAcceptsBlock } from "./game/rules.js";
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
    if (event.button !== 0) return false;
    if (getState() !== AppState.GAME || !current || cameraRig.mode !== "fp" || cameraRig.isLocked) return false;
    event.preventDefault();
    cameraRig.lock();
    return true;
  }
});
const hud = initHud();
const crosshair = document.getElementById("crosshair");
const lockOverlay = document.getElementById("lockOverlay");
const lockOverlayStatus = document.getElementById("lockOverlayStatus");
const objectiveBanner = document.getElementById("objectiveBanner");
const lessonHint = document.getElementById("lessonHint");
const helpCard = document.getElementById("helpCard");
const rulesToast = document.getElementById("rulesToast");
const angleIndicator = document.getElementById("angleIndicator");
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
const MAX_INTERACT_DISTANCE = 4.0;
const PICK_ASSIST_RADIUS = TILE_SIZE * 1.35;
const PICK_TOUCH_RADIUS = TILE_SIZE * 0.75;
const SOCKET_ASSIST_RADIUS = MAX_INTERACT_DISTANCE;
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
const ghostArrow = new THREE.Mesh(
  new THREE.BoxGeometry(0.12, 0.045, 0.72),
  new THREE.MeshBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 0.88, depthWrite: false })
);
ghostArrow.position.set(0, -0.32, 0.52);
ghostPreview.add(ghostArrow);
const ghostFanGeom = new THREE.BufferGeometry();
const ghostFanHalf = degToRad(24);
ghostFanGeom.setAttribute(
  "position",
  new THREE.Float32BufferAttribute([
    0, -0.34, 0,
    Math.sin(-ghostFanHalf) * 2.3, -0.34, Math.cos(-ghostFanHalf) * 2.3,
    Math.sin(ghostFanHalf) * 2.3, -0.34, Math.cos(ghostFanHalf) * 2.3
  ], 3)
);
ghostFanGeom.setIndex([0, 1, 2]);
const ghostFan = new THREE.Mesh(
  ghostFanGeom,
  new THREE.MeshBasicMaterial({ color: 0x6cffc3, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
);
ghostPreview.add(ghostFan);
ghostPreview.visible = false;
scene.add(ghostPreview);

let solveModeIndex = SOLVE_MODES.indexOf("GI");
let bounceViewIndex = 0;
let debugVisible = false;
let solverDirty = false;
let lastFrameMs = performance.now();
let targetInfo = null;
let invalidPlacementUntil = 0;
let objectiveBannerUntil = 0;
let lessonHintUntil = 0;
let helpCardUntil = 0;
let rulesToastUntil = 0;
let controlsHelpSeen = false;
let l1TutorialAnchor = null;
const urlParams = new URLSearchParams(window.location.search);
const qaMode = urlParams.has("qa");
const captureMode = urlParams.has("capture");

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

function shouldLockForFirstClick(event) {
  return event.button === 0 && getState() === AppState.GAME && !!current && cameraRig.mode === "fp" && !cameraRig.isLocked;
}

function requestPointerLockFromClick(event) {
  if (!shouldLockForFirstClick(event)) return;
  event.preventDefault();
  event.stopPropagation();
  cameraRig.lock();
}

function markDirty() {
  solverDirty = true;
}

function triggerRespawnFade() {
  if (!respawnFade) return;
  respawnFade.classList.add("respawnFade--active");
  window.setTimeout(() => respawnFade.classList.remove("respawnFade--active"), RESPAWN_FLASH_HOLD_MS);
}

function showHelpCard(durationMs = 9000) {
  helpCardUntil = performance.now() + durationMs;
}

const LESSON_HINTS = new Map([
  [2, "이번에 배우는 것: 거울을 돌려 빛을 꺾습니다."],
  [3, "이번에 배우는 것: 거울 두 개로 빛을 멀리 잇습니다."],
  [4, "이번에 배우는 것: 프리즘이 흰빛을 빨강·초록·파랑으로 나눕니다. 빨강+초록 = 노랑."],
  [5, "이번에 배우는 것: 빨강과 파랑을 겹치면 마젠타. 게이트를 여세요."]
]);

function resetL1TutorialAnchor() {
  l1TutorialAnchor = {
    x: player.position.x,
    z: player.position.z,
    yaw: cameraRig.yaw,
    pitch: cameraRig.pitch
  };
}

function showLevelGuidance(level, index) {
  if (captureMode) {
    objectiveBannerUntil = 0;
    lessonHintUntil = 0;
    helpCardUntil = 0;
    rulesToastUntil = 0;
    return;
  }
  const now = performance.now();
  objectiveBanner.textContent = level.id === 1 ? "WASD로 움직이고 마우스로 둘러보세요." : level.objective;
  objectiveBannerUntil = level.id === 1 ? Infinity : now + 4000;
  lessonHint.textContent = LESSON_HINTS.get(level.id) ?? "";
  lessonHintUntil = LESSON_HINTS.has(level.id) ? now + 5000 : 0;
  rulesToastUntil = now + 4500;
  if (level.id === 1) resetL1TutorialAnchor();
  if (index === 0 && !controlsHelpSeen) {
    controlsHelpSeen = true;
    showHelpCard(11000);
  }
}

function hasMovedOrLookedSinceL1Start() {
  if (!l1TutorialAnchor) return false;
  const moved = Math.hypot(player.position.x - l1TutorialAnchor.x, player.position.z - l1TutorialAnchor.z) > 0.12;
  const looked = Math.abs(cameraRig.yaw - l1TutorialAnchor.yaw) > 0.08 || Math.abs(cameraRig.pitch - l1TutorialAnchor.pitch) > 0.08;
  return moved || looked;
}

function l1PathAheadLit() {
  return current?.level?.grid?.tileAt({ x: 5, z: 1 })?.walkable === true;
}

function l1TutorialText() {
  if (!current || current.level.id !== 1) return "";
  if (!cameraRig.isLocked && cameraRig.mode === "fp") return "클릭하여 시작하세요.";
  const block = current.level.blocks.find((item) => item.id === "b1");
  if (block?.state === "carried" || player.heldBlockId === "b1") return "소켓을 바라보고 클릭해 블록을 놓으세요.";
  if (block?.state === "placed") {
    return l1PathAheadLit() ? "켜진 바닥을 밟아 출구로 가세요." : "마우스 휠로 빛 방향을 돌려 앞 바닥을 켜세요.";
  }
  if (cameraRig.isLocked && !hasMovedOrLookedSinceL1Start()) return "WASD로 움직이고 마우스로 둘러보세요.";
  return "빛 블록을 바라보고 클릭(또는 E)으로 집으세요.";
}

function updateGuidanceUi() {
  const now = performance.now();
  const inGame = getState() === AppState.GAME && !!current;
  if (inGame && current.level.id === 1 && !captureMode) {
    objectiveBanner.textContent = l1TutorialText();
    objectiveBanner.classList.remove("hidden");
  } else {
    objectiveBanner.classList.toggle("hidden", !inGame || now > objectiveBannerUntil);
  }
  lessonHint.classList.toggle("hidden", !inGame || now > lessonHintUntil);
  helpCard.classList.toggle("hidden", !inGame || now > helpCardUntil);
  rulesToast.classList.toggle("hidden", !inGame || now > rulesToastUntil);
}

function updatePointerLockOverlay() {
  if (captureMode) {
    lockOverlay.classList.add("hidden");
    return;
  }
  const show = getState() === AppState.GAME && !!current && cameraRig.mode === "fp" && !cameraRig.isLocked;
  lockOverlay.classList.toggle("hidden", !show);
  if (!show) return;
  if (typeof canvas.requestPointerLock !== "function") {
    lockOverlayStatus.textContent = "마우스 잠금 불가 · 드래그로 둘러보세요";
  } else if (cameraRig.pointerLockUnavailable) {
    lockOverlayStatus.textContent = "마우스 잠금이 거부됨 · 드래그로 둘러보세요";
  } else if (cameraRig.lockPending) {
    lockOverlayStatus.textContent = "마우스 연결 중…";
  } else {
    lockOverlayStatus.textContent = "클릭하면 시작합니다";
  }
}

function snappedDeg(deg) {
  return ((Math.round(deg / ROTATE_STEP_DEG) * ROTATE_STEP_DEG) % 360 + 360) % 360;
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
  showLevelGuidance(current.level, index);
}

function startGame() {
  loadLevel(0);
}

function completeLevel() {
  cameraRig.unlock();
  input.clearTransient();
  setState(AppState.LEVEL_COMPLETE);
  showLevelComplete(overlays, current.level);
}

function completeGame() {
  cameraRig.unlock();
  input.clearTransient();
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
  for (const view of current.visuals.mirrorViews ?? []) view.update(current.level);
}

function occupiedSocket(level, socket) {
  return level.blocks.some((block) => block.state === "placed" && sameCell(block.cell, socket.cell));
}

function heldBlock() {
  return current?.level.blocks.find((block) => block.id === player.heldBlockId) ?? null;
}

function canPlaceHeldOnSocket(socket) {
  const held = heldBlock();
  return !!held && !occupiedSocket(current.level, socket) && socketAcceptsBlock(socket, held);
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

function mirrorVisual(mirror) {
  return current.visuals.mirrorViews?.find((view) => view.mirror.id === mirror.id)?.base ?? null;
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

function nearestMirrorTarget() {
  let best = null;
  let bestDist = Infinity;
  for (const mirror of current.level.mirrors ?? []) {
    const pos = cellToWorld(mirror.cell, current.level, 0.42);
    const dist = Math.hypot(pos.x - player.position.x, pos.z - player.position.z);
    if (dist > MAX_INTERACT_DISTANCE || dist >= bestDist) continue;
    if (!visible({ x: player.position.x, z: player.position.z }, pos, current.level.walls)) continue;
    if (!targetNearCrosshair(pos, MAX_INTERACT_DISTANCE, 0.62)) continue;
    bestDist = dist;
    best = mirror;
  }
  if (!best) return null;
  const object = mirrorVisual(best);
  return { type: "mirror", mirror: best, object, point: object?.position?.clone() ?? cellTargetPoint(best.cell, 0.42) };
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
  const objects = [...blockTargets, ...current.visuals.socketMeshes, ...(current.visuals.mirrorMeshes ?? [])];
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
      if (socket && player.heldBlockId && canPlaceHeldOnSocket(socket) && socketAssistInfo(socket, MAX_INTERACT_DISTANCE)) return { type: "socket", socket, object: socketVisual(socket), point: hit.point };
      if (socket && !socketHit) socketHit = { type: "socket", socket, object: socketVisual(socket), point: hit.point };
    }
    const mirrorId = hit.object.userData.mirrorId;
    if (mirrorId && !player.heldBlockId) {
      const mirror = current.level.mirrors?.find((item) => item.id === mirrorId);
      const pos = mirror ? cellToWorld(mirror.cell, current.level, 0.42) : null;
      const dist = pos ? Math.hypot(pos.x - player.position.x, pos.z - player.position.z) : Infinity;
      if (mirror && dist <= MAX_INTERACT_DISTANCE) return { type: "mirror", mirror, object: mirrorVisual(mirror), point: hit.point };
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
          if (!player.heldBlockId || canPlaceHeldOnSocket(socket)) best = socket;
        }
      }
      if (best && socketAssistInfo(best, MAX_INTERACT_DISTANCE)) {
        const object = socketVisual(best);
        return { type: "socket", socket: best, object, point: floorHit.clone() };
      }
    }
  }
  if (player.heldBlockId) return nearestSocketTarget() ?? forwardSocketTarget();
  return nearestBlockTarget() ?? nearestMirrorTarget() ?? socketHit;
}

function forwardSocketTarget() {
  const forward = cameraRig.getForwardXZ();
  let best = null;
  let bestScore = -Infinity;
  for (const socket of current.level.sockets) {
    if (occupiedSocket(current.level, socket)) continue;
    if (player.heldBlockId && !canPlaceHeldOnSocket(socket)) continue;
    const assist = socketAssistInfo(socket, SOCKET_AIM_RADIUS);
    if (!assist) continue;
    const pos = assist.pos;
    if (!targetNearCrosshair(pos, SOCKET_AIM_RADIUS)) continue;
    const dx = pos.x - player.position.x;
    const dz = pos.z - player.position.z;
    const dist = assist.dist;
    if (dist < 0.15) continue;
    const dot = (dx * forward.x + dz * forward.z) / Math.max(dist, 1e-5);
    if (dot < 0.5) continue;
    const score = dot * 1.6 - dist * 0.45;
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
    const held = heldBlock();
    const valid = !!held && canPlaceHeldOnSocket(targetInfo.socket);
    ghostPreview.visible = true;
    ghostPreview.material.color.set(valid ? 0x6cffc3 : 0xff4c38);
    ghostFan.material.color.set(valid ? 0x6cffc3 : 0xff4c38);
    ghostPreview.position.copy(targetPosition);
    ghostPreview.position.y = 0.42;
    ghostPreview.rotation.y = degToRad(held?.emitDir ?? yawToEmitDir(cameraRig.yaw));
  }
}

function updateAngleIndicator() {
  let text = "";
  const held = heldBlock();
  if (held) {
    text = `조준 ${snappedDeg(held.emitDir ?? yawToEmitDir(cameraRig.yaw))}°`;
  } else if (targetInfo?.type === "block" && targetInfo.block?.state === "placed") {
    text = `조준 ${snappedDeg(targetInfo.block.emitDir ?? 0)}°`;
  } else if (targetInfo?.type === "mirror" && targetInfo.mirror?.rotatable) {
    text = `거울 ${snappedDeg(targetInfo.mirror.normalYaw ?? 0)}°`;
  }
  angleIndicator.textContent = text;
  angleIndicator.classList.toggle("hidden", !text || getState() !== AppState.GAME);
}

function updateCrosshairSafety() {
  if (!current) return;
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  let dir = speed > 0.15 ? { x: player.velocity.x / speed, z: player.velocity.z / speed } : null;
  if (!dir) {
    const axes = input.movementAxes();
    const forward = cameraRig.getForwardXZ();
    const right = cameraRig.getRightXZ();
    const desiredX = forward.x * axes.forward + right.x * axes.right;
    const desiredZ = forward.z * axes.forward + right.z * axes.right;
    const desiredLen = Math.hypot(desiredX, desiredZ);
    dir = desiredLen > 1e-5 ? { x: desiredX / desiredLen, z: desiredZ / desiredLen } : forward;
  }
  const look = Math.max(1.5, speed * 0.5);
  const fan = [0, Math.PI / 4, -Math.PI / 4];
  const safest = Math.min(
    ...fan.map((angle) => {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const x = dir.x * c - dir.z * s;
      const z = dir.x * s + dir.z * c;
      return sampleIrradianceAt(current.level, player.position.x + x * look, player.position.z + z * look);
    })
  );
  crosshair.classList.toggle("crosshair--solid", safest >= WALK_ON);
  crosshair.classList.toggle("crosshair--void", safest < WALK_ON);
  crosshair.classList.toggle("crosshair--invalid", performance.now() < invalidPlacementUntil);
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
    mirrorId: targetInfo.mirror?.id ?? null,
    point: vectorSnapshot(targetInfo.point)
  };
}

function installQaSnapshot() {
  if (!qaMode) return;
  window.__AFTERGLOW_QA__ = {
    settle() {
      if (!current) return null;
      current.level.playerCell = { ...player.cell };
      solve(current.level, current.level.mode);
      solverDirty = false;
      for (const surfel of current.level.surfels) {
        const target = surfel.gameplayIrradiance ?? surfel.irradiance;
        surfel.visualIrradiance.r = target.r;
        surfel.visualIrradiance.g = target.g;
        surfel.visualIrradiance.b = target.b;
      }
      refreshBlockViews();
      applyGI(current.level, current.visuals, 1000);
      return this.snapshot();
    },
    loadLevel(index) {
      loadLevel(index);
      return this.settle();
    },
    applyAction(action) {
      if (!current) return null;
      if (typeof action === "number") {
        const actionIndex = action;
        action = current.level.solutionActions?.[actionIndex];
        if (!action) throw new Error(`Missing solution action ${actionIndex}`);
      }
      if (action.type === "place") {
        const block = placeBlockOnSocket(current.level, action.blockId, action.socketId);
        if (typeof action.emitDir === "number") block.emitDir = action.emitDir;
      } else if (action.type === "rotateMirror") {
        const mirror = current.level.mirrors?.find((item) => item.id === action.mirrorId);
        if (mirror) mirror.normalYaw = action.normalYaw;
      } else if (action.type === "color") {
        const block = current.level.blocks.find((item) => item.id === action.blockId);
        if (block) block.colorKey = action.colorKey;
      }
      player.heldBlockId = null;
      markDirty();
      return this.settle();
    },
    applySolution(upto = Infinity) {
      if (!current) return null;
      resetBlocksToPickup(current.level);
      player.heldBlockId = null;
      commandStack.clear();
      const actions = current.level.solutionActions ?? [];
      for (let i = 0; i < Math.min(upto, actions.length); i++) this.applyAction(actions[i]);
      return this.settle();
    },
    setMode(mode) {
      if (!current) return null;
      current.level.mode = mode;
      const index = SOLVE_MODES.indexOf(mode);
      if (index >= 0) solveModeIndex = index;
      return this.settle();
    },
    setBounceView(view) {
      if (!current) return null;
      const index = BOUNCE_VIEWS.indexOf(view);
      if (index < 0) throw new Error(`Unknown bounce view ${view}`);
      bounceViewIndex = index;
      current.level.mode = activeSolveMode();
      return this.settle();
    },
    setCameraMode(mode) {
      cameraRig.setMode(mode);
      cameraRig.update(current.level, player);
      return this.snapshot();
    },
    setCameraPeek() {
      if (!current) return null;
      cameraRig.setMode("peek");
      for (let i = 0; i < 32; i++) cameraRig.update(current.level, player);
      return this.snapshot();
    },
    setYawPitch(yaw, pitch) {
      if (!current) return null;
      cameraRig.setMode("fp");
      cameraRig.setYawPitch(yaw, pitch);
      cameraRig.update(current.level, player);
      return this.snapshot();
    },
    forcePointerLock(value = true) {
      cameraRig.qaForceLocked = !!value;
      return this.snapshot();
    },
    forceLock(value = true) {
      cameraRig.qaForceLocked = !!value;
      return this.snapshot();
    },
    setDebug({ visible = debugVisible, surfels = debugView.showSurfels, normals = debugView.showNormals } = {}) {
      debugVisible = !!visible;
      debugView.setSurfels(!!surfels);
      debugView.setNormals(!!normals);
      debugView.group.visible = debugVisible || debugView.showSurfels || debugView.showNormals;
      debugView.draw(current.level);
      return this.snapshot();
    },
    setPlayerCell(cell) {
      if (!current) return null;
      const pos = cellToWorld(cell, current.level, 0);
      player.position.set(pos.x, 0, pos.z);
      player.deriveCell(current.level);
      player.mesh.position.copy(player.position);
      player.shadow.position.set(player.position.x, 0.012, player.position.z);
      current.level.playerCell = { ...player.cell };
      cameraRig.snapTo(current.level, player);
      return this.settle();
    },
    showComplete() {
      completeGame();
      return this.snapshot();
    },
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
          crosshairVisible: !hud.root.classList.contains("hidden") && getComputedStyle(crosshair).display !== "none" && getComputedStyle(crosshair).visibility !== "hidden",
          canvasCursor: getComputedStyle(canvas).cursor,
          ghostVisible: ghostPreview.visible,
          targetHighlightVisible: targetHighlight.visible,
          hintText: hud.hint?.textContent ?? "",
          lockOverlayVisible: !lockOverlay.classList.contains("hidden"),
          lockOverlayStatus: lockOverlayStatus.textContent,
          objectiveBannerVisible: !objectiveBanner.classList.contains("hidden"),
          objectiveBannerText: objectiveBanner.textContent,
          lessonHintVisible: !lessonHint.classList.contains("hidden"),
          lessonHintText: lessonHint.textContent,
          helpCardVisible: !helpCard.classList.contains("hidden"),
          rulesToastVisible: !rulesToast.classList.contains("hidden"),
          angleText: angleIndicator.textContent,
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
                kind: block.kind,
                state: block.state,
                colorKey: block.colorKey,
                emitDir: block.emitDir,
                coneDeg: block.coneDeg,
                spawnCell: { ...block.spawnCell },
                cell: block.cell ? { ...block.cell } : null
              })),
              mirrors: (current.level.mirrors ?? []).map((mirror) => ({ id: mirror.id, cell: { ...mirror.cell }, normalYaw: mirror.normalYaw })),
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
    if (block.state === "pickup") block.emitDir = yawToEmitDir(cameraRig.yaw);
    block.manualAim = false;
    block.state = "carried";
    block.cell = null;
    block.holder = "player";
    player.heldBlockId = block.id;
    const after = blockSnapshot(block);
    commandStack.push(block, before, after);
    markDirty();
    return;
  }

  if (targetInfo?.type !== "socket" || !canPlaceHeldOnSocket(targetInfo.socket)) {
    invalidPlacementUntil = performance.now() + 700;
    return;
  }
  const { socket } = targetInfo;
  const before = blockSnapshot(held);
  placeBlockOnSocket(level, held.id, socket.id);
  held.manualAim = false;
  player.heldBlockId = null;
  const after = blockSnapshot(held);
  commandStack.push(held, before, after);
  markDirty();
}

function rotateSelected(deltaDeg) {
  const held = current.level.blocks.find((block) => block.id === player.heldBlockId);
  if (held) {
    const before = blockSnapshot(held);
    held.emitDir = rotateDeg(held.emitDir ?? yawToEmitDir(cameraRig.yaw), deltaDeg);
    held.manualAim = true;
    const after = blockSnapshot(held);
    commandStack.push(held, before, after);
    markDirty();
    return true;
  }
  targetInfo = raycastTarget();
  if (targetInfo?.type === "block" && targetInfo.block?.state === "placed") {
    const block = targetInfo.block;
    const before = blockSnapshot(block);
    block.emitDir = rotateDeg(block.emitDir ?? 0, deltaDeg);
    block.manualAim = true;
    const after = blockSnapshot(block);
    commandStack.push(block, before, after);
    markDirty();
    return true;
  }
  if (targetInfo?.type !== "mirror" || !targetInfo.mirror?.rotatable) return false;
  const mirror = targetInfo.mirror;
  const before = commandStack.snapshot(mirror);
  mirror.normalYaw = rotateDeg(mirror.normalYaw ?? 0, deltaDeg);
  const after = commandStack.snapshot(mirror);
  commandStack.push(mirror, before, after);
  markDirty();
  return true;
}

function interactionHint(status) {
  if (performance.now() < invalidPlacementUntil) return "소켓에만 놓을 수 있음";
  if (status?.reachedExit && player.heldBlockId) return "블록을 소켓에 놓아야 통과할 수 있어요";
  if (getState() !== AppState.GAME) return "";
  if (targetInfo?.type === "socket" && player.heldBlockId) return "E·클릭으로 놓기 · 휠·[ ]로 회전";
  if (targetInfo?.type === "block" && targetInfo.block?.state === "placed") return "E·클릭으로 집기 · 휠·[ ]로 회전";
  if (targetInfo?.type === "block" && !player.heldBlockId) return "E·클릭으로 집기";
  if (targetInfo?.type === "mirror") return "휠·[ ]로 거울 돌리기";
  if (!cameraRig.isLocked && cameraRig.mode === "fp") {
    if (cameraRig.pointerLockUnavailable || typeof canvas.requestPointerLock !== "function") return "드래그로 둘러보기 · 클릭하면 마우스 잠금";
    return "클릭하여 시작";
  }
  return "";
}

function handleInput() {
  if (getState() !== AppState.GAME || !current) return;
  if (input.consumeAction("mouse0")) handlePickPlace();
  if (input.consumeAction("e")) handlePickPlace();
  if (input.consumeAction("[")) rotateSelected(-ROTATE_STEP_DEG);
  if (input.consumeAction("]")) rotateSelected(ROTATE_STEP_DEG);
  if (input.consumeAction("q")) {
    const held = heldBlock();
    if (held && !held.colorLocked) {
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
    showLevelGuidance(current.level, levelIndex);
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
  if (input.consumeAction("?") || input.consumeAction("/")) showHelpCard(9000);
  if (input.consumeAction("escape")) {
    cameraRig.unlock();
    input.clearTransient();
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
  updateAngleIndicator();
  updateCrosshairSafety();
  applyGI(current.level, current.visuals, dtMs);
  debugView.group.visible = debugVisible || debugView.showSurfels || debugView.showNormals;
  debugView.draw(current.level);
  const status = checkPlayer(current.level, player.cell);
  if (status.reachedExit && status.gatesOpen && status.walkable && player.position.y >= -0.05 && !player.heldBlockId && getState() === AppState.GAME) {
    if (levelIndex === LEVELS.length - 1) completeGame();
    else completeLevel();
  }
  updateHud(hud, {
    inGame: getState() === AppState.GAME,
    levelIndex,
    totalLevels: LEVELS.length,
    level: current.level,
    cameraMode: cameraRig.mode,
    solveMode: current.level.mode,
    bounceViewIndex,
    player,
    hint: interactionHint(status),
    debugVisible,
    debugText: current.visuals.debugText,
    appState: getState()
  });
  updateGuidanceUi();
  updatePointerLockOverlay();
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
document.addEventListener("pointerdown", requestPointerLockFromClick, { capture: true });
document.addEventListener("pointerlockchange", () => input.clearTransient());
showTitle(overlays, true);
installQaSnapshot();
loop();
