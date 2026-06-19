import { distanceSq3, dot3, normalize3, sub3 } from "../core/math.js";

function normalCos(surface, direction) {
  const d = dot3(surface.normal, direction);
  return surface.type === "wall" ? Math.abs(d) : Math.max(0, d);
}

export function formFactor(target, source) {
  const dir = normalize3(sub3(source.pos, target.pos));
  const reverse = { x: -dir.x, y: -dir.y, z: -dir.z };
  const cosS = normalCos(target, dir);
  const cosN = normalCos(source, reverse);
  const d2 = Math.max(distanceSq3(target.pos, source.pos), 0.25);
  return (cosS * cosN) / (Math.PI * d2);
}

