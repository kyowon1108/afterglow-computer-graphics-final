export const TILE_SIZE = 1.25;
export const WALL_HEIGHT = 2.4;
export const WALL_THICKNESS = 0.18;
export const WALK_ON = 0.6;
export const WALK_OFF = 0.4;
export const BOUNCE_RADIUS = 4.25 * TILE_SIZE;
export const BOUNCE_SCALE = 9.8;
export const INDIRECT_CLAMP = 0.72;
export const BOUNCE_PASSES = 2;
export const DIRECT_INTENSITY_WHITE = 17;
export const DIRECT_INTENSITY_COLOR = 19;
export const VISUAL_LERP = 0.18;
export const MOVE_LERP_MS = 80;
export const COYOTE_MS = 85;
export const INPUT_BUFFER_MS = 100;
export const RESPAWN_FADE_MS = 350;
export const TILE_TELEGRAPH_MS = 400;
export const MAX_SURFELS = 450;
export const MAX_BLOCKS = 4;
export const GATE_ON = 0.6;
export const HUE_DOT = 0.88;
export const MIN_CHROMA = 0.35;
export const CARRY_RADIUS = 1.6 * TILE_SIZE;
export const CARRY_INTENSITY_SCALE = 0.8;
export const BLOCK_LIGHT_HEIGHT = 0.85;
export const FLOOR_SURFEL_HEIGHT = 0.04;
export const WALL_SURFEL_HEIGHT = 1.0;

export const PALETTE = {
  white: { hex: 0xffffff, rgb: { r: 1, g: 1, b: 1 }, icon: "◇", iconName: "diamond" },
  red: { hex: 0xd55e00, rgb: { r: 0.835, g: 0.369, b: 0 }, icon: "▲", iconName: "triangle" },
  green: { hex: 0x009e73, rgb: { r: 0, g: 0.62, b: 0.451 }, icon: "■", iconName: "square" },
  blue: { hex: 0x0072b2, rgb: { r: 0, g: 0.447, b: 0.698 }, icon: "●", iconName: "circle" },
  orange: { hex: 0xe69f00, rgb: { r: 0.902, g: 0.624, b: 0 }, icon: "◆", iconName: "diamondFilled" }
};

export const SOLVE_MODES = ["DIRECT_ONLY", "BOUNCE1", "BOUNCE2", "GI"];
export const BOUNCE_VIEWS = ["FINAL", "DIRECT", "BOUNCE1", "BOUNCE2"];
