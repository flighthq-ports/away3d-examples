import type { ImageResource, Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  configureDirectionalShadowCamera3D,
  createAabb,
  createAmbientLight,
  createBuiltInScene3DResourceResolver,
  createCamera3D,
  createEnvironment,
  createFxaaEffect,
  createImageResource,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createScreenSpaceFogEffect,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  drawGlScene3DShadowMap,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DDocumentFromAwd2Url,
  loadScene3DResources,
  prepareMeshSkinning,
  registerDeflateDecompressor,
  registerWebImageDecoders,
  scaleMeshGeometryUvs,
  setQuaternionFromEuler,
  setVector3,
  updateMeshSkin,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { awayDirection, bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway, createPointLightFromAway } from '../../shared/lighting';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createAnimationController } from './animation';
import { createScene3DContext } from './renderer';

registerDeflateDecompressor(); registerWebImageDecoders();

const assetRoot = 'away3d/OnkbaAWDAnimation/onkba/';
// Scene colours are the original's constants.
const SKY_COLOR = 0x333338;
const ZENITH_COLOR = 0x445465;
const SUN_COLOR = 0xaaaaa9;
const FOG_NEAR = 1000;
const FOG_FAR = 10000;
const GROUND_Y = -480;

// Clear colour and fog colour are consumed as linear values, so the original's sRGB constants have
// to be linearised or the dark grey sky renders as mid grey.
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

const CAMERA_NEAR = 1;
const CAMERA_FAR = 30000;
// The fog effect works in non-linear depth-buffer space, so the original's world-space fog
// distances have to be pushed through the same projection curve the depth buffer uses. Dividing
// them by the far plane instead would start the fog almost at the camera.
function depthAt(distance: number): number {
  return (CAMERA_FAR * (distance - CAMERA_NEAR)) / (distance * (CAMERA_FAR - CAMERA_NEAR));
}

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: linearRgba(SKY_COLOR),
  effects: [
    createScreenSpaceFogEffect({
      color: linearRgba(SKY_COLOR),
      near: depthAt(FOG_NEAR),
      far: depthAt(FOG_FAR),
      density: 1,
    }),
    createFxaaEffect(),
  ],
});
const scene = createScene3D();
const camera = createCameraFromAway({ fov: 70, near: CAMERA_NEAR, far: CAMERA_FAR });
// HoverController(view.camera, null, 180, 0, 1000, 10, 90) with the tilt range widened to +/-60,
// aimed at (hero.x, 0, hero.z) — so the target sits on the ground plane, not at chest height.
const orbit = createOrbitControllerFromAway(camera, {
  distance: 1000,
  panAngle: 180,
  tiltAngle: 0,
  minTiltAngle: -60,
  maxTiltAngle: 60,
  targetY: 0,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 100, maxDistance: 2000 });

// The original builds its sky procedurally: a vertical ramp from the zenith colour down to the fog
// colour. Six faces are drawn here so the same ramp can drive both the skybox and the baked IBL.
// The cube faces are sampled as linear data rather than sRGB, so the sky colours are written into
// the canvas already linearised. Filling with the raw sRGB bytes renders the sky far too bright.
function linearHex(srgb: number): string {
  let out = '#';
  for (let shift = 16; shift >= 0; shift -= 8) {
    const channel = ((srgb >> shift) & 0xff) / 255;
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    out += Math.round(linear * 255).toString(16).padStart(2, '0');
  }
  return out;
}

function skyFace(face: number): ImageResource {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const zenith = linearHex(ZENITH_COLOR);
  const horizon = linearHex(SKY_COLOR);
  if (face === 2) {
    g.fillStyle = zenith;
  } else if (face === 3) {
    g.fillStyle = horizon;
  } else {
    const ramp = g.createLinearGradient(0, 0, 0, size);
    ramp.addColorStop(0, zenith);
    ramp.addColorStop(1, horizon);
    g.fillStyle = ramp;
  }
  g.fillRect(0, 0, size, size);
  return createImageResource(canvas);
}
const environment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, [0, 1, 2, 3, 4, 5].map(skyFace)),
  intensity: 1,
});
bakeGlEnvironmentIbl(ctx.state, environment);

