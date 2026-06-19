import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const publicRoot = new URL("../public/", import.meta.url);
const textureRoot = new URL("assets/textures/", publicRoot);

const textureSets = [
  { name: "floor_tile", id: "PavingStones033" },
  { name: "wall_rock", id: "Rock013" },
  { name: "bounce_panel", id: "Concrete042A" }
];

const dirs = [
  "models",
  "assets/textures/floor_tile",
  "assets/textures/wall_rock",
  "assets/textures/bounce_panel",
  "assets/textures/gate_stone"
];

function noticeLines(extra = []) {
  return [
    "AFTERGLOW asset fallback manifest",
    "ambientCG IDs: PavingStones033, Rock013, Concrete042A; gate_stone reuses floor.",
    "RobotExpressive.glb primary: https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb",
    "Runtime uses public PBR textures when present; otherwise procedural CanvasTexture / capsule fallback.",
    ...extra
  ].join("\n");
}

async function ensureDirs() {
  for (const dir of dirs) await fs.mkdir(new URL(dir, publicRoot), { recursive: true });
}

async function writeFallbackNotice(extra = []) {
  await fs.writeFile(new URL("assets/FALLBACK.txt", publicRoot), noticeLines(extra));
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(destination, bytes);
}

async function findFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) files.push(...(await findFiles(full)));
    else files.push(full);
  }
  return files;
}

function findMap(files, patterns) {
  return files.find((file) => {
    const base = path.basename(file).toLowerCase();
    return /\.(jpg|jpeg)$/i.test(base) && patterns.some((pattern) => pattern.test(base));
  });
}

async function copyIfFound(source, destination) {
  if (!source) return false;
  await fs.copyFile(source, destination);
  return true;
}

async function normalizeTextureSet(tempDir, targetDir) {
  const files = await findFiles(tempDir);
  await fs.mkdir(targetDir, { recursive: true });
  const mappings = [
    ["basecolor.jpg", [/base.?color/i, /albedo/i, /diffuse/i, /color/i]],
    ["normal.jpg", [/normalgl/i, /normal/i]],
    ["roughness.jpg", [/roughness/i]],
    ["ao.jpg", [/ambient.?occlusion/i, /\bao\b/i]]
  ];
  const copied = [];
  for (const [name, patterns] of mappings) {
    const source = findMap(files, patterns);
    if (await copyIfFound(source, path.join(targetDir, name))) copied.push(name);
  }
  if (!copied.includes("basecolor.jpg")) throw new Error(`basecolor map missing in ${tempDir}`);
  return copied;
}

async function fetchTextureSet(set) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `afterglow-${set.name}-`));
  const zipPath = path.join(workDir, `${set.id}.zip`);
  const unzipDir = path.join(workDir, "unzipped");
  const url = `https://ambientcg.com/get?file=${set.id}_1K-JPG.zip`;
  await download(url, zipPath);
  await fs.mkdir(unzipDir, { recursive: true });
  await execFileAsync("unzip", ["-q", zipPath, "-d", unzipDir]);
  const targetDir = path.join(textureRoot.pathname, set.name);
  const copied = await normalizeTextureSet(unzipDir, targetDir);
  await fs.rm(workDir, { recursive: true, force: true });
  return `${set.name}: ${copied.join(", ")}`;
}

async function copyGateTextureFallback() {
  const sourceDir = path.join(textureRoot.pathname, "floor_tile");
  const targetDir = path.join(textureRoot.pathname, "gate_stone");
  await fs.mkdir(targetDir, { recursive: true });
  for (const name of ["basecolor.jpg", "normal.jpg", "roughness.jpg", "ao.jpg"]) {
    try {
      await fs.copyFile(path.join(sourceDir, name), path.join(targetDir, name));
    } catch {
      // Optional maps are allowed to fall back procedurally.
    }
  }
}

async function fetchRobot() {
  const destination = new URL("models/RobotExpressive.glb", publicRoot);
  await download(
    "https://raw.githubusercontent.com/mrdoob/three.js/master/examples/models/gltf/RobotExpressive/RobotExpressive.glb",
    destination
  );
  return "RobotExpressive.glb";
}

await ensureDirs();
const successes = [];
const failures = [];

for (const set of textureSets) {
  try {
    successes.push(await fetchTextureSet(set));
  } catch (error) {
    failures.push(`${set.name}: ${error.message}`);
  }
}

try {
  await copyGateTextureFallback();
} catch (error) {
  failures.push(`gate_stone: ${error.message}`);
}

try {
  successes.push(await fetchRobot());
} catch (error) {
  failures.push(`robot: ${error.message}`);
}

await writeFallbackNotice([
  "",
  `Downloaded: ${successes.length ? successes.join(" | ") : "none"}`,
  `Fallbacks: ${failures.length ? failures.join(" | ") : "none"}`
]);

if (failures.length) {
  console.log(`AFTERGLOW assets: partial/fallback mode. ${failures.join(" | ")}. exit 0.`);
} else {
  console.log(`AFTERGLOW assets: downloaded ${successes.join(" | ")}. exit 0.`);
}
