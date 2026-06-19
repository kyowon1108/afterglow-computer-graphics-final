import { BOUNCE_VIEWS } from "../core/constants.js";
import { iconFor } from "../entities/EmissiveBlock.js";

export function initHud() {
  return {
    root: document.getElementById("hud"),
    level: document.getElementById("levelLabel"),
    objective: document.getElementById("objectiveLabel"),
    camera: document.getElementById("cameraLabel"),
    gi: document.getElementById("giLabel"),
    bounce: document.getElementById("bounceLabel"),
    held: document.getElementById("heldLabel"),
    foot: document.getElementById("footLabel"),
    debug: document.getElementById("debugPanel")
  };
}

export function updateHud(hud, state) {
  hud.root.classList.toggle("hidden", !state.inGame);
  hud.level.textContent = `Level ${state.levelIndex + 1} / ${state.totalLevels}`;
  hud.objective.textContent = state.level.objective;
  hud.camera.textContent = state.cameraMode.toUpperCase();
  hud.gi.textContent = state.solveMode;
  hud.bounce.textContent = BOUNCE_VIEWS[state.bounceViewIndex] ?? "FINAL";
  const held = state.level.blocks.find((b) => b.id === state.player.heldBlockId);
  hud.held.textContent = held ? iconFor(held.colorKey) : "none";
  const footLum = state.player.ground?.luminance ?? 0;
  const solid = state.player.ground?.supported !== false;
  hud.foot.textContent = `${footLum.toFixed(2)} ${solid ? "solid" : "void"}`;
  hud.debug.classList.toggle("hidden", !state.debugVisible);
  hud.debug.textContent = state.debugText;
}
