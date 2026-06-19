import * as THREE from "three";
import { TILE_SIZE, TILE_TELEGRAPH_MS } from "../core/constants.js";
import { luminance } from "../core/math.js";

export function createTileMesh(surfel, materials) {
  const geom = new THREE.BoxGeometry(TILE_SIZE * 0.92, 0.08, TILE_SIZE * 0.92);
  const mesh = new THREE.Mesh(geom, materials.voidTile.clone());
  mesh.position.set(surfel.pos.x, -0.04, surfel.pos.z);
  mesh.userData.surfelId = surfel.id;
  mesh.userData.tileState = "void";
  mesh.userData.transitionTimer = 0;

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 0.35 })
  );
  edge.position.copy(mesh.position);
  edge.position.y += 0.05;
  edge.userData.edgeFor = surfel.id;
  return { mesh, edge };
}

export function updateTileVisual(tileRecord, surfel, dtMs) {
  const { mesh, edge } = tileRecord;
  const state = surfel.gateColor && !surfel.walkable ? "gateLocked" : surfel.gateColor && surfel.walkable ? "gateOpen" : surfel.walkable ? "solid" : surfel.wasWalkable ? "fading" : "void";
  if (state !== mesh.userData.tileState) {
    mesh.userData.tileState = state;
    mesh.userData.transitionTimer = TILE_TELEGRAPH_MS;
  }
  mesh.userData.transitionTimer = Math.max(0, mesh.userData.transitionTimer - dtMs);
  const lum = luminance(surfel.visualIrradiance);
  const e = surfel.visualIrradiance;
  mesh.material.color.setRGB(
    state === "void" ? 0.04 : Math.min(0.35 + e.r * 0.18, 1),
    state === "void" ? 0.055 : Math.min(0.36 + e.g * 0.18, 1),
    state === "void" ? 0.06 : Math.min(0.34 + e.b * 0.18, 1)
  );
  mesh.material.emissive.setRGB(Math.min(e.r * 0.22, 1), Math.min(e.g * 0.22, 1), Math.min(e.b * 0.22, 1));
  mesh.material.emissiveIntensity = Math.min(lum, 1.8);
  mesh.material.opacity = state === "void" ? 0.48 : 1;
  edge.visible = state !== "void";
  edge.material.opacity = state === "fading" ? 0.75 : state === "gateLocked" ? 0.25 : 0.55;
}

