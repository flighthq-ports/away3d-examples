import type { PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createBoxMeshGeometry,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DHit,
  createScene3DLights,
  createTexture,
  createToneMapEffect,
  createUnlitMaterial,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  pickScene3D,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect(), createFxaaEffect()] });
const scene = createScene3D();
const camera = createCameraFromAway({ y: 500, z: -600, far: 3000 });
const lights = createScene3DLights();
const [floorImage, cubeImage] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, 'floor_diffuse.jpg'), loadImageResourceFromUrl(ctx.host, 'trinket_diffuse.jpg'),
]);
const floor = createMesh(createPlaneMeshGeometry(700, 700), [
  createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: floorImage }) }),
]);
const cube = createMesh(createBoxMeshGeometry(100, 100, 100), [
  createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: cubeImage }) }),
]);
cube.position.y = 50;
invalidateNodeLocalTransform(cube);
addNodeChild(scene.root, floor); addNodeChild(scene.root, cube);

let startX = 0; let startZ = 0; let targetX = 0; let targetZ = 0; let started = -1;
const hit = createScene3DHit();
ctx.canvas.addEventListener('pointerup', (event) => {
  const rect = ctx.canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const picked = pickScene3D(scene.root, camera, x, y, hit);
  if (picked?.node !== floor) return;
  startX = cube.position.x; startZ = cube.position.z;
  targetX = picked.pointX; targetZ = picked.pointZ; started = performance.now();
});

const help = document.createElement('div');
help.textContent = 'Click the floor to move the cube along a curved path';
Object.assign(help.style, { position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui', textShadow: '0 1px 4px #000' });
document.body.appendChild(help);
function frame(ts: number): void {
  if (started >= 0) {
    const t = Math.min(1, (ts - started) / 500);
    const u = 1 - t;
    cube.position.x = u * u * startX + 2 * u * t * targetX + t * t * targetX;
    cube.position.z = u * u * startZ + 2 * u * t * startZ + t * t * targetZ;
    cube.position.y = 50 + Math.sin(t * Math.PI) * 35;
    invalidateNodeLocalTransform(cube);
    if (t === 1) started = -1;
  }
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
