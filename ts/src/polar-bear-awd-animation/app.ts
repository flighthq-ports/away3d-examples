import type { Mesh, Node3D, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  bakeGlEnvironmentIbl,
  configureDirectionalShadowCamera3D,
  createAabb,
  createBuiltInScene3DResourceResolver,
  createCamera3D,
  createEnvironment,
  createFxaaEffect,
  createImageResource,
  createMesh,
  createOrthographicProjection,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createScreenSpaceFogEffect,
  createVector3,
  setAabb,
  setCamera3DViewMatrix4FromLookAt,
  createStandardPbrMaterial,
  createTexture,
  createTextureAtlas,
  createTilingSampler,
  createToneMapEffect,
  drawGlScene3DShadowMap,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DDocumentFromAwd2Url,
  loadScene3DResources,
  prepareMeshSkinning,
  prewarmParticleEmitter3D,
  registerDeflateDecompressor,
  registerWebImageDecoders,
  scaleMeshGeometryUvs,
  setQuaternionFromEuler,
  setVector3,
  stepParticleEmitter3D,
  updateMeshSkin,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { awayDirection, createCameraFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway, createPointLightFromAway } from '../../shared/lighting';
import { createAnimationController } from './animation';
import { createScene3DContext } from './renderer';

registerDeflateDecompressor();
registerWebImageDecoders();

// FogMethod(0, 3000, 0x5f5e6e). Clear colour and fog are consumed as LINEAR values, so the sRGB
// constant has to be converted — passing the raw 0x5f5e6e is what washed the whole scene pale.
const CAMERA_NEAR = 20;
const CAMERA_FAR = 5000;
const FOG_COLOR = 0x5f5e6e;
const FOG_FAR = 3000;
// The effect ramps over NON-LINEAR window depth, where distance compresses hard: depth(1000) is
// already 0.984 and depth(3000) is 0.997. Mapping the original's world-linear 0..3000 range onto
// that fogs the bear itself, so the near end is chosen to sit just beyond him and let the haze
// build over the ground behind.
const FOG_VISIBLE_NEAR = 1200;

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
    // NOTE: this fogs the skybox too. Away3D's FogMethod is a MATERIAL method, so its sky stays
    // crisp; a screen-space depth fog cannot tell sky from distant ground (both sit at depth ~1),
    // and the effect has no background skip. The window below is chosen to keep what it does to
    // the sky mild rather than to hide it.
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
const camera = createCameraFromAway({ y: 500, near: CAMERA_NEAR, far: CAMERA_FAR });
// The original does NOT orbit. `camera.y = 500; camera.z = 0` and a LookAtController whose
// lookAtObject becomes the bear, so the camera stands still and only turns to keep him in frame —
// which is why he shrinks into the distance as he walks away. It binds no mouse listeners at all.
const cameraEye = createVector3(0, 500, 0);
const cameraTarget = createVector3(0, 0, -1000);
const cameraUp = createVector3(0, 1, 0);

// DirectionalLight(-1, -0.4, 1). The direction is an Away3D vector and must be converted, or the
// sun ends up on the wrong side and the shadow falls away from the camera.
const awaySun = createDirectionalLightFromAway({
  direction: awayDirection(-1, -0.4, 1),
  diffuse: 1.35,
  ambient: 0.22,
  ambientColor: 0xbad9ef,
});
awaySun.directional.castsShadow = true;
awaySun.directional.pcfRadius = 2;
awaySun.directional.shadowBias = 0.0025;
awaySun.directional.normalBias = 1;
const skyLight = createPointLightFromAway({
  color: 0xffffff,
  diffuse: 0.7,
  range: 2500,
  referenceDistance: 1200,
});
// skyLight.y = 500, with x and z left at zero.
setVector3(skyLight.position, 0, 500, 0);
const lights = createScene3DLights({ ambient: awaySun.ambient, directional: awaySun.directional, point: [skyLight] });

const assetRoot = 'away3d/PolarBearAWDAnimation/';
const [bearDiffuse, bearNormal, bearSpecular, snowDiffuse, snowNormal, snowSpecular, skyFaces, sceneDocument] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, `${assetRoot}polarbear_diffuse.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}polarbear_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}polarbear_specular.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}snow_diffuse.png`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}snow_normals.png`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}snow_specular.png`),
  Promise.all(
    ['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'].map((face) =>
      loadImageResourceFromUrl(ctx.host, `${assetRoot}skybox/sky_${face}.jpg`),
    ),
  ),
  loadScene3DDocumentFromAwd2Url(ctx.host, `${assetRoot}PolarBear.awd`),
]);
if (!sceneDocument) throw new Error('Could not load PolarBear.awd');

