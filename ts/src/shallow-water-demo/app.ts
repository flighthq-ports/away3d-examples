import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createBoxMeshGeometry,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DHit,
  createScene3DLights,
  createStandardPbrMaterial,
  createToneMapEffect,
  createVector3,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  pickScene3D,
  setMeshGeometryVertexPosition,
  setVector3,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x071a27ff,
  effects: [createToneMapEffect({ exposure: 1.25 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 4000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 1100, panAngle: 30, tiltAngle: 28, targetY: 20 });
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 500, maxDistance: 2100 });
const light = createDirectionalLightFromAway({
  direction: { x: -0.35, y: -1, z: -0.2 }, diffuse: 1.25, ambient: 0.18, color: 0xc9e7ff,
});
const lights = createScene3DLights({ ambient: light.ambient, directional: light.directional });

const waterGeometry: MeshGeometry = createPlaneMeshGeometry(900, 900, 72, 72);
const waterMaterial = createStandardPbrMaterial({
  baseColor: 0x5cbde0c8,
  metallic: 0.55,
  roughness: 0.12,
  alphaMode: 'blend',
  doubleSided: true,
});
const water = createMesh(waterGeometry, [waterMaterial]);
setVector3(water.position, 0, 8, 0);
invalidateNodeLocalTransform(water);
addNodeChild(scene.root, water);

const tileMaterial = createStandardPbrMaterial({ baseColor: 0x477e91ff, metallic: 0.02, roughness: 0.8 });
const floor = createMesh(createBoxMeshGeometry(940, 18, 940), [tileMaterial]);
setVector3(floor.position, 0, -55, 0); invalidateNodeLocalTransform(floor); addNodeChild(scene.root, floor);
for (const [width, height, depth, x, z] of [
  [1020, 115, 40, 0, -490], [1020, 115, 40, 0, 490],
  [40, 115, 940, -490, 0], [40, 115, 940, 490, 0],
] as const) {
  const wall = createMesh(createBoxMeshGeometry(width, height, depth), [tileMaterial]);
  setVector3(wall.position, x, 0, z); invalidateNodeLocalTransform(wall); addNodeChild(scene.root, wall);
}

const vertexCount = getMeshGeometryVertexCount(waterGeometry);
const baseX = new Float32Array(vertexCount);
const baseZ = new Float32Array(vertexCount);
const point = createVector3();
for (let i = 0; i < vertexCount; i++) {
  getMeshGeometryVertexPosition(point, waterGeometry, i);
  baseX[i] = point.x; baseZ[i] = point.z;
}

interface Ripple { born: number; x: number; z: number }
const ripples: Ripple[] = [];
function addRipple(x: number, z: number, born = performance.now()): void {
  ripples.push({ x, z, born });
  if (ripples.length > 16) ripples.shift();
}

const hit = createScene3DHit();
ctx.canvas.addEventListener('pointerup', (event) => {
  const rect = ctx.canvas.getBoundingClientRect();
  const screenX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const screenY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const picked = pickScene3D(scene.root, camera, screenX, screenY, hit);
  if (picked?.node === water) addRipple(picked.pointX, picked.pointZ);
});

let nextRain = 0;
function frame(ts: number): void {
  if (ts >= nextRain) {
    addRipple((Math.random() - 0.5) * 760, (Math.random() - 0.5) * 760, ts);
    nextRain = ts + 520;
  }
  for (let i = 0; i < vertexCount; i++) {
    const x = baseX[i]!; const z = baseZ[i]!;
    let y = Math.sin(x * 0.025 + ts * 0.0018) * 2.4 + Math.cos(z * 0.021 - ts * 0.0014) * 2;
    for (const ripple of ripples) {
      const age = (ts - ripple.born) / 1000;
      if (age < 0 || age > 4) continue;
      const distance = Math.hypot(x - ripple.x, z - ripple.z);
      const ring = distance - age * 145;
      y += Math.sin(ring * 0.12) * Math.exp(-Math.abs(ring) * 0.035) * (1 - age / 4) * 22;
    }
    setMeshGeometryVertexPosition(waterGeometry, i, x, y, z);
  }
  while (ripples[0] && ts - ripples[0].born > 4000) ripples.shift();
  computeMeshGeometryNormals(waterGeometry, waterGeometry);
  computeMeshGeometryTangents(waterGeometry, waterGeometry);
  invalidateMeshGeometry(waterGeometry);
  orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}

const help = document.createElement('div');
help.textContent = 'Click the water to make a ripple · drag to orbit · wheel to zoom';
Object.assign(help.style, { position: 'fixed', left: '18px', top: '16px', color: '#e8faff', font: '14px system-ui', textShadow: '0 1px 5px #000', pointerEvents: 'none' });
document.body.appendChild(help);
window.addEventListener('resize', () => {
  const width = innerWidth; const height = innerHeight; const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio; ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`; ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});
requestAnimationFrame(frame);
