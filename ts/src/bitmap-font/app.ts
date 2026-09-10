import type { BitmapFont, MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createFxaaEffect,
  createMesh,
  createMeshGeometry,
  createNode3D,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTextureAtlasFromImageResource,
  createToneMapEffect,
  createUnlitMaterial,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  parseBitmapFontXml,
  setQuaternionFromEuler,
  setVector3,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x000000ff,
  effects: [createToneMapEffect(), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ y: 200, z: -600, near: 20, far: 3000 });
const lights = createScene3DLights();

const assetRoot = 'away3d/BitmapFont/fonts/';
const image = await loadImageResourceFromUrl(ctx.host, `${assetRoot}BerberRevKC_260.png`);
const atlas = createTextureAtlasFromImageResource(image);
const fnt = await fetch(`${assetRoot}BerberRevKC_260.fnt`).then((response) => response.text());
const font = parseBitmapFontXml(fnt, { resolvePage: () => atlas });
if (!font) throw new Error('Could not parse BerberRevKC_260.fnt');

function createTextGeometry(bitmapFont: Readonly<BitmapFont>, text: string, fontSize: number): MeshGeometry {
  const scale = fontSize / 260;
  let width = 0;
  for (const character of text) width += (bitmapFont.glyphs.get(character.codePointAt(0)!)?.advance ?? 0) * scale;

  const vertices: number[] = [];
  const indices: number[] = [];
  let cursor = -width / 2;
  for (const character of text) {
    const glyph = bitmapFont.glyphs.get(character.codePointAt(0)!);
    if (!glyph) continue;
    const x0 = cursor + glyph.bearingX * scale;
    const x1 = x0 + glyph.width * scale;
    const y0 = (bitmapFont.metrics.ascent - glyph.bearingY) * scale;
    const y1 = y0 - glyph.height * scale;
    const u0 = glyph.x / image.width;
    const v0 = glyph.y / image.height;
    const u1 = (glyph.x + glyph.width) / image.width;
    const v1 = (glyph.y + glyph.height) / image.height;
    const base = vertices.length / 5;
    vertices.push(
      x0, y0, 0, u0, v0,
      x0, y1, 0, u0, v1,
      x1, y1, 0, u1, v1,
      x1, y0, 0, u1, v0,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    cursor += glyph.advance * scale;
  }

  return createMeshGeometry({
    layout: {
      stride: 20,
      attributes: [
        { semantic: 'position', format: 'float32x3', byteOffset: 0 },
        { semantic: 'uv0', format: 'float32x2', byteOffset: 12 },
      ],
    },
    topology: 'triangle-list',
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  });
}

const labelGeometry = createTextGeometry(font, 'THIS IS A TEST', 100);
const fontTexture = createTexture({ source: image });
const labelCount = 14;
for (let i = 0; i < labelCount; i++) {
  const angle = i / labelCount * Math.PI * 2;
  // Matches the original's two-level layout: a container swept to this label's heading, holding an
  // upright text panel. The panels all sit centred on the same vertical axis and stacked in Y — the
  // original's `x = -400` / `y = -300` are the centring offsets of a top-left-registered 800x600
  // TextField, NOT a ring radius, so the result is a skewer of signs rather than a spiral
  // staircase. This geometry is already centred horizontally, so only the vertical offset carries.
  //
  // The original's `rotationX = 90` is not a tilt to reproduce: an Away3D plane lies flat in XZ by
  // default (yUp), so that rotation is what STANDS the sign up to face the viewer. This geometry is
  // built upright in XY already, so it needs no tilt — adding one would lay the text face-up.
  //
  // The heading is negated versus the original's literal value: Away3D's rotation direction is
  // left-handed and this SDK's is right-handed, so reusing the raw angle sweeps the stack the wrong
  // way round.
  const container = createNode3D();
  setQuaternionFromEuler(container.rotation, 0, -angle, 0);
  invalidateNodeLocalTransform(container);
  addNodeChild(scene.root, container);

  const color = ((Math.random() * 0xffffff) << 8 | 0xff) >>> 0;
  const label = createMesh(labelGeometry, [createUnlitMaterial({
    baseColor: color,
    baseColorMap: fontTexture,
    alphaMode: 'blend',
    doubleSided: true,
  })]);
  setVector3(label.position, 0, -300 + i * 60, 0);
  invalidateNodeLocalTransform(label);
  addNodeChild(container, label);
}

// Stands in for the original's away3d.debug.AwayFPS readout: measured framerate plus the scene's
// triangle count, top-left. PLY is fixed here because the label set never changes after startup.
const triangleCount = labelCount * (labelGeometry.indices!.length / 3);
const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', left: '10px', top: '10px', zIndex: '3', color: '#fff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textShadow: '0 1px 3px #000',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;
function updateStats(timestamp: number): void {
  framesThisSecond++;
  if (timestamp - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (timestamp - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = timestamp;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;
}

const idleFrameLimit = 600;
let idleFrames = Math.floor(idleFrameLimit * 0.9);
let mouseActive = true;
const isMobile = /Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
const idleOverlay = document.createElement('div');
if (!isMobile) {
  Object.assign(idleOverlay.style, {
    position: 'fixed', inset: '0', zIndex: '2', background: 'rgba(0, 0, 0, 0.8)',
    pointerEvents: 'none', display: 'none',
  });
  document.body.appendChild(idleOverlay);
  window.addEventListener('mousemove', () => {
    mouseActive = true;
    idleFrames = 0;
  });
  document.documentElement.addEventListener('mouseleave', () => {
    mouseActive = false;
  });
}

let rotation = 0;
let previousTime = performance.now();
function frame(timestamp: number): void {
  const deltaTime = Math.min(0.1, (timestamp - previousTime) / 1000);
  previousTime = timestamp;
  updateStats(timestamp);
  if (!isMobile) {
    idleOverlay.style.display = !mouseActive || idleFrames > idleFrameLimit ? 'block' : 'none';
    if (mouseActive) idleFrames++;
  }
  if (mouseActive) {
    rotation += deltaTime * Math.PI / 3;
    setQuaternionFromEuler(scene.root.rotation, 0, rotation, 0);
    invalidateNodeLocalTransform(scene.root);
  }
  ctx.render(scene.root, camera, lights);
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
