import { INPUT_BUFFER_MS } from "./constants.js";

const MOVE_KEYS = new Map([
  ["w", { x: 0, z: -1 }],
  ["arrowup", { x: 0, z: -1 }],
  ["s", { x: 0, z: 1 }],
  ["arrowdown", { x: 0, z: 1 }],
  ["a", { x: -1, z: 0 }],
  ["arrowleft", { x: -1, z: 0 }],
  ["d", { x: 1, z: 0 }],
  ["arrowright", { x: 1, z: 0 }]
]);

export class Input {
  constructor(canvas = window, options = {}) {
    this.canvas = canvas;
    this.onPointerDownCapture = options.onPointerDown ?? null;
    this.down = new Set();
    this.moveBuffer = [];
    this.actions = [];
    window.addEventListener("keydown", (event) => this.onKey(event));
    window.addEventListener("keyup", (event) => this.down.delete(event.key.toLowerCase()));
    this.canvas.addEventListener?.("pointerdown", (event) => this.onPointerDown(event));
    this.canvas.addEventListener?.("wheel", (event) => this.onWheel(event), { passive: false });
  }

  onKey(event) {
    const key = event.key.toLowerCase();
    if (MOVE_KEYS.has(key) || ["e", "q", "z", "r", "g", "b", "m", "t", "p", "o", "f", "f1", "v", "n", "c", "escape", "[", "]", "?", "/"].includes(key)) {
      event.preventDefault();
    }
    this.down.add(key);
    const now = performance.now();
    if (MOVE_KEYS.has(key) && !event.repeat) this.moveBuffer.push({ dir: MOVE_KEYS.get(key), at: now });
    if (!event.repeat) this.actions.push({ key, at: now });
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    if (this.onPointerDownCapture?.(event) === true) return;
    this.actions.push({ key: "mouse0", at: performance.now() });
  }

  onWheel(event) {
    event.preventDefault();
    if (Math.abs(event.deltaY) < 1) return;
    this.actions.push({ key: event.deltaY > 0 ? "]" : "[", at: performance.now() });
  }

  poll() {
    const cutoff = performance.now() - INPUT_BUFFER_MS;
    this.moveBuffer = this.moveBuffer.filter((entry) => entry.at >= cutoff);
    this.actions = this.actions.filter((entry) => entry.at >= cutoff);
  }

  consumeMove() {
    this.poll();
    return this.moveBuffer.shift()?.dir ?? null;
  }

  consumeAction(key) {
    this.poll();
    const index = this.actions.findIndex((entry) => entry.key === key);
    if (index === -1) return false;
    this.actions.splice(index, 1);
    return true;
  }

  isDown(key) {
    return this.down.has(key.toLowerCase());
  }

  clearTransient() {
    this.moveBuffer = [];
    this.actions = [];
  }

  movementAxes() {
    const forward = (this.isDown("w") || this.isDown("arrowup") ? 1 : 0) - (this.isDown("s") || this.isDown("arrowdown") ? 1 : 0);
    const right = (this.isDown("d") || this.isDown("arrowright") ? 1 : 0) - (this.isDown("a") || this.isDown("arrowleft") ? 1 : 0);
    return { forward, right };
  }
}
