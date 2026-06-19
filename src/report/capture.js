export const SHOT_NAMES = [
  "01_title",
  "02_l1_direct_before",
  "03_l1_direct_after",
  "04_l2_direct_only_fail",
  "05_l2_gi_bounce_success",
  "06_surfel_debug_points",
  "07_bounce_pass_direct",
  "08_bounce_pass_1",
  "09_bounce_pass_2",
  "10_color_mixing",
  "11_color_gate_locked",
  "12_color_gate_open",
  "13_robot_animation",
  "14_uv_normalmap_closeup",
  "15_game_complete"
];

export function printShotName({ appState, levelIndex, solveMode, debugVisible }) {
  let name = SHOT_NAMES[0];
  if (appState === "GAME_COMPLETE") name = "15_game_complete";
  else if (debugVisible) name = "06_surfel_debug_points";
  else if (levelIndex === 0) name = "03_l1_direct_after";
  else if (levelIndex === 1 && solveMode === "DIRECT_ONLY") name = "04_l2_direct_only_fail";
  else if (levelIndex === 1) name = "05_l2_gi_bounce_success";
  else if (levelIndex === 2) name = "09_bounce_pass_2";
  else if (levelIndex === 3) name = "10_color_mixing";
  else if (levelIndex === 4) name = "12_color_gate_open";
  console.info(`[AFTERGLOW capture] ${name}.png`);
  return name;
}

