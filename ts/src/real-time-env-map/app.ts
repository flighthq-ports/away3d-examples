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
  beginGlCubeRenderFace,
  drawGlEnvironmentSkybox,
  drawGlScene3D,
  endGlCubeRenderFace,
  getCubeCaptureFaceCamera3D,
  createCamera3D,
  createPerspectiveProjection,
  createScreenSpaceFogEffect,
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
const TERRAIN_SEGMENTS = 250;
const CAMERA_NEAR = 20;
const CAMERA_FAR = 4000;
// FogMethod(500, 2000, 0x5f5e6e).
const FOG_COLOR = 0x5f5e6e;
const FOG_FAR = 2000;
// The fog effect ramps over NON-LINEAR window depth, so the original's world-linear near endpoint
// cannot be transplanted literally - depth saturates so fast that 500 would haze the subject.
// This window is chosen for that ramp instead: clear around the head, hazing toward the far dunes.
const FOG_VISIBLE_NEAR = 900;

// Clear colour and fog are consumed as linear values, so the sRGB constants are converted.
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
      far: depthAt(FOG_FAR),
      density: 1,
    }),
    createToneMapEffect({ exposure: 1.05 }),
    createFxaaEffect(),
  ],
});
const scene = createScene3D();
const camera = createCameraFromAway({ near: CAMERA_NEAR, far: CAMERA_FAR });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 600,
  panAngle: 90,
  tiltAngle: 10,
  minTiltAngle: 2,
  maxTiltAngle: 90,
  targetY: 120,
  // cameraController.wrapPanAngle = true. The pan target below is atan2-derived, so it jumps
  // 2*PI across the branch cut; without this the eased camera glides the long way round every
  // time R2D2 completes a lap.
  wrapPanAngle: true,
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

// Elevation reads one texel per vertex, at row `(segmentsH - zi)` — a row that counts DOWN as
// Away3D z rises. This port negates z against Away3D, so the row must count UP with Flight z;
// sampling `1 - v` mirrors the whole terrain front-to-back.
function terrainHeight(x: number, z: number): number {
  const u = Math.max(0, Math.min(1, x / TERRAIN_SIZE + 0.5));
  const v = Math.max(0, Math.min(1, z / TERRAIN_SIZE + 0.5));
  const px = Math.min(heightCanvas.width - 1, Math.floor(u * (heightCanvas.width - 1)));
  const py = Math.min(heightCanvas.height - 1, Math.floor(v * (heightCanvas.height - 1)));
  return (heightPixels[(py * heightCanvas.width + px) * 4]! / 255) * TERRAIN_HEIGHT - 3;
}

const desertGeometry: MeshGeometry = createPlaneMeshGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
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
// ColorMaterial(0x000000) + FresnelEnvMapMethod(normalReflectance .6, fresnelPower 2): a black
// base whose reflection is fresnel-weighted, so it is ~60% reflective face-on and mirror-like at
// grazing angles. A metal's baseColor IS its F0, so 0.6 grey reproduces that directly — the old
// near-black baseColor tinted the reflection to nothing, which is why the head rendered black.
head.materials = [
  createStandardPbrMaterial({
    baseColor: 0xccccccff,
    metallic: 1,
    roughness: 0.05,
  }),
];
setVector3(head.scale, 60, 60, 60);
setVector3(head.position, 0, 180, 0);
// The original sets head.rotationY = -90. This port negates Away3D's z, which reverses the sense
// of a rotation about Y, so the sign flips here - otherwise the head faces away from the camera.
setQuaternionFromEuler(head.rotation, 0, Math.PI / 2, 0);
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

