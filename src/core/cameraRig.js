import * as THREE from "three";
import { TILE_SIZE } from "./constants.js";
import { cellToWorld, clamp } from "./math.js";

const MODES = ["fp", "peek", "third"];
const EYE_HEIGHT = 1.6;
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = 1.55;
const POINTER_LOCK_RETRY_MS = 1200;

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
    this.lastPointerLockFailureMs = -Infinity;
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    document.addEventListener("pointerlockchange", () => this.onPointerLockChange());
    document.addEventListener("pointerlockerror", () => this.notePointerLockFailure());
  }

  get isLocked() {
    return document.pointerLockElement === this.canvas;
  }

  get pointerLockUnavailable() {
    return performance.now() - this.lastPointerLockFailureMs < POINTER_LOCK_RETRY_MS;
  }

  shouldRequestLock() {
    return !this.isLocked && !this.lockPending && !this.pointerLockUnavailable && typeof this.canvas.requestPointerLock === "function";
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
    if (!this.shouldRequestLock()) return false;
    const request = this.canvas.requestPointerLock();
    this.lockPending = true;
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
    if (this.isLocked) document.exitPointerLock?.();
  }

  onMouseMove(event) {
    if (!this.isLocked || this.mode !== "fp") return;
    this.yaw -= event.movementX * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - event.movementY * MOUSE_SENSITIVITY));
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
    const target = new THREE.Vector3(focus.x, Math.max(9, span * 1.05), focus.z + 0.01);
    this.camera.up.set(0, 0, -1);
    this.camera.position.copy(target);
    this.matrix.lookAt(target, new THREE.Vector3(focus.x, 0.35, focus.z), this.camera.up);
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
