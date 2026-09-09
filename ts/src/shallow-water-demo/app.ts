import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createBoxMeshGeometry,
  createEnvironment,
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
  loadImageResourceFromUrl,
  pickScene3D,
  setMeshGeometryVertexPosition,
  setVector3,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
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

const skyFaces = await Promise.all(
  ['positive_x', 'negative_x', 'positive_y', 'negative_y', 'positive_z', 'negative_z'].map((face) =>
    loadImageResourceFromUrl(ctx.host, `skybox/snow_${face}.jpg`),
  ),
);
const environment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, skyFaces),
  intensity: 1,
});
bakeGlEnvironmentIbl(ctx.state, environment);

const waterGeometry: MeshGeometry = createPlaneMeshGeometry(900, 900, 72, 72);
const waterMaterial = createStandardPbrMaterial({
  baseColor: 0x5cbde0c8,
  metallic: 0.68,
  roughness: 0.06,
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

const gridWidth = 73;
const gridHeight = 73;
const gridSpacing = 900 / (gridWidth - 1);
const gravity = 980;
const fluidDepth = 8;
const viscosity = 0.3;
const fixedStep = 1 / 120;
let displacement = new Float32Array(gridWidth * gridHeight);
let nextDisplacement = new Float32Array(gridWidth * gridHeight);
const velocity = new Float32Array(gridWidth * gridHeight);
const vertexCell = new Uint32Array(vertexCount);
for (let i = 0; i < vertexCount; i++) {
  const column = Math.round((baseX[i]! / 900 + 0.5) * (gridWidth - 1));
  const row = Math.round((baseZ[i]! / 900 + 0.5) * (gridHeight - 1));
  vertexCell[i] = row * gridWidth + column;
}

function disturb(x: number, z: number, strength = 18): void {
  const centerX = Math.round((x / 900 + 0.5) * (gridWidth - 1));
  const centerZ = Math.round((z / 900 + 0.5) * (gridHeight - 1));
  const brushRadius = 4;
  for (let dz = -brushRadius; dz <= brushRadius; dz++) {
    for (let dx = -brushRadius; dx <= brushRadius; dx++) {
      const column = centerX + dx;
      const row = centerZ + dz;
      if (column <= 0 || column >= gridWidth - 1 || row <= 0 || row >= gridHeight - 1) continue;
      const distance = Math.hypot(dx, dz);
      if (distance > brushRadius) continue;
      const falloff = 1 - distance / brushRadius;
      displacement[row * gridWidth + column] += strength * falloff * falloff;
    }
  }
}

function solveShallowWater(deltaTime: number): void {
  const accelerationScale = gravity * fluidDepth / (gridSpacing * gridSpacing);
  const damping = Math.exp(-viscosity * deltaTime);
  nextDisplacement.fill(0);
  for (let row = 1; row < gridHeight - 1; row++) {
    for (let column = 1; column < gridWidth - 1; column++) {
      const index = row * gridWidth + column;
      const laplacian = displacement[index - 1]! + displacement[index + 1]!
        + displacement[index - gridWidth]! + displacement[index + gridWidth]!
        - 4 * displacement[index]!;
      velocity[index] = (velocity[index]! + accelerationScale * laplacian * deltaTime) * damping;
      nextDisplacement[index] = displacement[index]! + velocity[index]! * deltaTime;
    }
  }
  const previous = displacement;
  displacement = nextDisplacement;
  nextDisplacement = previous;
}

const hit = createScene3DHit();
ctx.canvas.addEventListener('pointerup', (event) => {
  const rect = ctx.canvas.getBoundingClientRect();
  const screenX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const screenY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const picked = pickScene3D(scene.root, camera, screenX, screenY, hit);
  if (picked?.node === water) disturb(picked.pointX, picked.pointZ, -24);
});

let nextRain = 0;
let previousTime = performance.now();
let simulationAccumulator = 0;
function frame(ts: number): void {
  if (ts >= nextRain) {
    disturb((Math.random() - 0.5) * 760, (Math.random() - 0.5) * 760);
    nextRain = ts + 350;
  }
  simulationAccumulator += Math.min(0.05, (ts - previousTime) / 1000);
  previousTime = ts;
  while (simulationAccumulator >= fixedStep) {
    solveShallowWater(fixedStep);
    simulationAccumulator -= fixedStep;
  }
  for (let i = 0; i < vertexCount; i++) {
    setMeshGeometryVertexPosition(
      waterGeometry,
      i,
      baseX[i]!,
      displacement[vertexCell[i]!]!,
      baseZ[i]!,
    );
  }
  computeMeshGeometryNormals(waterGeometry, waterGeometry);
  computeMeshGeometryTangents(waterGeometry, waterGeometry);
  invalidateMeshGeometry(waterGeometry);
  orbit.update(); ctx.render(scene.root, camera, lights, environment); requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const width = innerWidth; const height = innerHeight; const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio; ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`; ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});
requestAnimationFrame(frame);
