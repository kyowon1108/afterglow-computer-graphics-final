import * as THREE from "three";
import { PALETTE } from "../core/constants.js";

const TEXTURE_MAP_KEYS = ["map", "normalMap", "roughnessMap", "aoMap"];

function textureParams(set) {
  if (!set) return {};
  return {
    map: set.basecolor ?? null,
    normalMap: set.normal ?? null,
    roughnessMap: set.roughness ?? null,
    aoMap: set.ao ?? null
  };
}

function cloneTextureWithRepeat(texture, repeatX, repeatY) {
  if (!texture) return null;
  const clone = texture.clone();
  clone.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
  clone.needsUpdate = true;
  return clone;
}

export function cloneMaterialWithRepeat(material, repeatX = 1, repeatY = 1) {
  const clone = material.clone();
  for (const key of TEXTURE_MAP_KEYS) {
    if (clone[key]) clone[key] = cloneTextureWithRepeat(clone[key], repeatX, repeatY);
  }
  return clone;
}

export function makeMaterials(textureSets = {}) {
  const floor = textureParams(textureSets.floor);
  const wall = textureParams(textureSets.wall);
  const bounce = textureParams(textureSets.bounce);
  return {
    litTile: new THREE.MeshStandardMaterial({ ...floor, color: 0x777c73, roughness: 0.78, metalness: 0.02, emissive: 0x000000 }),
    voidTile: new THREE.MeshStandardMaterial({ ...floor, color: 0x111719, roughness: 0.95, transparent: true, opacity: 0.62, emissive: 0x000000 }),
    wall: new THREE.MeshStandardMaterial({ ...wall, color: 0x242a2c, roughness: 0.92 }),
    bounce: new THREE.MeshStandardMaterial({ ...bounce, color: 0xf2f0e6, roughness: 0.55, emissive: 0x111111 }),
    socket: new THREE.MeshStandardMaterial({ ...floor, color: 0x2b3434, roughness: 0.8, emissive: 0x332900 }),
    exit: new THREE.MeshStandardMaterial({ color: 0xffe6a3, emissive: 0xffc766, emissiveIntensity: 1.2 }),
    player: new THREE.MeshStandardMaterial({ color: 0xdfe7e4, roughness: 0.55, metalness: 0.1 }),
    debug: new THREE.MeshBasicMaterial({ color: 0x66ddff })
  };
}

export function makeBlockMaterial(colorKey) {
  const palette = PALETTE[colorKey] ?? PALETTE.white;
  return new THREE.MeshStandardMaterial({
    color: palette.hex,
    emissive: palette.hex,
    emissiveIntensity: colorKey === "white" ? 0.7 : 1.0,
    roughness: 0.34
  });
}
