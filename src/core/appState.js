export const AppState = Object.freeze({
  TITLE: "TITLE",
  GAME: "GAME",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
  GAME_COMPLETE: "GAME_COMPLETE",
  PAUSE: "PAUSE"
});

let currentState = AppState.TITLE;

export function setState(next) {
  currentState = next;
}

export function getState() {
  return currentState;
}

