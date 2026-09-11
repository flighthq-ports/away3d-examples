import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createAmbientLight,
  createBoxMeshGeometry,
  createEnvironment,
  createFxaaEffect,
  createImageResourceFromCanvas,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DHit,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createToneMapEffect,
  createUnlitMaterial,
  createVector3,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  pickScene3D,
  setMeshGeometryVertexPosition,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x071a27ff,
  effects: [createToneMapEffect({ exposure: 1.25 }), createFxaaEffect()],
});
const scene = createScene3D();
// ShallowFluid(gridDimension 200, gridDimension 200, gridSpacing 2, ...): 199 segments of 2 units
// gives a 398-unit pool, and 2 x 199^2 = 79202 triangles, which is the original's POLY 79250. The
// port had a 73x73 grid on a 900-unit plane — about an eighth of the resolution, spread over more
// than twice the area, so the ripples were coarse and the camera had to sit far back to frame it.
const GRID_DIMENSION = 200;
const GRID_SPACING = 2;
const PLANE_SEGMENTS = GRID_DIMENSION - 1;
const PLANE_SIZE = PLANE_SEGMENTS * GRID_SPACING;

const camera = createCameraFromAway({ far: 4000 });
// HoverController(camera, null, 180, 20, 320, 5).
const orbit = createOrbitControllerFromAway(camera, {
  distance: 320,
  panAngle: 180,
  tiltAngle: 20,
  minTiltAngle: 5,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 120, maxDistance: 900 });
// A single blue PointLight with diffuse 2 and specular 0.5, which the original re-seats on the
// camera every frame (`skyLight.transform = camera.transform.clone()`) — a headlight, and the
// reason a bright specular sits wherever you happen to be looking. The port replaced it with a
// fixed white directional light, which lost that entirely.
const skyLight = createPointLightFromAway({
  color: 0x0000ff,
  diffuse: 2,
  range: 4000,
  referenceDistance: 320,
});
// ambient 1 over ambientColor 0x111199 on the water material.
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x111199, intensity: 1 }),
  point: [skyLight],
});

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

const waterGeometry: MeshGeometry = createPlaneMeshGeometry(
  PLANE_SIZE, PLANE_SIZE, PLANE_SEGMENTS, PLANE_SEGMENTS,
);
// ColorMaterial(0xFFFFFF) carrying EnvMapMethod(cubeTexture, 1) at full strength — a white
// surface that mirrors the snow skybox, which is the whole point of the sample ("how to apply an
// environment map to a material"). The port had it as a translucent cyan half-metal, which read
// as tinted glass in a swimming pool and reflected almost nothing.
const waterMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  metallic: 1,
  roughness: 0.04,
});
const water = createMesh(waterGeometry, [waterMaterial]);
addNodeChild(scene.root, water);

// The pool is four walls 5 units thick and 500000 tall, sunk so that only 5 units stand above the
// water (`poolVOffset = 5 - poolHeight/2`). They read as a thin dark rim around the surface and
// nothing more. The port built a shallow open-topped tray with a floor slab and 115-unit walls in
// a bright cyan, which is what made the scene look like a paddling pool rather than open water.
//
// Their material is a perlin-noise bitmap put through a 0.1 colour transform — near-black with a
// faint mottle. Generated here rather than faked with a flat colour, since the mottle is what
// stops the rim reading as a solid band.
const POOL_HEIGHT = 500000;
const POOL_THICKNESS = 5;
const poolVerticalOffset = 5 - POOL_HEIGHT / 2;
const poolHorizontalOffset = PLANE_SIZE / 2 + POOL_THICKNESS / 2;

const noiseCanvas = document.createElement('canvas');
noiseCanvas.width = 256;
noiseCanvas.height = 256;
const noiseContext = noiseCanvas.getContext('2d');
if (!noiseContext) throw new Error('A 2D canvas is required for the pool texture');
const noise = noiseContext.createImageData(256, 256);
let noiseSeed = 0x2f6e2b1;
for (let i = 0; i < noise.data.length; i += 4) {
  noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
  // The 0.1 transform caps this at 25 of 255 — dark enough to sit behind the water's reflection.
  const value = 6 + ((noiseSeed >>> 16) % 20);
  noise.data[i] = value;
  noise.data[i + 1] = value;
  noise.data[i + 2] = value;
  noise.data[i + 3] = 255;
}
noiseContext.putImageData(noise, 0, 0);
// Unlit, because the original never gives poolMaterial a lightPicker — in Away3D that means it
// takes no diffuse lighting and simply shows its texture. Shaded as PBR instead, the blue
// headlight washed the rim bright blue and it read as a painted kerb around the water.
const poolMaterial = createUnlitMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: createImageResourceFromCanvas(noiseCanvas) }),
});

