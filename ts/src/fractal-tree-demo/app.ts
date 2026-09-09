import type { ImageResource, MeshGeometry, PerspectiveProjection, Vector3Like } from '@flighthq/sdk';
import {
  addNodeChild,
  appendInstancedMeshInstance,
  bakeGlEnvironmentIbl,
  composeMatrix4,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createCylinderMeshGeometry,
  createEnvironment,
  createFxaaEffect,
  createIcosphereMeshGeometry,
  createImageResource,
  createInstancedMesh,
  createMatrix4,
  createMesh,
  createPlaneMeshGeometry,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createToneMapEffect,
  createVector3,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  invalidateMeshGeometry,
  loadImageResourceFromUrl,
  setMeshGeometryVertexPosition,
  setQuaternionFromUnitVectors,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const TERRAIN_SIZE = 120_000;
const TERRAIN_HEIGHT = 22_000;
const TERRAIN_BASE = -6000;
const TREE_COUNT = 25;

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x000000ff,
  effects: [createToneMapEffect({ exposure: 1.15 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 250000 });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 25000,
  panAngle: 0,
  tiltAngle: 10,
  targetY: 4500,
  minTiltAngle: 0,
  maxTiltAngle: 70,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 8000, maxDistance: 80000 });

const moon = createDirectionalLightFromAway({
  direction: { x: -0.3, y: -0.45, z: -1 },
  diffuse: 0.75,
  ambient: 0.1,
  color: 0xd9e6ff,
});
const lights = createScene3DLights({ ambient: moon.ambient, directional: moon.directional });

