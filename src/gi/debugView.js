import * as THREE from "three";
import { luminance } from "../core/math.js";

export class DebugView {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.showSurfels = false;
    this.showNormals = false;
    scene.add(this.group);
  }

  toggle() {
    this.group.visible = !this.group.visible;
  }

  setSurfels(on) {
    this.showSurfels = on;
    this.group.visible = on || this.showNormals;
  }

  setNormals(on) {
    this.showNormals = on;
    this.group.visible = on || this.showSurfels;
  }

  draw(level) {
    this.group.clear();
    if (!this.group.visible) return;
    const geom = new THREE.SphereGeometry(0.055, 8, 6);
    for (const surfel of level.surfels) {
      if (!this.showSurfels && surfel.type !== "wall") continue;
      const mat = new THREE.MeshBasicMaterial({ color: surfel.type === "wall" ? 0xf2f0e6 : 0x66ddff });
      mat.color.offsetHSL(0, 0, Math.min(luminance(surfel.irradiance) * 0.05, 0.25));
      const point = new THREE.Mesh(geom, mat);
      point.position.set(surfel.pos.x, surfel.pos.y + 0.04, surfel.pos.z);
      this.group.add(point);
      if (this.showNormals) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints([
          point.position,
          new THREE.Vector3(surfel.pos.x + surfel.normal.x * 0.35, surfel.pos.y + 0.04 + surfel.normal.y * 0.35, surfel.pos.z + surfel.normal.z * 0.35)
        ]);
        this.group.add(new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0xffe6a3 })));
      }
    }
  }
}

