import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const PORT = Number(process.env.AFTERGLOW_CAPTURE_PORT ?? 5178);
const APP_URL = process.env.AFTERGLOW_CAPTURE_URL ?? `http://127.0.0.1:${PORT}/?qa=1`;
const OUT_DIR = new URL("../public/report-captures/", import.meta.url);
const VIEWPORT = { width: 1280, height: 720 };

const shots = [
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
  if (process.env.AFTERGLOW_CAPTURE_URL) return null;
  const child = spawn("npm", ["run", "dev", "--", "--port", String(PORT)], {
    cwd: new URL("../", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  await waitForServer(APP_URL.replace("/?qa=1", "/"));
  return child;
}

async function shot(page, name) {
  if (!shots.includes(name)) throw new Error(`Unknown shot ${name}`);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT_DIR.pathname, `${name}.png`) });
  console.log(`captured ${name}.png`);
}

async function snap(page) {
  return page.evaluate(() => window.__AFTERGLOW_QA__.snapshot());
}

async function pulse(page, key, ms = 150) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(80);
}

async function waitGame(page) {
  await page.waitForFunction(() => window.__AFTERGLOW_QA__?.snapshot().appState === "GAME", null, { timeout: 5000 });
  await page.waitForTimeout(250);
}

async function pressE(page, predicate, timeout = 5000) {
  await page.keyboard.press("KeyE");
  await page.waitForFunction(predicate, null, { timeout });
  await page.waitForTimeout(150);
}

async function moveAxis(page, axis, target, label) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    const state = await snap(page);
    if (state.appState !== "GAME") return;
    const value = state.player.cell[axis];
    if (value === target) return;
    if (axis === "x") await pulse(page, value < target ? "KeyW" : "KeyS");
    else await pulse(page, value < target ? "KeyD" : "KeyA");
  }
  throw new Error(`${label}: timed out at ${JSON.stringify((await snap(page)).player)}`);
}

async function moveTo(page, x, z, label, order = "xz") {
  if (order === "zx") {
    await moveAxis(page, "z", z, label);
    await moveAxis(page, "x", x, label);
  } else {
    await moveAxis(page, "x", x, label);
    await moveAxis(page, "z", z, label);
  }
  await page.waitForTimeout(250);
}

async function continueLevel(page, title) {
  await page.waitForFunction((expected) => window.__AFTERGLOW_QA__?.snapshot().modalTitle === expected, title, { timeout: 8000 });
  await page.click("#overlayButton");
  await waitGame(page);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
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
    await shot(page, "01_title");
    await page.click("#startButton");
    await waitGame(page);
    await shot(page, "02_l1_direct_before");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === "b1");
    await shot(page, "14_uv_normalmap_closeup");
    await moveTo(page, 3, 1, "L1 socket");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === null && window.__AFTERGLOW_QA__.snapshot().level.blocks[0].state === "placed");
    await shot(page, "03_l1_direct_after");
    await moveTo(page, 6, 1, "L1 exit");
    await continueLevel(page, "Level 1 cleared");

    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === "b1");
    await moveTo(page, 4, 1, "L2 socket");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === null && window.__AFTERGLOW_QA__.snapshot().level.blocks[0].state === "placed");
    await page.keyboard.press("KeyG");
    await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().level.mode === "DIRECT_ONLY");
    await shot(page, "04_l2_direct_only_fail");
    await page.keyboard.press("KeyG");
    await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().level.mode === "GI");
    await shot(page, "05_l2_gi_bounce_success");
    await page.keyboard.press("F1");
    await page.keyboard.press("KeyV");
    await shot(page, "06_surfel_debug_points");
    await page.keyboard.press("F1");
    await page.keyboard.press("KeyV");
    await moveTo(page, 5, 4, "L2 south");
    await moveTo(page, 1, 4, "L2 exit");
    await continueLevel(page, "Level 2 cleared");

    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === "b1");
    await moveTo(page, 3, 1, "L3 socket");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === null && window.__AFTERGLOW_QA__.snapshot().level.blocks[0].state === "placed");
    await page.keyboard.press("KeyB");
    await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().level.mode === "DIRECT_ONLY");
    await shot(page, "07_bounce_pass_direct");
    await page.keyboard.press("KeyB");
    await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().level.mode === "BOUNCE1");
    await shot(page, "08_bounce_pass_1");
    await page.keyboard.press("KeyB");
    await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().level.mode === "BOUNCE2");
    await shot(page, "09_bounce_pass_2");
    await page.keyboard.press("KeyB");
    await moveTo(page, 9, 3, "L3 exit");
    await continueLevel(page, "Level 3 cleared");

    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === "b1");
    await moveTo(page, 3, 1, "L4 s1");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === null && window.__AFTERGLOW_QA__.snapshot().level.blocks.find((b) => b.id === "b1").state === "placed");
    await moveTo(page, 3, 3, "L4 b2");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === "b2");
    await moveTo(page, 5, 1, "L4 s2");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === null && window.__AFTERGLOW_QA__.snapshot().level.blocks.find((b) => b.id === "b2").state === "placed");
    await shot(page, "10_color_mixing");
    await moveTo(page, 7, 3, "L4 exit");
    await continueLevel(page, "Level 4 cleared");

    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === "b1");
    await moveTo(page, 3, 1, "L5 s1");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === null && window.__AFTERGLOW_QA__.snapshot().level.blocks.find((b) => b.id === "b1").state === "placed");
    await moveTo(page, 8, 1, "L5 gate locked view");
    await page.keyboard.press("KeyM");
    await shot(page, "11_color_gate_locked");
    await page.keyboard.press("KeyM");
    await moveTo(page, 2, 1, "L5 b2");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === "b2");
    await moveTo(page, 8, 2, "L5 s2");
    await pressE(page, () => window.__AFTERGLOW_QA__.snapshot().player.heldBlockId === null && window.__AFTERGLOW_QA__.snapshot().level.blocks.find((b) => b.id === "b2").state === "placed");
    await page.keyboard.press("KeyM");
    await shot(page, "12_color_gate_open");
    await page.keyboard.press("KeyM");
    await page.keyboard.press("KeyT");
    await pulse(page, "KeyW", 500);
    await shot(page, "13_robot_animation");
    await moveTo(page, 9, 3, "L5 gate", "zx");
    await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().appState === "GAME_COMPLETE", null, { timeout: 8000 });
    await shot(page, "15_game_complete");

    if (errors.length) throw new Error(`Browser errors during capture: ${errors.join(" | ")}`);
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