const awaySun = createDirectionalLightFromAway({
  // Away3D is left-handed, so the sun vector has to come through the handedness adapter; passing
  // the raw literal lit the character from behind and left the face in shadow.
  direction: awayDirection(-0.5, -1, 0.3),
  color: SUN_COLOR,
  ambientColor: SUN_COLOR,
  ambient: 0.4,
  diffuse: 1,
});
awaySun.directional.castsShadow = true;
awaySun.directional.pcfRadius = 2;
awaySun.directional.shadowBias = 0.0025;
awaySun.directional.normalBias = 1;
// A sky-coloured fill light that tracks the camera, as in the original.
const skyLight = createPointLightFromAway({
  color: SKY_COLOR,
  diffuse: 0.5,
  range: 2500,
  referenceDistance: 1000,
});
const lights = createScene3DLights({
  ambient: awaySun.ambient ?? createAmbientLight({ intensity: 0.2 }),
  directional: awaySun.directional,
  point: [skyLight],
});

const document3d = await loadScene3DDocumentFromAwd2Url(ctx.host, `${assetRoot}onkba.awd`);
if (!document3d) throw new Error('Could not load compressed Onkba AWD');
const model = createScene3DFromDocument(document3d);
await loadScene3DResources(model, createBuiltInScene3DResourceResolver(ctx.host));

