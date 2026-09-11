import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
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
  setMeshGeometryVertexNormal,
  setMeshGeometryVertexPosition,
  setMeshGeometryVertexTangent,
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
let disturbing = false;
// ShallowFluid(gridDimension 200, gridDimension 200, gridSpacing 2, ...): 199 segments of 2 units
// gives a 398-unit pool, and 2 x 199^2 = 79202 triangles, which is the original's POLY 79250. The
// port had a 73x73 grid on a 900-unit plane — about an eighth of the resolution, spread over more
// than twice the area, so the ripples were coarse and the camera had to sit far back to frame it.
// The original runs 200 cells at spacing 2. Raised here for finer ripples: 320 cells over the same
// 398-unit pool is 2.6x the detail (203522 triangles against 79202). The ceiling is CPU, and it is
// steep — the per-vertex pass scales with cells while the solver, whose step count scales with
// 1/spacing, scales with the cube of the grid. Measured in this harness: 3.6ms per frame at 200,
// 10.4ms at 320, and 400 could not hold a steady frame at all. 320 keeps room inside a 60fps
// budget on modest hardware.
const GRID_DIMENSION = 320;
// Spacing follows from holding the original's 398-unit pool.
const GRID_SPACING = 398 / (GRID_DIMENSION - 1);
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
// `if (planeDisturb) { disturb } else if (move) { rotate }` — a drag that starts on the water
// disturbs it and does NOT also spin the camera. `disturbing` is set by the pointerdown handler
// further down, which runs first because it is registered first.
bindOrbitDrag(ctx.canvas, orbit, {
  minDistance: 120,
  maxDistance: 900,
  shouldStart: () => !disturbing,
});
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
  // Kept sharp. The reflection's blockiness is not roughness — it is the IBL prefilter
  // resolution (see PORTING.md); blurring it to 0.24 hides that but turns the water to plastic,
  // and the original is a sharp mirror.
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
// GRID_SPACING sets the plane's physical size; the solver itself is spacing-independent.
// ShallowFluid's own scheme, rather than an invented one. It is the damped 2D wave equation
// solved over two buffers, with constants precalculated as:
//
//   realWaveSpeed = speed * (spacing / (2 * dt)) * sqrt(viscosity * dt + 2)
//   f1 = realWaveSpeed^2 * dt^2 / spacing^2   f2 = 1 / (viscosity * dt + 2)
//   k1 = (4 - 8 * f1) * f2   k2 = (viscosity * dt - 2) * f2   k3 = 2 * f1 * f2
//
// Substituting realWaveSpeed collapses f1 to `speed^2 * (viscosity * dt + 2) / 4`, which is
// independent of both spacing and dt: the scheme is CFL-limited, so a wave advances about one
// cell per step whatever the grid. `speed` must stay below 1 or it diverges — the original notes
// this on the constant itself.
//
// The port had a different solver whose wave speed went as `gravity * depth / spacing^2`. That
// made it sensitive to the grid, and when the spacing was corrected from 12.5 to the original's
// 2 the acceleration term grew about 39x: the surface churned continuously and the high-frequency
// chop it produced was what read as pixelation, since a mirror amplifies every normal.
const WAVE_SPEED = 0.99;
// The original initialises viscosity at 0.3, but that is barely any damping: solving the scheme,
// amplitude decays by exp(-viscosity / 2) per second — independent of both timestep and grid — so
// 0.3 leaves a disturbance at 10% after 3.3s and still ringing at 1% after 19s. Water in a pool
// this size does not behave that way.
//
// 1.7 is the top of the range the original's own GUI exposed for it
// (`gui.addSlider("fluid.viscosity", 0.0, 1.7)`), so this is a point on their control rather than
// an invented number, and it settles the way water does: 10% after 1.3s, 1% after 3.6s.
const VISCOSITY = 1.7;
// The original derives dt from `stage.frameRate` — 1/60 — and steps once per frame on a grid of
// spacing 2. Because the scheme is CFL-limited, a wave crosses one cell per step, so world wave
// speed is `spacing / step`: refining the grid without shortening the step would slow the ripples
// in proportion. The step therefore scales with the spacing, holding wave speed at the original's
// 120 units per second whatever the grid.
const fixedStep = (1 / 60) * (GRID_SPACING / 2);
const f1 = WAVE_SPEED * WAVE_SPEED * (VISCOSITY * fixedStep + 2) / 4;
const f2 = 1 / (VISCOSITY * fixedStep + 2);
const k1 = (4 - 8 * f1) * f2;
const k2 = (VISCOSITY * fixedStep - 2) * f2;
const k3 = 2 * f1 * f2;

let displacement = new Float32Array(gridWidth * gridHeight);
let previousDisplacement = new Float32Array(gridWidth * gridHeight);
const vertexCell = new Uint32Array(vertexCount);
for (let i = 0; i < vertexCount; i++) {
  const column = Math.round((baseX[i]! / PLANE_SIZE + 0.5) * (gridWidth - 1));
  const row = Math.round((baseZ[i]! / PLANE_SIZE + 0.5) * (gridHeight - 1));
  vertexCell[i] = row * gridWidth + column;
}

