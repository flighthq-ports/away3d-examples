import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createVector3,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  scaleMeshGeometryUvs,
  setMeshGeometryVertexPosition,
  setTextureUvOffset,
  setVector3,
} from '@flighthq/sdk';
import { createCameraFromAway, createFirstPersonControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0xbcd5e6ff,
  effects: [createToneMapEffect({ exposure: 1.05 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 9000, near: 5 });
const controller = createFirstPersonControllerFromAway(camera, { x: 0, y: 450, z: -1800, yaw: 180, pitch: 8 });
const light = createDirectionalLightFromAway({
  direction: { x: -0.45, y: -1, z: -0.2 }, diffuse: 1.35, ambient: 0.2, color: 0xfff1d0,
});
const lights = createScene3DLights({ ambient: light.ambient, directional: light.directional });
const assetRoot = 'away3d/TerrainDemo/';
const [heightImage, terrainImage, normalImage, waterNormalImage] = await Promise.all([
  loadImageResourceFromUrl(`${assetRoot}terrain/terrain_heights.jpg`),
  loadImageResourceFromUrl(`${assetRoot}terrain/terrain_diffuse.jpg`),
  loadImageResourceFromUrl(`${assetRoot}terrain/terrain_normals.jpg`),
  loadImageResourceFromUrl(`${assetRoot}water_normals.jpg`),
]);

if (!heightImage.source) throw new Error('The terrain heightmap has no drawable image source');
const heightCanvas = document.createElement('canvas');
heightCanvas.width = heightImage.width; heightCanvas.height = heightImage.height;
const heightContext = heightCanvas.getContext('2d', { willReadFrequently: true });
if (!heightContext) throw new Error('A 2D canvas is required to decode the heightmap');
heightContext.drawImage(heightImage.source, 0, 0);
const heightPixels = heightContext.getImageData(0, 0, heightCanvas.width, heightCanvas.height).data;

const terrainSize = 5200;
function terrainHeight(x: number, z: number): number {
  const u = Math.max(0, Math.min(1, x / terrainSize + 0.5));
  const v = Math.max(0, Math.min(1, z / terrainSize + 0.5));
  const px = Math.min(heightCanvas.width - 1, Math.floor(u * heightCanvas.width));
  const py = Math.min(heightCanvas.height - 1, Math.floor((1 - v) * heightCanvas.height));
  return (heightPixels[(py * heightCanvas.width + px) * 4]! / 255) * 920 - 80;
}

const terrainGeometry: MeshGeometry = createPlaneMeshGeometry(terrainSize, terrainSize, 128, 128);
const vertex = createVector3();
for (let i = 0; i < getMeshGeometryVertexCount(terrainGeometry); i++) {
  getMeshGeometryVertexPosition(vertex, terrainGeometry, i);
  setMeshGeometryVertexPosition(terrainGeometry, i, vertex.x, terrainHeight(vertex.x, vertex.z), vertex.z);
}
computeMeshGeometryNormals(terrainGeometry, terrainGeometry);
computeMeshGeometryTangents(terrainGeometry, terrainGeometry);
invalidateMeshGeometry(terrainGeometry);
const terrain = createMesh(terrainGeometry, [createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: terrainImage }),
  normalMap: createTexture({ source: normalImage, colorSpace: 'linear' }),
  metallic: 0,
  roughness: 0.96,
})]);
addNodeChild(scene.root, terrain);

const waterSampler = createTilingSampler();
const waterTexture = createTexture({ source: waterNormalImage, colorSpace: 'linear', sampler: waterSampler });
const waterGeometry = createPlaneMeshGeometry(terrainSize, terrainSize);
scaleMeshGeometryUvs(waterGeometry, 24, 24);
const water = createMesh(waterGeometry, [createStandardPbrMaterial({
  baseColor: 0x3d92b080, normalMap: waterTexture, metallic: 0.72, roughness: 0.12,
  alphaMode: 'blend', doubleSided: true,
})]);
setVector3(water.position, 0, 205, 0); invalidateNodeLocalTransform(water); addNodeChild(scene.root, water);

const keys = new Set<string>();
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));
let dragging = false; let lastX = 0; let lastY = 0;
ctx.canvas.addEventListener('pointerdown', (event) => { dragging = true; lastX = event.clientX; lastY = event.clientY; ctx.canvas.setPointerCapture(event.pointerId); });
ctx.canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  controller.yaw -= (event.clientX - lastX) * 0.004;
  controller.pitch += (event.clientY - lastY) * 0.003;
  lastX = event.clientX; lastY = event.clientY;
});
ctx.canvas.addEventListener('pointerup', (event) => { dragging = false; ctx.canvas.releasePointerCapture(event.pointerId); });

const forward = createVector3(); const right = createVector3();
let previousTime = performance.now();
function frame(ts: number): void {
  const seconds = Math.min(0.05, (ts - previousTime) / 1000); previousTime = ts;
  controller.forward(forward); controller.right(right);
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1050 : 480) * seconds;
  const forwardInput = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const rightInput = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  controller.position.x += forward.x * forwardInput * speed + right.x * rightInput * speed;
  controller.position.z += forward.z * forwardInput * speed + right.z * rightInput * speed;
  controller.position.x = Math.max(-2500, Math.min(2500, controller.position.x));
  controller.position.z = Math.max(-2500, Math.min(2500, controller.position.z));
  const groundY = terrainHeight(controller.position.x, controller.position.z) + 70;
  controller.position.y += (groundY - controller.position.y) * Math.min(1, seconds * 5);
  controller.update();
  setTextureUvOffset(waterTexture, ts * 0.000025, ts * -0.000018);
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}

const help = document.createElement('div');
help.textContent = 'WASD / arrows to explore · Shift to run · drag to look';
Object.assign(help.style, { position: 'fixed', left: '18px', top: '16px', color: '#fff', font: '14px system-ui', textShadow: '0 1px 5px #000', pointerEvents: 'none' });
document.body.appendChild(help);
window.addEventListener('resize', () => {
  const width = innerWidth; const height = innerHeight; const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio; ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`; ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});
requestAnimationFrame(frame);
