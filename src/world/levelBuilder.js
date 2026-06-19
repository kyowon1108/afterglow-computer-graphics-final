import * as THREE from "three";
import { TILE_SIZE, WALL_HEIGHT, PALETTE } from "../core/constants.js";
import { cellToWorld, degToRad } from "../core/math.js";
import { createLevelState } from "../game/rules.js";
import { createTileMesh } from "./tileMesh.js";
import { buildRoom } from "./room.js";
import { EmissiveBlockView } from "../entities/EmissiveBlock.js";
import { ExitPortal } from "../entities/ExitPortal.js";
import { createLightPool } from "../gi/applyGI.js";
import { addUv2 } from "./geometry.js";
import { cloneMaterialWithRepeat } from "./materials.js";

function addInteriorWalls(group, level, materials) {
  const geom = addUv2(new THREE.BoxGeometry(TILE_SIZE, WALL_HEIGHT, TILE_SIZE));
  const material = cloneMaterialWithRepeat(materials.wall, 1, WALL_HEIGHT / TILE_SIZE);
  for (const cell of level.interiorWalls) {
    const mesh = new THREE.Mesh(geom, material.clone());
    const pos = cellToWorld(cell, level, WALL_HEIGHT / 2);
    mesh.position.set(pos.x, pos.y, pos.z);
    group.add(mesh);
  }
}

function addSockets(group, level, materials) {
  const geom = addUv2(new THREE.CylinderGeometry(0.38, 0.38, 0.035, 32));
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
  const geom = addUv2(new THREE.BoxGeometry(TILE_SIZE * 0.86, 1.05, 0.08));
  for (const panel of level.bouncePanels) {
    for (const cell of panel.cells) {
      const mesh = new THREE.Mesh(geom, cloneMaterialWithRepeat(materials.bounce, 1, 1));
      const pos = cellToWorld(cell, level, 0.72);
      mesh.position.set(pos.x, pos.y, pos.z);
      if (panel.normal === "+x" || panel.normal === "-x") mesh.rotation.y = Math.PI / 2;
      group.add(mesh);
    }
  }
}

function createMirrorFan() {
  const radius = 2.35;
  const half = degToRad(24);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      0, 0.02, 0,
      Math.sin(-half) * radius, 0.02, Math.cos(-half) * radius,
      Math.sin(half) * radius, 0.02, Math.cos(half) * radius
    ], 3)
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x6cffc3, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide })
  );
}

function addMirrors(group, level, materials) {
  const baseGeom = addUv2(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 32));
  const arrowGeom = new THREE.BoxGeometry(0.12, 0.06, 0.62);
  const hitGeom = new THREE.BoxGeometry(TILE_SIZE * 0.86, 1.15, TILE_SIZE * 0.86);
  const hitMat = new THREE.MeshBasicMaterial({ color: 0x8fd7ff, transparent: true, opacity: 0, depthWrite: false });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xdfe7e4, roughness: 0.26, metalness: 0.55, emissive: 0x111111 });
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x6cffc3, transparent: true, opacity: 0.94 });
  const views = [];
  const meshes = [];
  for (const mirror of level.mirrors ?? []) {
    const base = new THREE.Mesh(baseGeom, mirrorMat.clone());
    const arrow = new THREE.Mesh(arrowGeom, arrowMat.clone());
    const fan = createMirrorFan();
    const hitbox = new THREE.Mesh(hitGeom, hitMat);
    base.userData.mirrorId = mirror.id;
    hitbox.userData.mirrorId = mirror.id;
    hitbox.userData.hitOnly = true;
    group.add(base, arrow, fan, hitbox);
    const view = {
      mirror,
      base,
      arrow,
      fan,
      hitbox,
      update(activeLevel) {
        const source = activeLevel.mirrors?.find((item) => item.id === mirror.id) ?? mirror;
        const pos = cellToWorld(source.cell, activeLevel, 0.12);
        base.position.set(pos.x, pos.y, pos.z);
        arrow.position.set(pos.x, 0.2, pos.z);
        hitbox.position.set(pos.x, 0.58, pos.z);
        arrow.rotation.y = degToRad(source.normalYaw ?? 0);
        fan.position.set(pos.x, 0.03, pos.z);
        fan.rotation.y = degToRad(source.normalYaw ?? 0);
        arrow.position.x += Math.sin(degToRad(source.normalYaw ?? 0)) * 0.24;
        arrow.position.z += Math.cos(degToRad(source.normalYaw ?? 0)) * 0.24;
      }
    };
    view.update(level);
    views.push(view);
    meshes.push(base, hitbox);
  }
  return { mirrorViews: views, mirrorMeshes: meshes };
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
    if (tile.icon) group.add(tile.icon);
  }
  const socketMeshes = addSockets(group, level, materials);
  const { mirrorViews, mirrorMeshes } = addMirrors(group, level, materials);

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
    mirrorViews,
    mirrorMeshes,
    socketMeshes,
    exit,
    lights: createLightPool(scene),
    paletteHex,
    debugText: ""
  };
  return { level, visuals };
}
