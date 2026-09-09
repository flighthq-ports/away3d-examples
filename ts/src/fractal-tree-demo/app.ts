import type { PerspectiveProjection, Vector3Like } from '@flighthq/sdk';
import {
  addNodeChild,
  createCylinderMeshGeometry,
  createFxaaEffect,
  createIcosphereMeshGeometry,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createVector3,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  scaleMeshGeometryUvs,
  setQuaternionFromUnitVectors,
  setVector3,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x07111cff,
  effects: [createToneMapEffect({ exposure: 1.15 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 6000 });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 1850,
  panAngle: 28,
  tiltAngle: 16,
  targetY: 650,
  minTiltAngle: -8,
  maxTiltAngle: 70,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 650, maxDistance: 3600 });

const light = createDirectionalLightFromAway({
  direction: { x: -0.35, y: -1, z: -0.45 },
  diffuse: 1.3,
  ambient: 0.16,
});
const lights = createScene3DLights({ ambient: light.ambient, directional: light.directional });
const assetRoot = 'away3d/FractalTreeDemo/';
const [bark, leaf, grass] = await Promise.all([
  loadImageResourceFromUrl(`${assetRoot}tree/bark0.jpg`),
  loadImageResourceFromUrl(`${assetRoot}tree/leaf4.jpg`),
  loadImageResourceFromUrl(`${assetRoot}terrain/grass.jpg`),
]);

const barkMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: bark, sampler: createTilingSampler() }),
  metallic: 0,
  roughness: 0.88,
});
const leafMaterial = createStandardPbrMaterial({
  baseColor: 0x8fc868ff,
  baseColorMap: createTexture({ source: leaf }),
  metallic: 0,
  roughness: 0.72,
});
const groundSampler = createTilingSampler();
const groundGeometry = createPlaneMeshGeometry(3600, 3600);
scaleMeshGeometryUvs(groundGeometry, 18, 18);
const ground = createMesh(groundGeometry, [createStandardPbrMaterial({
  baseColor: 0x697e58ff,
  baseColorMap: createTexture({ source: grass, sampler: groundSampler }),
  metallic: 0,
  roughness: 0.98,
})]);
addNodeChild(scene.root, ground);

const branchGeometry = createCylinderMeshGeometry(1, 1, 1, 8, true);
const leafGeometry = createIcosphereMeshGeometry(1, 1);
const yAxis = createVector3(0, 1, 0);

function addBranch(start: Readonly<Vector3Like>, direction: Readonly<Vector3Like>, length: number, radius: number): Vector3Like {
  const end = createVector3(
    start.x + direction.x * length,
    start.y + direction.y * length,
    start.z + direction.z * length,
  );
  const branch = createMesh(branchGeometry, [barkMaterial]);
  setVector3(branch.position, (start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  setVector3(branch.scale, radius, length, radius);
  setQuaternionFromUnitVectors(branch.rotation, yAxis, direction);
  invalidateNodeLocalTransform(branch);
  addNodeChild(scene.root, branch);
  return end;
}

function grow(start: Readonly<Vector3Like>, length: number, radius: number, yaw: number, pitch: number, depth: number): void {
  const direction = createVector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  );
  const end = addBranch(start, direction, length, radius);
  if (depth === 0) {
    const crown = createMesh(leafGeometry, [leafMaterial]);
    setVector3(crown.position, end.x, end.y, end.z);
    setVector3(crown.scale, 70, 48, 70);
    invalidateNodeLocalTransform(crown);
    addNodeChild(scene.root, crown);
    return;
  }

  const bend = 0.42 + depth * 0.025;
  grow(end, length * 0.76, radius * 0.7, yaw - bend, 0.92 + Math.sin(yaw * 2.3) * 0.09, depth - 1);
  grow(end, length * 0.73, radius * 0.68, yaw + bend, 0.88 + Math.cos(yaw * 1.7) * 0.1, depth - 1);
}

const trunkTop = addBranch(createVector3(0, 0, 0), createVector3(0, 1, 0), 380, 46);
grow(trunkTop, 290, 34, 0.2, 1.14, 6);
grow(trunkTop, 275, 32, 2.3, 1.02, 6);
grow(trunkTop, 260, 31, 4.35, 1.08, 6);

const help = document.createElement('div');
help.textContent = 'Drag to orbit · wheel to zoom · recursive geometry generated at startup';
Object.assign(help.style, {
  position: 'fixed', left: '18px', top: '16px', color: '#eef6e8', font: '14px system-ui',
  textShadow: '0 1px 5px #000', pointerEvents: 'none',
});
document.body.appendChild(help);

function frame(): void {
  orbit.update();
  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const width = innerWidth; const height = innerHeight; const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio; ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`; ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});
requestAnimationFrame(frame);