const [
  heroImage, heroNormal, heroLightmap,
  gunImage, gunNormal, gunLightmap,
  floorImage, floorNormal, floorSpecular,
] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, `${assetRoot}onkba_diffuse.png`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}onkba_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}onkba_lightmap.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}gun_diffuse.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}gun_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}gun_lightmap.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}floor_diffuse.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}floor_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}floor_specular.jpg`),
]);

const heroMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: heroImage }),
  normalMap: createTexture({ source: heroNormal, colorSpace: 'linear' }),
  occlusionMap: createTexture({ source: heroLightmap, colorSpace: 'linear' }),
  metallic: 0,
  roughness: 0.6,
  alphaMode: 'mask',
  alphaCutoff: 0.9,
});
const gunMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: gunImage }),
  normalMap: createTexture({ source: gunNormal, colorSpace: 'linear' }),
  occlusionMap: createTexture({ source: gunLightmap, colorSpace: 'linear' }),
  metallic: 0.72,
  roughness: 0.28,
});

// The original scales both the hero and the gun by 10, and stands the gun on the ground as a
// separate prop at (0, -470, -250) rather than parenting it to the character.
const skinned: Mesh[] = [];
let heroMesh: Mesh | null = null;
walkNodeDescendants(model.root, (node) => {
  if (isMesh(node)) {
    if (node.name === 'Onkba') {
      heroMesh = node;
      node.materials = [heroMaterial];
      setVector3(node.scale, 10, 10, 10);
      // This importer puts the hero's origin at its feet, where Away3D's sat at the model's centre,
      // so the mesh has to be dropped onto the ground plane instead of being left at y = 0.
      setVector3(node.position, 0, GROUND_Y, 0);
      invalidateNodeLocalTransform(node);
    } else if (node.name === 'Gun') {
      node.materials = [gunMaterial];
      setVector3(node.scale, 10, 10, 10);
      setVector3(node.position, 0, -470, -250);
      // The original resets rotationX/rotationY to 0, clearing the orientation baked into the AWD
      // so the gun lies flat on the ground instead of standing on end.
      setQuaternionFromEuler(node.rotation, 0, 0, 0);
      invalidateNodeLocalTransform(node);
    }
    if (node.skin) { prepareMeshSkinning(node); skinned.push(node); }
  }
  return true;
});
addNodeChild(scene.root, model.root);


// Ground: a 100000-unit plane at y = -480 with the floor set tiled 160x.
const floorSampler = createTilingSampler();
const groundGeometry = createPlaneMeshGeometry(100000, 100000);
scaleMeshGeometryUvs(groundGeometry, 160, 160);
const ground = createMesh(groundGeometry, [createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: floorImage, sampler: floorSampler }),
  normalMap: createTexture({ source: floorNormal, sampler: floorSampler, colorSpace: 'linear' }),
  metallic: 0,
  roughness: 0.85,
  occlusionMap: createTexture({ source: floorSpecular, sampler: floorSampler, colorSpace: 'linear' }),
})]);
setVector3(ground.position, 0, GROUND_Y, 0);
invalidateNodeLocalTransform(ground);
addNodeChild(scene.root, ground);

const animation = createAnimationController(model.animations, 'Breathe');

// The original's control scheme. The hero never translates — it only turns on the spot and swaps
// clips, so movement keys pick Walk/Run and turn keys drive a per-frame yaw increment.
const ROTATION_SPEED = 3;
if (!heroMesh) throw new Error('onkba.awd contains no mesh named Onkba');
const hero: Mesh = heroMesh;
let isRunning = false;
let isMoving = false;
let rotationInc = 0;
let heroYaw = 0;

function refreshMovementClip(): void {
  animation.play(isMoving ? (isRunning ? 'Run' : 'Walk') : 'Breathe');
}

window.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'ShiftLeft': case 'ShiftRight':
      isRunning = true; refreshMovementClip(); break;
    case 'ArrowUp': case 'KeyW': case 'KeyZ':
    case 'ArrowDown': case 'KeyS':
      isMoving = true; refreshMovementClip(); break;
    case 'ArrowLeft': case 'KeyA': case 'KeyQ':
      // Negated for Away3D's left-handed rotation direction.
      rotationInc = ROTATION_SPEED; break;
    case 'ArrowRight': case 'KeyD':
      rotationInc = -ROTATION_SPEED; break;
    case 'KeyE':
      animation.play('Boxe'); break;
    case 'Space': case 'KeyR':
      animation.play('Fight'); break;
    default:
      return;
  }
  event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'ShiftLeft': case 'ShiftRight':
      isRunning = false; refreshMovementClip(); break;
    case 'ArrowUp': case 'KeyW': case 'KeyZ':
    case 'ArrowDown': case 'KeyS':
    case 'Space': case 'KeyE': case 'KeyR':
      isMoving = false; refreshMovementClip(); break;
    case 'ArrowLeft': case 'KeyA': case 'KeyQ':
    case 'ArrowRight': case 'KeyD':
      rotationInc = 0; break;
    default:
  }
});

// The original's on-screen instructions, verbatim.
const help = document.createElement('div');
help.textContent = [
  'Cursor keys / WSAD / ZSQD - move',
  'SHIFT - hold down to run',
  'E - punch',
  'SPACE / R - guard',
].join('\n');
Object.assign(help.style, {
  position: 'fixed', left: '10px', top: '10px', zIndex: '2', color: '#ffffff',
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
  position: 'fixed', right: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textAlign: 'right',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

const shadowCamera = createCamera3D({
  near: 1,
  far: 10,
  projection: createOrthographicProjection({ halfWidth: 1, halfHeight: 1 }),
});
const shadowBounds = createAabb(-1200, GROUND_Y - 20, -1200, 1200, 900, 1200);

let last = 0;
function frame(ts: number): void {
  const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0;
  last = ts;

  framesThisSecond++;
  if (ts - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (ts - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = ts;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;

  heroYaw += rotationInc * dt * 60 * Math.PI / 180;
  setQuaternionFromEuler(hero.rotation, 0, heroYaw, 0);
  invalidateNodeLocalTransform(hero);

  animation.step(dt);
  for (const mesh of skinned) updateMeshSkin(mesh);
  orbit.update();
  // The sky fill light rides with the camera, as in the original.
  setVector3(skyLight.position, camera.view.m[12]!, camera.view.m[13]!, camera.view.m[14]!);

  configureDirectionalShadowCamera3D(shadowCamera, awaySun.directional.direction, shadowBounds);
  drawGlScene3DShadowMap(ctx.state, model.root, shadowCamera, awaySun.directional);
  ctx.render(scene.root, camera, lights, environment);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr;
  ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
