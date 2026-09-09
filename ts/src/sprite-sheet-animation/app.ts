import type { Mesh, PerspectiveProjection, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  createBuiltInScene3DResourceResolver,
  createCamera3D,
  createEnvironment,
  createFxaaEffect,
  createImageResource,
  createPerspectiveProjection,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createTexture,
  createToneMapEffect,
  createUnlitMaterial,
  createVector3,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DDocumentFromAwd2Url,
  loadScene3DResources,
  registerDeflateDecompressor,
  registerWebImageDecoders,
  setCamera3DViewMatrix4FromLookAt,
  setTextureUvOffset,
  setTextureUvScale,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

registerDeflateDecompressor();
registerWebImageDecoders();

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x010c14ff,
  effects: [createToneMapEffect({ exposure: 1.1 }), createFxaaEffect()],
});
const scene = createScene3D();
const cameraPosition = createVector3(-17850, 12390, 9322);
const camera3d = createCamera3D({
  near: 1000,
  far: 100000,
  projection: createPerspectiveProjection({ fovY: Math.PI / 3, aspect: innerWidth / innerHeight }),
});
const origin = createVector3();
const up = createVector3(0, 1, 0);

const lights = createScene3DLights({
  point: [
    createPointLightFromAway({ color: 0x2e71ff, diffuse: 0.9, range: 60000, referenceDistance: 18000 }),
    createPointLightFromAway({ color: 0xffa825, diffuse: 0.5, range: 60000, referenceDistance: 16000 }),
    createPointLightFromAway({ color: 0xff0500, diffuse: 1.3, range: 40000, referenceDistance: 12000 }),
  ],
});
lights.point![0]!.position.x = 5691;
lights.point![0]!.position.y = 10893;
lights.point![0]!.position.z = 11242;
lights.point![1]!.position.x = -20250;
lights.point![1]!.position.y = 4545;
lights.point![1]!.position.z = -500;
lights.point![2]!.position.x = -7031;
lights.point![2]!.position.y = 2583;
lights.point![2]!.position.z = 8319;

const assetRoot = 'away3d/SpriteSheetAnimation/';
const [sceneDocument, environmentFaces] = await Promise.all([
  loadScene3DDocumentFromAwd2Url(ctx.host, `${assetRoot}tictac/tictac.awd`),
  Promise.all(
    [0, 1, 2, 3, 4, 5].map((face) =>
      loadImageResourceFromUrl(ctx.host, `${assetRoot}spritesheets/textures/back_CB${face}.jpg`),
    ),
  ),
]);
if (!sceneDocument) throw new Error('Could not load compressed tictac AWD');
const clock = createScene3DFromDocument(sceneDocument);
await loadScene3DResources(clock, createBuiltInScene3DResourceResolver(ctx.host));
addNodeChild(scene.root, clock.root);
bakeGlEnvironmentIbl(ctx.state, createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, environmentFaces),
  intensity: 0.7,
}));

function makeSheet(
  columns: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
  drawFrame: (context: CanvasRenderingContext2D, frame: number, width: number, height: number) => void,
) {
  const sheet = document.createElement('canvas');
  sheet.width = columns * cellWidth;
  sheet.height = rows * cellHeight;
  const context = sheet.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required to build the sprite sheets');
  for (let frame = 0; frame < columns * rows; frame++) {
    context.save();
    context.translate((frame % columns) * cellWidth, Math.floor(frame / columns) * cellHeight);
    drawFrame(context, frame, cellWidth, cellHeight);
    context.restore();
  }
  return createImageResource(sheet);
}

const digitsSheet = makeSheet(10, 6, 160, 96, (context, frame, width, height) => {
  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#ff442d');
  gradient.addColorStop(0.52, '#ffc845');
  gradient.addColorStop(1, '#6edbff');
  context.shadowColor = '#ff752f';
  context.shadowBlur = 12;
  context.fillStyle = gradient;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 72px ui-monospace, monospace';
  context.fillText(String(frame).padStart(2, '0'), width / 2, height / 2 + 3);
});
const delimiterSheet = makeSheet(5, 2, 96, 96, (context, frame, width, height) => {
  context.clearRect(0, 0, width, height);
  const intensity = Math.sin(frame / 9 * Math.PI) ** 2;
  context.shadowColor = '#fff';
  context.shadowBlur = 18 * intensity;
  context.fillStyle = `rgba(255, 245, 220, ${0.12 + intensity * 0.88})`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '700 72px ui-monospace, monospace';
  context.fillText(':', width / 2, height / 2);
});
const pulseSheet = makeSheet(4, 3, 96, 96, (context, frame, width, height) => {
  context.clearRect(0, 0, width, height);
  const pulse = 0.25 + frame / 11 * 0.75;
  const glow = context.createRadialGradient(width / 2, height / 2, 1, width / 2, height / 2, width * 0.47);
  glow.addColorStop(0, `rgba(255,255,255,${pulse})`);
  glow.addColorStop(0.2, `rgba(255,80,32,${pulse})`);
  glow.addColorStop(1, 'rgba(255,20,0,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
});

function createSpriteTexture(source: ReturnType<typeof createImageResource>, columns: number, rows: number): Texture {
  const texture = createTexture({ source });
  setTextureUvScale(texture, 1 / columns, 1 / rows);
  return texture;
}

function setSpriteFrame(texture: Texture, frame: number, columns: number, rows: number): void {
  const wrapped = ((frame % (columns * rows)) + columns * rows) % (columns * rows);
  setTextureUvOffset(texture, (wrapped % columns) / columns, Math.floor(wrapped / columns) / rows);
}

const digitTextures = new Map<string, Texture>();
let delimiterTexture: Texture | null = null;
let pulseTexture: Texture | null = null;
walkNodeDescendants(clock.root, (node) => {
  if (!isMesh(node)) return true;
  const mesh = node as Mesh;
  if (['hours', 'minutes', 'seconds'].includes(mesh.name ?? '')) {
    const texture = createSpriteTexture(digitsSheet, 10, 6);
    mesh.materials = [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: texture })];
    digitTextures.set(mesh.name!, texture);
  } else if (mesh.name === 'delimiter') {
    delimiterTexture = createSpriteTexture(delimiterSheet, 5, 2);
    mesh.materials = [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: delimiterTexture })];
  } else if (mesh.name === 'button') {
    pulseTexture = createSpriteTexture(pulseSheet, 4, 3);
    mesh.materials = [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: pulseTexture })];
  }
  return true;
});
for (const name of ['hours', 'minutes', 'seconds']) {
  if (!digitTextures.has(name)) throw new Error(`The clock AWD is missing its ${name} display mesh`);
}
if (!delimiterTexture || !pulseTexture) throw new Error('The clock AWD is missing its animated controls');

