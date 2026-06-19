import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = Number(process.env.AFTERGLOW_SMOKE_PORT ?? 5180);
const APP_URL = process.env.AFTERGLOW_SMOKE_URL ?? `http://127.0.0.1:${PORT}/?qa=1`;
const VIEWPORT = { width: 1280, height: 720 };

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until Vite is ready.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startServer() {
  if (process.env.AFTERGLOW_SMOKE_URL) return null;
  const child = spawn("npm", ["run", "dev", "--", "--port", String(PORT)], {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  await waitForServer(APP_URL.replace("/?qa=1", "/"));
  return child;
}

async function snap(page) {
  return page.evaluate(() => window.__AFTERGLOW_QA__.snapshot());
}

async function waitFor(page, predicate, label, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await snap(page);
    if (predicate(state)) return state;
    await page.waitForTimeout(50);
  }
  throw new Error(`${label}: timed out at ${JSON.stringify(await snap(page))}`);
}

async function pulse(page, key, ms = 150) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(80);
}

async function moveAxis(page, axis, target, label) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    const state = await snap(page);
    const value = state.player.cell[axis];
    if (value === target) return state;
    if (axis === "x") await pulse(page, value < target ? "KeyW" : "KeyS");
    else await pulse(page, value < target ? "KeyD" : "KeyA");
  }
  throw new Error(`${label}: move timed out at ${JSON.stringify((await snap(page)).player)}`);
}

async function moveTo(page, x, z, label) {
  await moveAxis(page, "x", x, label);
  await moveAxis(page, "z", z, label);
  await page.waitForTimeout(250);
}

async function clickCanvas(page) {
  const box = await page.locator("#gameCanvas").boundingBox();
  if (!box) throw new Error("gameCanvas has no bounding box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(180);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.click("#startButton");
    await waitFor(page, (state) => state.appState === "GAME" && state.levelIndex === 0, "L1 start");

    await clickCanvas(page);
    await waitFor(page, (state) => state.player.heldBlockId === "b1", "mouse click picks block");

    await moveTo(page, 3, 1, "L1 socket");
    await waitFor(page, (state) => state.target?.type === "socket" && state.ui.ghostVisible, "socket ghost preview");
    await clickCanvas(page);
    await waitFor(
      page,
      (state) => state.player.heldBlockId === null && state.level.blocks.find((block) => block.id === "b1")?.state === "placed",
      "mouse click places block"
    );

    await page.keyboard.press("KeyZ");
    await waitFor(
      page,
      (state) => state.player.heldBlockId === "b1" && state.level.blocks.find((block) => block.id === "b1")?.state === "carried",
      "undo restores carried block"
    );
    await page.keyboard.press("KeyZ");
    await waitFor(
      page,
      (state) => state.player.heldBlockId === null && state.level.blocks.find((block) => block.id === "b1")?.state === "pickup",
      "undo restores pickup block"
    );

    await page.keyboard.press("KeyR");
    await waitFor(
      page,
      (state) =>
        state.camera.mode === "fp" &&
        state.player.cell.x === state.level.start.x &&
        state.player.cell.z === state.level.start.z &&
        state.player.heldBlockId === null &&
        state.level.blocks.find((block) => block.id === "b1")?.state === "pickup",
      "R returns to safe start after undo"
    );

    await page.keyboard.press("KeyE");
    await waitFor(page, (state) => state.player.heldBlockId === "b1", "keyboard E picks block");
    await page.keyboard.press("KeyQ");
    await waitFor(page, (state) => state.level.blocks.find((block) => block.id === "b1")?.colorKey === "red", "Q cycles held color");

    await page.keyboard.press("KeyG");
    await waitFor(page, (state) => state.level.mode === "DIRECT_ONLY", "G toggles direct-only");
    await page.keyboard.press("KeyB");
    await page.keyboard.press("KeyB");
    await waitFor(page, (state) => state.level.mode === "BOUNCE1", "B cycles to bounce1");

    await page.keyboard.press("KeyM");
    await waitFor(page, (state) => state.camera.mode === "peek", "M toggles peek camera");
    await page.keyboard.press("KeyM");
    await page.keyboard.press("KeyT");
    await waitFor(page, (state) => state.camera.mode === "third", "T toggles third camera");

    await page.keyboard.press("KeyR");
    await waitFor(
      page,
      (state) =>
        state.camera.mode === "fp" &&
        state.player.heldBlockId === null &&
        state.level.mode === "GI" &&
        state.level.blocks.find((block) => block.id === "b1")?.state === "pickup" &&
        state.level.blocks.find((block) => block.id === "b1")?.colorKey === "white",
      "R resets level state"
    );

    await page.keyboard.down("KeyW");
    await waitFor(page, (state) => state.player.position.y < -1, "unlit floor causes fall", 5000);
    await page.keyboard.up("KeyW");
    await waitFor(
      page,
      (state) => state.player.cell.x === state.level.start.x && state.player.cell.z === state.level.start.z && Math.abs(state.player.position.y) < 0.1,
      "fall respawns at level start",
      6000
    );

    if (errors.length) throw new Error(`Browser errors during smoke: ${errors.join(" | ")}`);
    console.log("PASS interaction smoke: mouse/E pick-place, ghost, undo, color, reset, GI/B, cameras, fall/respawn");
  } finally {
    await browser.close();
    server?.kill("SIGTERM");
  }
}

await main();
