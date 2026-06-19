import { FLOOR_SURFEL_HEIGHT, PALETTE } from "../core/constants.js";
import { cellKey, cellToWorld, color, colorFromHex, sameCell } from "../core/math.js";

function makeSurfel(id, cell, levelDef, gate) {
  const pos = cellToWorld(cell, levelDef, FLOOR_SURFEL_HEIGHT);
  const type = gate ? "gate" : "floor";
  const isSpawn = (levelDef.blocks ?? []).some((block) => sameCell(block.spawnCell, cell));
  return {
    id,
    cell: { ...cell },
    pos,
    normal: { x: 0, y: 1, z: 0 },
    type,
    albedo: color(0.54, 0.52, 0.47),
    direct: color(),
    directPlaced: color(),
    directCarried: color(),
    bounce1: color(),
    bounce2: color(),
    irradiance: color(),
    visualIrradiance: color(),
    walkable: false,
    wasWalkable: false,
    alwaysSolid: sameCell(cell, levelDef.start) || sameCell(cell, levelDef.exit) || isSpawn,
    gateColor: gate?.gateColor ?? null,
    icon: gate?.icon ?? null,
    uvRect: { u: 0, v: 0, w: 1, h: 1 }
  };
}

export function buildGrid(levelDef) {
  const blocked = new Set(levelDef.interiorWalls.map(cellKey));
  const gateByCell = new Map((levelDef.gates ?? []).map((gate) => [cellKey(gate.cell), gate]));
  const surfels = [];
  const tiles = [];
  const byKey = new Map();
  let id = 0;

  for (let z = 0; z < levelDef.height; z++) {
    for (let x = 0; x < levelDef.width; x++) {
      const cell = { x, z };
      const special = sameCell(cell, levelDef.start) || sameCell(cell, levelDef.exit) || gateByCell.has(cellKey(cell));
      const interior = x > 0 && x < levelDef.width - 1 && z > 0 && z < levelDef.height - 1;
      if (!interior && !special) continue;
      if (blocked.has(cellKey(cell))) continue;
      const surfel = makeSurfel(`f${id++}`, cell, levelDef, gateByCell.get(cellKey(cell)));
      if (surfel.gateColor && PALETTE[surfel.gateColor]) {
        surfel.albedo = colorFromHex(PALETTE[surfel.gateColor].hex);
      }
      surfels.push(surfel);
      tiles.push(surfel);
      byKey.set(cellKey(cell), surfel);
    }
  }

  return {
    width: levelDef.width,
    height: levelDef.height,
    surfels,
    floorSurfels: surfels,
    tiles,
    tileAt(cell) {
      return byKey.get(cellKey(cell)) ?? null;
    },
    byKey
  };
}