let previousHour = -1;
let previousMinute = -1;
let previousSecond = -1;
let delimiterStarted = 0;
function updateClock(timestamp: number): void {
  const now = new Date();
  if (previousHour !== now.getHours()) {
    previousHour = now.getHours();
    setSpriteFrame(digitTextures.get('hours')!, previousHour, 10, 6);
  }
  if (previousMinute !== now.getMinutes()) {
    previousMinute = now.getMinutes();
    setSpriteFrame(digitTextures.get('minutes')!, previousMinute, 10, 6);
  }
  if (previousSecond !== now.getSeconds()) {
    previousSecond = now.getSeconds();
    delimiterStarted = timestamp;
    setSpriteFrame(digitTextures.get('seconds')!, previousSecond, 10, 6);
  }
  setSpriteFrame(delimiterTexture!, Math.floor((timestamp - delimiterStarted) * 0.006), 5, 2);
  const pulsePhase = Math.floor(timestamp * 0.012) % 22;
  setSpriteFrame(pulseTexture!, pulsePhase < 12 ? pulsePhase : 22 - pulsePhase, 4, 3);
}

const tweenStart = createVector3(cameraPosition.x, cameraPosition.y, cameraPosition.z);
const tweenEnd = createVector3();
let tweenStartTime = performance.now();
let tweenDuration = 5000;
function chooseCameraDestination(timestamp: number): void {
  tweenStart.x = cameraPosition.x;
  tweenStart.y = cameraPosition.y;
  tweenStart.z = cameraPosition.z;
  tweenEnd.x = 4000 - Math.random() * 24000;
  tweenEnd.y = Math.random() * 16000;
  tweenEnd.z = 3000 + Math.random() * 18000;
  tweenStartTime = timestamp;
  tweenDuration = 4000 + Math.random() * 2000;
}
chooseCameraDestination(tweenStartTime);

function updateCamera(timestamp: number): void {
  let ratio = (timestamp - tweenStartTime) / tweenDuration;
  if (ratio >= 1) {
    cameraPosition.x = tweenEnd.x;
    cameraPosition.y = tweenEnd.y;
    cameraPosition.z = tweenEnd.z;
    chooseCameraDestination(timestamp);
    ratio = 0;
  }
  const eased = ratio < 0.5 ? 2 * ratio * ratio : 1 - (-2 * ratio + 2) ** 2 / 2;
  cameraPosition.x = tweenStart.x + (tweenEnd.x - tweenStart.x) * eased;
  cameraPosition.y = tweenStart.y + (tweenEnd.y - tweenStart.y) * eased;
  cameraPosition.z = tweenStart.z + (tweenEnd.z - tweenStart.z) * eased;
  setCamera3DViewMatrix4FromLookAt(camera3d, cameraPosition, origin, up);
}

function frame(timestamp: number): void {
  updateClock(timestamp);
  updateCamera(timestamp);
  ctx.render(scene.root, camera3d, lights);
  requestAnimationFrame(frame);
}

const note = document.createElement('div');
note.textContent = 'Runtime sprite sheets · independent clock frames · pulsing button · autonomous camera';
Object.assign(note.style, {
  position: 'fixed',
  left: '16px',
  top: '14px',
  color: '#fff',
  font: '14px system-ui',
  textShadow: '0 1px 4px #000',
  pointerEvents: 'none',
});
document.body.appendChild(note);

window.addEventListener('resize', () => {
  const width = innerWidth;
  const height = innerHeight;
  const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio;
  ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`;
  ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera3d.projection as PerspectiveProjection).aspect = width / height;
});

requestAnimationFrame(frame);
