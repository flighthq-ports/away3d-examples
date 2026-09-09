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

const modes = [
  { label: 'No mip-mapping', mipmaps: false, anisotropy: 1 },
  { label: 'Mip-mapping · no anisotropic filtering', mipmaps: true, anisotropy: 1 },
  { label: 'Mip-mapping · 2× anisotropic filtering', mipmaps: true, anisotropy: 2 },
  { label: 'Mip-mapping · 4× anisotropic filtering', mipmaps: true, anisotropy: 4 },
  { label: 'Mip-mapping · 8× anisotropic filtering', mipmaps: true, anisotropy: 8 },
  { label: 'Mip-mapping · 16× anisotropic filtering', mipmaps: true, anisotropy: 16 },
] as const;
let mode = 0;
const label = document.createElement('div');
Object.assign(label.style, {
  position: 'fixed', left: '24px', top: '20px', color: '#fff', font: '18px system-ui',
  textShadow: '0 1px 4px #000', pointerEvents: 'none',
});
document.body.appendChild(label);
function applyMode(): void {
  const next = modes[mode]!;
  // createTexture() clones the sampler passed to it, so the live sampler the renderer reads is
  // texture.sampler, not this module's own `sampler` reference — mutate that clone directly.
  texture.sampler.mipmaps = next.mipmaps;
  texture.sampler.minFilter = next.mipmaps ? 'linear-mipmap-linear' : 'linear';
  texture.sampler.anisotropy = next.anisotropy;
  label.textContent = `Click anywhere to change\n${next.label}`;
}
applyMode();
ctx.canvas.addEventListener('click', () => { mode = (mode + 1) % modes.length; applyMode(); });

const rotation = createQuaternion();
const yAxis = createVector3(0, 1, 0);
function frame(ts: number): void {
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
