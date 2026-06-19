import * as THREE from "three";
import { TILE_SIZE, WALL_HEIGHT } from "../core/constants.js";
import { addUv2 } from "./geometry.js";
import { cloneMaterialWithRepeat } from "./materials.js";

export function buildRoom(level, materials) {
  const group = new THREE.Group();
  const width = level.width * TILE_SIZE;
  const depth = level.height * TILE_SIZE;
  const wallGeomH = addUv2(new THREE.BoxGeometry(width, WALL_HEIGHT, 0.16));
  const wallGeomV = addUv2(new THREE.BoxGeometry(0.16, WALL_HEIGHT, depth));
  const wallMatH = cloneMaterialWithRepeat(materials.wall, width / TILE_SIZE, WALL_HEIGHT / TILE_SIZE);
  const wallMatV = cloneMaterialWithRepeat(materials.wall, depth / TILE_SIZE, WALL_HEIGHT / TILE_SIZE);
  const zTop = -depth / 2 - TILE_SIZE * 0.5;
  const zBottom = depth / 2 - TILE_SIZE * 0.5;
  const xLeft = -width / 2 - TILE_SIZE * 0.5;
  const xRight = width / 2 - TILE_SIZE * 0.5;
  const north = new THREE.Mesh(wallGeomH, wallMatH);
  const south = new THREE.Mesh(wallGeomH, wallMatH.clone());
  const west = new THREE.Mesh(wallGeomV, wallMatV);
  const east = new THREE.Mesh(wallGeomV, wallMatV.clone());
  north.position.set(-TILE_SIZE * 0.5, WALL_HEIGHT / 2, zTop);
  south.position.set(-TILE_SIZE * 0.5, WALL_HEIGHT / 2, zBottom);
  west.position.set(xLeft, WALL_HEIGHT / 2, -TILE_SIZE * 0.5);
  east.position.set(xRight, WALL_HEIGHT / 2, -TILE_SIZE * 0.5);
  group.add(north, south, west, east);
  return group;
}
