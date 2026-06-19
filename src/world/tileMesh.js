import * as THREE from "three";
import { PALETTE, TILE_SIZE, TILE_TELEGRAPH_MS } from "../core/constants.js";
import { luminance } from "../core/math.js";
import { addUv2 } from "./geometry.js";

function drawGateIcon(ctx, iconName) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  if (iconName === "circle") {
    ctx.beginPath();
    ctx.arc(64, 64, 38, 0, Math.PI * 2);
    ctx.fill();
  } else if (iconName === "triangle") {
    ctx.beginPath();
    ctx.moveTo(64, 18);
    ctx.lineTo(108, 102);
    ctx.lineTo(20, 102);
    ctx.closePath();
    ctx.fill();
  } else if (iconName === "diamond" || iconName === "diamondFilled") {
    ctx.beginPath();
    ctx.moveTo(64, 15);
    ctx.lineTo(112, 64);
    ctx.lineTo(64, 113);
    ctx.lineTo(16, 64);
    ctx.closePath();
    iconName === "diamond" ? ctx.stroke() : ctx.fill();
  } else {
    ctx.fillRect(22, 22, 84, 84);
  }
}

function createGateIconTexture(surfel) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  ctx.lineWidth = 6;
  for (let x = -128; x < 256; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.lineTo(x + 128, 0);
    ctx.stroke();
  }
  drawGateIcon(ctx, surfel.icon);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createTileMesh(surfel, materials) {
  const geom = addUv2(new THREE.BoxGeometry(TILE_SIZE * 0.92, 0.08, TILE_SIZE * 0.92));
  const mesh = new THREE.Mesh(geom, materials.voidTile.clone());
  mesh.position.set(surfel.pos.x, -0.04, surfel.pos.z);
  mesh.userData.surfelId = surfel.id;
  mesh.userData.tileState = "void";
  mesh.userData.transitionTimer = 0;

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geom),
    new THREE.LineBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 0.35 })
  );
  edge.position.copy(mesh.position);
  edge.position.y += 0.05;
  edge.userData.edgeFor = surfel.id;

  let icon = null;
  if (surfel.gateColor) {
    icon = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE_SIZE * 0.74, TILE_SIZE * 0.74),
      new THREE.MeshBasicMaterial({
        map: createGateIconTexture(surfel),
        color: PALETTE[surfel.gateColor]?.hex ?? 0xffffff,
        transparent: true,
        opacity: 0.72,
        depthWrite: false
      })
    );
    icon.rotation.x = -Math.PI / 2;
    icon.position.set(surfel.pos.x, 0.018, surfel.pos.z);
    icon.userData.gateIconFor = surfel.id;
  }
  return { mesh, edge, icon };
}

export function updateTileVisual(tileRecord, surfel, dtMs) {
  const { mesh, edge, icon } = tileRecord;
  const state = surfel.gateColor && !surfel.walkable ? "gateLocked" : surfel.gateColor && surfel.walkable ? "gateOpen" : surfel.walkable ? "solid" : surfel.wasWalkable ? "fading" : "void";
  if (state !== mesh.userData.tileState) {
    mesh.userData.tileState = state;
    mesh.userData.transitionTimer = TILE_TELEGRAPH_MS;
  }
  mesh.userData.transitionTimer = Math.max(0, mesh.userData.transitionTimer - dtMs);
  const lum = luminance(surfel.visualIrradiance);
  const e = surfel.visualIrradiance;
  mesh.material.color.setRGB(
    state === "void" ? 0.04 : Math.min(0.35 + e.r * 0.18, 1),
    state === "void" ? 0.055 : Math.min(0.36 + e.g * 0.18, 1),
    state === "void" ? 0.06 : Math.min(0.34 + e.b * 0.18, 1)
  );
  mesh.material.emissive.setRGB(Math.min(e.r * 0.22, 1), Math.min(e.g * 0.22, 1), Math.min(e.b * 0.22, 1));
  mesh.material.emissiveIntensity = Math.min(lum, 1.8);
  mesh.material.opacity = state === "void" ? 0.48 : 1;
  edge.visible = state !== "void";
  edge.material.opacity = state === "fading" ? 0.75 : state === "gateLocked" ? 0.25 : 0.55;
  if (icon) {
    icon.visible = true;
    icon.material.color.setHex(state === "gateOpen" ? PALETTE[surfel.gateColor]?.hex ?? 0xffffff : 0xf1f5ec);
    icon.material.opacity = state === "gateOpen" ? 0.95 : 0.72;
  }
}
