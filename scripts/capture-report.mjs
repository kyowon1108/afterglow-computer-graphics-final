import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = Number(process.env.AFTERGLOW_CAPTURE_PORT ?? 5178);
const APP_URL = process.env.AFTERGLOW_CAPTURE_URL ?? `http://127.0.0.1:${PORT}/?qa=1&capture=1`;
const ROOT_URL = new URL("/", APP_URL).toString();
const OUT_DIR_URL = new URL("../public/report-captures/", import.meta.url);
const OUT_DIR = fileURLToPath(OUT_DIR_URL);
const VIEWPORT = { width: 1280, height: 720 };

const SHOTS = [
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function cameraSignature(snapshot) {
  const camera = snapshot.camera;
  return {
    mode: camera.mode,
    yaw: round3(camera.yaw),
    pitch: round3(camera.pitch),
    position: {
      x: round3(camera.position.x),
      y: round3(camera.position.y),
      z: round3(camera.position.z)
    }
  };
}

function configSignature(snapshot) {
  return {
    levelIndex: snapshot.levelIndex,
    blocks: snapshot.level.blocks.map((block) => ({
      id: block.id,
      state: block.state,
      colorKey: block.colorKey,
      emitDir: block.emitDir,
      cell: block.cell
    })),
    mirrors: snapshot.level.mirrors.map((mirror) => ({
      id: mirror.id,
      normalYaw: mirror.normalYaw
    }))
  };
}

function assertSameJson(a, b, label) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${label} changed:\n${left}\n${right}`);
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
  await waitForServer(ROOT_URL);
  return child;
}

async function clearOldCaptures() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const entries = await fs.readdir(OUT_DIR, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
      .map((entry) => fs.unlink(path.join(OUT_DIR, entry.name)))
  );
}

async function waitFonts(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true));
}

async function waitQa(page) {
  await page.waitForFunction(() => !!window.__AFTERGLOW_QA__?.snapshot, null, { timeout: 10000 });
}

async function snap(page) {
  return page.evaluate(() => window.__AFTERGLOW_QA__.snapshot());
}

async function qa(page, method, ...args) {
  return page.evaluate(
    ({ method: qaMethod, args: qaArgs }) => {
      const api = window.__AFTERGLOW_QA__;
      if (!api?.[qaMethod]) throw new Error(`Missing QA hook ${qaMethod}`);
      return api[qaMethod](...qaArgs);
    },
    { method, args }
  );
}

async function setReportLabel(page, text = "") {
  await page.evaluate((label) => {
    let el = document.getElementById("reportLabel");
    if (!label) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "reportLabel";
      document.body.append(el);
    }
    el.textContent = label;
  }, text);
}

async function addReportStyles(page) {
  await page.addStyleTag({
    content: `
      #reportLabel {
        position: fixed;
        left: 24px;
        top: 92px;
        z-index: 20;
        max-width: 560px;
        border: 1px solid rgba(255, 230, 163, 0.35);
        border-radius: 8px;
        background: rgba(5, 8, 10, 0.78);
        color: #fff7c7;
        padding: 10px 12px;
        font: 800 14px/1.45 Inter, system-ui, sans-serif;
        white-space: pre-line;
        text-shadow: 0 1px 2px rgba(0,0,0,0.55);
      }
    `
  });
}

async function capture(page, name, { settle = true, label = "" } = {}) {
  if (!SHOTS.includes(name)) throw new Error(`Unknown shot ${name}`);
  await setReportLabel(page, label);
  if (settle) await qa(page, "settle");
  await waitFonts(page);
  await page.waitForTimeout(180);
  await page.screenshot({
    path: path.join(OUT_DIR, `${name}.png`),
    fullPage: false
  });
  console.log(`captured ${name}.png`);
  return snap(page);
}

async function startGame(page) {
  await page.click("#startButton");
  await waitQa(page);
  await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().appState === "GAME", null, { timeout: 5000 });
}

async function loadSolvedPeek(page, index) {
  await qa(page, "loadLevel", index);
  await qa(page, "applySolution");
  await qa(page, "setCameraPeek");
  await qa(page, "settle");
}

async function main() {
  await clearOldCaptures();
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 2
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  try {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await waitFonts(page);
    await addReportStyles(page);

    await capture(page, "01_title", { settle: false });
    await startGame(page);

    await qa(page, "setCameraPeek");
    await qa(page, "setBounceView", "FINAL");
    await capture(page, "02_l1_aim_before");

    await qa(page, "applySolution");
    await qa(page, "setCameraPeek");
    await qa(page, "setBounceView", "FINAL");
    await capture(page, "03_l1_aim_after");

    await loadSolvedPeek(page, 1);
    await qa(page, "setBounceView", "DIRECT");
    const l2Direct = await capture(page, "04_l2_direct_only");
    await qa(page, "setBounceView", "FINAL");
    const l2Gi = await capture(page, "05_l2_gi_on");
    assertSameJson(cameraSignature(l2Direct), cameraSignature(l2Gi), "L2 comparison camera");
    assertSameJson(configSignature(l2Direct), configSignature(l2Gi), "L2 comparison config");

    await loadSolvedPeek(page, 2);
    await qa(page, "setDebug", { visible: true, surfels: true, normals: false });
    await capture(page, "06_surfel_debug");
    await qa(page, "setDebug", { visible: false, surfels: false, normals: false });

    await qa(page, "setCameraPeek");
    await qa(page, "setBounceView", "DIRECT");
    const l3Direct = await capture(page, "07_bounce_direct");
    await qa(page, "setBounceView", "BOUNCE1");
    const l3Pass1 = await capture(page, "08_bounce_pass1");
    await qa(page, "setBounceView", "FINAL");
    const l3Final = await capture(page, "09_bounce_pass2");
    assertSameJson(cameraSignature(l3Direct), cameraSignature(l3Pass1), "L3 direct/pass1 camera");
    assertSameJson(cameraSignature(l3Direct), cameraSignature(l3Final), "L3 direct/final camera");
    assertSameJson(configSignature(l3Direct), configSignature(l3Pass1), "L3 direct/pass1 config");
    assertSameJson(configSignature(l3Direct), configSignature(l3Final), "L3 direct/final config");

    await loadSolvedPeek(page, 3);
    await capture(page, "10_color_mixing", {
      label: "프리즘 분광\n흰빛 -> 빨강 + 초록 + 파랑\n빨강 + 초록 = 노랑 게이트"
    });

    await qa(page, "loadLevel", 3);
    await qa(page, "applyAction", { type: "place", blockId: "p1", socketId: "s1", emitDir: 90 });
    await qa(page, "applyAction", { type: "color", blockId: "p1", colorKey: "red" });
    await qa(page, "setCameraPeek");
    await qa(page, "setBounceView", "FINAL");
    const l4Locked = await capture(page, "11_color_gate_locked");
    await qa(page, "applyAction", { type: "color", blockId: "p1", colorKey: "white" });
    const l4Open = await capture(page, "12_color_gate_open");
    assertSameJson(cameraSignature(l4Locked), cameraSignature(l4Open), "L4 gate comparison camera");

    await qa(page, "loadLevel", 0);
    await qa(page, "applySolution");
    await qa(page, "setPlayerCell", { x: 3, z: 1 });
    await qa(page, "forceLock", true);
    await qa(page, "setYawPitch", -Math.PI / 2, -0.18);
    await qa(page, "setCameraMode", "third");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(420);
    await capture(page, "13_robot_animation");
    await page.keyboard.up("KeyW");

    await qa(page, "loadLevel", 2);
    await qa(page, "applySolution");
    await qa(page, "setPlayerCell", { x: 3, z: 2 });
    await qa(page, "setYawPitch", Math.PI, -0.46);
    await capture(page, "14_texture_uv_normal");

    await qa(page, "loadLevel", 4);
    await qa(page, "applySolution");
    await qa(page, "setPlayerCell", { x: 6, z: 4 });
    await page.waitForFunction(() => window.__AFTERGLOW_QA__.snapshot().appState === "GAME_COMPLETE", null, { timeout: 5000 });
    await capture(page, "15_game_complete");

    await setReportLabel(page, "");
    if (errors.length) throw new Error(`Browser errors during capture: ${errors.join(" | ")}`);

    const files = (await fs.readdir(OUT_DIR)).filter((file) => file.endsWith(".png")).sort();
    const expected = SHOTS.map((name) => `${name}.png`);
    assertSameJson(files, expected, "capture file list");
    console.log(`PASS capture report: ${files.length} PNGs`);
  } finally {
    await browser.close();
    if (server) server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
