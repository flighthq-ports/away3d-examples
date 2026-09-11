import type { ImageResource, InstancedMesh, Material, Matrix4, MeshGeometry, PerspectiveProjection, Vector3Like } from '@flighthq/sdk';
import {
  addNodeChild,
  appendInstancedMeshInstance,
  bakeGlEnvironmentIbl,
  composeMatrix4,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createAmbientLight,
  createCylinderMeshGeometry,
  createEnvironment,
  createFxaaEffect,
  createHemisphereLight,
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
  setQuaternionFromEuler,
  setQuaternionFromUnitVectors,
} from '@flighthq/sdk';
import { awayDirection, bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const CAMERA_FAR = 250_000;

const TERRAIN_SIZE = 120_000;
const TERRAIN_HEIGHT = 22_000;
const TERRAIN_BASE = -6000;
const TREE_COUNT = 25;
// FractalTreeRound(width 1000, height 10, stretching 3, ..., level 10) in the original: the first
// box alone is 1000 across and 10 x that tall, and every level after it is only 3 x its own
// (rapidly shrinking) side. So the intended tree is a tall bare trunk carrying a modest crown,
// around 15000 units — set against a camera 25000 away, it is meant to dominate the frame. The
// port had it at roughly 1280 units total, which is why the trees read as scrub.
const TRUNK_HEIGHT = 10_000;
const TRUNK_RADIUS = 500;
const LIMB_LENGTH = 1_500;
const LIMB_RADIUS = 200;
// Original level is 10 (1024 tips). This generator branches in two at each step from three limbs,
// so depth 6 gives 192 tips — enough for the crown to read as foliage rather than bare sticks
// without instancing 25 x 1024 leaf clusters.
const TREE_DEPTH = 7;
// Foliage(leafPositions, leavesPerCluster 5, leafSize 300, leafClusterRadius 400).
// The original spends 1024 leaf positions x 5 leaves on the canopy; this generator has 384
// tips, so each cluster is enlarged to close the gaps rather than instancing 25x that many.
const LEAF_CLUSTER_RADIUS = 750;

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x000000ff,
  effects: [
    // The original's FogMethod(0, 200000, 0x000000) is deliberately not reproduced. A
    // screen-space fog works in window depth, and this camera spans near 20 to far 250000, so
    // depth is crushed to ~1 within a few thousand units: `depthAt(25000)` is already 0.99928,
    // which fogged the entire mid-field to black — measured (3,17,5) where the original reads
    // (50,73,41). It also has no background skip, so it dimmed the skybox with it. In the
    // original the distant ridge stays clearly lit at this framing, so the fog contributes almost
    // nothing here and dropping it is closer than approximating it.
    createToneMapEffect({ exposure: 0.85 }),
    createFxaaEffect(),
  ],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: CAMERA_FAR });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 25000,
  panAngle: 0,
  tiltAngle: 10,
  targetY: 4500,
  minTiltAngle: 0,
  maxTiltAngle: 70,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 8000, maxDistance: 80000 });

// The original lights this with three: a moon, a dim sky fill, and a camera lamp.
//
// `moonLight` sits at (3500, 4500, 10000) and looks at the origin — "appear to come from the moon
// in the sky box" — giving an Away3D direction of (-0.304, -0.391, -0.869). This port negates
// Away3D's z, so the light must arrive at (-0.304, -0.391, +0.869); it was hard-coded to
// (-0.264, -0.396, -0.880), which is the same light coming from the opposite side of the scene,
// so the moon in the skybox and the shading disagreed. Its diffuse is 0.5, not the 0.75 used here.
const moon = createDirectionalLightFromAway({
  direction: awayDirection(-3500, -4500, -10000),
  diffuse: 0.5,
  // Faithfully white. A cool tint is tempting for night, but the terrain albedo is already a
  // saturated green and tinting the key only fights it; the hemisphere fill below is what gives
  // the scene its blue.
  color: 0xffffff,
});
// `skyLight` is a second DirectionalLight at diffuse 0.1 with no direction set — a flat fill, and
// Scene3DLights carries only one directional anyway. A hemisphere light is the better reading of
// it and the actual improvement here: sky colour from above, near-black from below, so the trunks
// and branches lift out of pure silhouette and pick up night sky without the ground brightening.
const skyFill = createHemisphereLight({
  groundColor: 0x05070c,
  intensity: 0.1,
  skyColor: 0x5c7bbf,
});
// `cameraLight` (a PointLight at diffuse 0.25, radius 1000, fallOff 2000, re-seated on the camera
// each frame) is deliberately left out: the orbit never comes closer than 8000 units, so a light
// that reaches 2000 cannot touch anything in this scene, and carrying it would cost a per-fragment
// point light for nothing.
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x0a0e18, intensity: 1 }),
  directional: moon.directional,
  hemisphere: [skyFill],
});