// CubeReflectionTexture(256), near 50, far 3000, centred on the head at (0, 100, 0).
const captureTarget = createGlCubeRenderTarget(ctx.state, 256);
const capturePosition = createVector3(0, 100, 0);
// renderGlEnvironmentCapture draws only the scene graph, and Flight's skybox is not a scene node —
// so using it captures a black sky and the head reflects almost nothing. Away3D gets this for free
// because its SkyBox IS a scene child, and `reflectionTexture.render(view)` therefore includes it.
// The six faces are driven here instead so the sky can be drawn into each one.
const captureCamera = createCamera3D({
  near: 50,
  far: 3000,
  projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI * 0.5 }),
});
// The six face renders and the IBL bake have very different costs — measured here the faces are
// ~44ms (the whole 178k-triangle scene, six times over) and the bake ~0.3ms — and very different
// constraints. The bake must run EVERY frame or the skybox's revision bump leaves the IBL stale
// and the head goes black (see renderer.ts). The faces only have to be fresh enough to read as
// live, and re-baking a slightly stale capture costs nothing, so the two run on separate cadences.
const CAPTURE_FACE_INTERVAL = 4;
let captureFaceCountdown = 0;
function captureEnvironment(): void {
  if (captureFaceCountdown <= 0) {
    renderCaptureFaces();
    captureFaceCountdown = CAPTURE_FACE_INTERVAL;
  } else {
    captureFaceCountdown--;
  }
  bakeGlEnvironmentCaptureIbl(ctx.state, captureTarget, 1.2);
}

function renderCaptureFaces(): void {
  // The head must not reflect itself.
  head.enabled = false;
  try {
    for (let face = 0; face < 6; face++) {
      getCubeCaptureFaceCamera3D(captureCamera, capturePosition, face);
      beginGlCubeRenderFace(ctx.state, captureTarget, face);
      try {
        drawGlEnvironmentSkybox(ctx.state, skyEnvironment, captureCamera, 1);
        drawGlScene3D(ctx.state, scene.root, captureCamera, lights);
      } finally {
        endGlCubeRenderFace(ctx.state);
      }
    }
  } finally {
    head.enabled = true;
  }
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

  framesThisSecond++;
  if (timestamp - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (timestamp - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = timestamp;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;

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

  // The original steers with `r2d2.rotationY += _rotationSpeed` and `r2d2.moveForward(_speed)`,
  // which walks along the mesh's local +Z. This port negates Away3D's z, and that reverses both the
  // sense of a rotation about Y and the world direction local +Z points in, so both are negated.
  heading -= rotationSpeed * frames * Math.PI / 180;
  r2Scene.root.position.x -= Math.sin(heading) * speed * frames;
  r2Scene.root.position.z -= Math.cos(heading) * speed * frames;
  const radius = Math.hypot(r2Scene.root.position.x, r2Scene.root.position.z);
  if (radius > 0 && (radius < 200 || radius > 500)) {
    const constrainedRadius = Math.max(200, Math.min(500, radius));
    r2Scene.root.position.x *= constrainedRadius / radius;
    r2Scene.root.position.z *= constrainedRadius / radius;
  }
  r2Scene.root.position.y = terrainHeight(r2Scene.root.position.x, r2Scene.root.position.z) + 30;
  setQuaternionFromEuler(r2Scene.root.rotation, 0, heading, 0);
  invalidateNodeLocalTransform(r2Scene.root);

  // `cameraController.panAngle = 90 - 180*atan2(r2d2.z, r2d2.x)/PI`, with z negated for Flight.
  orbit.panAngle = Math.PI / 2 + Math.atan2(r2Scene.root.position.z, r2Scene.root.position.x);
  orbit.update();

  // The original re-renders its CubeReflectionTexture every frame (`reflectionTexture.render(view)`),
  // and so must this: see the note in renderer.ts for why skipping a frame blacks out the head.
  ctx.render(scene.root, camera, lights, skyEnvironment, captureEnvironment);
  requestAnimationFrame(frame);
}

// The original's instructions, verbatim, with no drop shadow (its filter line is commented out).
const help = document.createElement('div');
help.textContent = 'Cursor keys / WSAD - Move R2D2\nClick+drag: Move camera';
Object.assign(help.style, {
  position: 'fixed',
  left: '0px',
  top: '0px',
  color: '#ffffff',
  font: '11px sans-serif',
  whiteSpace: 'pre',
  pointerEvents: 'none',
});
document.body.appendChild(help);

// Stands in for the original's AwayStats readout. This sample moves it to the top right
// (`awayStats.x = stage.stageWidth - awayStats.width` in onResize).
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
  position: 'fixed', right: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textAlign: 'right',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

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
