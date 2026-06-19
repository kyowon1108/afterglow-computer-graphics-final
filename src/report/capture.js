export const SHOT_NAMES = [
  "01_title",
  "02_l1_aim_before",
  "03_l1_aim_after",
  "04_l2_direct_only",
  "05_l2_gi_on",
  "06_surfel_debug",
  "07_bounce_direct",
  "08_bounce_pass1",
  "09_bounce_pass2",
  "10_color_mixing",
  "11_color_gate_locked",
  "12_color_gate_open",
  "13_robot_animation",
  "14_texture_uv_normal",
  "15_game_complete"
];

export function printShotName({ appState, levelIndex, solveMode, debugVisible }) {
  let name = SHOT_NAMES[0];
  if (appState === "GAME_COMPLETE") name = "15_game_complete";
  else if (debugVisible) name = "06_surfel_debug";
  else if (levelIndex === 0) name = "03_l1_aim_after";
  else if (levelIndex === 1 && solveMode === "DIRECT_ONLY") name = "04_l2_direct_only";
  else if (levelIndex === 1) name = "05_l2_gi_on";
  else if (levelIndex === 2 && solveMode === "DIRECT_ONLY") name = "07_bounce_direct";
  else if (levelIndex === 2 && solveMode === "BOUNCE1") name = "08_bounce_pass1";
  else if (levelIndex === 2) name = "09_bounce_pass2";
  else if (levelIndex === 3) name = "10_color_mixing";
  else if (levelIndex === 4) name = "12_color_gate_open";
  console.info(`[AFTERGLOW capture] ${name}.png`);
  return name;
}
