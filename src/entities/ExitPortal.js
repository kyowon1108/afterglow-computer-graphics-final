import * as THREE from "three";
import { TILE_SIZE } from "../core/constants.js";
import { cellToWorld } from "../core/math.js";

export class ExitPortal {
  constructor(level, material) {
    this.mesh = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 36), material);
    ring.rotation.x = Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 32), material);
    glow.position.y = 0.04;
    this.mesh.add(ring, glow);
    const pos = cellToWorld(level.exit, level, 0.08);
    this.mesh.position.set(pos.x, pos.y, pos.z);
    this.mesh.scale.setScalar(TILE_SIZE * 0.8);
  }

  reached(playerCell, level) {
    return Math.max(Math.abs(playerCell.x - level.exit.x), Math.abs(playerCell.z - level.exit.z)) <= 1;
  }
}

