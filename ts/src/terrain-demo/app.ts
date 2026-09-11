import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createEnvironment,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DLights,
  createScreenSpaceFogEffect,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createVector3,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  scaleMeshGeometryUvs,
  setMeshGeometryVertexPosition,
  setTextureUvOffset,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { awayDirection, createCameraFromAway, createFirstPersonControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createScene3DContext } from './renderer';

// Scene constants from the original. Elevation(terrain, heights, 5000, 1300, 5000, 250, 250) at
// y = 0, water at y = 285, camera.y = 300 with lens near 1 / far 4000.
const CAMERA_NEAR = 1;
const CAMERA_FAR = 4000;
const TERRAIN_SIZE = 5000;
const TERRAIN_HEIGHT = 1300;
const TERRAIN_SEGMENTS = 250;
const WATER_Y = 285;
// FogMethod(0, 8000, 0xcfd9de). Clear colour and fog are consumed as LINEAR values.
const FOG_COLOR = 0xcfd9de;
// The effect ramps over NON-LINEAR window depth, and a near plane of 1 crushes that range hard —
// depth(100) is already 0.990. So the haze window is chosen against that curve rather than by
// transplanting the original's world-linear 0..8000.
const FOG_VISIBLE_NEAR = 500;

function linearChannel(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function linearRgba(srgb: number): number {
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    out = (out << 8) | Math.round(linearChannel((srgb >> shift) & 0xff) * 255);
  }
  return ((out << 8) | 0xff) >>> 0;
}
function depthAt(distance: number): number {
  const d = Math.max(distance, CAMERA_NEAR);
  return (CAMERA_FAR * (d - CAMERA_NEAR)) / (d * (CAMERA_FAR - CAMERA_NEAR));
}

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: linearRgba(FOG_COLOR),
  effects: [
    createScreenSpaceFogEffect({
      color: linearRgba(FOG_COLOR),
      near: depthAt(FOG_VISIBLE_NEAR),
      far: depthAt(CAMERA_FAR),
      density: 1,
    }),
    createToneMapEffect({ exposure: 1.05 }),
    createFxaaEffect(),
  ],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: CAMERA_FAR, near: CAMERA_NEAR });
