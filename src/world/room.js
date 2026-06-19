import * as THREE from "three";
import { TILE_SIZE, WALL_HEIGHT } from "../core/constants.js";

export function buildRoom(level, materials) {
  const group = new THREE.Group();
  const width = level.width * TILE_SIZE;
  const depth = level.height * TILE_SIZE;
  const wallGeomH = new THREE.BoxGeometry(width, WALL_HEIGHT, 0.16);
  const wallGeomV = new THREE.BoxGeometry(0.16, WALL_HEIGHT, depth);
  const zTop = -depth / 2 - TILE_SIZE * 0.5;
  const zBottom = depth / 2 - TILE_SIZE * 0.5;
  const xLeft = -width / 2 - TILE_SIZE * 0.5;
  const xRight = width / 2 - TILE_SIZE * 0.5;
  const north = new THREE.Mesh(wallGeomH, materials.wall);
  const south = new THREE.Mesh(wallGeomH, materials.wall);
  const west = new THREE.Mesh(wallGeomV, materials.wall);
  const east = new THREE.Mesh(wallGeomV, materials.wall);
  north.position.set(-TILE_SIZE * 0.5, WALL_HEIGHT / 2, zTop);
  south.position.set(-TILE_SIZE * 0.5, WALL_HEIGHT / 2, zBottom);
  west.position.set(xLeft, WALL_HEIGHT / 2, -TILE_SIZE * 0.5);
  east.position.set(xRight, WALL_HEIGHT / 2, -TILE_SIZE * 0.5);
  group.add(north, south, west, east);
  return group;
}

