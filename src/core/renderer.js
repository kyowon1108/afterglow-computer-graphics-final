import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";

export function initRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080a);
  scene.fog = new THREE.FogExp2(0x05080a, 0.035);

  const ambient = new THREE.AmbientLight(0x586363, 0.25);
  const key = new THREE.DirectionalLight(0xfff4d6, 0.6);
  key.position.set(4, 9, 6);
  scene.add(ambient, key);

  let composer = null;
  let renderPass = null;
  let outlinePass = null;

  function ensureComposer(camera) {
    if (composer) {
      renderPass.camera = camera;
      outlinePass.renderCamera = camera;
      return;
    }
    const size = new THREE.Vector2(window.innerWidth, window.innerHeight);
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(size, 0.3, 0.35, 1.45);
    outlinePass = new OutlinePass(size, scene, camera);
    outlinePass.edgeStrength = 3.0;
    outlinePass.edgeGlow = 0.35;
    outlinePass.edgeThickness = 1.3;
    outlinePass.visibleEdgeColor.set(0x6cffc3);
    outlinePass.hiddenEdgeColor.set(0x183d37);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outlinePass);
  }

  const resize = (camera) => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    if (camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
  };

  const setOutlineObjects = (objects = []) => {
    if (outlinePass) outlinePass.selectedObjects = objects.filter(Boolean);
  };

  const render = (camera) => {
    ensureComposer(camera);
    composer.render();
  };

  return { renderer, scene, resize, render, setOutlineObjects };
}
