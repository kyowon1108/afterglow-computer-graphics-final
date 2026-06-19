import { TILE_SIZE, GATE_ON, HUE_DOT, MIN_CHROMA } from "./constants.js";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function cellKey(cell) {
  return `${cell.x},${cell.z}`;
}

export function sameCell(a, b) {
  return !!a && !!b && a.x === b.x && a.z === b.z;
}

export function addCell(a, b) {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function isAdjacent(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
}

export function cellToWorld(cell, level, y = 0) {
  return {
    x: (cell.x - level.width / 2) * TILE_SIZE,
    y,
    z: (cell.z - level.height / 2) * TILE_SIZE
  };
}

export function worldToGrid(worldX, worldZ, level) {
  return {
    x: worldX / TILE_SIZE + level.width / 2,
    z: worldZ / TILE_SIZE + level.height / 2
  };
}

export function worldToCell(worldX, worldZ, level) {
  return {
    x: Math.round(worldX / TILE_SIZE + level.width / 2),
    z: Math.round(worldZ / TILE_SIZE + level.height / 2)
  };
}

export function cellBounds(cell, level) {
  const center = cellToWorld(cell, level, 0);
  const half = TILE_SIZE * 0.5;
  return {
    minX: center.x - half,
    maxX: center.x + half,
    minZ: center.z - half,
    maxZ: center.z + half
  };
}

export function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function sub3(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add3(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale3(a, s) {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot3(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function lengthSq3(a) {
  return dot3(a, a);
}

export function distanceSq3(a, b) {
  return lengthSq3(sub3(a, b));
}

export function normalize3(a) {
  const len = Math.sqrt(lengthSq3(a));
  if (len < 1e-8) return { x: 0, y: 0, z: 0 };
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

export function color(r = 0, g = 0, b = 0) {
  return { r, g, b };
}

export function colorFromHex(hex) {
  return {
    r: ((hex >> 16) & 255) / 255,
    g: ((hex >> 8) & 255) / 255,
    b: (hex & 255) / 255
  };
}

export function cloneColor(c) {
  return { r: c.r, g: c.g, b: c.b };
}

export function addColor(a, b) {
  a.r += b.r;
  a.g += b.g;
  a.b += b.b;
  return a;
}

export function scaledColor(c, s) {
  return { r: c.r * s, g: c.g * s, b: c.b * s };
}

export function multiplyColor(a, b) {
  return { r: a.r * b.r, g: a.g * b.g, b: a.b * b.b };
}

export function resetColor(c) {
  c.r = 0;
  c.g = 0;
  c.b = 0;
  return c;
}

export function luminance(c) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function chroma(c) {
  const max = Math.max(c.r, c.g, c.b);
  const min = Math.min(c.r, c.g, c.b);
  return (max - min) / Math.max(max, 1e-4);
}

export function hueDot(a, b) {
  const al = Math.hypot(a.r, a.g, a.b);
  const bl = Math.hypot(b.r, b.g, b.b);
  if (al < 1e-6 || bl < 1e-6) return 0;
  return (a.r * b.r + a.g * b.g + a.b * b.b) / (al * bl);
}

export function hueMatchesGate(energy, target) {
  return luminance(energy) >= GATE_ON && chroma(energy) >= MIN_CHROMA && hueDot(energy, target) >= HUE_DOT;
}

function orient(a, b, c) {
  return (b.z - a.z) * (c.x - b.x) - (b.x - a.x) * (c.z - b.z);
}

function onSegment(a, b, c) {
  return (
    Math.min(a.x, c.x) - 1e-6 <= b.x &&
    b.x <= Math.max(a.x, c.x) + 1e-6 &&
    Math.min(a.z, c.z) - 1e-6 <= b.z &&
    b.z <= Math.max(a.z, c.z) + 1e-6
  );
}

export function segmentIntersect(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (Math.abs(o1) < 1e-8 && onSegment(a, c, b)) return true;
  if (Math.abs(o2) < 1e-8 && onSegment(a, d, b)) return true;
  if (Math.abs(o3) < 1e-8 && onSegment(c, a, d)) return true;
  if (Math.abs(o4) < 1e-8 && onSegment(c, b, d)) return true;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
