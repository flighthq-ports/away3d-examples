import type { Mesh, MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentCaptureIbl,
  bakeGlEnvironmentIbl,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createAmbientLight,
  createEnvironment,
  createFxaaEffect,
  createGlCubeRenderTarget,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createVector3,
  findNode,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  renderGlEnvironmentCapture,
  scaleMeshGeometryUvs,
  setMeshGeometryVertexPosition,
  setQuaternionFromEuler,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const MAX_SPEED = 1;
const MAX_ROTATION_SPEED = 10;
const DRAG = 0.95;
const ACCELERATION = 0.5;
const ROTATION_ACCELERATION = 0.5;
const TERRAIN_SIZE = 5000;
const TERRAIN_HEIGHT = 300;

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x5f5e6eff,
  effects: [createToneMapEffect({ exposure: 1.05 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ near: 20, far: 4000 });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 600,
  panAngle: 90,
  tiltAngle: 10,
  minTiltAngle: 2,
  maxTiltAngle: 90,
  targetY: 120,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 350, maxDistance: 1100 });

const awayLight = createDirectionalLightFromAway({
  direction: { x: -1, y: -2, z: 1 },
  color: 0xeedddd,
  diffuse: 1.15,
  ambient: 0.42,
  ambientColor: 0x808090,
});
const lights = createScene3DLights({
  ambient: awayLight.ambient ?? createAmbientLight({ color: 0x808090, intensity: 0.42 }),
  directional: awayLight.directional,
});

const root = 'away3d/RealTimeEnvMap/';
const [faceImages, heightImage, aridImage, r2Image, headObj, r2Obj] = await Promise.all([
  Promise.all(
    ['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'].map((face) =>
      loadImageResourceFromUrl(ctx.host, `${root}skybox/sky_${face}.jpg`),
    ),
  ),
  loadImageResourceFromUrl(ctx.host, `${root}desertHeightMap.jpg`),
  loadImageResourceFromUrl(ctx.host, `${root}arid.jpg`),
  loadImageResourceFromUrl(ctx.host, `${root}r2d2_diffuse.jpg`),
  fetch(`${root}head.obj`).then((response) => response.text()),
  fetch(`${root}R2D2.obj`).then((response) => response.text()),
]);

const skyEnvironment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, faceImages),
  intensity: 1.2,
});
bakeGlEnvironmentIbl(ctx.state, skyEnvironment);

if (!heightImage.source) throw new Error('The desert heightmap has no drawable image source');
const heightCanvas = document.createElement('canvas');
heightCanvas.width = heightImage.width;
heightCanvas.height = heightImage.height;
const heightContext = heightCanvas.getContext('2d', { willReadFrequently: true });
if (!heightContext) throw new Error('A 2D canvas is required to decode the desert heightmap');
heightContext.drawImage(heightImage.source, 0, 0);
const heightPixels = heightContext.getImageData(0, 0, heightCanvas.width, heightCanvas.height).data;

function terrainHeight(x: number, z: number): number {
  const u = Math.max(0, Math.min(1, x / TERRAIN_SIZE + 0.5));
  const v = Math.max(0, Math.min(1, z / TERRAIN_SIZE + 0.5));
  const px = Math.min(heightCanvas.width - 1, Math.floor(u * heightCanvas.width));
  const py = Math.min(heightCanvas.height - 1, Math.floor((1 - v) * heightCanvas.height));
  return (heightPixels[(py * heightCanvas.width + px) * 4]! / 255) * TERRAIN_HEIGHT - 3;
}

const desertGeometry: MeshGeometry = createPlaneMeshGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 160, 160);
const terrainVertex = createVector3();
for (let i = 0; i < getMeshGeometryVertexCount(desertGeometry); i++) {
  getMeshGeometryVertexPosition(terrainVertex, desertGeometry, i);
  setMeshGeometryVertexPosition(
    desertGeometry,
    i,
    terrainVertex.x,
    terrainHeight(terrainVertex.x, terrainVertex.z),
    terrainVertex.z,
  );
}
computeMeshGeometryNormals(desertGeometry, desertGeometry);
computeMeshGeometryTangents(desertGeometry, desertGeometry);
scaleMeshGeometryUvs(desertGeometry, 25, 25);
invalidateMeshGeometry(desertGeometry);
const desertSampler = createTilingSampler();
const desert = createMesh(desertGeometry, [
  createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: createTexture({ source: aridImage, sampler: desertSampler }),
    metallic: 0,
    roughness: 0.92,
  }),
]);
addNodeChild(scene.root, desert);

