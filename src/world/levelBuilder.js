import * as THREE from "three";
import { TILE_SIZE, WALL_HEIGHT, PALETTE } from "../core/constants.js";
import { cellToWorld } from "../core/math.js";
import { createLevelState } from "../game/rules.js";
import { createTileMesh } from "./tileMesh.js";
import { buildRoom } from "./room.js";
import { EmissiveBlockView } from "../entities/EmissiveBlock.js";
import { ExitPortal } from "../entities/ExitPortal.js";
import { createLightPool } from "../gi/applyGI.js";

function addInteriorWalls(group, level, materials) {
  const geom = new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE);
  for (const cell of level.interiorWalls) {
    const mesh = new THREE.Mesh(geom, materials.wall);
    const pos = cellToWorld(cell, level, WALL_HEIGHT / 2);
    mesh.position.set(pos.x, pos.y, pos.z);
    group.add(mesh);
  }
}

function addSockets(group, level, materials) {
  const geom = new THREE.CylinderGeometry(0.38, 0.38, 0.035, 32);
  const hitGeom = new THREE.BoxGeometry(TILE_SIZE * 0.82, 1.1, TILE_SIZE * 0.82);
  const hitMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0, depthWrite: false });
  const socketMeshes = [];
  for (const socket of level.sockets) {
    const mesh = new THREE.Mesh(geom, materials.socket.clone());
    const pos = cellToWorld(socket.cell, level, 0.055);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData.socketId = socket.id;
    group.add(mesh);
    const hitbox = new THREE.Mesh(hitGeom, hitMat);
    hitbox.position.set(pos.x, 0.56, pos.z);
    hitbox.userData.socketId = socket.id;
    hitbox.userData.hitOnly = true;
    group.add(hitbox);
    socketMeshes.push(mesh, hitbox);
  }
  return socketMeshes;
}

function addBouncePanels(group, level, materials) {
  const geom = new THREE.BoxGeometry(TILE_SIZE * 0.86, 1.05, 0.08);
  for (const panel of level.bouncePanels) {
    for (const cell of panel.cells) {
      const mesh = new THREE.Mesh(geom, materials.bounce.clone());
      const pos = cellToWorld(cell, level, 0.72);
      mesh.position.set(pos.x, pos.y, pos.z);
      if (panel.normal === "+x" || panel.normal === "-x") mesh.rotation.y = Math.PI / 2;
      group.add(mesh);
    }
  }
}

export function buildLevel(levelDef, scene, materials) {
  const level = createLevelState(levelDef);
  const group = new THREE.Group();
  const tileBySurfel = new Map();
  const blockMeshes = new Map();
  const paletteHex = (key) => PALETTE[key]?.hex ?? PALETTE.white.hex;

  group.add(buildRoom(level, materials));
  addInteriorWalls(group, level, materials);
  addBouncePanels(group, level, materials);

  for (const surfel of level.grid.surfels) {
    const tile = createTileMesh(surfel, materials);
    tileBySurfel.set(surfel.id, tile);
    group.add(tile.mesh, tile.edge);
  }
  const socketMeshes = addSockets(group, level, materials);

  const blockViews = [];
  for (const block of level.blocks) {
    const view = new EmissiveBlockView(block);
    view.update(level, { cell: level.start });
    blockViews.push(view);
    blockMeshes.set(block.id, view.mesh);
    group.add(view.mesh);
  }

  const exit = new ExitPortal(level, materials.exit);
  group.add(exit.mesh);
  scene.add(group);

  const visuals = {
    group,
    tileBySurfel,
    blockMeshes,
    blockViews,
    socketMeshes,
    exit,
    lights: createLightPool(scene),
    paletteHex,
    debugText: ""
  };
  return { level, visuals };
}
