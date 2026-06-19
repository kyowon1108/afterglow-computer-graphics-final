import * as THREE from "three";
import { luminance } from "../core/math.js";
import { updateTileVisual } from "../world/tileMesh.js";

export function createLightPool(scene) {
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 7);
    light.castShadow = false;
    scene.add(light);
    lights.push(light);
  }
  return lights;
}

export function applyGI(level, visuals, dtMs = 16) {
  for (const surfel of level.grid.surfels) {
    const record = visuals.tileBySurfel.get(surfel.id);
    if (record) updateTileVisual(record, surfel, dtMs);
  }
  const placed = level.blocks.filter((b) => b.state === "placed" && b.cell).slice(0, 4);
  visuals.lights.forEach((light, index) => {
    const block = placed[index];
    if (!block) {
      light.intensity = 0;
      return;
    }
    const mesh = visuals.blockMeshes.get(block.id);
    if (mesh) light.position.copy(mesh.position).add(new THREE.Vector3(0, 0.55, 0));
    light.color.setHex(visuals.paletteHex(block.colorKey));
    light.intensity = 2.2;
  });
  visuals.debugText = `surfels ${level.surfels.length}\nwalkable ${level.grid.surfels.filter((s) => s.walkable).length}\nsolve ${level.lastSolveMs.toFixed(2)}ms`;
  return level.grid.surfels.reduce((sum, s) => sum + luminance(s.irradiance), 0);
}

