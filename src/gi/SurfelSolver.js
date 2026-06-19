import {
  BLOCK_LIGHT_HEIGHT,
  BOUNCE_RADIUS,
  BOUNCE_SCALE,
  CARRY_INTENSITY_SCALE,
  CARRY_RADIUS,
  DIRECT_INTENSITY_COLOR,
  DIRECT_INTENSITY_WHITE,
  INDIRECT_CLAMP,
  PALETTE,
  TILE_SIZE,
  VISUAL_LERP,
  WALK_OFF,
  WALK_ON
} from "../core/constants.js";
import {
  addColor,
  cellToWorld,
  cloneColor,
  color,
  distanceSq3,
  dot3,
  hueMatchesGate,
  luminance,
  multiplyColor,
  normalize3,
  resetColor,
  scaledColor,
  sub3
} from "../core/math.js";
import { formFactor } from "./formFactor.js";
import { visible } from "./visibility.js";

const PATCH_AREA = TILE_SIZE * TILE_SIZE;

function blockColor(block) {
  return PALETTE[block.colorKey]?.rgb ?? PALETTE.white.rgb;
}

function blockIntensity(block) {
  return block.colorKey === "white" ? DIRECT_INTENSITY_WHITE : DIRECT_INTENSITY_COLOR;
}

function blockLightPos(block, level) {
  if (block.state === "placed" && block.cell) return cellToWorld(block.cell, level, BLOCK_LIGHT_HEIGHT);
  if (block.state === "carried" && level.playerCell) return cellToWorld(level.playerCell, level, BLOCK_LIGHT_HEIGHT);
  return null;
}

function allSurfels(level) {
  return level.surfels;
}

function clearSurfel(s) {
  resetColor(s.direct);
  resetColor(s.directPlaced);
  resetColor(s.directCarried);
  resetColor(s.bounce1);
  resetColor(s.bounce2);
  resetColor(s.irradiance);
}

function addDirectContribution(surfel, block, level, bucket) {
  const lightPos = blockLightPos(block, level);
  if (!lightPos) return;
  if (block.state === "carried" && Math.sqrt(distanceSq3(lightPos, surfel.pos)) > CARRY_RADIUS) return;
  if (surfel.type !== "wall" && !visible(lightPos, surfel.pos, level.walls)) return;
  const toLight = normalize3(sub3(lightPos, surfel.pos));
  const rawCos = dot3(surfel.normal, toLight);
  const cosT = surfel.type === "wall" ? Math.max(0.08, Math.abs(rawCos)) : Math.max(0, rawCos);
  if (cosT <= 0) return;
  const d2 = Math.max(distanceSq3(lightPos, surfel.pos), 0.25);
  const intensity = blockIntensity(block) * (block.state === "carried" ? CARRY_INTENSITY_SCALE : 1);
  const contribution = scaledColor(blockColor(block), (intensity * cosT) / d2);
  addColor(bucket, contribution);
}

function computeDirect(level) {
  for (const surfel of allSurfels(level)) {
    for (const block of level.blocks) {
      if (!block.on || !["placed", "carried"].includes(block.state)) continue;
      if (block.state === "placed") addDirectContribution(surfel, block, level, surfel.directPlaced);
      if (block.state === "carried") addDirectContribution(surfel, block, level, surfel.directCarried);
    }
    surfel.direct.r = surfel.directPlaced.r + surfel.directCarried.r;
    surfel.direct.g = surfel.directPlaced.g + surfel.directCarried.g;
    surfel.direct.b = surfel.directPlaced.b + surfel.directCarried.b;
  }
}

function sourceEnergy(source, pass) {
  if (pass === 1) return source.directPlaced;
  return {
    r: source.directPlaced.r + source.bounce1.r,
    g: source.directPlaced.g + source.bounce1.g,
    b: source.directPlaced.b + source.bounce1.b
  };
}

function scaleColorInPlace(value, scale) {
  value.r *= scale;
  value.g *= scale;
  value.b *= scale;
}

function clampIndirect(target, pass) {
  if (pass === 1) {
    const lit = luminance(target.bounce1);
    if (lit > INDIRECT_CLAMP) scaleColorInPlace(target.bounce1, INDIRECT_CLAMP / lit);
    return;
  }
  const bounce1Lit = luminance(target.bounce1);
  const remaining = Math.max(0, INDIRECT_CLAMP - bounce1Lit);
  const bounce2Lit = luminance(target.bounce2);
  if (bounce2Lit > remaining) scaleColorInPlace(target.bounce2, remaining / bounce2Lit);
}

function computeBounce(level, pass) {
  const targetKey = pass === 1 ? "bounce1" : "bounce2";
  for (const target of allSurfels(level)) {
    for (const source of allSurfels(level)) {
      if (source === target) continue;
      if (distanceSq3(target.pos, source.pos) > BOUNCE_RADIUS * BOUNCE_RADIUS) continue;
      if (!visible(target.pos, source.pos, level.walls)) continue;
      const src = sourceEnergy(source, pass);
      const strength = luminance(src);
      if (strength < 0.001) continue;
      const f = formFactor(target, source);
      if (f <= 0) continue;
      addColor(target[targetKey], scaledColor(multiplyColor(source.albedo, src), f * PATCH_AREA * BOUNCE_SCALE));
    }
    clampIndirect(target, pass);
  }
}

function combinedByMode(surfel, mode) {
  if (mode === "VISUAL_OFF") return color();
  const result = cloneColor(surfel.direct);
  if (mode === "DIRECT_ONLY") return result;
  addColor(result, surfel.bounce1);
  if (mode === "BOUNCE1") return result;
  addColor(result, surfel.bounce2);
  return result;
}

function updateWalkable(surfel) {
  surfel.wasWalkable = surfel.walkable;
  if (surfel.type === "wall") {
    surfel.walkable = false;
    return;
  }

  if (surfel.alwaysSolid) {
    surfel.walkable = true;
    return;
  }

  const lit = luminance(surfel.irradiance);
  let next = surfel.walkable ? lit >= WALK_OFF : lit >= WALK_ON;
  if (surfel.gateColor) {
    next = hueMatchesGate(surfel.irradiance, PALETTE[surfel.gateColor].rgb);
  }
  surfel.walkable = next;
}

export function solve(level, mode = level.mode ?? "GI") {
  const started = performance.now?.() ?? Date.now();
  for (const surfel of allSurfels(level)) clearSurfel(surfel);
  computeDirect(level);
  computeBounce(level, 1);
  computeBounce(level, 2);
  for (const surfel of allSurfels(level)) {
    const next = combinedByMode(surfel, mode);
    surfel.irradiance = next;
    surfel.visualIrradiance.r += (next.r - surfel.visualIrradiance.r) * VISUAL_LERP;
    surfel.visualIrradiance.g += (next.g - surfel.visualIrradiance.g) * VISUAL_LERP;
    surfel.visualIrradiance.b += (next.b - surfel.visualIrradiance.b) * VISUAL_LERP;
    updateWalkable(surfel);
  }
  level.mode = mode;
  level.lastSolveMs = (performance.now?.() ?? Date.now()) - started;
  return level;
}

export function getIrradiance(level, id) {
  return level.surfels.find((s) => s.id === id)?.irradiance ?? color();
}

export function setMode(level, mode) {
  level.mode = mode;
  return solve(level, mode);
}
