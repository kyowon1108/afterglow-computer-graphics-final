import { segmentIntersect } from "../core/math.js";

export function visible(aPos, bPos, walls) {
  const a = { x: aPos.x, z: aPos.z };
  const b = { x: bPos.x, z: bPos.z };
  for (const wall of walls) {
    if (!wall.blocksVisibility) continue;
    if (segmentIntersect(a, b, wall.a, wall.b)) return false;
  }
  return true;
}