const environment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, skyFaces),
  intensity: 0.7,
});
bakeGlEnvironmentIbl(ctx.state, environment);

const model = createScene3DFromDocument(sceneDocument);
await loadScene3DResources(model, createBuiltInScene3DResourceResolver(ctx.host));
const bearMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: bearDiffuse }),
  normalMap: createTexture({ source: bearNormal, colorSpace: 'linear' }),
  metallicRoughnessMap: createTexture({ source: bearSpecular, colorSpace: 'linear' }),
  metallic: 0,
  roughness: 0.55,
});
const skinned: Mesh[] = [];
walkNodeDescendants(model.root, (node) => {
  if (isMesh(node)) {
    node.materials = [bearMaterial];
    if (node.skin) {
      prepareMeshSkinning(node);
      skinned.push(node);
    }
  }
  return true;
});
const bearMesh = skinned.find((mesh) => mesh.name === 'PolarBear') ?? skinned[0];
if (!bearMesh) throw new Error('PolarBear.awd did not contain a skinned mesh');
setVector3(bearMesh.scale, bearMesh.scale.x * 1.5, bearMesh.scale.y * 1.5, bearMesh.scale.z * 1.5);
setVector3(bearMesh.position, 0, 0, -1000);
// Mirroring Away3D's +Z-forward space into Flight negates rotations around Y.
let bearHeading = Math.PI / 4;
setQuaternionFromEuler(bearMesh.rotation, 0, bearHeading, 0);
invalidateNodeLocalTransform(bearMesh);
// The walk and run clips animate ZeroJoint, the skeleton's root, and that translation is the
// bear's forward travel — about 6.2 units a cycle. Left in the pose it carries the whole bear
// forward inside the container and then snaps back when the clip loops, which is visible as the
// bear sliding ahead of himself and resetting. Away3D lifts the same motion off the pose and onto
// the mesh (SkeletonAnimator.updatePosition); here the travel is read from the clip separately
// and applied to the mesh, so the joint is pinned back to its bind translation every frame. Only
// x and z are pinned — y is left animated so the body still rises and falls with the gait.
const ROOT_JOINT = 'ZeroJoint';
let rootJoint: Node3D | null = null;
walkNodeDescendants(model.root, (node) => {
  if (rootJoint === null && node.name === ROOT_JOINT) rootJoint = node as Node3D;
  return true;
});
const rootRest = rootJoint !== null
  ? { x: (rootJoint as Node3D).position.x, z: (rootJoint as Node3D).position.z }
  : null;

addNodeChild(scene.root, model.root);



const groundSampler = createTilingSampler();
const groundGeometry = createPlaneMeshGeometry(50000, 50000);
scaleMeshGeometryUvs(groundGeometry, 50, 50);
const ground = createMesh(groundGeometry, [createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: snowDiffuse, sampler: groundSampler }),
  normalMap: createTexture({ source: snowNormal, colorSpace: 'linear', sampler: groundSampler }),
  metallicRoughnessMap: createTexture({ source: snowSpecular, colorSpace: 'linear', sampler: groundSampler }),
  metallic: 0,
  roughness: 0.72,
})]);
addNodeChild(scene.root, ground);

