import type { MeshGeometry, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createFxaaEffect,
  createMesh,
  createMeshGeometry,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTextureAtlas,
  createToneMapEffect,
  createUnlitMaterial,
  createVector3,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  prewarmParticleEmitter3D,
  prepareScene3DRender,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromEuler,
  setVector3,
  stepParticleEmitter3D,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const WIDTH = 6000;
const HEIGHT = 8000;
const STEPS_X = 64;
const STEPS_Y = 64;
const HEIGHT_SCALE = 10;
const NOISE_SCALE = 128;

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x02040aff,
  effects: [createToneMapEffect(), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 50000 });
const lights = createScene3DLights();

// A compact 2D simplex implementation keeps the sample's scrolling procedural terrain self-contained.
const gradients = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]] as const;
function gradientIndex(x: number, y: number): number {
  let hash = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  return (hash >>> 0) & 7;
}

function rawSimplex2d(x: number, y: number): number {
  const skew = 0.5 * (Math.sqrt(3) - 1);
  const unskew = (3 - Math.sqrt(3)) / 6;
  const s = (x + y) * skew;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * unskew;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + unskew;
  const y1 = y0 - j1 + unskew;
  const x2 = x0 - 1 + 2 * unskew;
  const y2 = y0 - 1 + 2 * unskew;

  function corner(px: number, py: number, gx: number, gy: number): number {
    const attenuation = 0.5 - px * px - py * py;
    if (attenuation <= 0) return 0;
    const gradient = gradients[gradientIndex(gx, gy)]!;
    return attenuation ** 4 * (gradient[0] * px + gradient[1] * py);
  }

  return 70 * (
    corner(x0, y0, i, j)
    + corner(x1, y1, i + i1, j + j1)
    + corner(x2, y2, i + 1, j + 1)
  );
}

