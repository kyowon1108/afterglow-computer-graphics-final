import * as THREE from "three";
import { BLOCK_LIGHT_HEIGHT, PALETTE } from "../core/constants.js";
import { cellToWorld, sameCell } from "../core/math.js";
import { makeBlockMaterial } from "../world/materials.js";

export class EmissiveBlockView {
  constructor(block) {
    this.block = block;
    this.colorKey = block.colorKey;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), makeBlockMaterial(block.colorKey));
    this.mesh.userData.blockId = block.id;
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
    this.mesh.visible = this.block.on !== false;
  }
}

export function cycleColor(block) {
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
