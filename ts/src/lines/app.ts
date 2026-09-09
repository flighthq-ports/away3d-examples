import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createFxaaEffect,
  createMesh,
  createMeshGeometry,
  createScene3D,
  createScene3DLights,
  createSphereMeshGeometry,
  createToneMapEffect,
  createUnlitMaterial,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  setVector3,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, backgroundColor: 0x02040aff, effects: [createToneMapEffect(), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ far: 50000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 4000, panAngle: 0, tiltAngle: 12, targetY: 100 });
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 1200, maxDistance: 8000 }); const lights = createScene3DLights();

const columns = 64; const rows = 42; const spacing = 70; const points: number[] = [];
function appendLine(x1: number, z1: number, x2: number, z2: number): void { points.push(x1, 0, z1, x2, 0, z2); }
for (let z = 0; z < rows; z++) for (let x = 0; x < columns; x++) {
  const px = (x - (columns - 1) / 2) * spacing; const pz = (z - (rows - 1) / 2) * spacing;
  if (x + 1 < columns) appendLine(px, pz, px + spacing, pz);
  if (z + 1 < rows) appendLine(px, pz, px, pz + spacing);
}
const geometry: MeshGeometry = createMeshGeometry({
  layout: { stride: 12, attributes: [{ semantic: 'position', format: 'float32x3', byteOffset: 0 }] },
  topology: 'line-list', vertices: new Float32Array(points),
});
const grid = createMesh(geometry, [createUnlitMaterial({ baseColor: 0x3289ffff })]); addNodeChild(scene.root, grid);
const markers = [0xff4274ff, 0x66ffd1ff, 0xffcc45ff].map((color) => {
  const mesh = createMesh(createSphereMeshGeometry(55, 18, 12), [createUnlitMaterial({ baseColor: color })]); addNodeChild(scene.root, mesh); return mesh;
});
function heightAt(x: number, z: number, t: number): number {
  return Math.sin(Math.hypot(x, z) * 0.008 - t * 2.2) * 105 + Math.cos(x * 0.006 + t) * 45;
}
function frame(ts: number): void {
  const t = ts / 1000; const vertices = geometry.vertices;
  for (let i = 0; i < vertices.length; i += 3) vertices[i + 1] = heightAt(vertices[i]!, vertices[i + 2]!, t);
  invalidateMeshGeometry(geometry);
  for (let i = 0; i < markers.length; i++) {
    const angle = t * (0.35 + i * 0.08) + i * 2.1; const x = Math.sin(angle) * (500 + i * 300); const z = Math.cos(angle) * (500 + i * 300);
    setVector3(markers[i]!.position, x, heightAt(x, z, t) + 85, z); invalidateNodeLocalTransform(markers[i]!);
  }
  orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
