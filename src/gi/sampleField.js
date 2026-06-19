import { COYOTE_MS, TILE_SIZE, WALK_OFF, WALK_ON } from "../core/constants.js";
import { clamp, luminance, worldToGrid } from "../core/math.js";

export const GroundState = Object.freeze({
  SOLID: "SOLID",
  VOID: "VOID"
});

export const GROUND_DWELL_MS = 120;
export const GROUND_COYOTE_MS = Math.max(100, COYOTE_MS);

function gridCoord(level, worldX, worldZ) {
  return worldToGrid(worldX, worldZ, level);
}

function sampleCell(level, x, z) {
  const surfel = level.grid.tileAt({ x, z });
  if (!surfel || surfel.type === "wall" || surfel.blockedByPanel) return 0;
  const energy = surfel.gameplayIrradiance ?? surfel.irradiance;
  return surfel.alwaysSolid ? Math.max(WALK_ON, luminance(energy)) : luminance(energy);
}

export function sampleIrradianceAt(level, worldX, worldZ) {
  const p = gridCoord(level, worldX, worldZ);
  const x0 = Math.floor(p.x);
  const z0 = Math.floor(p.z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = clamp(p.x - x0, 0, 1);
  const tz = clamp(p.z - z0, 0, 1);

  const a = sampleCell(level, x0, z0);
  const b = sampleCell(level, x1, z0);
  const c = sampleCell(level, x0, z1);
  const d = sampleCell(level, x1, z1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * tz;
}

export function isGroundSolidAt(state, level, worldX, worldZ) {
  const current = state === GroundState.SOLID ? GroundState.SOLID : GroundState.VOID;
  const lit = sampleIrradianceAt(level, worldX, worldZ);
  if (current === GroundState.VOID && lit >= WALK_ON) return GroundState.SOLID;
  if (current === GroundState.SOLID && lit <= WALK_OFF) return GroundState.VOID;
  return current;
}

export function createGroundContact(state = GroundState.VOID) {
  return {
    state,
    pendingState: state,
    pendingMs: 0,
    coyoteMs: 0,
    luminance: 0
  };
}

export function updateGroundContact(contact, level, worldX, worldZ, dtMs) {
  const desired = isGroundSolidAt(contact.state, level, worldX, worldZ);
  const luminanceAtFoot = sampleIrradianceAt(level, worldX, worldZ);
  let nextState = contact.state;
  let pendingState = contact.pendingState;
  let pendingMs = contact.pendingMs;

  if (desired !== contact.state) {
    pendingState = desired;
    pendingMs = pendingState === contact.pendingState ? pendingMs + dtMs : dtMs;
    if (pendingMs >= GROUND_DWELL_MS) {
      nextState = desired;
      pendingMs = 0;
    }
  } else {
    pendingState = contact.state;
    pendingMs = 0;
  }

  let coyoteMs = contact.coyoteMs;
  if (contact.state === GroundState.SOLID && nextState === GroundState.VOID) coyoteMs = GROUND_COYOTE_MS;
  else if (nextState === GroundState.VOID) coyoteMs = Math.max(0, coyoteMs - dtMs);
  else coyoteMs = 0;
  return {
    state: nextState,
    pendingState,
    pendingMs,
    coyoteMs,
    luminance: luminanceAtFoot,
    supported: nextState === GroundState.SOLID || coyoteMs > 0
  };
}
