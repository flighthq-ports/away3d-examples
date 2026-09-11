import type { Mesh, PerspectiveProjection, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  createAmbientLight,
  createBloomEffect,
  createCamera3D,
  createEnvironment,
  createFxaaEffect,
  createImageResource,
  createPerspectiveProjection,
  createSampler,
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
  // Black. The room is a partial set — a wall and a table, no floor — so the clear colour shows
  // through at the edges of frame, and against a dark bedroom any tint reads as a lit surface.
  // Note the clear colour is consumed as LINEAR and re-encoded for display, so it comes out much
  // brighter than the hex suggests: the previous 0x02040a displayed around (16, 23, 56).
  backgroundColor: 0x000000ff,
  effects: [
    // The digits are unlit materials at full texture brightness against a near-black room, so
    // they are the only thing above the threshold — the bloom reads as the LEDs themselves
    // emitting rather than as a general haze over the image.
    // Threshold has to sit below the DIGITS' luminance, which is far lower than their apparent
    // brightness: 0xff3a08 decodes to linear (1.0, 0.042, 0.002), and red carries only 0.2126 of
    // luma, so the digits weigh in at 0.243. A 0.35 threshold excluded them entirely and the
    // bloom did nothing. Anything above this is the white silkscreen on the display face, which
    // is a small area and reads fine slightly hot.
    createBloomEffect({ threshold: 0.15, intensity: 1.4, radius: 1.3, passes: 5 }),
    createToneMapEffect({ exposure: 1.1 }),
    createFxaaEffect(),
  ],
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
// The light comes off the digit groups themselves rather than from one lamp floating in front of
// the case, so each readout throws its own pool and the spill falls where the numbers actually
// are. Positions are the display meshes' own, pushed clear of the glass along the face normal:
// hours-to-minutes runs along (0.707, 0, 0.708), so the normal toward the viewer is
// (-0.708, 0, 0.707). Four is the whole forward-light budget (MAX_FORWARD_LIGHTS), which is
// exactly the four lit elements on the clock.
const GLASS_OFFSET = 400;
const NORMAL_X = -0.708;
const NORMAL_Z = 0.707;
const emitters: [number, number, number][] = [
  [-1253, 231, 1413], // hours
  [1823, 231, 4492], // minutes
  [219, -1092, 3016], // seconds
  [307, 656, 2931], // delimiter
];
const displayLights = emitters.map(([x, y, z]) => {
  const light = createPointLightFromAway({
    color: DISPLAY_GLOW_COLOR,
    // Individually weak and short-range: the glow should die away within arm's reach of the
    // clock, leaving the rest of the room black.
    diffuse: 0.85,
    range: 9000,
    referenceDistance: 1100,
  });
  setVector3(light.position, x + NORMAL_X * GLASS_OFFSET, y, z + NORMAL_Z * GLASS_OFFSET);
  return light;
});
const lights = createScene3DLights({
  // Barely there — just enough that the wallpaper is a shape rather than a void.
  // Just enough to make out the room: the wallpaper and the table edge should be readable
  // as shapes without competing with the display.
  ambient: createAmbientLight({ color: 0x0b1018, intensity: 1 }),
  point: displayLights,
});

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
// The original uses this cube through an EnvMapMethod — a reflection on specific materials, not
// a light. Baked as scene IBL at 0.7 it behaves as a large ambient source and lights the whole
// room regardless of the lamps, which is what kept the wallpaper bright in a supposedly dark
// bedroom. Held low enough to still catch the chrome bezel without illuminating the room.
bakeGlEnvironmentIbl(ctx.state, createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, environmentFaces),
  intensity: 0.05,
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
// Sheet sizes are generous because the camera pans right up to the display, and a cell is the
// entire resolution one frame ever has. At the original's 512 over a 6x5 grid a digit pair is
// about 85x102 texels, which magnifies into visible stair-stepping from this close. The SWF is
// vector art, so it re-rasterises crisply at any size — this costs memory, not fidelity.
// 10 columns of 2048 gives each digit pair 204 texels across, which held up with no visible
// stair-stepping at the closest the camera gets. 4096 was tried first and is indistinguishable
// here, so it is not worth the four-fold memory (a 4090x1890 sheet is ~31MB against ~7.7MB).
// The fit is per clip, because it depends on how each was authored — see SwfSheetFit. `digits`
// hides its glyphs inside a panel three times their width, so it is measured to the lit artwork;
// the other two rely on their backdrop to place the art inside the cell.
const digitsSheetData = buildSwfSheet('digits', 60, 10, 6, 2048, 'lit');
const delimiterSheetData = buildSwfSheet('delimiter', 10, 5, 2, 1024, 'opaque');
const pulseSheetData = buildSwfSheet('pulse', 12, 4, 3, 1024, 'opaque');
const digitsSheet = digitsSheetData.resource;
const delimiterSheet = delimiterSheetData.resource;
const pulseSheet = pulseSheetData.resource;

// Trilinear plus anisotropy: the display is usually seen at a slant, which is exactly the case
// plain bilinear handles worst. Mipmapping a sprite sheet normally risks neighbouring cells
// bleeding into each other at the coarser levels, but each frame is inset to 84% of its cell
// (CONTENT_FILL), so there is an 8% gutter of empty space on every side absorbing it.
function createSpriteSampler() {
  return createSampler({
    anisotropy: 8,
    magFilter: 'linear',
    minFilter: 'linear-mipmap-linear',
    mipmaps: true,
    wrapU: 'clamp-to-edge',
    wrapV: 'clamp-to-edge',
  });
}

function createSpriteTexture(source: ReturnType<typeof createImageResource>, columns: number, rows: number): Texture {
  const texture = createTexture({ source, sampler: createSpriteSampler() });
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
        // The bezel is called `chromebody`, but on an alarm clock of this kind it is chromed
        // plastic rather than metal. As a metal at 0.82 its albedo tinted the reflection and it
        // mirrored the room; as a dielectric it keeps a tight specular roll-off along the rim —
        // which is what actually catches the digits — without behaving like polished steel.
        const chrome = mesh.name === 'chromebody';
        mesh.materials = [createStandardPbrMaterial({
          baseColor: 0xffffffff,
          baseColorMap: texture,
          normalMap: mesh.name === 'furniture'
            ? createTexture({ source: furnitureNormal, colorSpace: 'linear' })
            : undefined,
          metallic: 0,
          roughness: chrome ? 0.34 : 0.68,
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