const assetRoot = 'away3d/FractalTreeDemo/';
const [
  bark, barkNormal, barkSpecular, leaf, grass, rock, beach, heightImage, terrainNormal, splatImage, skyFaces,
] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/bark0.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/barkNRM.png`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/barkSPEC.png`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/leaf4.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/grass.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/rock.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/beach.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/terrain_heights.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/terrain_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/terrain_splats.png`),
  Promise.all(
    ['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'].map((face) =>
      loadImageResourceFromUrl(ctx.host, `${assetRoot}skybox/grimnight_${face}.png`),
    ),
  ),
]);

const environment = createEnvironment({
  environment: createCubeTextureFromAwayFaces(ctx.host, skyFaces),
  intensity: 0.6,
});
bakeGlEnvironmentIbl(ctx.state, environment);

function pixels(image: Readonly<ImageResource>): ImageData {
  if (!image.source) throw new Error('The terrain source image is not drawable');
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('A 2D canvas is required to build the terrain');
  context.drawImage(image.source, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

const heightPixels = pixels(heightImage);
function terrainHeight(x: number, z: number): number {
  const u = Math.max(0, Math.min(1, x / TERRAIN_SIZE + 0.5));
  const v = Math.max(0, Math.min(1, z / TERRAIN_SIZE + 0.5));
  const px = Math.min(heightPixels.width - 1, Math.floor(u * heightPixels.width));
  const py = Math.min(heightPixels.height - 1, Math.floor((1 - v) * heightPixels.height));
  return TERRAIN_BASE + heightPixels.data[(py * heightPixels.width + px) * 4]! / 255 * TERRAIN_HEIGHT;
}

function buildSplatTexture(): ImageResource {
  const splat = pixels(splatImage);
  const sources = [pixels(grass), pixels(rock), pixels(beach)];
  const canvas = document.createElement('canvas');
  canvas.width = splat.width;
  canvas.height = splat.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required to composite the terrain splat map');
  const output = context.createImageData(splat.width, splat.height);
  for (let y = 0; y < splat.height; y++) {
    for (let x = 0; x < splat.width; x++) {
      const index = (y * splat.width + x) * 4;
      const red = splat.data[index]! / 255;
      const green = splat.data[index + 1]! / 255;
      const blue = splat.data[index + 2]! / 255;
      const weights = [Math.max(green, 1 - red - green - blue), red, blue];
      const weightSum = Math.max(0.0001, weights[0]! + weights[1]! + weights[2]!);
      for (let channel = 0; channel < 3; channel++) {
        let value = 0;
        for (let layer = 0; layer < sources.length; layer++) {
          const source = sources[layer]!;
          const sampleX = (x * 20) % source.width;
          const sampleY = (y * 20) % source.height;
          value += source.data[(sampleY * source.width + sampleX) * 4 + channel]! * weights[layer]! / weightSum;
        }
        output.data[index + channel] = value;
      }
      output.data[index + 3] = 255;
    }
  }
  context.putImageData(output, 0, 0);
  return createImageResource(canvas);
}

const terrainGeometry: MeshGeometry = createPlaneMeshGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 96, 96);
const terrainVertex = createVector3();
for (let i = 0; i < getMeshGeometryVertexCount(terrainGeometry); i++) {
  getMeshGeometryVertexPosition(terrainVertex, terrainGeometry, i);
  setMeshGeometryVertexPosition(
    terrainGeometry,
    i,
    terrainVertex.x,
    terrainHeight(terrainVertex.x, terrainVertex.z),
    terrainVertex.z,
  );
}
computeMeshGeometryNormals(terrainGeometry, terrainGeometry);
computeMeshGeometryTangents(terrainGeometry, terrainGeometry);
invalidateMeshGeometry(terrainGeometry);
const terrain = createMesh(terrainGeometry, [createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: buildSplatTexture() }),
  normalMap: createTexture({ source: terrainNormal, colorSpace: 'linear' }),
  metallic: 0,
  roughness: 0.96,
})]);
addNodeChild(scene.root, terrain);

const barkMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: bark }),
  normalMap: createTexture({ source: barkNormal, colorSpace: 'linear' }),
  metallicRoughnessMap: createTexture({ source: barkSpecular, colorSpace: 'linear' }),
  metallic: 0,
  roughness: 0.78,
});
const leafMaterial = createStandardPbrMaterial({
  baseColor: 0xb4df8fff,
  baseColorMap: createTexture({ source: leaf }),
  metallic: 0,
  roughness: 0.72,
  alphaMode: 'mask',
  alphaCutoff: 0.35,
  doubleSided: true,
});

interface BranchDefinition {
  direction: Vector3Like;
  length: number;
  midpoint: Vector3Like;
  radius: number;
}
const branchDefinitions: BranchDefinition[] = [];
const leafPositions: Vector3Like[] = [];
function addBranch(start: Readonly<Vector3Like>, direction: Readonly<Vector3Like>, length: number, radius: number): Vector3Like {
  const end = createVector3(
    start.x + direction.x * length,
    start.y + direction.y * length,
    start.z + direction.z * length,
  );
  branchDefinitions.push({
    direction: createVector3(direction.x, direction.y, direction.z),
    length,
    midpoint: createVector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2),
    radius,
  });
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
    leafPositions.push(end);
    return;
  }
  const bend = 0.42 + depth * 0.025;
  grow(end, length * 0.76, radius * 0.7, yaw - bend, 0.92 + Math.sin(yaw * 2.3) * 0.09, depth - 1);
  grow(end, length * 0.73, radius * 0.68, yaw + bend, 0.88 + Math.cos(yaw * 1.7) * 0.1, depth - 1);
}
const trunkTop = addBranch(createVector3(), createVector3(0, 1, 0), 380, 46);
grow(trunkTop, 290, 34, 0.2, 1.14, 4);
grow(trunkTop, 275, 32, 2.3, 1.02, 4);
grow(trunkTop, 260, 31, 4.35, 1.08, 4);

const branches = createInstancedMesh(
  createCylinderMeshGeometry(1, 1, 1, 8, true),
  [barkMaterial],
  branchDefinitions.length * TREE_COUNT,
);
const crowns = createInstancedMesh(
  createIcosphereMeshGeometry(1, 1),
  [leafMaterial],
  leafPositions.length * TREE_COUNT,
);
const yAxis = createVector3(0, 1, 0);
const instancePosition = createVector3();
const instanceDirection = createVector3();
const instanceScale = createVector3();
const instanceRotation = createQuaternion();
const instanceMatrix = createMatrix4();

let randomState = 0x4f1bbcdc;
function random(): number {
  randomState |= 0;
  randomState = randomState + 0x6d2b79f5 | 0;
  let value = Math.imul(randomState ^ randomState >>> 15, 1 | randomState);
  value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

for (let treeIndex = 0; treeIndex < TREE_COUNT; treeIndex++) {
  const x = treeIndex === 0 ? 0 : (random() - 0.5) * TERRAIN_SIZE * 0.82;
  const z = treeIndex === 0 ? 0 : (random() - 0.5) * TERRAIN_SIZE * 0.82;
  const y = terrainHeight(x, z);
  const yaw = random() * Math.PI * 2;
  const treeScale = 0.75 + random() * 0.5;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  for (const branch of branchDefinitions) {
    instancePosition.x = x + (branch.midpoint.x * cosine + branch.midpoint.z * sine) * treeScale;
    instancePosition.y = y + branch.midpoint.y * treeScale;
    instancePosition.z = z + (-branch.midpoint.x * sine + branch.midpoint.z * cosine) * treeScale;
    instanceDirection.x = branch.direction.x * cosine + branch.direction.z * sine;
    instanceDirection.y = branch.direction.y;
    instanceDirection.z = -branch.direction.x * sine + branch.direction.z * cosine;
    setQuaternionFromUnitVectors(instanceRotation, yAxis, instanceDirection);
    instanceScale.x = branch.radius * treeScale;
    instanceScale.y = branch.length * treeScale;
    instanceScale.z = branch.radius * treeScale;
    composeMatrix4(instanceMatrix, instancePosition, instanceRotation, instanceScale);
    appendInstancedMeshInstance(branches, instanceMatrix);
  }
  for (const leafPosition of leafPositions) {
    instancePosition.x = x + (leafPosition.x * cosine + leafPosition.z * sine) * treeScale;
    instancePosition.y = y + leafPosition.y * treeScale;
    instancePosition.z = z + (-leafPosition.x * sine + leafPosition.z * cosine) * treeScale;
    instanceRotation.x = 0;
    instanceRotation.y = 0;
    instanceRotation.z = 0;
    instanceRotation.w = 1;
    instanceScale.x = 70 * treeScale;
    instanceScale.y = 48 * treeScale;
    instanceScale.z = 70 * treeScale;
    composeMatrix4(instanceMatrix, instancePosition, instanceRotation, instanceScale);
    appendInstancedMeshInstance(crowns, instanceMatrix);
  }
}
addNodeChild(scene.root, branches);
addNodeChild(scene.root, crowns);

const help = document.createElement('div');
help.textContent = `One recursive tree · ${TREE_COUNT} GPU-instanced clones · heightmap + three-layer splat terrain`;
Object.assign(help.style, {
  position: 'fixed', left: '18px', top: '16px', color: '#eef6e8', font: '14px system-ui',
  textShadow: '0 1px 5px #000', pointerEvents: 'none',
});
document.body.appendChild(help);

function frame(): void {
  orbit.update();
  ctx.render(scene.root, camera, lights, environment);
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
