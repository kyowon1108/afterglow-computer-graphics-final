import * as THREE from "three";
import { BLOCK_LIGHT_HEIGHT, PALETTE, PRISM_SPREAD_DEG } from "../core/constants.js";
import { cellToWorld, degToRad, sameCell } from "../core/math.js";
import { makeBlockMaterial } from "../world/materials.js";

function createFan(colorHex, radius = 2.4, halfDeg = 24) {
  const half = degToRad(halfDeg);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      0, -0.36, 0,
      Math.sin(-half) * radius, -0.36, Math.cos(-half) * radius,
      Math.sin(half) * radius, -0.36, Math.cos(half) * radius
    ], 3)
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  return new THREE.Mesh(geometry, material);
}

export class EmissiveBlockView {
  constructor(block) {
    this.block = block;
    this.colorKey = block.colorKey;
    const geometry = block.kind === "prism" ? new THREE.ConeGeometry(0.42, 0.58, 3) : new THREE.BoxGeometry(0.52, 0.52, 0.52);
    this.mesh = new THREE.Mesh(geometry, makeBlockMaterial(block.colorKey));
    this.mesh.userData.blockId = block.id;
    this.dirArrow = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.045, 0.64),
      new THREE.MeshBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 0.92 })
    );
    this.dirArrow.position.set(0, -0.31, 0.46);
    this.mesh.add(this.dirArrow);
    this.fans = {
      white: createFan(0xfff788, 2.6, 26),
      red: createFan(PALETTE.red.hex, 2.45, 18),
      green: createFan(PALETTE.green.hex, 2.45, 18),
      blue: createFan(PALETTE.blue.hex, 2.45, 18)
    };
    this.fans.green.rotation.y = degToRad(PRISM_SPREAD_DEG);
    this.fans.blue.rotation.y = degToRad(-PRISM_SPREAD_DEG);
    for (const fan of Object.values(this.fans)) {
      fan.renderOrder = 2;
      this.mesh.add(fan);
    }
  }

  update(level, player) {
    if (this.block.state === "carried") {
      if (player.position) this.mesh.position.set(player.position.x, player.position.y + BLOCK_LIGHT_HEIGHT + 0.38, player.position.z);
      else {
        const pos = cellToWorld(player.cell, level, BLOCK_LIGHT_HEIGHT + 0.38);
        this.mesh.position.set(pos.x, pos.y, pos.z);
      }
    } else {
      const cell = this.block.state === "placed" ? this.block.cell : this.block.spawnCell;
      const pos = cellToWorld(cell, level, 0.36);
      this.mesh.position.set(pos.x, pos.y, pos.z);
    }
    if (this.colorKey !== this.block.colorKey) {
      this.mesh.material.dispose();
      this.mesh.material = makeBlockMaterial(this.block.colorKey);
      this.colorKey = this.block.colorKey;
    }
    this.mesh.rotation.y = degToRad(this.block.emitDir ?? 0);
    this.dirArrow.visible = this.block.state !== "pickup";
    const fanVisible = this.block.state !== "pickup";
    this.fans.white.visible = fanVisible && this.block.kind !== "prism";
    this.fans.red.visible = fanVisible && this.block.kind === "prism" && this.block.colorKey === "white";
    this.fans.green.visible = fanVisible && this.block.kind === "prism" && this.block.colorKey === "white";
    this.fans.blue.visible = fanVisible && this.block.kind === "prism" && this.block.colorKey === "white";
    if (this.block.kind === "prism" && this.block.colorKey !== "white") {
      this.fans[this.block.colorKey].visible = fanVisible;
    }
    this.mesh.visible = this.block.on !== false;
  }
}

export function cycleColor(block) {
  if (block.colorLocked) return;
  const keys = ["white", "red", "green", "blue"];
  block.colorKey = keys[(keys.indexOf(block.colorKey) + 1) % keys.length];
}

export function findBlockAt(level, cell) {
  return level.blocks.find((block) => {
    if (block.state === "pickup") return sameCell(block.spawnCell, cell);
    if (block.state === "placed") return sameCell(block.cell, cell);
    return false;
  });
}

export function socketAt(level, cell) {
  return level.sockets.find((socket) => sameCell(socket.cell, cell));
}

export function iconFor(colorKey) {
  return `${PALETTE[colorKey]?.icon ?? "◇"} ${colorKey}`;
}