for (const [width, depth, x, z] of [
  [POOL_THICKNESS, PLANE_SIZE + POOL_THICKNESS * 2, -poolHorizontalOffset, 0],
  [POOL_THICKNESS, PLANE_SIZE + POOL_THICKNESS * 2, poolHorizontalOffset, 0],
  [PLANE_SIZE, POOL_THICKNESS, 0, poolHorizontalOffset],
  [PLANE_SIZE, POOL_THICKNESS, 0, -poolHorizontalOffset],
] as const) {
  const wall = createMesh(createBoxMeshGeometry(width, POOL_HEIGHT, depth), [poolMaterial]);
  setVector3(wall.position, x, poolVerticalOffset, z);
  invalidateNodeLocalTransform(wall);
  addNodeChild(scene.root, wall);
}

const vertexCount = getMeshGeometryVertexCount(waterGeometry);
const baseX = new Float32Array(vertexCount);
const baseZ = new Float32Array(vertexCount);
const point = createVector3();
for (let i = 0; i < vertexCount; i++) {
  getMeshGeometryVertexPosition(point, waterGeometry, i);
  baseX[i] = point.x; baseZ[i] = point.z;
}

const gridWidth = GRID_DIMENSION;
const gridHeight = GRID_DIMENSION;
const gridSpacing = GRID_SPACING;
const gravity = 980;
const fluidDepth = 8;
const viscosity = 0.3;
const fixedStep = 1 / 120;
let displacement = new Float32Array(gridWidth * gridHeight);
let nextDisplacement = new Float32Array(gridWidth * gridHeight);
const velocity = new Float32Array(gridWidth * gridHeight);
const vertexCell = new Uint32Array(vertexCount);
for (let i = 0; i < vertexCount; i++) {
  const column = Math.round((baseX[i]! / PLANE_SIZE + 0.5) * (gridWidth - 1));
  const row = Math.round((baseZ[i]! / PLANE_SIZE + 0.5) * (gridHeight - 1));
  vertexCell[i] = row * gridWidth + column;
}

function disturb(x: number, z: number, strength = 18): void {
  const centerX = Math.round((x / PLANE_SIZE + 0.5) * (gridWidth - 1));
  const centerZ = Math.round((z / PLANE_SIZE + 0.5) * (gridHeight - 1));
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

// "Click on the fluid to disturb it" — the original arms a brush on MOUSE_DOWN over the plane and
// keeps disturbing on every MOUSE_MOVE while it is held, so a drag draws a wake. The port only
// disturbed once on pointerup, which made the surface feel unresponsive.
const hit = createScene3DHit();
let disturbing = false;
function disturbAtPointer(event: PointerEvent): void {
  const rect = ctx.canvas.getBoundingClientRect();
  const screenX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const screenY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const picked = pickScene3D(scene.root, camera, screenX, screenY, hit);
  if (picked?.node === water) disturb(picked.pointX, picked.pointZ, -24);
}
ctx.canvas.addEventListener('pointerdown', (event) => {
  disturbing = true;
  disturbAtPointer(event);
});
ctx.canvas.addEventListener('pointermove', (event) => {
  if (disturbing) disturbAtPointer(event);
});
for (const done of ['pointerup', 'pointercancel', 'pointerleave']) {
  ctx.canvas.addEventListener(done, () => { disturbing = false; });
}

// Stands in for AwayStats, which this sample moves to the top right in onResize
// (`awayStats.x = stage.stageWidth - awayStats.width`). It has no instructions overlay — the
// original's only text lived in the commented-out GUI panel.
let triangleCount = 0;
walkNodeDescendants(scene.root, (node) => {
  if (isMesh(node) && node.geometry && node.geometry.topology === 'triangle-list') {
    const geometry = node.geometry;
    const indexed = geometry.indices !== null
      ? geometry.indices.length
      : geometry.vertices.length / (geometry.layout.stride / 4);
    triangleCount += Math.floor(indexed / 3);
  }
  return true;
});
const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', right: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textAlign: 'right',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

let previousTime = performance.now();
let simulationAccumulator = 0;
function frame(ts: number): void {
  framesThisSecond++;
  if (ts - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (ts - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = ts;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;

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
  orbit.update();
  // The light rides the camera, as in the original.
  setVector3(skyLight.position, orbit.eye.x, orbit.eye.y, orbit.eye.z);
  ctx.render(scene.root, camera, lights, environment);
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