// `mouseBrushStrength = 5`, applied as `disturbBitmapInstant(planeX, planeY, -mouseBrushStrength,
// ...)`. The port pushed 24, nearly five times as deep — the scheme is linear so it settles just
// as fast either way (about 19% of peak after 2s, under 10% by 8s), but five times the amplitude
// on a mirrored surface is what made it look like it never calmed down.
function disturb(x: number, z: number, strength = 5): void {
  const centerX = Math.round((x / PLANE_SIZE + 0.5) * (gridWidth - 1));
  const centerZ = Math.round((z / PLANE_SIZE + 0.5) * (gridHeight - 1));
  const brushRadius = 6;
  for (let dz = -brushRadius; dz <= brushRadius; dz++) {
    for (let dx = -brushRadius; dx <= brushRadius; dx++) {
      const column = centerX + dx;
      const row = centerZ + dz;
      if (column <= 0 || column >= gridWidth - 1 || row <= 0 || row >= gridHeight - 1) continue;
      const distance = Math.hypot(dx, dz);
      if (distance > brushRadius) continue;
      const falloff = 1 - distance / brushRadius;
      displacement[row * gridWidth + column]! += strength * falloff * falloff;
    }
  }
}

function solveShallowWater(): void {
  const next = previousDisplacement;
  for (let row = 1; row < gridHeight - 1; row++) {
    const base = row * gridWidth;
    for (let column = 1; column < gridWidth - 1; column++) {
      const index = base + column;
      next[index] = k1 * displacement[index]!
        + k2 * next[index]!
        + k3 * (displacement[index - 1]! + displacement[index + 1]!
          + displacement[index - gridWidth]! + displacement[index + gridWidth]!);
    }
  }
  previousDisplacement = displacement;
  displacement = next;
}

// "Click on the fluid to disturb it". `plane.addEventListener(MouseEvent3D.MOUSE_DOWN, ...)` fires
// only when the press actually lands on the water, and that is what latches `planeDisturb` for the
// rest of the drag; a press anywhere else leaves it false, so the camera gate falls through to
// `move` and pans instead. Both flags clear on mouse up.
//
// The pick therefore has to decide the latch. Setting it on every pointerdown — as this did —
// blocked panning everywhere, because `pointerdown` fires before the `mousedown` that
// bindOrbitDrag listens for, so the gate always saw `disturbing` already true.
const hit = createScene3DHit();
const waterPoint = { x: 0, z: 0 };
function pickWater(event: PointerEvent): boolean {
  const rect = ctx.canvas.getBoundingClientRect();
  const screenX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const screenY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const picked = pickScene3D(scene.root, camera, screenX, screenY, hit);
  if (picked?.node !== water) return false;
  waterPoint.x = picked.pointX;
  waterPoint.z = picked.pointZ;
  return true;
}
ctx.canvas.addEventListener('pointerdown', (event) => {
  if (!pickWater(event)) return;
  disturbing = true;
  disturb(waterPoint.x, waterPoint.z, -5);
});
ctx.canvas.addEventListener('pointermove', (event) => {
  // Latched for the whole drag, but only leaves a wake where the ray still meets the water.
  if (disturbing && pickWater(event)) disturb(waterPoint.x, waterPoint.z, -5);
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
    solveShallowWater();
    simulationAccumulator -= fixedStep;
  }
  // Positions, then normals and tangents straight from the height field rather than from the
  // mesh. ShallowFluid supplies both itself — its PixelBender normal/tangent shaders are
  // commented out in the OpenFL port, so upstream actually shades the water with the constant
  // normals it was initialised with, but the shader it meant to run scaled central differences by
  // `-2 * spacing`, which is exactly the gradient below.
  //
  // This is also what makes a finer grid affordable. Deriving normals from the geometry cost
  // 10.6ms per frame at 200 cells and 42.8ms at 400 — it, not the fluid solve (0.5-1.5ms), was
  // the entire budget. Central differences are a handful of flops per vertex.
  const gradientScale = 1 / (2 * GRID_SPACING);
  for (let i = 0; i < vertexCount; i++) {
    const cell = vertexCell[i]!;
    const column = cell % gridWidth;
    const row = (cell - column) / gridWidth;
    const left = column > 0 ? displacement[cell - 1]! : displacement[cell]!;
    const right = column < gridWidth - 1 ? displacement[cell + 1]! : displacement[cell]!;
    const back = row > 0 ? displacement[cell - gridWidth]! : displacement[cell]!;
    const front = row < gridHeight - 1 ? displacement[cell + gridWidth]! : displacement[cell]!;
    const slopeX = (right - left) * gradientScale;
    const slopeZ = (front - back) * gradientScale;
    setMeshGeometryVertexPosition(waterGeometry, i, baseX[i]!, displacement[cell]!, baseZ[i]!);
    // normalize(-dh/dx, 1, -dh/dz)
    const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);
    setMeshGeometryVertexNormal(waterGeometry, i, -slopeX / length, 1 / length, -slopeZ / length);
    // Tangent along +x: normalize(1, dh/dx, 0), with the handedness Flight expects in w.
    const tangentLength = Math.sqrt(1 + slopeX * slopeX);
    setMeshGeometryVertexTangent(
      waterGeometry, i, 1 / tangentLength, slopeX / tangentLength, 0, 1,
    );
  }
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
