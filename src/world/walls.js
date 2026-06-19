import { TILE_SIZE, WALL_SURFEL_HEIGHT } from "../core/constants.js";
import { angleToDir, cellKey, cellToWorld, color, colorFromHex } from "../core/math.js";

function normalFromKey(key) {
  if (key === "+x") return { x: 1, y: 0, z: 0 };
  if (key === "-x") return { x: -1, y: 0, z: 0 };
  if (key === "+z") return { x: 0, y: 0, z: 1 };
  return { x: 0, y: 0, z: -1 };
}

function cellBounds(cell, levelDef) {
  const center = cellToWorld(cell, levelDef, 0);
  const half = TILE_SIZE * 0.5;
  return {
    left: center.x - half,
    right: center.x + half,
    top: center.z - half,
    bottom: center.z + half
  };
}

function addCellSegments(segments, cell, levelDef, idPrefix) {
  const b = cellBounds(cell, levelDef);
  segments.push({ id: `${idPrefix}-n`, a: { x: b.left, z: b.top }, b: { x: b.right, z: b.top }, blocksVisibility: true });
  segments.push({ id: `${idPrefix}-s`, a: { x: b.left, z: b.bottom }, b: { x: b.right, z: b.bottom }, blocksVisibility: true });
  segments.push({ id: `${idPrefix}-w`, a: { x: b.left, z: b.top }, b: { x: b.left, z: b.bottom }, blocksVisibility: true });
  segments.push({ id: `${idPrefix}-e`, a: { x: b.right, z: b.top }, b: { x: b.right, z: b.bottom }, blocksVisibility: true });
}

export function buildWalls(levelDef) {
  const walls = [];
  const wallSurfels = [];
  const panelCellKeys = new Set();

  for (const cell of levelDef.interiorWalls) {
    addCellSegments(walls, cell, levelDef, `i-${cell.x}-${cell.z}`);
  }

  for (const panel of levelDef.bouncePanels ?? []) {
    const normal = normalFromKey(panel.normal);
    for (const cell of panel.cells) {
      panelCellKeys.add(cellKey(cell));
      const base = cellToWorld(cell, levelDef, WALL_SURFEL_HEIGHT);
      const offset = TILE_SIZE * 0.46;
      const pos = {
        x: base.x - normal.x * offset,
        y: base.y,
        z: base.z - normal.z * offset
      };
      wallSurfels.push({
        id: `${panel.id}-${cell.x}-${cell.z}`,
        panelId: panel.id,
        cell: { ...cell },
        pos,
        normal,
        type: "wall",
        albedo: colorFromHex(panel.albedo),
        direct: { r: 0, g: 0, b: 0 },
        directPlaced: { r: 0, g: 0, b: 0 },
        directCarried: { r: 0, g: 0, b: 0 },
        bounce1: { r: 0, g: 0, b: 0 },
        bounce2: { r: 0, g: 0, b: 0 },
        irradiance: { r: 0, g: 0, b: 0 },
        gameplayIrradiance: { r: 0, g: 0, b: 0 },
        visualIrradiance: { r: 0, g: 0, b: 0 },
        walkable: false,
        wasWalkable: false,
        blocksVisibility: false
      });
    }
  }

  for (const mirror of levelDef.mirrors ?? []) {
    const pos = cellToWorld(mirror.cell, levelDef, WALL_SURFEL_HEIGHT);
    const dir = angleToDir(mirror.normalYaw);
    wallSurfels.push({
      id: `mirror-${mirror.id}`,
      mirrorId: mirror.id,
      cell: { ...mirror.cell },
      pos,
      normal: { x: dir.x, y: 0, z: dir.z },
      type: "mirror",
      albedo: mirror.albedo ? colorFromHex(mirror.albedo) : color(1, 1, 1),
      direct: { r: 0, g: 0, b: 0 },
      directPlaced: { r: 0, g: 0, b: 0 },
      directCarried: { r: 0, g: 0, b: 0 },
      bounce1: { r: 0, g: 0, b: 0 },
      bounce2: { r: 0, g: 0, b: 0 },
      irradiance: { r: 0, g: 0, b: 0 },
      gameplayIrradiance: { r: 0, g: 0, b: 0 },
      visualIrradiance: { r: 0, g: 0, b: 0 },
      walkable: false,
      wasWalkable: false,
      blocksVisibility: false
    });
  }

  return { walls, wallSurfels, panelCellKeys };
}
