import type { Mesh, PerspectiveProjection } from '@flighthq/sdk';
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
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway, createPointLightFromAway } from '../../shared/lighting';
import { createAnimationController } from './animation';
import { createScene3DContext } from './renderer';

registerDeflateDecompressor();
registerWebImageDecoders();

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x5f5e6eff,
  effects: [
    createScreenSpaceFogEffect({ color: 0x5f5e6eff, near: 0.96, far: 1, density: 3 }),
    createToneMapEffect({ exposure: 1.05 }),
    createFxaaEffect(),
  ],
});
const scene = createScene3D();
const camera = createCameraFromAway({ y: 500, near: 20, far: 5000 });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 1050,
  panAngle: 180,
  tiltAngle: 12,
  targetY: 180,
  targetZ: 1000,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 650, maxDistance: 1800 });

const awaySun = createDirectionalLightFromAway({
  direction: { x: -1, y: -0.4, z: 1 },
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
setVector3(skyLight.position, 0, 500, -1000);
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
const shadowBounds = createAabb(-1800, -20, -2800, 1800, 1400, 800);

const help = document.createElement('div');
help.textContent = 'WASD / arrows: animate and turn · Shift: run · drag: orbit';
Object.assign(help.style, {
  position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui',
  textShadow: '0 1px 4px #234', pointerEvents: 'none',
});
document.body.appendChild(help);

let previousTime = performance.now();
function frame(timestamp: number): void {
  const deltaTime = Math.min(0.1, (timestamp - previousTime) / 1000);
  previousTime = timestamp;
  animation.step(deltaTime);
  for (const mesh of skinned) updateMeshSkin(mesh);
  bearHeading += rotationPerFrame * deltaTime * 60 * Math.PI / 180;
  setQuaternionFromEuler(bearMesh.rotation, 0, bearHeading, 0);
  invalidateNodeLocalTransform(bearMesh);
  stepParticleEmitter3D(snowfall, snowState, snowConfig, deltaTime);
  orbit.update();
  configureDirectionalShadowCamera3D(shadowCamera, awaySun.directional.direction, shadowBounds);
  drawGlScene3DShadowMap(ctx.state, scene.root, shadowCamera, awaySun.directional);
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
