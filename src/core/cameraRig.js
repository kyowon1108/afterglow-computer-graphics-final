import * as THREE from "three";
import { TILE_SIZE } from "./constants.js";
import { cellToWorld, clamp } from "./math.js";

const MODES = ["fp", "peek", "third"];
const EYE_HEIGHT = 1.6;
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = 1.55;
const POINTER_LOCK_RETRY_MS = 4000;
const THIRD_WALL_PADDING = 0.12;

function firstWallHitT(from, to, walls) {
  const ray = { x: to.x - from.x, z: to.z - from.z };
  let best = 1;
  for (const wall of walls ?? []) {
    if (!wall.blocksVisibility) continue;
    const seg = { x: wall.b.x - wall.a.x, z: wall.b.z - wall.a.z };
    const denom = ray.x * seg.z - ray.z * seg.x;
    if (Math.abs(denom) < 1e-6) continue;
    const rel = { x: wall.a.x - from.x, z: wall.a.z - from.z };
    const t = (rel.x * seg.z - rel.z * seg.x) / denom;
    const u = (rel.x * ray.z - rel.z * ray.x) / denom;
    if (t > 0 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

function cellSegments(cell, level) {
  const center = cellToWorld(cell, level, 0);
  const half = TILE_SIZE * 0.5;
  const left = center.x - half;
  const right = center.x + half;
  const top = center.z - half;
  const bottom = center.z + half;
  return [
    { a: { x: left, z: top }, b: { x: right, z: top }, blocksVisibility: true },
    { a: { x: left, z: bottom }, b: { x: right, z: bottom }, blocksVisibility: true },
    { a: { x: left, z: top }, b: { x: left, z: bottom }, blocksVisibility: true },
    { a: { x: right, z: top }, b: { x: right, z: bottom }, blocksVisibility: true }
  ];
}

function cameraCollisionSegments(level) {
  const segments = [...(level.walls ?? [])];
  for (const key of level.blockedPanelCells ?? []) {
    const [x, z] = key.split(",").map(Number);
    segments.push(...cellSegments({ x, z }, level));
  }
  const left = (0 - level.width / 2) * TILE_SIZE;
  const right = (level.width - 1 - level.width / 2) * TILE_SIZE;
  const top = (0 - level.height / 2) * TILE_SIZE;
  const bottom = (level.height - 1 - level.height / 2) * TILE_SIZE;
  segments.push(
    { a: { x: left, z: top }, b: { x: right, z: top }, blocksVisibility: true },
    { a: { x: left, z: bottom }, b: { x: right, z: bottom }, blocksVisibility: true },
    { a: { x: left, z: top }, b: { x: left, z: bottom }, blocksVisibility: true },
    { a: { x: right, z: top }, b: { x: right, z: bottom }, blocksVisibility: true }
  );
  return segments;
}

export class CameraRig {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.mode = "fp";
    this.yaw = -Math.PI / 2;
    this.pitch = -0.1;
    this.position = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.matrix = new THREE.Matrix4();
    this.forward = new THREE.Vector3(1, 0, 0);
    this.right = new THREE.Vector3(0, 0, 1);
    this.lockPending = false;
    this.dragLookActive = false;
    this.qaForceLocked = false;
    this.lastDrag = { x: 0, y: 0 };
    this.lastPointerLockFailureMs = -Infinity;
    this.peekTarget = new THREE.Vector3();
    this.peekDesired = new THREE.Vector3();
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    window.addEventListener("mouseup", () => this.endDragLook());
    this.canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    document.addEventListener("pointerlockchange", () => this.onPointerLockChange());
    document.addEventListener("pointerlockerror", () => this.notePointerLockFailure());
  }

  get isLocked() {
    return this.qaForceLocked || document.pointerLockElement === this.canvas;
  }

  get pointerLockUnavailable() {
    return performance.now() - this.lastPointerLockFailureMs < POINTER_LOCK_RETRY_MS;
  }

  shouldRequestLock() {
    return !this.isLocked && !this.lockPending && typeof this.canvas.requestPointerLock === "function";
  }

  notePointerLockFailure() {
    this.lastPointerLockFailureMs = performance.now();
    this.lockPending = false;
  }

  onPointerLockChange() {
    if (!this.isLocked) return;
    this.lastPointerLockFailureMs = -Infinity;
    this.lockPending = false;
  }

  lock() {
    if (this.isLocked || this.lockPending) return false;
    if (typeof this.canvas.requestPointerLock !== "function") {
      this.notePointerLockFailure();
      return false;
    }
    let request = null;
    this.lockPending = true;
    try {
      request = this.canvas.requestPointerLock();
    } catch {
      this.notePointerLockFailure();
      return false;
    }
    if (!request?.then) {
      this.lockPending = false;
      return true;
    }
    request
      .then(() => this.onPointerLockChange())
      .catch(() => this.notePointerLockFailure())
      .finally(() => {
        if (!this.isLocked) this.lockPending = false;
      });
    return true;
  }

  unlock() {
    this.qaForceLocked = false;
    this.lockPending = false;
    this.endDragLook();
    if (this.isLocked) document.exitPointerLock?.();
  }

  rotateBy(deltaX, deltaY) {
    this.yaw -= deltaX * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - deltaY * MOUSE_SENSITIVITY));
  }

  onPointerDown(event) {
    if (event.button !== 0 || this.isLocked || this.mode !== "fp") return;
    if (!this.pointerLockUnavailable && typeof this.canvas.requestPointerLock === "function") return;
    this.dragLookActive = true;
    this.lastDrag = { x: event.clientX, y: event.clientY };
  }

  endDragLook() {
    this.dragLookActive = false;
  }

  onMouseMove(event) {
    if (this.mode !== "fp") return;
    if (this.isLocked) {
      this.rotateBy(event.movementX, event.movementY);
      return;
    }
    if (!this.dragLookActive) return;
    const dx = event.movementX || event.clientX - this.lastDrag.x;
    const dy = event.movementY || event.clientY - this.lastDrag.y;
    this.lastDrag = { x: event.clientX, y: event.clientY };
    this.rotateBy(dx, dy);
  }

  setMode(mode) {
    if (mode === "top" || mode === "chase" || mode === "close") this.mode = "fp";
    else if (MODES.includes(mode)) this.mode = mode;
  }

  setYawPitch(yaw, pitch = this.pitch) {
    this.yaw = yaw;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
  }

  toggleThird() {
    this.mode = this.mode === "third" ? "fp" : "third";
  }

  togglePeek() {
    this.mode = this.mode === "peek" ? "fp" : "peek";
  }

  getForwardXZ() {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  getRightXZ() {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  applyFp(player) {
    this.camera.up.set(0, 1, 0);
    this.camera.position.set(player.position.x, player.position.y + EYE_HEIGHT, player.position.z);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }

  applyPeek(level) {
    const focus = cellToWorld({ x: (level.width - 1) / 2, z: (level.height - 1) / 2 }, level, 0.35);
    const span = Math.max(level.width, level.height) * TILE_SIZE;
    const target = this.peekDesired.set(focus.x, Math.max(9, span * 1.05), focus.z + 0.01);
    this.peekTarget.set(focus.x, 0.35, focus.z);
    this.camera.up.set(0, 0, -1);
    this.camera.position.lerp(target, 0.2);
    if (this.camera.position.distanceTo(target) < 0.04) this.camera.position.copy(target);
    this.matrix.lookAt(this.camera.position, this.peekTarget, this.camera.up);
    this.camera.quaternion.setFromRotationMatrix(this.matrix);
  }

  applyThird(level, player) {
    const forward = this.getForwardXZ();
    const right = this.getRightXZ();
    const target = new THREE.Vector3(player.position.x, player.position.y + 0.72, player.position.z);
    const cameraPos = new THREE.Vector3(
      player.position.x - forward.x * 2.2 + right.x * 2.7,
      player.position.y + 1.55,
      player.position.z - forward.z * 2.2 + right.z * 2.7
    );
    const minX = (1 - level.width / 2) * TILE_SIZE + 0.35;
    const maxX = (level.width - 2 - level.width / 2) * TILE_SIZE - 0.35;
    const minZ = (1 - level.height / 2) * TILE_SIZE + 0.35;
    const maxZ = (level.height - 2 - level.height / 2) * TILE_SIZE - 0.35;
    cameraPos.x = clamp(cameraPos.x, minX, maxX);
    cameraPos.z = clamp(cameraPos.z, minZ, maxZ);
    if (cameraPos.distanceTo(target) < 1.9) cameraPos.y += 0.75;
    const hitT = firstWallHitT(target, cameraPos, cameraCollisionSegments(level));
    if (hitT < 1) cameraPos.lerpVectors(target, cameraPos, Math.max(0.18, hitT - THIRD_WALL_PADDING));
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(cameraPos);
    this.matrix.lookAt(cameraPos, target, this.camera.up);
    this.camera.quaternion.setFromRotationMatrix(this.matrix);
  }

  snapTo(level, player) {
    this.update(level, player);
  }

  update(level, player) {
    if (this.mode === "peek") this.applyPeek(level);
    else if (this.mode === "third") this.applyThird(level, player);
    else this.applyFp(player);
  }
}