// FirstPersonController(camera, 180, 0, -80, 80) with camera.y = 300 and no x/z set.
const controller = createFirstPersonControllerFromAway(camera, {
  x: 0, y: 300, z: 0, yaw: 180, pitch: 0, minPitch: -80, maxPitch: 80,
});
// DirectionalLight(-300, -300, -5000), colour 0xfffdc5, ambient 1; the terrain material carries
// ambientColor 0x303040 at ambient 1.
const light = createDirectionalLightFromAway({
  direction: awayDirection(-300, -300, -5000),
  diffuse: 1.35,
  ambient: 1,
  ambientColor: 0x303040,
  color: 0xfffdc5,
});
const lights = createScene3DLights({ ambient: light.ambient, directional: light.directional });
const assetRoot = 'away3d/TerrainDemo/';
const SKY_FACES = ['positive_x', 'negative_x', 'positive_y', 'negative_y', 'positive_z', 'negative_z'];
const [heightImage, terrainImage, normalImage, waterNormalImage, ...skyFaces] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/terrain_heights.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/terrain_diffuse.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/terrain_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}water_normals.jpg`),
  ...SKY_FACES.map((face) => loadImageResourceFromUrl(ctx.host, `${assetRoot}skybox/snow_${face}.jpg`)),
]);

if (!heightImage.source) throw new Error('The terrain heightmap has no drawable image source');
const heightCanvas = document.createElement('canvas');
heightCanvas.width = heightImage.width; heightCanvas.height = heightImage.height;
const heightContext = heightCanvas.getContext('2d', { willReadFrequently: true });
if (!heightContext) throw new Error('A 2D canvas is required to decode the heightmap');
heightContext.drawImage(heightImage.source, 0, 0);
const heightPixels = heightContext.getImageData(0, 0, heightCanvas.width, heightCanvas.height).data;

// SkyBox(cubeTexture) over the same snow cube the water reflects. The port loaded none of these
// faces, so the sky was a flat clear colour and the water had nothing to mirror.
const environment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, skyFaces),
  intensity: 1,
});
bakeGlEnvironmentIbl(ctx.state, environment);

const terrainSize = TERRAIN_SIZE;
// Elevation reads one texel per vertex, at row `(segmentsH - zi)` — a row that counts DOWN as
// Away3D z rises. This port negates z against Away3D, so the row must count UP with Flight z;
// sampling `1 - v` mirrors the whole terrain front-to-back.
function terrainHeight(x: number, z: number): number {
  const u = Math.max(0, Math.min(1, x / terrainSize + 0.5));
  const v = Math.max(0, Math.min(1, z / terrainSize + 0.5));
  const px = Math.min(heightCanvas.width - 1, Math.floor(u * (heightCanvas.width - 1)));
  const py = Math.min(heightCanvas.height - 1, Math.floor(v * (heightCanvas.height - 1)));
  return (heightPixels[(py * heightCanvas.width + px) * 4]! / 255) * TERRAIN_HEIGHT;
}

const terrainGeometry: MeshGeometry = createPlaneMeshGeometry(terrainSize, terrainSize, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
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
scaleMeshGeometryUvs(waterGeometry, 50, 50);
// The original's water is `new BitmapData(512, 512, true, 0xaa404070)` — an ARGB literal, so
// alpha 0xaa over a dark blue-grey 0x404070 — with alphaBlending, a fresnel specular method and
// an EnvMapMethod over the same snow cube. The port read that as RGBA: a bright cyan 0x3d92b0 at
// half alpha, and made it metallic 0.72, which leaves a metal almost no diffuse. Against a pale
// foggy sky the result was invisible; the lake simply was not there.
const water = createMesh(waterGeometry, [createStandardPbrMaterial({
  baseColor: 0x404070aa,
  normalMap: waterTexture,
  metallic: 0,
  roughness: 0.08,
  alphaMode: 'blend',
  doubleSided: true,
})]);
setVector3(water.position, 0, WATER_Y, 0); invalidateNodeLocalTransform(water); addNodeChild(scene.root, water);

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
  const groundY = terrainHeight(controller.position.x, controller.position.z) + 20;
  controller.position.y += (groundY - controller.position.y) * Math.min(1, seconds * 5);
  controller.update();
  framesThisSecond++;
  if (ts - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (ts - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = ts;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;
  setTextureUvOffset(waterTexture, ts * 0.000025, ts * -0.000018);
  ctx.render(scene.root, camera, lights, environment);
  requestAnimationFrame(frame);
}

// The original's instructions, verbatim (its drop-shadow filter line is commented out).
const help = document.createElement('div');
help.textContent = 'Mouse click and drag - rotate\nCursor keys / WSAD - move';
Object.assign(help.style, {
  position: 'fixed', left: '0px', top: '0px', zIndex: '2', color: '#ffffff',
  font: '11px sans-serif', whiteSpace: 'pre', pointerEvents: 'none',
});
document.body.appendChild(help);

// Stands in for AwayStats, which this sample moves to the top right in onResize
// (`awayStats.x = stage.stageWidth - awayStats.width`).
let triangleCount = 0;
walkNodeDescendants(scene.root, (node) => {
  if (isMesh(node) && node.geometry && node.geometry.topology === 'triangle-list') {
    const geometry = node.geometry;
    const indexed = geometry.indices !== null
      ? geometry.indices.length
      : geometry.vertices.length / (geometry.layout.stride / 4);
    triangleCount += Math.floor(indexed / 3);
  }
  return true;
});
const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', right: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textAlign: 'right',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;
window.addEventListener('resize', () => {
  const width = innerWidth; const height = innerHeight; const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio; ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`; ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});
requestAnimationFrame(frame);
