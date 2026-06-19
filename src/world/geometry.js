export function addUv2(geometry) {
  if (geometry.attributes.uv && !geometry.attributes.uv2) {
    geometry.setAttribute("uv2", geometry.attributes.uv.clone());
  }
  return geometry;
}
