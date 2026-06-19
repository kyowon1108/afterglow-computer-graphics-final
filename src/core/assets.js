import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const loader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();

function urlFor(path) {
  return `${BASE_URL}${path}`.replace(/\/+/g, "/");
}

function configureTexture(texture, colorSpace, anisotropy = 8) {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  return texture;
}

function makeCanvasTexture(name, colorA = "#343b3b", colorB = "#6f776d", anisotropy = 8) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = colorB;
  ctx.lineWidth = 4;
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.font = "700 14px sans-serif";
  ctx.fillText(name, 10, 118);
  const texture = new THREE.CanvasTexture(canvas);
  return configureTexture(texture, THREE.SRGBColorSpace, anisotropy);
}

function loadTexture(path, colorSpace, anisotropy) {
  return new Promise((resolve) => {
    const texture = loader.load(
      urlFor(path),
      (loaded) => resolve(configureTexture(loaded, colorSpace, anisotropy)),
      undefined,
      () => resolve(null)
    );
    configureTexture(texture, colorSpace, anisotropy);
  });
}

export async function loadTexSet(name, options = {}) {
  const anisotropy = options.anisotropy ?? 8;
  const root = `assets/textures/${name}`;
  const [basecolor, normal, roughness, ao] = await Promise.all([
    loadTexture(`${root}/basecolor.jpg`, THREE.SRGBColorSpace, anisotropy),
    loadTexture(`${root}/normal.jpg`, THREE.NoColorSpace, anisotropy),
    loadTexture(`${root}/roughness.jpg`, THREE.NoColorSpace, anisotropy),
    loadTexture(`${root}/ao.jpg`, THREE.NoColorSpace, anisotropy)
  ]);

  if (basecolor) {
    return {
      basecolor,
      normal,
      roughness,
      ao,
      fallback: false
    };
  }

  return {
    basecolor: makeCanvasTexture(name, undefined, undefined, anisotropy),
    normal: null,
    roughness: null,
    ao: null,
    fallback: true
  };
}

export async function loadRobot() {
  return new Promise((resolve) => {
    gltfLoader.load(
      urlFor("models/RobotExpressive.glb"),
      (gltf) => resolve(gltf),
      undefined,
      () => resolve(null)
    );
  });
}
