import type { Mesh, PerspectiveProjection, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  createAmbientLight,
  createCamera3D,
  createEnvironment,
  createFxaaEffect,
  createImageResource,
  createPerspectiveProjection,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createToneMapEffect,
  createUnlitMaterial,
  createVector3,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DDocumentFromAwd2Url,
  registerDeflateDecompressor,
  registerWebImageDecoders,
  setCamera3DViewMatrix4FromLookAt,
  setTextureUvOffset,
  setTextureUvScale,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createPointLightFromAway } from '../../shared/lighting';
import { createSwfSheetBuilder } from './swfSheets';
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

// DELIBERATE DEVIATION from the original's lighting, at the user's request.
//
// The original lights the room with three PointLights, and of the three only the blue key
// (0x2E71FF, diffuse 0.3) reaches the clock at all — the warm orange and red are short-range
// accents with fallOff 6759 sitting 20760 and 11194 units away, so they contribute exactly zero
// here. The result is a bedroom washed in blue by a lamp that exists nowhere in the scene.
//
// The clock lights its own room instead, since its display is the only light source the scene
// actually contains. A dim cool ambient stands in for night through a window, and a warm point
// light in front of the display carries the LED colour onto the table and the wallpaper behind.
// The display meshes are unlit, so the digits keep glowing at full strength while everything
// around them falls away into the dark.
const DISPLAY_GLOW_COLOR = 0xff3a08;
// The display centres on the frontscreen mesh at (286, 237, 2952), and hours-to-minutes runs
// along (0.707, 0, 0.708), so the face normal toward the viewer is (-0.708, 0, 0.707). The light
// sits a little way along it, in front of the glass rather than inside the case.
const displayGlow = createPointLightFromAway({
  color: DISPLAY_GLOW_COLOR,
  diffuse: 2.2,
  range: 22000,
  referenceDistance: 2600,
});
const lights = createScene3DLights({
  // Night, not blackness: enough that the wallpaper still reads as a shape.
  ambient: createAmbientLight({ color: 0x0c1018, intensity: 1 }),
  point: [displayGlow],
});
setVector3(displayGlow.position, -564, 237, 3800);

const assetRoot = 'away3d/SpriteSheetAnimation/';


const staticTextureFiles = {
  backside: 'm_backside.jpg',
  body: 'm_body.jpg',
  chromebody: 'm_chromebody.jpg',
  drawerbtn: 'm_drawerbtn.jpg',
  frontscreen: 'm_frontscreen.jpg',
  furniture: 'm_furniture.jpg',
  wall: 'm_wall.jpg',
  wire: 'm_wire.jpg',
} as const;
const [sceneDocument, environmentFaces, staticTextureEntries, furnitureNormal] = await Promise.all([
  loadScene3DDocumentFromAwd2Url(ctx.host, `${assetRoot}tictac/tictac.awd`),
  Promise.all(
    [0, 1, 2, 3, 4, 5].map((face) =>
      loadImageResourceFromUrl(ctx.host, `${assetRoot}spritesheets/textures/back_CB${face}.jpg`),
    ),
  ),
  Promise.all(Object.entries(staticTextureFiles).map(async ([name, file]) => [
    name,
    await loadImageResourceFromUrl(ctx.host, `${assetRoot}tictac/textures/${file}`),
  ] as const)),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tictac/textures/furniture_NM.jpg`),
]);
if (!sceneDocument) throw new Error('Could not load compressed tictac AWD');
const clock = createScene3DFromDocument(sceneDocument);
addNodeChild(scene.root, clock.root);
bakeGlEnvironmentIbl(ctx.state, createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, environmentFaces),
  intensity: 0.7,
}));
const staticTextures = new Map(staticTextureEntries);

// Every animated texture in this sample is built at runtime from MovieClips inside digits.swf,
// exactly as the original does with SpriteSheetHelper.generateFromMovieClip — the digits are the
// artwork from the SWF, not a redrawing of it. The grids match the original's calls:
//   digits    60 frames over 6x5 at 512   (the original spreads these over two maps; one is fine
//                                          here because a 6x10 grid of 512/6-wide cells still fits
//                                          comfortably inside the max texture size)
//   pulse     12 frames over 4x3 at 256
//   delimiter 10 frames over 5x2 at 256   (the original passes sourceMC.totalFrames, which is 10)
const buildSwfSheet = createSwfSheetBuilder(
  new Uint8Array(await (await fetch(`${assetRoot}spritesheets/digits.swf`)).arrayBuffer()),
);
const digitsSheetData = buildSwfSheet('digits', 60, 10, 6, 1024);
const delimiterSheetData = buildSwfSheet('delimiter', 10, 5, 2, 256);
const pulseSheetData = buildSwfSheet('pulse', 12, 4, 3, 256);
const digitsSheet = digitsSheetData.resource;
const delimiterSheet = delimiterSheetData.resource;
const pulseSheet = pulseSheetData.resource;

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
  } else {
    const image = staticTextures.get(mesh.name ?? '');
    if (image) {
      const texture = createTexture({ source: image });
      if (mesh.name === 'frontscreen') {
        mesh.materials = [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: texture })];
      } else {
        const chrome = mesh.name === 'chromebody';
        mesh.materials = [createStandardPbrMaterial({
          baseColor: 0xffffffff,
          baseColorMap: texture,
          normalMap: mesh.name === 'furniture'
            ? createTexture({ source: furnitureNormal, colorSpace: 'linear' })
            : undefined,
          metallic: chrome ? 0.82 : 0,
          roughness: chrome ? 0.22 : 0.68,
        })];
      }
    }
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
