import type { ImageResource, Mesh, Node3D, PerspectiveProjection } from '@flighthq/sdk';
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
  getAnimationClipDuration,
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
  // The original assigns tiltAngle = 0, but Away3D's setter clamps against the min/max in force at
  // that moment — still 10 from the HoverController constructor, since minTiltAngle is widened to
  // -60 only afterwards. So the sample actually opens at 10 degrees, looking slightly down.
  panAngle: 180,
  tiltAngle: 10,
  minTiltAngle: -60,
  maxTiltAngle: 60,
  targetY: 0,
});
// This sample drags the camera 1 degree per pixel, not the 0.3 most Away3D samples use, and its
// wheel step is `distance -= delta * 5` over Flash's +/-3-per-notch delta.
bindOrbitDrag(ctx.canvas, orbit, {
  minDistance: 100,
  maxDistance: 2000,
  degreesPerPixel: 1,
  wheelScale: 0.15,
});

// Zooming in raises the look-at target so a close camera frames the torso rather than the feet:
// `_cameraHeight = distance < 600 ? (600 - distance) / 2 : 0`.
const BASE_TARGET_Y = 0;
function updateCameraHeight(): void {
  orbit.target.y = BASE_TARGET_Y + (orbit.distance < 600 ? (600 - orbit.distance) / 2 : 0);
}

// The original builds its sky procedurally: a vertical ramp from the zenith colour down to the
// fog colour. The ramp is evaluated per texel against each texel's world direction rather than as
// a flat top-to-bottom fill per face, so it stays continuous across the cube's edges instead of
// showing a seam where neighbouring faces disagree.
function skyDirection(face: number, u: number, v: number, out: [number, number, number]): void {
  switch (face) {
    case 0: out[0] = 1; out[1] = -v; out[2] = -u; break;
    case 1: out[0] = -1; out[1] = -v; out[2] = u; break;
    case 2: out[0] = u; out[1] = 1; out[2] = v; break;
    case 3: out[0] = u; out[1] = -1; out[2] = -v; break;
    case 4: out[0] = u; out[1] = -v; out[2] = 1; break;
    default: out[0] = -u; out[1] = -v; out[2] = -1; break;
  }
}

function skyFace(face: number): ImageResource {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d')!;
  const image = g.createImageData(size, size);
  const dir: [number, number, number] = [0, 0, 0];
  // Linearised endpoints — the cube faces are sampled as linear data, so writing raw sRGB bytes
  // here renders the sky far too bright.
  const zenith = [16, 8, 0].map((shift) => linearChannel((ZENITH_COLOR >> shift) & 0xff));
  const horizon = [16, 8, 0].map((shift) => linearChannel((SKY_COLOR >> shift) & 0xff));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;
      skyDirection(face, u, v, dir);
      const length = Math.hypot(dir[0], dir[1], dir[2]);
      // Ramp over the upper hemisphere, as the original's vector sky does.
      const t = Math.max(0, Math.min(1, dir[1] / length));
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const value = horizon[channel]! + (zenith[channel]! - horizon[channel]!) * t;
        image.data[offset + channel] = Math.round(value * 255);
      }
      image.data[offset + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return createImageResource(canvas);
}

const environment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, [0, 1, 2, 3, 4, 5].map(skyFace)),
  intensity: 2.4,
});
bakeGlEnvironmentIbl(ctx.state, environment);

const awaySun = createDirectionalLightFromAway({
  // Away3D is left-handed, so the sun vector has to come through the handedness adapter; passing
  // the raw literal lit the character from behind and left the face in shadow.
  direction: awayDirection(-0.5, -1, 0.3),
  color: SUN_COLOR,
  ambientColor: SUN_COLOR,
  ambient: 0.55,
  diffuse: 1.8,
});
awaySun.directional.castsShadow = true;
awaySun.directional.pcfRadius = 2;
awaySun.directional.shadowBias = 0.0025;
awaySun.directional.normalBias = 1;
// A sky-coloured fill light that tracks the camera, as in the original.
const skyLight = createPointLightFromAway({
  color: SKY_COLOR,
  diffuse: 0.9,
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

// Away3D's SkeletonAnimator lifts each clip's root delta onto the mesh (updatePosition), so the
// character advances through the world and the camera's lookAtPosition tracks it. Here the clip
// drives the root joint directly, which makes the character surge forward and then snap back every
// time the clip loops. To match the original, the root joint's horizontal travel is pinned out of
// the pose and re-applied to the mesh as continuous motion instead.
const ROOT_JOINT = 'Bone001';
const rootJointMatches: Node3D[] = [];
walkNodeDescendants(model.root, (node) => {
  if (node.name === ROOT_JOINT) rootJointMatches.push(node as Node3D);
  return true;
});
const rootJoint: Node3D | null = rootJointMatches[0] ?? null;
const rootRestX = rootJoint ? rootJoint.position.x : 0;
const rootRestZ = rootJoint ? rootJoint.position.z : 0;

// Forward speed per clip, taken from that clip's own root track so the feet do not slide: the
// root's total Z travel across the clip, scaled by the mesh, over the clip's duration.
const HERO_SCALE = 10;
function clipGroundSpeed(name: string): number {
  const clip = model.animations[name];
  if (!clip) return 0;
  let best = 0;
  for (const channel of clip.channels) {
    if (channel.track.components !== 3 || channel.track.quaternion) continue;
    const values = channel.track.values;
    if (values.length < 6) continue;
    const travel = Math.abs(values[values.length - 1]! - values[2]!);
    if (travel > best) best = travel;
  }
  const duration = getAnimationClipDuration(clip);
  return duration > 0 ? (best * HERO_SCALE) / duration : 0;
}
const WALK_SPEED = clipGroundSpeed('Walk');
const RUN_SPEED = clipGroundSpeed('Run');

// The original's control scheme. The hero never translates — it only turns on the spot and swaps
// clips, so movement keys pick Walk/Run and turn keys drive a per-frame yaw increment.
const ROTATION_SPEED = 3;
if (!heroMesh) throw new Error('onkba.awd contains no mesh named Onkba');
const hero: Mesh = heroMesh;
let isRunning = false;
let isMoving = false;
let moveDirection = 0;
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
      isMoving = true; moveDirection = 1; refreshMovementClip(); break;
    case 'ArrowDown': case 'KeyS':
      isMoving = true; moveDirection = -1; refreshMovementClip(); break;
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
      isMoving = false; moveDirection = 0; refreshMovementClip(); break;
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

  // Pin the root joint's horizontal travel out of the pose so the character walks on the spot,
  // then advance the mesh itself along its heading at the clip's own ground speed.
  if (rootJoint !== null) {
    setVector3(rootJoint.position, rootRestX, rootJoint.position.y, rootRestZ);
    invalidateNodeLocalTransform(rootJoint);
  }
  if (isMoving) {
    const speed = (isRunning ? RUN_SPEED : WALK_SPEED) * moveDirection;
    hero.position.x += Math.sin(heroYaw) * speed * dt;
    hero.position.z += Math.cos(heroYaw) * speed * dt;
    invalidateNodeLocalTransform(hero);
  }

  for (const mesh of skinned) updateMeshSkin(mesh);
  // The original aims the camera at (hero.x, cameraHeight, hero.z) every frame.
  orbit.target.x = hero.position.x;
  orbit.target.z = hero.position.z;
  updateCameraHeight();
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
