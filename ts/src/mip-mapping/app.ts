import type { PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  copyQuaternion,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createUnlitMaterial,
  createVector3,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  scaleMeshGeometryUvs,
  setQuaternionFromAxisAngle,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  effects: [createToneMapEffect(), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ y: 25, targetY: -500, targetZ: 2000, far: 30000 });
const sampler = createTilingSampler();
sampler.mipmaps = false;
sampler.minFilter = 'linear';
sampler.anisotropy = 1;
const texture = createTexture({ source: await loadImageResourceFromUrl(ctx.host, 'floor_diffuse.jpg'), sampler });
const material = createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: texture });
const geometry = createPlaneMeshGeometry(20000, 20000);
scaleMeshGeometryUvs(geometry, 150, 150);
const plane = createMesh(geometry, [material]);
addNodeChild(scene.root, plane);
const lights = createScene3DLights();

// Labels are the original's verbatim strings, not restyled paraphrases.
const modes = [
  { label: 'No Mip-mapping', mipmaps: false, anisotropy: 1 },
  { label: 'Mip-mapping with no anisotropic filtering', mipmaps: true, anisotropy: 1 },
  { label: 'Mip-mapping with 2X anisotropic filtering', mipmaps: true, anisotropy: 2 },
  { label: 'Mip-mapping with 4X anisotropic filtering', mipmaps: true, anisotropy: 4 },
  { label: 'Mip-mapping with 8X anisotropic filtering', mipmaps: true, anisotropy: 8 },
  { label: 'Mip-mapping with 16X anisotropic filtering', mipmaps: true, anisotropy: 16 },
] as const;
let mode = 0;

// Two separate fields, matching the original's placement, sizes and colours: a white 32px prompt at
// (300, 50) and a blue 24px state readout at (300, 100).
const clickText = document.createElement('div');
clickText.textContent = 'Click anywhere to change';
Object.assign(clickText.style, {
  position: 'fixed', left: '300px', top: '50px', zIndex: '2', color: '#ffffff',
  font: '32px sans-serif', pointerEvents: 'none',
});
document.body.appendChild(clickText);

const label = document.createElement('div');
Object.assign(label.style, {
  position: 'fixed', left: '300px', top: '100px', zIndex: '2', color: '#2222ff',
  font: '24px sans-serif', pointerEvents: 'none',
});
document.body.appendChild(label);

// Stands in for the original's away3d.debug.AwayFPS readout at (10, 10).
const triangleCount = geometry.indices !== null
  ? geometry.indices.length / 3
  : geometry.vertices.length / (geometry.layout.stride / 4) / 3;
const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', left: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textShadow: '0 1px 3px #000',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

function applyMode(): void {
  const next = modes[mode]!;
  // createTexture() clones the sampler passed to it, so the live sampler the renderer reads is
  // texture.sampler, not this module's own `sampler` reference — mutate that clone directly.
  texture.sampler.mipmaps = next.mipmaps;
  texture.sampler.minFilter = next.mipmaps ? 'linear-mipmap-linear' : 'linear';
  texture.sampler.anisotropy = next.anisotropy;
  label.textContent = next.label;
}
applyMode();
ctx.canvas.addEventListener('click', () => { mode = (mode + 1) % modes.length; applyMode(); });

const rotation = createQuaternion();
const yAxis = createVector3(0, 1, 0);
function frame(ts: number): void {
  framesThisSecond++;
  if (ts - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (ts - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = ts;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;

  setQuaternionFromAxisAngle(rotation, yAxis, ts / 2500);
  copyQuaternion(plane.rotation, rotation);
  invalidateNodeLocalTransform(plane);
  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = window.innerWidth; const h = window.innerHeight; const pr = window.devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr;
  ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