const snowflakeCanvas = document.createElement('canvas');
snowflakeCanvas.width = 64;
snowflakeCanvas.height = 64;
const snowflakeContext = snowflakeCanvas.getContext('2d');
if (!snowflakeContext) throw new Error('A 2D canvas is required to create the snow particle');
snowflakeContext.translate(32, 32);
snowflakeContext.strokeStyle = '#fff';
snowflakeContext.lineWidth = 3;
snowflakeContext.shadowColor = '#d9f2ff';
snowflakeContext.shadowBlur = 8;
for (let arm = 0; arm < 6; arm++) {
  snowflakeContext.rotate(Math.PI / 3);
  snowflakeContext.beginPath();
  snowflakeContext.moveTo(0, 0);
  snowflakeContext.lineTo(0, 25);
  snowflakeContext.moveTo(0, 14);
  snowflakeContext.lineTo(-6, 20);
  snowflakeContext.moveTo(0, 14);
  snowflakeContext.lineTo(6, 20);
  snowflakeContext.stroke();
}
const snowflake = createImageResource(snowflakeCanvas);
const snowAtlas = createTextureAtlas({ texture: createTexture({ source: snowflake }) });
addTextureAtlasRegion(snowAtlas, 0, 0, snowflake.width, snowflake.height);
const snowfall = createParticleEmitter3D();
snowfall.blendMode = 'normal';
snowfall.data.atlas = snowAtlas;
setVector3(snowfall.position, 0, 1200, -1000);
invalidateNodeLocalTransform(snowfall);
addNodeChild(scene.root, snowfall);
const snowState = createParticleEmitterState();
const snowConfig = createParticleEmitterConfig({
  maxParticles: 3000,
  spawnRate: 150,
  duration: -1,
  loop: true,
  lifetimeMin: 20,
  lifetimeMax: 20,
  emitterShape: 'box',
  emitterWidth: 10000,
  emitterHeight: 0,
  emitterDepth: 10000,
  directionX: 0,
  directionY: -1,
  directionZ: 0,
  spread: 0.18,
  speedMin: 100,
  speedMax: 100,
  scaleMin: 10,
  scaleMax: 22,
  alphaStart: 0.92,
  alphaEnd: 0.5,
  rotationSpeedMin: -1.8,
  rotationSpeedMax: 1.8,
  blendMode: 'normal',
});
prewarmParticleEmitter3D(snowfall, snowState, snowConfig, 20, 1 / 60);

const animation = createAnimationController(model.animations, 'Breathe');
let currentAnimation = 'Breathe';
let moving = false;
let running = false;
let movementDirection = 1;
let rotationPerFrame = 0;
function playMovement(direction: number): void {
  moving = true;
  movementDirection = direction;
  const name = running ? 'Run' : 'Walk';
  if (currentAnimation !== name) {
    currentAnimation = name;
    animation.play(name);
  }
  animation.setSpeed(direction * (running ? 2 : 1));
}
function stopMovement(): void {
  moving = false;
  if (currentAnimation !== 'Breathe') {
    currentAnimation = 'Breathe';
    animation.play('Breathe');
  }
  animation.setSpeed(1);
}
window.addEventListener('keydown', (event) => {
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    running = true;
    if (moving) playMovement(movementDirection);
  } else if (event.code === 'KeyW' || event.code === 'ArrowUp') {
    playMovement(1);
  } else if (event.code === 'KeyS' || event.code === 'ArrowDown') {
    playMovement(-1);
  } else if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
    rotationPerFrame = 3;
  } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
    rotationPerFrame = -3;
  } else {
    return;
  }
  event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
    running = false;
    if (moving) playMovement(movementDirection);
  } else if (['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
    stopMovement();
  } else if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    rotationPerFrame = 0;
  } else {
    return;
  }
  event.preventDefault();
});