const headScene = createScene3DFromObj(headObj);
const headCandidate = findNode(headScene.root, isMesh) as Mesh | null;
if (!headCandidate) throw new Error('head.obj contains no mesh');
const head: Mesh = headCandidate;
head.materials = [
  createStandardPbrMaterial({
    baseColor: 0x18202aff,
    metallic: 1,
    roughness: 0.08,
  }),
];
setVector3(head.scale, 60, 60, 60);
setVector3(head.position, 0, 180, 0);
setQuaternionFromEuler(head.rotation, 0, -Math.PI / 2, 0);
invalidateNodeLocalTransform(head);
addNodeChild(scene.root, head);

const r2Scene = createScene3DFromObj(r2Obj);
const r2Material = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: r2Image }),
  metallic: 0.25,
  roughness: 0.42,
});
walkNodeDescendants(r2Scene.root, (node) => {
  if (isMesh(node)) node.materials = [r2Material];
  return true;
});
setVector3(r2Scene.root.scale, 5, 5, 5);
setVector3(r2Scene.root.position, 200, terrainHeight(200, 0) + 30, 0);
invalidateNodeLocalTransform(r2Scene.root);
addNodeChild(scene.root, r2Scene.root);

const captureTarget = createGlCubeRenderTarget(ctx.state, 128);
const capturePosition = createVector3(0, 100, 0);
let captureCountdown = 0;
function captureEnvironment(): void {
  renderGlEnvironmentCapture(ctx.state, capturePosition, scene.root, lights, captureTarget, {
    near: 50,
    far: 3000,
    excludeNode: head,
  });
  bakeGlEnvironmentCaptureIbl(ctx.state, captureTarget, 1.2);
}

const keys = new Set<string>();
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
window.addEventListener('keydown', (event) => {
  if (movementKeys.has(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => {
  if (movementKeys.has(event.code)) {
    keys.delete(event.code);
    event.preventDefault();
  }
});

let speed = 0;
let rotationSpeed = 0;
let heading = 0;
let previousTime = performance.now();
function frame(timestamp: number): void {
  const frames = Math.min(3, (timestamp - previousTime) / (1000 / 60));
  previousTime = timestamp;

  const forwardInput = Number(keys.has('KeyW') || keys.has('ArrowUp'))
    - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const turnInput = Number(keys.has('KeyD') || keys.has('ArrowRight'))
    - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const drag = Math.pow(DRAG, frames);
  speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed * drag + forwardInput * ACCELERATION * frames));
  rotationSpeed = Math.max(
    -MAX_ROTATION_SPEED,
    Math.min(MAX_ROTATION_SPEED, rotationSpeed * drag + turnInput * ROTATION_ACCELERATION * frames),
  );

  heading += rotationSpeed * frames * Math.PI / 180;
  r2Scene.root.position.x += Math.sin(heading) * speed * frames;
  r2Scene.root.position.z += Math.cos(heading) * speed * frames;
  const radius = Math.hypot(r2Scene.root.position.x, r2Scene.root.position.z);
  if (radius > 0 && (radius < 200 || radius > 500)) {
    const constrainedRadius = Math.max(200, Math.min(500, radius));
    r2Scene.root.position.x *= constrainedRadius / radius;
    r2Scene.root.position.z *= constrainedRadius / radius;
  }
  r2Scene.root.position.y = terrainHeight(r2Scene.root.position.x, r2Scene.root.position.z) + 30;
  setQuaternionFromEuler(r2Scene.root.rotation, 0, heading, 0);
  invalidateNodeLocalTransform(r2Scene.root);

  orbit.panAngle = Math.PI / 2 - Math.atan2(r2Scene.root.position.z, r2Scene.root.position.x);
  orbit.update();

  if (captureCountdown <= 0) {
    captureEnvironment();
    captureCountdown = 5;
  } else {
    captureCountdown--;
  }
  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

const help = document.createElement('div');
help.textContent = 'WASD / arrows: drive R2D2 · drag: move camera · live environment capture';
Object.assign(help.style, {
  position: 'fixed',
  left: '16px',
  top: '14px',
  color: '#fff',
  font: '14px system-ui',
  textShadow: '0 1px 4px #000',
  pointerEvents: 'none',
});
document.body.appendChild(help);

window.addEventListener('resize', () => {
  const width = innerWidth;
  const height = innerHeight;
  const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio;
  ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`;
  ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});

requestAnimationFrame(frame);