const assetRoot = 'away3d/FractalTreeDemo/';
const [
  bark, barkNormal, barkSpecular, leaf, grass, rock, heightImage, terrainNormal, splatImage, skyFaces,
] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/bark0.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/barkNRM.png`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/barkSPEC.png`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}tree/leaf4.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/grass.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}terrain/rock.jpg`),
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
  // Note this single number does two jobs: it scales the IBL contribution AND multiplies the
  // drawn skybox (`drawGlEnvironmentSkybox` uniform `u_intensity`). Lowering it to tame the
  // terrain also crushed the visible night sky from (23,22,39) to (1,1,2) against the original's
  // (23,22,39), so brightness is dialled with the key light and exposure instead.
  intensity: 1,
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
// Elevation reads one texel per vertex, at row `(segmentsH - zi)` — a row that counts DOWN as
// Away3D z rises. This port negates z against Away3D, so the row must count UP with Flight z;
// sampling `1 - v` mirrors the whole terrain front-to-back.
function terrainHeight(x: number, z: number): number {
  const u = Math.max(0, Math.min(1, x / TERRAIN_SIZE + 0.5));
  const v = Math.max(0, Math.min(1, z / TERRAIN_SIZE + 0.5));
  const px = Math.min(heightPixels.width - 1, Math.floor(u * (heightPixels.width - 1)));
  const py = Math.min(heightPixels.height - 1, Math.floor(v * (heightPixels.height - 1)));
  return TERRAIN_BASE + heightPixels.data[(py * heightPixels.width + px) * 4]! / 255 * TERRAIN_HEIGHT;
}

let randomState = 0x4f1bbcdc;
function random(): number {
  randomState |= 0;
  randomState = randomState + 0x6d2b79f5 | 0;
  let value = Math.imul(randomState ^ randomState >>> 15, 1 | randomState);
  value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

// Tree placements are decided before the terrain texture is built, because the ground under each
// tree has to be painted into it — see buildTerrainTexture.
interface TreePlacement { scale: number; x: number; yaw: number; z: number }
const treePlacements: TreePlacement[] = [];
// Where the camera opens, derived from the orbit the original sets up
// (`HoverController(0, 10, 25000)` with a target 4500 up and AwayJS's yFactor of 2):
//   eye.x = 0, eye.z = -25000 * cos(10deg), eye.y = 4500 + 25000 * sin(10deg) * 2
const cameraEyeX = 0;
const cameraEyeZ = -25000 * Math.cos(10 * Math.PI / 180);
// A clone landing near that point fills the frame with one leaf cluster, close enough that the
// leaf texture reads as a pattern rather than foliage. The original scatters blind — it has no
// trees at all as shipped — so keeping a clearing around the viewpoint is a deliberate choice.
const CAMERA_CLEARANCE = 16_000;

for (let treeIndex = 0; treeIndex < TREE_COUNT; treeIndex++) {
  // onTreeTimer scatters each clone across the whole terrain
  // (`terrainWidth*Math.random() - terrainWidth/2`).
  let x = 0;
  let z = 0;
  if (treeIndex > 0) {
    for (let attempt = 0; attempt < 24; attempt++) {
      x = (random() - 0.5) * TERRAIN_SIZE;
      z = (random() - 0.5) * TERRAIN_SIZE;
      if (Math.hypot(x - cameraEyeX, z - cameraEyeZ) >= CAMERA_CLEARANCE) break;
    }
  }
  const yaw = random() * Math.PI * 2;
  // generateTree() places the first tree at the origin unscaled; only generateClones() varies.
  const scale = treeIndex === 0 ? 1 : 0.75 + random() * 0.5;
  treePlacements.push({ scale, x, yaw, z });
}

// The terrain diffuse, rebuilt on the original's recipe and then graded for looks.
//
// Two things were wrong before. The layers were "tiled" as `(x * 20) % source.width`, which is not
// tiling at all — it steps 20 source pixels per output pixel, point-sampling a sparse comb out of
// the grass bitmap, and that aliasing is where the fluorescent green speckle came from. And the
// recipe was TerrainDemo's: three textures through `terrain_splats.png`. FractalTreeDemo actually
// uses grass as the BASE with `TerrainDiffuseMethod([rock.jpg], blendTexture, [20, 20])` — a
// single rock layer at 20x tiling, blended through a map it generates at runtime.
//
// That generated map is also how the original grounds its trees: `createTreeShadow` paints a soft
// blob into it as each tree is placed, so the ground beneath a tree turns rocky and dark. The same
// blobs are painted here, which is what stops the trees floating.
//
// The grade on top is a deliberate deviation, asked for because the original reads dark and harsh:
// the blend is pulled toward rock, and the result is desaturated and warmed a little so the grass
// is moss rather than fluorescent.
const TERRAIN_TEXTURE_SIZE = 2048;
const GRASS_REPEATS = 14;
const ROCK_REPEATS = 20;
const DESATURATION = 0.42;

function sampleTiled(
  source: { data: Uint8ClampedArray; height: number; width: number },
  u: number, v: number, repeats: number, channel: number,
): number {
  const x = Math.floor(((u * repeats) % 1) * source.width);
  const y = Math.floor(((v * repeats) % 1) * source.height);
  return source.data[(y * source.width + x) * 4 + channel]!;
}

function buildTerrainTexture(): ImageResource {
  const size = TERRAIN_TEXTURE_SIZE;
  const grassPixels = pixels(grass);
  const rockPixels = pixels(rock);
  const splat = pixels(splatImage);

  // 0 = grass, 1 = rock. Large-scale variation comes off the splat map's red channel, which keeps
  // that asset doing useful work, and the tree blobs are added on top.
  const blend = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const sv = Math.floor((y / size) * splat.height);
    for (let x = 0; x < size; x++) {
      const su = Math.floor((x / size) * splat.width);
      blend[y * size + x] = 0.22 + (splat.data[(sv * splat.width + su) * 4]! / 255) * 0.4;
    }
  }
  for (const placement of treePlacements) {
    const centerX = (placement.x / TERRAIN_SIZE + 0.5) * size;
    const centerY = (placement.z / TERRAIN_SIZE + 0.5) * size;
    const radius = size * 0.038 * placement.scale;
    const minX = Math.max(0, Math.floor(centerX - radius));
    const maxX = Math.min(size - 1, Math.ceil(centerX + radius));
    const minY = Math.max(0, Math.floor(centerY - radius));
    const maxY = Math.min(size - 1, Math.ceil(centerY + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.hypot(x - centerX, y - centerY);
        if (distance > radius) continue;
        const falloff = 1 - distance / radius;
        blend[y * size + x] = Math.min(1, blend[y * size + x]! + falloff * falloff * 0.95);
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas is required to composite the terrain');
  const output = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const index = (y * size + x) * 4;
      const rock = blend[y * size + x]!;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let channel = 0; channel < 3; channel++) {
        const value = sampleTiled(grassPixels, u, v, GRASS_REPEATS, channel) * (1 - rock)
          + sampleTiled(rockPixels, u, v, ROCK_REPEATS, channel) * rock;
        if (channel === 0) red = value;
        else if (channel === 1) green = value;
        else blue = value;
      }
      // Desaturate toward luminance, then nudge warm, so the grass reads as moss at night.
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      output.data[index] = red + (luma - red) * DESATURATION + 6;
      output.data[index + 1] = green + (luma - green) * DESATURATION;
      output.data[index + 2] = blue + (luma - blue) * DESATURATION + 4;
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
  baseColorMap: createTexture({ source: buildTerrainTexture() }),
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
  // Pitch falls away with depth so the limbs start steep off the trunk and flatten toward the
  // tips. Holding one near-vertical pitch at every level, as this did before, splays the whole
  // crown into a single flat fan at the top of the pole — the "lamp post" silhouette.
  const bend = 0.42 + depth * 0.025;
  const spread = 0.34 + depth * 0.1;
  grow(end, length * 0.76, radius * 0.7, yaw - bend, spread + Math.sin(yaw * 2.3) * 0.09, depth - 1);
  grow(end, length * 0.73, radius * 0.68, yaw + bend, spread * 0.94 + Math.cos(yaw * 1.7) * 0.1, depth - 1);
}
const trunkTop = addBranch(createVector3(), createVector3(0, 1, 0), TRUNK_HEIGHT, TRUNK_RADIUS);
grow(trunkTop, LIMB_LENGTH, LIMB_RADIUS, 0.2, 1.14, TREE_DEPTH);
grow(trunkTop, LIMB_LENGTH * 0.95, LIMB_RADIUS * 0.94, 2.3, 1.02, TREE_DEPTH);
grow(trunkTop, LIMB_LENGTH * 0.9, LIMB_RADIUS * 0.91, 4.35, 1.08, TREE_DEPTH);

// An instanced mesh uploads its matrices as a SINGLE-ROW RGBA32F palette, four texels per
// instance (glSkinPaletteTexture), so one mesh can hold at most MAX_TEXTURE_SIZE / 4 instances —
// 4096 on a typical GPU, 2048 under SwiftShader. Past that the upload fails with
// "Level of detail outside of range" and the whole mesh silently draws nothing, which is exactly
// why the forest was missing. The trees are therefore spread over as many instanced meshes as the
// limit requires instead of being capped by it.
// GlContext does not surface the MAX_TEXTURE_SIZE enum, so it is read by its GL value (0x0D33).
const maxTextureSize = (ctx.state.gl.getParameter(0x0d33) as number | null) ?? 4096;
const INSTANCES_PER_BATCH = Math.max(1, Math.floor(maxTextureSize / 4));

function createInstanceBatches(
  geometry: MeshGeometry, materials: Material[], total: number,
): InstancedMesh[] {
  const batches: InstancedMesh[] = [];
  for (let placed = 0; placed < total; placed += INSTANCES_PER_BATCH) {
    batches.push(createInstancedMesh(geometry, materials, Math.min(INSTANCES_PER_BATCH, total - placed)));
  }
  return batches;
}
function appendInstance(batches: InstancedMesh[], cursor: { index: number }, matrix: Matrix4): void {
  while (cursor.index < batches.length
    && batches[cursor.index]!.instanceCount >= batches[cursor.index]!.instanceMatrices.length) {
    cursor.index++;
  }
  const batch = batches[cursor.index];
  if (batch) appendInstancedMeshInstance(batch, matrix);
}

const branchBatches = createInstanceBatches(
  createCylinderMeshGeometry(1, 1, 1, 8, true),
  [barkMaterial],
  branchDefinitions.length * TREE_COUNT,
);
const crownBatches = createInstanceBatches(
  createIcosphereMeshGeometry(1, 1),
  [leafMaterial],
  leafPositions.length * TREE_COUNT,
);
const branchCursor = { index: 0 };
const crownCursor = { index: 0 };

const yAxis = createVector3(0, 1, 0);
const instancePosition = createVector3();
const instanceDirection = createVector3();
const instanceScale = createVector3();
const instanceRotation = createQuaternion();
const instanceMatrix = createMatrix4();

for (const placement of treePlacements) {
  const { x, yaw, z } = placement;
  const treeScale = placement.scale;
  const y = terrainHeight(x, z);
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
    appendInstance(branchBatches, branchCursor, instanceMatrix);
  }
  for (const leafPosition of leafPositions) {
    instancePosition.x = x + (leafPosition.x * cosine + leafPosition.z * sine) * treeScale;
    instancePosition.y = y + leafPosition.y * treeScale;
    instancePosition.z = z + (-leafPosition.x * sine + leafPosition.z * cosine) * treeScale;
    // Every tip sits at much the same height, so identical upright spheres merged into one flat
    // pancake per tree. Jittering each cluster's size, position and orientation breaks that into
    // something that reads as a canopy: the facets of neighbouring icospheres no longer line up,
    // and the silhouette gains a ragged edge.
    const clusterScale = (0.62 + random() * 0.55) * LEAF_CLUSTER_RADIUS * treeScale;
    instancePosition.x += (random() - 0.5) * clusterScale * 0.7;
    instancePosition.y += (random() - 0.5) * clusterScale * 0.5;
    instancePosition.z += (random() - 0.5) * clusterScale * 0.7;
    setQuaternionFromEuler(
      instanceRotation, random() * Math.PI, random() * Math.PI, random() * Math.PI,
    );
    instanceScale.x = clusterScale;
    instanceScale.y = clusterScale * 0.82;
    instanceScale.z = clusterScale;
    composeMatrix4(instanceMatrix, instancePosition, instanceRotation, instanceScale);
    appendInstance(crownBatches, crownCursor, instanceMatrix);
  }
}
// Frame the whole of the centre tree. The original aims its HoverController at the origin, which
// with its terrain offset lands on the tree's base — fine for a demo whose tree only appears once
// you press a button, but here it cuts the crown off the top of the screen. Aiming at the tree's
// midpoint instead keeps the trunk and canopy both in shot, which is what the framing is for.
let treeTopLocal = 0;
for (const branch of branchDefinitions) {
  treeTopLocal = Math.max(treeTopLocal, branch.midpoint.y + branch.length / 2);
}
orbit.target.y = terrainHeight(0, 0) + treeTopLocal * 0.5;

for (const batch of branchBatches) addNodeChild(scene.root, batch);
for (const batch of crownBatches) addNodeChild(scene.root, batch);

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