function terrainNoise(x: number, y: number): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmplitude = 0;
  for (let octave = 0; octave < 7; octave++) {
    total += rawSimplex2d(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return (total / maxAmplitude + 1) * 128 * HEIGHT_SCALE;
}

const xGap = WIDTH / (STEPS_X - 1);
const zGap = HEIGHT / STEPS_Y;
const gridPoints: number[] = [];
for (let row = 0; row < STEPS_Y; row++) {
  const z = -HEIGHT / 2 + row * zGap;
  for (let column = 1; column < STEPS_X; column++) {
    const x0 = -WIDTH / 2 + (column - 1) * xGap;
    const x1 = -WIDTH / 2 + column * xGap;
    gridPoints.push(x0, 0, z, x1, 0, z);
  }
}
const gridGeometry: MeshGeometry = createMeshGeometry({
  layout: { stride: 12, attributes: [{ semantic: 'position', format: 'float32x3', byteOffset: 0 }] },
  topology: 'line-list',
  vertices: new Float32Array(gridPoints),
});
const grid = createMesh(gridGeometry, [createUnlitMaterial({ baseColor: 0x00a060ff })]);
addNodeChild(scene.root, grid);

function createWireSphere(radius: number, color: number) {
  const points: number[] = [];
  const segments = 24;
  for (let latitude = 1; latitude < 12; latitude++) {
    const phi = -Math.PI / 2 + latitude * Math.PI / 12;
    for (let i = 0; i < segments; i++) {
      const a0 = i * Math.PI * 2 / segments;
      const a1 = (i + 1) * Math.PI * 2 / segments;
      points.push(
        Math.cos(a0) * Math.cos(phi) * radius, Math.sin(phi) * radius, Math.sin(a0) * Math.cos(phi) * radius,
        Math.cos(a1) * Math.cos(phi) * radius, Math.sin(phi) * radius, Math.sin(a1) * Math.cos(phi) * radius,
      );
    }
  }
  for (let longitude = 0; longitude < 16; longitude++) {
    const theta = longitude * Math.PI * 2 / 16;
    for (let i = 0; i < segments; i++) {
      const p0 = -Math.PI / 2 + i * Math.PI / segments;
      const p1 = -Math.PI / 2 + (i + 1) * Math.PI / segments;
      points.push(
        Math.cos(theta) * Math.cos(p0) * radius, Math.sin(p0) * radius, Math.sin(theta) * Math.cos(p0) * radius,
        Math.cos(theta) * Math.cos(p1) * radius, Math.sin(p1) * radius, Math.sin(theta) * Math.cos(p1) * radius,
      );
    }
  }
  return createMesh(createMeshGeometry({
    layout: { stride: 12, attributes: [{ semantic: 'position', format: 'float32x3', byteOffset: 0 }] },
    topology: 'line-list',
    vertices: new Float32Array(points),
  }), [createUnlitMaterial({ baseColor: color })]);
}

const spheres = [
  createWireSphere(200, 0xffffff80),
  createWireSphere(200, 0xff000080),
  createWireSphere(100, 0x0000ff80),
];
setVector3(spheres[0]!.position, -WIDTH * 0.2, 0, HEIGHT * 0.25);
setVector3(spheres[1]!.position, WIDTH * 0.2, 0, HEIGHT * 0.25);
setVector3(spheres[2]!.position, 0, 0, HEIGHT * 0.25);
for (const sphere of spheres) addNodeChild(scene.root, sphere);

const particleImage = await loadImageResourceFromUrl(ctx.host, 'blue.png');
const particleAtlas = createTextureAtlas({ texture: createTexture({ source: particleImage }) });
addTextureAtlasRegion(particleAtlas, 0, 0, particleImage.width, particleImage.height);
const sparks = createParticleEmitter3D();
sparks.blendMode = 'add';
sparks.data.atlas = particleAtlas;
setVector3(sparks.position, 0, 1000, -5000);
invalidateNodeLocalTransform(sparks);
addNodeChild(scene.root, sparks);
const sparkState = createParticleEmitterState();
const sparkConfig = createParticleEmitterConfig({
  maxParticles: 500,
  spawnRate: 50,
  duration: -1,
  loop: true,
  lifetimeMin: 10,
  lifetimeMax: 10,
  emitterShape: 'cone3d',
  emitterConeAngle: 2.2,
  directionX: 0,
  directionY: 0.65,
  directionZ: -0.76,
  speedMin: 500,
  speedMax: 1000,
  scaleMin: 50,
  scaleMax: 50,
  colorStartR: 0,
  colorStartG: 0,
  colorStartB: 0,
  colorEndR: 1,
  colorEndG: 1,
  colorEndB: 1,
  alphaStart: 0,
  alphaEnd: 1,
  blendMode: 'add',
});
prewarmParticleEmitter3D(sparks, sparkState, sparkConfig, 10, 1 / 60);

function geometryPolygonCount(geometry: Readonly<MeshGeometry>): number {
  return geometry.subsets.reduce((count, subset) => {
    if (geometry.topology === 'triangle-list') return count + Math.floor(subset.indexCount / 3);
    if (geometry.topology === 'triangle-strip') return count + Math.max(0, subset.indexCount - 2);
    return count;
  }, 0);
}

function scenePolygonCount(): number {
  const renderList = prepareScene3DRender(
    ctx.state, scene.root, camera, lights, ctx.canvas.width / ctx.canvas.height,
  );
  let polygons = 0;
  for (let i = 0; i < renderList.meshCount; i++) {
    polygons += geometryPolygonCount(renderList.visibleMeshes[i]!.geometry);
  }
  for (let i = 0; i < renderList.instancedMeshCount; i++) {
    const mesh = renderList.visibleInstancedMeshes[i]!;
    polygons += geometryPolygonCount(mesh.geometry) * mesh.instanceCount;
  }
  if (sparks.enabled) polygons += sparks.data.particleCount * 2;
  return polygons;
}

const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', left: '10px', top: '10px', zIndex: '3', color: '#fff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textShadow: '0 1px 3px #000',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;
function updateStats(timestamp: number): void {
  framesThisSecond++;
  if (timestamp - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (timestamp - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = timestamp;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${scenePolygonCount()}`;
}

const eye = createVector3();
const target = createVector3();
const up = createVector3(0, 1, 0);
let scrollOffset = 0;
let sphereRotation = 0;
let previousTime = performance.now();
function heightAt(column: number, row: number): number {
  return terrainNoise(column / NOISE_SCALE, (row + scrollOffset) / NOISE_SCALE);
}

function frame(timestamp: number): void {
  const deltaTime = Math.min(0.1, (timestamp - previousTime) / 1000);
  previousTime = timestamp;
  const referenceFrames = deltaTime * 60;
  scrollOffset += referenceFrames;
  sphereRotation += referenceFrames * Math.PI / 5;

  const vertices = gridGeometry.vertices;
  let vertex = 0;
  for (let row = 0; row < STEPS_Y; row++) {
    for (let column = 1; column < STEPS_X; column++) {
      vertices[vertex + 1] = heightAt(column - 1, row);
      vertices[vertex + 4] = heightAt(column, row);
      vertex += 6;
    }
  }
  invalidateMeshGeometry(gridGeometry);

  const sphereColumns = [Math.floor(STEPS_X * 0.3), Math.floor(STEPS_X * 0.7), Math.floor(STEPS_X * 0.5)];
  const sphereRadii = [200, 200, 100];
  for (let i = 0; i < spheres.length; i++) {
    spheres[i]!.position.y = heightAt(sphereColumns[i]!, Math.floor(STEPS_Y * 0.25)) + sphereRadii[i]!;
    setQuaternionFromEuler(spheres[i]!.rotation, sphereRotation * (i === 2 ? 1.5 : 1), 0, 0);
    invalidateNodeLocalTransform(spheres[i]!);
  }

  const cameraWave = Math.sin(scrollOffset * 0.05);
  const cameraColumn = Math.floor(STEPS_X * (0.5 + cameraWave * 0.25));
  const cameraYaw = cameraWave * -25 * Math.PI / 180;
  setVector3(eye, cameraWave * WIDTH * 0.25, heightAt(cameraColumn, 0) + 100, 4000);
  setVector3(target, eye.x + Math.sin(cameraYaw) * 4000, eye.y, eye.z - Math.cos(cameraYaw) * 4000);
  setCamera3DViewMatrix4FromLookAt(camera, eye, target, up);

  stepParticleEmitter3D(sparks, sparkState, sparkConfig, deltaTime);
  ctx.render(scene.root, camera, lights);
  updateStats(timestamp);
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
