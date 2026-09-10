import type { MeshGeometry, Node3D, PerspectiveProjection } from '@flighthq/sdk';
import {
  acquireGlRenderTexture,
  createCustomShaderMaterial,
  addNodeChild,
  bakeGlEnvironmentIbl,
  createCamera3D,
  createGlRenderTexturePool,
  createPerspectiveProjection,
  createPlane,
  matrix4TransformPoint,
  setPlaneFromNormalAndPoint,
  drawGlEnvironmentSkybox,
  drawGlScene3D,
  registerGlRenderTextureResolver,
  reflectCamera3DByPlane,
  renderIntoGlRenderTexture,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createEnvironment,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createScreenSpaceFogEffect,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createVector3,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  scaleMeshGeometryUvs,
  setMeshGeometryVertexPosition,
  setQuaternionFromEuler,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { awayDirection, bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { registerMirrorShader } from './mirrorShader';
import { createScene3DContext } from './renderer';

const assetRoot = 'away3d/PlanarReflections/';

// Scene constants taken from the original.
const CAMERA_NEAR = 20;
const CAMERA_FAR = 4000;
const FOG_NEAR = 0;
const FOG_FAR = 2000;
const FOG_COLOR = 0x100215;
const TERRAIN_SIZE = 5000;
const TERRAIN_HEIGHT = 600;
const TERRAIN_SEGMENTS = 75;
const MIRROR_WIDTH = 400;
const MIRROR_HEIGHT = 200;
// The original places the mirror at Away3D z = -200; shared/camera converts Away3D's left-handed
// Z for the camera, so scene positions taken from the original have to be negated to match.
const MIRROR_Z = 200;
const R2D2_SCALE = 5;
const R2D2_Y = 30;

// Physics constants, verbatim from the original.
const MAX_SPEED = 1;
const MAX_ROTATION_SPEED = 10;
const ACCELERATION = 0.5;
const ROTATION = 0.5;

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
// The fog effect works in non-linear depth-buffer space, so the original's world distances are
// pushed through the same projection curve the depth buffer uses.
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
      near: depthAt(FOG_NEAR),
      far: depthAt(FOG_FAR),
      density: 1,
    }),
    createFxaaEffect(),
  ],
});
const scene = createScene3D();
const camera = createCameraFromAway({ near: CAMERA_NEAR, far: CAMERA_FAR });
// HoverController(camera, null, 45, 10, 400, 3, 90), aimed at the origin.
const orbit = createOrbitControllerFromAway(camera, {
  distance: 400,
  panAngle: 45,
  tiltAngle: 10,
  minTiltAngle: 3,
  maxTiltAngle: 90,
});
// The original binds only mouse drag — it has no wheel listener, so zoom stays out.
bindOrbitDrag(ctx.canvas, orbit);

const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(-1, -2, 1),
  color: 0xeedddd,
  ambient: 1,
  ambientColor: 0x808090,
  shading: 'pbr',
});
const lights = createScene3DLights({ ambient, directional });

