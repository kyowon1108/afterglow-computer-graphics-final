import {
  BLOCK_LIGHT_HEIGHT,
  BOUNCE_RADIUS,
  BOUNCE_SCALE,
  CARRY_INTENSITY_SCALE,
  CARRY_RADIUS,
  DIRECT_INTENSITY_COLOR,
  DIRECT_INTENSITY_WHITE,
  EMITTER_CONE_DEG,
  INDIRECT_CLAMP,
  MIRROR_GAIN,
  MIRROR_RECV_MIN,
  PALETTE,
  PRISM_SPREAD_DEG,
  TILE_SIZE,
  WALK_OFF,
  WALK_ON
} from "../core/constants.js";
import {
  addColor,
  angleToDir,
  cellToWorld,
  cloneColor,
  color,
  coneWeight,
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

function intensityForColor(colorKey) {
  return colorKey === "white" ? DIRECT_INTENSITY_WHITE : DIRECT_INTENSITY_COLOR;
}

function blockLightPos(block, level) {
  if (block.state === "placed" && block.cell) return cellToWorld(block.cell, level, BLOCK_LIGHT_HEIGHT);
  if (block.state === "carried" && level.playerCell) return cellToWorld(level.playerCell, level, BLOCK_LIGHT_HEIGHT);
  return null;
}

function allSurfels(level) {
  return level.surfels;
}

function mirrorSurfels(level) {
  return level.wallSurfels?.filter((surfel) => surfel.type === "mirror") ?? [];
}

function clearSurfel(s) {
  resetColor(s.direct);
  resetColor(s.directPlaced);
  resetColor(s.directCarried);
  resetColor(s.bounce1);
  resetColor(s.bounce2);
  resetColor(s.irradiance);
  if (!s.gameplayIrradiance) s.gameplayIrradiance = color();
  else resetColor(s.gameplayIrradiance);
}

function syncMirrorSurfels(level) {
  for (const surfel of mirrorSurfels(level)) {
    const mirror = level.mirrors?.find((item) => item.id === surfel.mirrorId);
    if (!mirror) continue;
    const dir = angleToDir(mirror.normalYaw);
    surfel.normal.x = dir.x;
    surfel.normal.y = 0;
    surfel.normal.z = dir.z;
  }
}

function expandEmitters(block, level) {
  const lightPos = blockLightPos(block, level);
  if (!lightPos) return;
  if (block.state === "carried" || block.kind !== "prism") {
    return [
      {
        block,
        pos: lightPos,
        state: block.state,
        colorKey: block.colorKey,
        rgb: blockColor(block),
        emitDir: block.emitDir ?? 0,
        coneDeg: block.state === "placed" ? block.coneDeg ?? EMITTER_CONE_DEG : 360,
        intensity: intensityForColor(block.colorKey)
      }
    ];
  }
  if (block.colorKey !== "white") {
    return [
      {
        block,
        pos: lightPos,
        state: block.state,
        colorKey: block.colorKey,
        rgb: blockColor(block),
        emitDir: block.emitDir ?? 0,
        coneDeg: block.coneDeg ?? EMITTER_CONE_DEG,
        intensity: intensityForColor(block.colorKey)
      }
    ];
  }
  return [
    { colorKey: "red", offset: 0 },
    { colorKey: "green", offset: PRISM_SPREAD_DEG },
    { colorKey: "blue", offset: -PRISM_SPREAD_DEG }
  ].map(({ colorKey, offset }) => ({
    block,
    pos: lightPos,
    state: block.state,
    colorKey,
    rgb: PALETTE[colorKey].rgb,
    emitDir: (block.emitDir ?? 0) + offset,
    coneDeg: block.coneDeg ?? EMITTER_CONE_DEG,
    intensity: intensityForColor(colorKey)
  }));
}

function targetCosTerm(surfel, sourcePos) {
  const toLight = normalize3(sub3(sourcePos, surfel.pos));
  const rawCos = dot3(surfel.normal, toLight);
  return surfel.type === "wall" || surfel.type === "mirror" ? Math.max(0.08, Math.abs(rawCos)) : Math.max(0, rawCos);
}

function addDirectContribution(surfel, emitter, level, bucket) {
  const lightPos = emitter.pos;
  if (emitter.state === "carried" && Math.sqrt(distanceSq3(lightPos, surfel.pos)) > CARRY_RADIUS) return;
  if (!visible(lightPos, surfel.pos, level.walls)) return;
  const cosT = targetCosTerm(surfel, lightPos);
  if (cosT <= 0) return;
  const cone = coneWeight(lightPos, surfel.pos, emitter.emitDir, emitter.coneDeg);
  if (cone <= 0) return;
  const d2 = Math.max(distanceSq3(lightPos, surfel.pos), 0.25);
  const intensity = emitter.intensity * (emitter.state === "carried" ? CARRY_INTENSITY_SCALE : 1);
  const contribution = scaledColor(emitter.rgb, (intensity * cosT * cone) / d2);
  addColor(bucket, contribution);
}

function computeDirect(level) {
  for (const surfel of allSurfels(level)) {
    for (const block of level.blocks) {
      if (!block.on || !["placed", "carried"].includes(block.state)) continue;
      for (const emitter of expandEmitters(block, level) ?? []) {
        if (block.state === "placed") addDirectContribution(surfel, emitter, level, surfel.directPlaced);
        if (block.state === "carried") addDirectContribution(surfel, emitter, level, surfel.directCarried);
      }
    }
  }
}

function combineDirect(level) {
  for (const surfel of allSurfels(level)) {
    surfel.direct.r = surfel.directPlaced.r + surfel.directCarried.r;
    surfel.direct.g = surfel.directPlaced.g + surfel.directCarried.g;
    surfel.direct.b = surfel.directPlaced.b + surfel.directCarried.b;
  }
}

function mirrorInputFromDirect(level) {
  const inputs = new Map();
  for (const surfel of mirrorSurfels(level)) inputs.set(surfel.mirrorId, cloneColor(surfel.directPlaced));
  return inputs;
}

function addToMirrorInput(inputs, surfel, contribution) {
  if (surfel.type !== "mirror" || !surfel.mirrorId) return;
  const existing = inputs.get(surfel.mirrorId) ?? color();
  addColor(existing, contribution);
  inputs.set(surfel.mirrorId, existing);
}

function addMirrorContribution(target, mirrorSurfel, mirror, recv, level, nextInputs) {
  if (target === mirrorSurfel) return;
  if (distanceSq3(target.pos, mirrorSurfel.pos) > BOUNCE_RADIUS * BOUNCE_RADIUS) return;
  if (!visible(mirrorSurfel.pos, target.pos, level.walls)) return;
  const cone = coneWeight(mirrorSurfel.pos, target.pos, mirror.normalYaw, EMITTER_CONE_DEG);
  if (cone <= 0) return;
  const cosT = targetCosTerm(target, mirrorSurfel.pos);
  if (cosT <= 0) return;
  const d2 = Math.max(distanceSq3(mirrorSurfel.pos, target.pos), 0.25);
  const contribution = scaledColor(multiplyColor(mirrorSurfel.albedo, recv), (MIRROR_GAIN * cone * cosT) / d2);
  addColor(target.directPlaced, contribution);
  addToMirrorInput(nextInputs, target, contribution);
}

function computeMirrors(level) {
  let inputs = mirrorInputFromDirect(level);
  for (let pass = 0; pass < 2; pass++) {
    const nextInputs = new Map();
    for (const mirrorSurfel of mirrorSurfels(level)) {
      const mirror = level.mirrors?.find((item) => item.id === mirrorSurfel.mirrorId);
      if (!mirror) continue;
      const recv = inputs.get(mirror.id) ?? color();
      if (luminance(recv) < MIRROR_RECV_MIN) continue;
      for (const target of allSurfels(level)) addMirrorContribution(target, mirrorSurfel, mirror, recv, level, nextInputs);
    }
    inputs = nextInputs;
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

function gameplayByMode(surfel, mode) {
  if (mode === "VISUAL_OFF") return color();
  const result = cloneColor(surfel.directPlaced);
  if (mode === "DIRECT_ONLY") return result;
  addColor(result, surfel.bounce1);
  if (mode === "BOUNCE1") return result;
  addColor(result, surfel.bounce2);
  return result;
}

function updateWalkable(surfel) {
  surfel.wasWalkable = surfel.walkable;
  if (surfel.type === "wall" || surfel.type === "mirror" || surfel.blockedByPanel) {
    surfel.walkable = false;
    return;
  }

  if (surfel.alwaysSolid) {
    surfel.walkable = true;
    return;
  }

  const gameplayEnergy = surfel.gameplayIrradiance ?? surfel.irradiance;
  const lit = luminance(gameplayEnergy);
  let next = surfel.walkable ? lit >= WALK_OFF : lit >= WALK_ON;
  if (surfel.gateColor) {
    next = hueMatchesGate(gameplayEnergy, PALETTE[surfel.gateColor].rgb);
  }
  surfel.walkable = next;
}

export function solve(level, mode = level.mode ?? "GI") {
  const started = performance.now?.() ?? Date.now();
  syncMirrorSurfels(level);
  for (const surfel of allSurfels(level)) clearSurfel(surfel);
  computeDirect(level);
  computeMirrors(level);
  combineDirect(level);
  computeBounce(level, 1);
  computeBounce(level, 2);
  for (const surfel of allSurfels(level)) {
    const next = combinedByMode(surfel, mode);
    const gameplay = gameplayByMode(surfel, mode);
    surfel.irradiance = next;
    surfel.gameplayIrradiance = gameplay;
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