const shadowCamera = createCamera3D({
  near: 1,
  far: 10,
  projection: createOrthographicProjection({ halfWidth: 1, halfHeight: 1 }),
});
// The bear now roams, so the shadow volume has to travel with him. A fixed box centred on the
// origin either wastes almost all of the shadow map on empty snow or loses him entirely once he
// walks out of it. NearDirectionalShadowMapper(0.5) in the original keeps the map close to the
// subject for the same reason.
// The sun is low (y = -0.4), so the bear's shadow is roughly 2.5x his height and needs room.
const SHADOW_RADIUS = 1600;
const shadowBounds = createAabb(-SHADOW_RADIUS, -20, -SHADOW_RADIUS, SHADOW_RADIUS, 900, SHADOW_RADIUS);

// The original's instructions, verbatim (its drop-shadow filter line is commented out).
const help = document.createElement('div');
help.textContent = 'Cursor keys / WSAD - move\nSHIFT - hold down to run';
Object.assign(help.style, {
  position: 'fixed', left: '0px', top: '0px', zIndex: '2', color: '#ffffff',
  font: '11px sans-serif', whiteSpace: 'pre', pointerEvents: 'none',
});
document.body.appendChild(help);

// Stands in for the original's AwayStats readout, which this sample moves to the top right
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

// The root-motion delta arrives in the skeleton's own space and has to be scaled by the mesh and
// turned by the bear's heading before it becomes world travel.
const rootDelta = createVector3();
let previousTime = performance.now();
function frame(timestamp: number): void {
  const deltaTime = Math.min(0.1, (timestamp - previousTime) / 1000);
  previousTime = timestamp;

  framesThisSecond++;
  if (timestamp - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (timestamp - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = timestamp;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;

  animation.step(deltaTime, rootDelta);
  // Take the root motion back out of the pose before the skin is evaluated (see ROOT_JOINT).
  if (rootJoint !== null && rootRest !== null) {
    const joint = rootJoint as Node3D;
    setVector3(joint.position, rootRest.x, joint.position.y, rootRest.z);
    invalidateNodeLocalTransform(joint);
  }
  for (const mesh of skinned) updateMeshSkin(mesh);
  bearHeading += rotationPerFrame * deltaTime * 60 * Math.PI / 180;
  setQuaternionFromEuler(bearMesh.rotation, 0, bearHeading, 0);

  // Walk the clip's travel onto the mesh: the root-motion delta is a vector in the bear's own
  // space, so it is turned by his heading and scaled by the mesh. This model's forward is local
  // +Z — at heading 0 he faces the camera, which sits on +Z from him — so the delta rotates by a
  // plain Y rotation with no sign flip. Negating it here is what made him moonwalk: he played the
  // walk cycle while travelling backwards, and every key drove him the wrong way.
  const forward = rootDelta.z * bearMesh.scale.z;
  const strafe = rootDelta.x * bearMesh.scale.x;
  const sin = Math.sin(bearHeading);
  const cos = Math.cos(bearHeading);
  bearMesh.position.x += strafe * cos + forward * sin;
  bearMesh.position.z += -strafe * sin + forward * cos;
  invalidateNodeLocalTransform(bearMesh);


  stepParticleEmitter3D(snowfall, snowState, snowConfig, deltaTime);

  // LookAtController: the camera never moves, it just tracks the bear.
  setVector3(cameraTarget, bearMesh.position.x, bearMesh.position.y, bearMesh.position.z);
  setCamera3DViewMatrix4FromLookAt(camera, cameraEye, cameraTarget, cameraUp);
  setAabb(
    shadowBounds,
    bearMesh.position.x - SHADOW_RADIUS, -20, bearMesh.position.z - SHADOW_RADIUS,
    bearMesh.position.x + SHADOW_RADIUS, 900, bearMesh.position.z + SHADOW_RADIUS,
  );
  configureDirectionalShadowCamera3D(shadowCamera, awaySun.directional.direction, shadowBounds);
  // Only the bear casts. Handing the whole scene to the shadow pass includes the 50000x50000
  // ground plane, which fills the shadow map with a caster that lies exactly on the receiving
  // surface — the bear's own shadow is then lost in the ground's self-shadowing.
  drawGlScene3DShadowMap(ctx.state, model.root, shadowCamera, awaySun.directional);
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