const skyFaceNames = ['space_posX', 'space_negX', 'space_posY', 'space_negY', 'space_posZ', 'space_negZ'];
const [obj, r2d2Image, sandImage, heightImage, ...skyFaces] = await Promise.all([
  fetch(`${assetRoot}R2D2.obj`).then((response) => response.text()),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}r2d2_diffuse.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}desertsand.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}desertHeightMap.jpg`),
  ...skyFaceNames.map((face) => loadImageResourceFromUrl(ctx.host, `${assetRoot}skybox/${face}.jpg`)),
]);

const environment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, skyFaces),
  intensity: 1,
});
bakeGlEnvironmentIbl(ctx.state, environment);

// Elevation(desertMaterial, desertHeightMap.jpg, 5000, 600, 5000, 75, 75) at y = -3, UVs 25x.
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

const sandSampler = createTilingSampler();
const sandTexture = createTexture({ source: sandImage, sampler: sandSampler });
function createSandMaterial() {
  return createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: sandTexture,
    metallic: 0,
    roughness: 0.9,
  });
}

const desertGeometry: MeshGeometry = createPlaneMeshGeometry(
  TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS,
);
const terrainVertex = createVector3();
for (let i = 0; i < getMeshGeometryVertexCount(desertGeometry); i++) {
  getMeshGeometryVertexPosition(terrainVertex, desertGeometry, i);
  setMeshGeometryVertexPosition(
    desertGeometry, i, terrainVertex.x, terrainHeight(terrainVertex.x, terrainVertex.z), terrainVertex.z,
  );
}
computeMeshGeometryNormals(desertGeometry, desertGeometry);
computeMeshGeometryTangents(desertGeometry, desertGeometry);
scaleMeshGeometryUvs(desertGeometry, 25, 25);
invalidateMeshGeometry(desertGeometry);
addNodeChild(scene.root, createMesh(desertGeometry, [createSandMaterial()]));

// The original also lays a small 800x800 patch at the origin, with its UVs matched to the desert's.
const floorGeometry = createPlaneMeshGeometry(800, 800, 1, 1);
scaleMeshGeometryUvs(floorGeometry, (800 / TERRAIN_SIZE) * 25, (800 / TERRAIN_SIZE) * 25);
addNodeChild(scene.root, createMesh(floorGeometry, [createSandMaterial()]));

// R2D2, scaled 5 and started at (200, 30, 0).
function loadR2D2(): Node3D {
  const model = createScene3DFromObj(obj);
  const material = createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: createTexture({ source: r2d2Image }),
    metallic: 0.35,
    roughness: 0.4,
  });
  walkNodeDescendants(model.root, (node) => {
    if (isMesh(node)) node.materials = [material];
    return true;
  });
  setVector3(model.root.scale, R2D2_SCALE, R2D2_SCALE, R2D2_SCALE);
  invalidateNodeLocalTransform(model.root);
  addNodeChild(scene.root, model.root);
  return model.root;
}
const r2d2 = loadR2D2();

// PlaneGeometry(400, 200, 1, 1, false) is authored upright, sat on the ground (y = maxY) at z = -200.
registerMirrorShader(ctx.state);
registerGlRenderTextureResolver(ctx.state);
const reflectionPool = createGlRenderTexturePool();
const reflectionTexture = acquireGlRenderTexture(ctx.state, reflectionPool, {
  width: Math.max(1, Math.floor(ctx.canvas.width)),
  height: Math.max(1, Math.floor(ctx.canvas.height)),
  depth: 'depth-stencil',
  format: 'rgba8',
});

const mirrorMaterial = createCustomShaderMaterial({
  shaderKey: 'planarMirror',
  textures: { u_reflection: reflectionTexture },
  uniforms: { u_resolution: [ctx.canvas.width, ctx.canvas.height], u_strength: 0.9 },
});
// The panel is a single quad viewed from either side, so it must not be back-face culled.
mirrorMaterial.doubleSided = true;
const mirrorGeometry = createPlaneMeshGeometry(MIRROR_WIDTH, MIRROR_HEIGHT, 1, 1);
const mirror = createMesh(mirrorGeometry, [mirrorMaterial]);
setVector3(mirror.position, 0, MIRROR_HEIGHT / 2, MIRROR_Z);
setQuaternionFromEuler(mirror.rotation, Math.PI / 2, 0, 0);
invalidateNodeLocalTransform(mirror);
addNodeChild(scene.root, mirror);

// The mirror plane in world space, normal facing the side the camera sits on (-Z).
const mirrorPlane = createPlane(0, 0, -1, MIRROR_Z);
// Scratch for expressing that same plane in the reflected camera's view space each frame.
const mirrorPoint = createVector3(0, 0, MIRROR_Z);
const mirrorNormalTip = createVector3(0, 0, MIRROR_Z - 1);
const clipPointView = createVector3();
const clipTipView = createVector3();
const clipNormalView = createVector3();
const reflectionClipPlane = createPlane(0, 0, -1, MIRROR_Z);
const reflectedCamera = createCamera3D({
  near: CAMERA_NEAR,
  far: CAMERA_FAR,
  projection: createPerspectiveProjection({ fovY: (camera.projection as PerspectiveProjection).fovY, aspect: 1 }),
});

// The original's on-screen instructions, verbatim, at its 11px/(0,100) placement.
const help = document.createElement('div');
help.textContent = 'Cursor keys / WSAD - Move R2D2\nClick+drag: Move camera';
Object.assign(help.style, {
  position: 'fixed', left: '0px', top: '100px', zIndex: '2', color: '#ffffff',
  font: '11px sans-serif', whiteSpace: 'pre', pointerEvents: 'none',
});
document.body.appendChild(help);

// Stands in for the original's AwayStats readout.
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
  position: 'fixed', left: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

const pressed = new Set<string>();
const movementKeys = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
]);
window.addEventListener('keydown', (event) => {
  if (!movementKeys.has(event.code)) return;
  pressed.add(event.code);
  event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  if (!movementKeys.has(event.code)) return;
  pressed.delete(event.code);
  event.preventDefault();
});

// updateR2D2(): speed *= .95 then += acceleration; rotationSpeed += accel then *= .9; both clamped.
let speed = 0;
let rotationSpeed = 0;
let heading = 0;
setVector3(r2d2.position, 200, R2D2_Y, 0);
invalidateNodeLocalTransform(r2d2);

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

  const forwardInput = Number(pressed.has('KeyW') || pressed.has('ArrowUp'))
    - Number(pressed.has('KeyS') || pressed.has('ArrowDown'));
  const turnInput = Number(pressed.has('KeyD') || pressed.has('ArrowRight'))
    - Number(pressed.has('KeyA') || pressed.has('ArrowLeft'));

  speed = speed * Math.pow(0.95, frames) + forwardInput * ACCELERATION * frames;
  speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
  rotationSpeed = (rotationSpeed + turnInput * ROTATION * frames) * Math.pow(0.9, frames);
  rotationSpeed = Math.max(-MAX_ROTATION_SPEED, Math.min(MAX_ROTATION_SPEED, rotationSpeed));

  heading += rotationSpeed * frames * Math.PI / 180;
  r2d2.position.x += Math.sin(heading) * speed * frames;
  r2d2.position.z += Math.cos(heading) * speed * frames;
  setQuaternionFromEuler(r2d2.rotation, 0, heading, 0);
  invalidateNodeLocalTransform(r2d2);

  orbit.update();

  // Real planar reflection: reflect the camera through the mirror plane, render the scene from
  // there into a render texture, and let the mirror's shader sample it by screen position. The
  // mirror is hidden for that pass so it cannot reflect itself, and the winding order is flipped
  // because reflecting the camera reverses handedness.
  mirror.visible = false;
  renderIntoGlRenderTexture(ctx.state, reflectionTexture, (reflectionState) => {
    const gl = reflectionState.gl;
    reflectCamera3DByPlane(reflectedCamera, camera, mirrorPlane);
    (reflectedCamera.projection as PerspectiveProjection).aspect =
      (camera.projection as PerspectiveProjection).aspect;

    // Clip the reflection at the mirror plane so geometry behind the mirror cannot leak into it.
    // applyObliqueNearClipPlane wants the plane in VIEW space with its normal pointing into the
    // visible half-space, so the world plane is carried through the reflected camera's view
    // matrix (a point on it, plus a second point one unit along its normal). Assigned after
    // reflectCamera3DByPlane, which copies nearClipPlane from its source camera.
    matrix4TransformPoint(clipPointView, reflectedCamera.view, mirrorPoint);
    matrix4TransformPoint(clipTipView, reflectedCamera.view, mirrorNormalTip);
    setVector3(
      clipNormalView,
      clipTipView.x - clipPointView.x,
      clipTipView.y - clipPointView.y,
      clipTipView.z - clipPointView.z,
    );
    setPlaneFromNormalAndPoint(reflectionClipPlane, clipNormalView, clipPointView);
    reflectedCamera.nearClipPlane = reflectionClipPlane;
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    drawGlEnvironmentSkybox(
      reflectionState, environment, reflectedCamera, ctx.canvas.width / ctx.canvas.height,
    );
    gl.frontFace(gl.CW);
    drawGlScene3D(reflectionState, scene.root, reflectedCamera, lights);
    gl.frontFace(gl.CCW);
  });

  mirror.visible = true;

  ctx.render(scene.root, camera, lights, environment);
  requestAnimationFrame(frame);
}

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
