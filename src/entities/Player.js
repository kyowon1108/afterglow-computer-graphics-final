import * as THREE from "three";
import { cellBounds, cellKey, cellToWorld, worldToCell } from "../core/math.js";
import { createGroundContact, GroundState, updateGroundContact } from "../gi/sampleField.js";

const PLAYER_RADIUS = 0.35;
const GROUND_ACCEL = 25;
const AIR_ACCEL = 8;
const GROUND_FRICTION = 4;
const AIR_FRICTION = 0.4;
const GRAVITY = 30;
const MAX_STEP_SECONDS = 0.05;
const SUBSTEPS = 5;
const ROBOT_SCALE = 0.25;
const RESPAWN_Y = -3;

function makeCollisionBoxes(level) {
  const boxes = [];
  const panelCells = new Set();
  for (const panel of level.bouncePanels ?? []) {
    for (const cell of panel.cells ?? []) panelCells.add(cellKey(cell));
  }
  for (let z = 0; z < level.height; z++) {
    for (let x = 0; x < level.width; x++) {
      const cell = { x, z };
      if (level.grid.tileAt(cell) && !panelCells.has(cellKey(cell))) continue;
      boxes.push(cellBounds({ x, z }, level));
    }
  }
  return boxes;
}

function normalize2(x, z) {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

export class Player {
  constructor(material, robotAsset = null) {
    this.cell = { x: 0, z: 0 };
    this.spawnCell = { x: 0, z: 0 };
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.radius = PLAYER_RADIUS;
    this.heldBlockId = null;
    this.ground = createGroundContact(GroundState.SOLID);
    this.collisionBoxes = [];
    this.lastSolverCell = null;
    this.justRespawned = false;
    this.mesh = new THREE.Group();
    this.fallback = new THREE.Group();
    this.robot = null;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.55, 4, 10), material);
    body.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), material);
    head.position.y = 1.02;
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.04), new THREE.MeshBasicMaterial({ color: 0x101417 }));
    eye.position.set(0, 1.04, -0.2);
    this.fallback.add(body, head, eye);
    this.mesh.add(this.fallback);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 28),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    if (robotAsset) this.setRobot(robotAsset);
  }

  setRobot(robotAsset) {
    if (!robotAsset?.scene) return;
    this.robot = robotAsset.scene;
    this.robot.scale.setScalar(ROBOT_SCALE);
    this.robot.position.y = 0;
    this.robot.rotation.y = Math.PI;
    this.robot.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
        if (child.material) {
          child.material = child.material.clone();
          child.material.roughness = Math.min(child.material.roughness ?? 0.7, 0.72);
          child.material.metalness = child.material.metalness ?? 0.05;
          if (child.material.color) child.material.color.lerp(new THREE.Color(0xdfe7e4), 0.12).multiplyScalar(0.72);
          if (child.material.emissive) {
            child.material.emissive.set(0x2e3836);
            child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0, 0.04);
          }
        }
      }
    });
    this.mesh.add(this.robot);
    this.fallback.visible = false;
    this.mixer = new THREE.AnimationMixer(this.robot);
    this.actions = {};
    for (const clip of robotAsset.animations ?? []) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.playAction("Idle", 0);
  }

  playAction(name, fadeSeconds = 0.18) {
    const next = this.actions[name] ?? this.actions.Idle ?? Object.values(this.actions)[0];
    if (!next || next === this.activeAction) return;
    next.enabled = true;
    next.reset().fadeIn(fadeSeconds).play();
    if (this.activeAction) this.activeAction.fadeOut(fadeSeconds);
    this.activeAction = next;
  }

  updateAnimation(dtMs) {
    if (!this.mixer) return;
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed > 3.2 && this.actions.Running) this.playAction("Running");
    else if (horizontalSpeed > 0.25 && this.actions.Walking) this.playAction("Walking");
    else this.playAction("Idle");
    if (this.activeAction) {
      const speedScale = this.activeAction.getClip().name === "Running" ? 0.9 : 1.0;
      this.activeAction.timeScale = speedScale;
    }
    this.mixer.update(dtMs / 1000);
  }

  reset(level) {
    this.cell = { ...level.start };
    this.spawnCell = { ...level.start };
    this.heldBlockId = null;
    this.velocity.set(0, 0, 0);
    const pos = cellToWorld(this.cell, level, 0);
    this.position.set(pos.x, 0, pos.z);
    this.mesh.position.copy(this.position);
    this.shadow.position.set(this.position.x, 0.012, this.position.z);
    this.ground = createGroundContact(GroundState.SOLID);
    this.collisionBoxes = makeCollisionBoxes(level);
    this.lastSolverCell = { ...this.cell };
    this.justRespawned = false;
  }

  deriveCell(level) {
    const cell = worldToCell(this.position.x, this.position.z, level);
    this.cell = {
      x: Math.max(0, Math.min(level.width - 1, cell.x)),
      z: Math.max(0, Math.min(level.height - 1, cell.z))
    };
    return this.cell;
  }

  pushOutOfWalls() {
    for (const box of this.collisionBoxes) {
      const closestX = Math.max(box.minX, Math.min(this.position.x, box.maxX));
      const closestZ = Math.max(box.minZ, Math.min(this.position.z, box.maxZ));
      let dx = this.position.x - closestX;
      let dz = this.position.z - closestZ;
      let distSq = dx * dx + dz * dz;

      if (distSq < 1e-8) {
        const left = Math.abs(this.position.x - box.minX);
        const right = Math.abs(box.maxX - this.position.x);
        const top = Math.abs(this.position.z - box.minZ);
        const bottom = Math.abs(box.maxZ - this.position.z);
        const min = Math.min(left, right, top, bottom);
        if (min === left) dx = -1;
        else if (min === right) dx = 1;
        else if (min === top) dz = -1;
        else dz = 1;
        distSq = 1;
      }

      if (distSq >= this.radius * this.radius) continue;
      const dist = Math.sqrt(distSq);
      const push = this.radius - dist;
      const nx = dx / dist;
      const nz = dz / dist;
      this.position.x += nx * push;
      this.position.z += nz * push;
      const vn = this.velocity.x * nx + this.velocity.z * nz;
      if (vn < 0) {
        this.velocity.x -= vn * nx;
        this.velocity.z -= vn * nz;
      }
    }
  }

  update(dtMs, level, input, cameraRig) {
    this.justRespawned = false;
    const axes = input.movementAxes();
    const forward = cameraRig.getForwardXZ();
    const right = cameraRig.getRightXZ();
    const desired = normalize2(
      forward.x * axes.forward + right.x * axes.right,
      forward.z * axes.forward + right.z * axes.right
    );

    const stepDt = Math.min(dtMs / 1000, MAX_STEP_SECONDS) / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      const supported = this.ground.supported !== false;
      const accel = supported ? GROUND_ACCEL : AIR_ACCEL;
      this.velocity.x += desired.x * accel * stepDt;
      this.velocity.z += desired.z * accel * stepDt;
      const friction = Math.exp(-(supported ? GROUND_FRICTION : AIR_FRICTION) * stepDt) - 1;
      this.velocity.x += this.velocity.x * friction;
      this.velocity.z += this.velocity.z * friction;

      this.ground = updateGroundContact(this.ground, level, this.position.x, this.position.z, stepDt * 1000);
      if (this.ground.supported) {
        this.position.y = 0;
        if (this.velocity.y < 0) this.velocity.y = 0;
      } else {
        this.velocity.y -= GRAVITY * stepDt;
      }

      this.position.x += this.velocity.x * stepDt;
      this.position.y += this.velocity.y * stepDt;
      this.position.z += this.velocity.z * stepDt;
      this.pushOutOfWalls();

      if (this.position.y <= RESPAWN_Y) this.respawn(level);
    }

    this.deriveCell(level);
    this.mesh.position.copy(this.position);
    this.shadow.position.set(this.position.x, 0.012, this.position.z);
    this.mesh.rotation.y = cameraRig.yaw;
    this.updateAnimation(dtMs);
    this.mesh.visible = cameraRig.mode !== "fp";
    return !this.lastSolverCell || this.cell.x !== this.lastSolverCell.x || this.cell.z !== this.lastSolverCell.z;
  }

  commitSolverCell() {
    this.lastSolverCell = { ...this.cell };
  }

  respawn(level) {
    const pos = cellToWorld(this.spawnCell, level, 0);
    this.position.set(pos.x, 0, pos.z);
    this.velocity.set(0, 0, 0);
    this.ground = createGroundContact(GroundState.SOLID);
    this.deriveCell(level);
    this.mesh.position.copy(this.position);
    this.shadow.position.set(this.position.x, 0.012, this.position.z);
    this.justRespawned = true;
  }
}
