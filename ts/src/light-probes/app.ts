import type { ImageResource, LightProbe, Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  LIGHT_PROBE_SH_FLOATS,
  addNodeChild,
  captureBitmapFromImageResource,
  createAabb,
  createAmbientLight,
  createFxaaEffect,
  createHemisphereLight,
  createLightProbe,
  createLightProbeGrid,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createStandardPbrMaterial,
  createImageResource,
  createTexture,
  createToneMapEffect,
  createVector3,
  evaluateLightProbeSh,
  findNode,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  packLinearToColor,
  sampleLightProbeGrid,
  setCamera3DViewMatrix4FromLookAt,
  setLightProbeShFromColors,
  setQuaternionFromAxisAngle,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';

import { createCameraFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const assetRoot = 'away3d/LightProbes/';
const faceNames = ['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'] as const;
// Away3D's +Z points into the screen. The two Z directions therefore swap meaning in Flight's
// right-handed world; face orientation does not affect the mean radiance projected here.
const faceDirections = new Float32Array([
  1, 0, 0,
  -1, 0, 0,
  0, 1, 0,
  0, -1, 0,
  0, 0, -1,
  0, 0, 1,
]);

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x151515ff,
  effects: [createToneMapEffect({ exposure: 1.15 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ near: 20, far: 2000 });

// This port lays the scene out 3.2x larger than the original: its probes sit at +/-240 where the
// original's sit at +/-75. Distances taken from the original are scaled by that factor so the
// camera drift, head speed and head clamp all keep their original proportions.
const SCENE_SCALE = 240 / 75;

function srgbToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function averageLinearRgb(image: ImageResource): [number, number, number] {
  const bitmap = captureBitmapFromImageResource(ctx.host, image);
  if (!bitmap) throw new Error('The web host cannot read a light-probe cube face.');
  const data = bitmap.data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  // These maps are already low-frequency diffuse captures. Sampling every fourth texel keeps startup
  // light while preserving their directional room colour.
  for (let i = 0; i < data.length; i += 16) {
    red += srgbToLinear(data[i]!);
    green += srgbToLinear(data[i + 1]!);
    blue += srgbToLinear(data[i + 2]!);
    samples++;
  }
  return [red / samples, green / samples, blue / samples];
}

async function loadProbe(folder: string, x: number, z: number): Promise<LightProbe> {
  const images = await Promise.all(
    faceNames.map((face) => loadImageResourceFromUrl(ctx.host, `${assetRoot}cornellEnvMap/${folder}/${face}.jpg`)),
  );
  const colors = new Float32Array(18);
  for (let face = 0; face < images.length; face++) {
    colors.set(averageLinearRgb(images[face]!), face * 3);
  }
  const probe = createLightProbe(createVector3(x, 180, z));
  setLightProbeShFromColors(probe, colors, faceDirections);
  return probe;
}

// X-fastest, then Z, matching createLightProbeGrid's lattice order.
const probeGrid = createLightProbeGrid(
  await Promise.all([
    loadProbe('negXnegZ', -240, -240),
    loadProbe('posXnegZ', 240, -240),
    loadProbe('negXposZ', -240, 240),
    loadProbe('posXposZ', 240, 240),
  ]),
  createAabb(-240, 0, -240, 240, 400, 240),
  createVector3(2, 1, 2),
);

const keyLight = createPointLightFromAway({
  color: 0xffffff,
  diffuse: 1,
  range: 950,
  referenceDistance: 300,
  shading: 'pbr',
});
setVector3(keyLight.position, 0, 420, 0);
const probeLight = createHemisphereLight({
  skyColor: 0xffffffff,
  groundColor: 0x303030ff,
  intensity: 1.35,
});
const lights = createScene3DLights({
  ambient: createAmbientLight({ intensity: 0.03 }),
  hemisphere: [probeLight],
  point: [keyLight],
});

const [roomObj, headObj, roomImage, roomNormal, diffuse, normal, ao] = await Promise.all([
  fetch(`${assetRoot}cornell.obj`).then((response) => response.text()),
  fetch(`${assetRoot}head.obj`).then((response) => response.text()),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}cornell_baked.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}cornellWallNormals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}head_diffuse.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}head_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}head_AO.jpg`),
]);
const roomScene = createScene3DFromObj(roomObj);
const room = findNode(roomScene.root, isMesh) as Mesh | null;
if (room) {
  room.materials = [createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: createTexture({ source: roomImage }),
    // The original gives the Cornell box a normal map; without it the walls read flat.
    normalMap: createTexture({ source: roomNormal, colorSpace: 'linear' }),
    metallic: 0,
    roughness: 0.92,
  })];
  setVector3(room.scale, 380, 380, 380);
  invalidateNodeLocalTransform(room);
  addNodeChild(scene.root, room);
}

const headScene = createScene3DFromObj(headObj);
const loadedHead = findNode(headScene.root, isMesh) as Mesh | null;
if (!loadedHead) throw new Error('head.obj contains no mesh.');
const head: Mesh = loadedHead;
const headMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: diffuse }),
  normalMap: createTexture({ source: normal, colorSpace: 'linear' }),
  occlusionMap: createTexture({ source: ao, colorSpace: 'linear' }),
  metallic: 0.05,
  roughness: 0.3,
});
head.materials = [headMaterial];
setVector3(head.scale, 85, 85, 85);
invalidateNodeLocalTransform(head);
addNodeChild(scene.root, head);

const sampledSh = new Float32Array(LIGHT_PROBE_SH_FLOATS);
const sky = new Float32Array(3);
const ground = new Float32Array(3);
const up = createVector3(0, 1, 0);
const down = createVector3(0, -1, 0);
function packProbeColor(rgb: Float32Array): number {
  return packLinearToColor([
    Math.max(0, Math.min(1, rgb[0]!)),
    Math.max(0, Math.min(1, rgb[1]!)),
    Math.max(0, Math.min(1, rgb[2]!)),
    1,
  ]);
}

// Stands in for the original's AwayStats overlay.
let triangleCount = 0;
walkNodeDescendants(scene.root, (node) => {
  if (isMesh(node) && node.geometry) {
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
  position: 'fixed', left: '10px', top: '10px', zIndex: '2', color: '#fff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textShadow: '0 1px 3px #000',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

// The head is driven entirely by input, exactly as in the original: arrow keys walk it around the
// floor, and dragging spins it. It does not drift on its own.
const HEAD_SPEED = 2 * SCENE_SCALE;
const HEAD_LIMIT = 75 * SCENE_SCALE;
let xDir = 0;
let zDir = 0;
let headYaw = 0;
const yAxis = createVector3(0, 1, 0);
setVector3(head.position, 0, 0, 0);
invalidateNodeLocalTransform(head);

window.addEventListener('keydown', (event) => {
  if (event.code === 'ArrowUp') zDir = 1;
  else if (event.code === 'ArrowDown') zDir = -1;
  else if (event.code === 'ArrowLeft') xDir = -1;
  else if (event.code === 'ArrowRight') xDir = 1;
  else return;
  event.preventDefault();
});
// Space swaps the head between its photographic diffuse map and a flat 0xbbbbaa surface, which is
// how the original lets you see the probe contribution on its own without the texture confusing it.
const headTexture = createTexture({ source: diffuse });
const neutralCanvas = document.createElement('canvas');
neutralCanvas.width = 512;
neutralCanvas.height = 512;
const neutralContext = neutralCanvas.getContext('2d')!;
neutralContext.fillStyle = '#bbbbaa';
neutralContext.fillRect(0, 0, 512, 512);
const neutralTexture = createTexture({ source: createImageResource(neutralCanvas) });
let showingNeutral = false;

window.addEventListener('keyup', (event) => {
  if (event.code === 'ArrowUp' || event.code === 'ArrowDown') zDir = 0;
  else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') xDir = 0;
  else if (event.code === 'Space') {
    showingNeutral = !showingNeutral;
    headMaterial.baseColorMap = showingNeutral ? neutralTexture : headTexture;
  }
});

// Camera drift follows the pointer and eases back to centre, and always looks at the head — the
// original's LookAtController is bound to the head mesh, not to the origin.
let pointerX = window.innerWidth * 0.5;
let pointerY = window.innerHeight * 0.5;
let dragging = false;
let referencePointerX = 0;
let cameraX = 0;
let cameraY = 0;
const cameraEye = createVector3(0, 0, 0);
const cameraUp = createVector3(0, 1, 0);

window.addEventListener('mousemove', (event) => {
  pointerX = event.clientX;
  pointerY = event.clientY;
  if (dragging) {
    // Away3D is left-handed, so the original's `rotationY +=` becomes a negated yaw here.
    headYaw -= ((referencePointerX - pointerX) / 5) * Math.PI / 180;
    referencePointerX = pointerX;
  }
});
ctx.canvas.addEventListener('mousedown', (event) => {
  dragging = true;
  referencePointerX = event.clientX;
});
window.addEventListener('mouseup', () => { dragging = false; });

function frame(time: number): void {
  framesThisSecond++;
  if (time - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (time - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = time;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;

  if (!dragging) {
    cameraX = cameraX * 0.9 + (window.innerWidth * 0.5 - pointerX) * 0.05 * SCENE_SCALE;
    cameraY = cameraY * 0.9 + (window.innerHeight * 0.5 - pointerY) * 0.05 * SCENE_SCALE;
  }

  const nextX = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, head.position.x + xDir * HEAD_SPEED));
  const nextZ = Math.max(-HEAD_LIMIT, Math.min(HEAD_LIMIT, head.position.z + zDir * HEAD_SPEED));
  setVector3(head.position, nextX, head.position.y, nextZ);
  setQuaternionFromAxisAngle(head.rotation, yAxis, headYaw);
  invalidateNodeLocalTransform(head);

  if (sampleLightProbeGrid(sampledSh, head.position, probeGrid)) {
    evaluateLightProbeSh(sky, up, sampledSh);
    evaluateLightProbeSh(ground, down, sampledSh);
    probeLight.skyColor = packProbeColor(sky);
    probeLight.groundColor = packProbeColor(ground);
  }

  // The original's camera sits at a fixed z and is aimed at the head every frame.
  setVector3(cameraEye, cameraX, cameraY, 300 * SCENE_SCALE);
  setCamera3DViewMatrix4FromLookAt(camera, cameraEye, head.position, cameraUp);

  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio;
  ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`;
  ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});

requestAnimationFrame(frame);
