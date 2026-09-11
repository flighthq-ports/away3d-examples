import type { ParticleEmitter3D, ParticleEmitterState, PerspectiveProjection } from '@flighthq/sdk';
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
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  prewarmParticleEmitter3D,
  setVector3,
  stepParticleEmitter3D,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const PARTICLE_COUNT = 1000;
const LIFETIME = 4;

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  effects: [createToneMapEffect(), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 5000 });
// HoverController(camera, null, 45, 20, 1000, 5). The sixth argument is minTiltAngle — the port
// had it as `steps`, which sets the easing rate and left the tilt unclamped.
const orbit = createOrbitControllerFromAway(camera, {
  distance: 1000,
  panAngle: 45,
  tiltAngle: 20,
  minTiltAngle: 5,
});
bindOrbitDrag(ctx.canvas, orbit);
const lights = createScene3DLights();

// WireframeAxesGrid(10, 1500): three grid planes through the origin, drawn by the original as
// SegmentSets. The port left them out entirely, so the particles had no frame of reference.
// Defaults from away3d.debug.WireframeAxesGrid: XY blue, ZY red, XZ green, spanning +/-gridSize/2
// with subDivision steps, and the lines are inclusive of both bounds (11 per direction here).
// The grid is symmetric about the origin on every axis, so the Z negation does not apply.
const GRID_SUBDIVISION = 10;
const GRID_SIZE = 1500;
function addAxesGridPlane(plane: 'xy' | 'zy' | 'xz', color: number): void {
  const bound = GRID_SIZE * 0.5;
  const step = GRID_SIZE / GRID_SUBDIVISION;
  const points: number[] = [];
  for (let i = 0; i <= GRID_SUBDIVISION; i++) {
    const at = -bound + i * step;
    if (plane === 'xy') {
      points.push(bound, at, 0, -bound, at, 0);
      points.push(at, bound, 0, at, -bound, 0);
    } else if (plane === 'zy') {
      points.push(0, at, bound, 0, at, -bound);
      points.push(0, bound, at, 0, -bound, at);
    } else {
      points.push(bound, 0, at, -bound, 0, at);
      points.push(at, 0, bound, at, 0, -bound);
    }
  }
  const geometry = createMeshGeometry({
    layout: { stride: 12, attributes: [{ semantic: 'position', format: 'float32x3', byteOffset: 0 }] },
    topology: 'line-list',
    vertices: new Float32Array(points),
  });
  addNodeChild(scene.root, createMesh(geometry, [createUnlitMaterial({ baseColor: color })]));
}
addAxesGridPlane('xy', 0x0000ffff);
addAxesGridPlane('zy', 0xff0000ff);
addAxesGridPlane('xz', 0x00ff00ff);

const image = await loadImageResourceFromUrl(ctx.host, 'away3d/ParticleTrails/cards_suit.png');
const atlas = createTextureAtlas({ texture: createTexture({ source: image }) });
const cellWidth = image.width / 2;
const cellHeight = image.height / 2;
for (let row = 0; row < 2; row++) {
  for (let column = 0; column < 2; column++) {
    addTextureAtlasRegion(atlas, column * cellWidth, row * cellHeight, cellWidth, cellHeight);
  }
}

// Both emitters share this immutable lifecycle, matching Away3D's reused ParticleAnimationSet. Each
// gets an independent state and a moving node whose world-space spawn history becomes its trail.
const trailConfig = createParticleEmitterConfig({
  maxParticles: PARTICLE_COUNT,
  spawnRate: PARTICLE_COUNT / LIFETIME,
  duration: -1,
  loop: true,
  lifetimeMin: LIFETIME,
  lifetimeMax: LIFETIME,
  emitterShape: 'cone3d',
  emitterConeAngle: 0.7,
  directionX: 0,
  directionY: -1,
  directionZ: 0,
  speedMin: 100,
  speedMax: 220,
  scaleMin: 30,
  scaleMax: 30,
  alphaStart: 1,
  alphaEnd: 0,
  regionIdMin: 0,
  regionIdMax: 4,
  blendMode: 'add',
  worldSpace: true,
});

interface Trail {
  emitter: ParticleEmitter3D;
  state: ParticleEmitterState;
}

function createTrail(x: number, z: number): Trail {
  const emitter = createParticleEmitter3D();
  emitter.blendMode = 'add';
  emitter.data.atlas = atlas;
  setVector3(emitter.position, x, 300, z);
  invalidateNodeLocalTransform(emitter);
  addNodeChild(scene.root, emitter);
  const state = createParticleEmitterState();
  prewarmParticleEmitter3D(emitter, state, trailConfig, LIFETIME, 1 / 60);
  return { emitter, state };
}

const trails = [createTrail(500, 0), createTrail(0, 0)];
let angle = 0;
let previousTime = performance.now();
// Stands in for the original's AwayStats readout, which this sample never repositions, so it
// sits top left. The particles dominate the count and are emitters rather than Mesh nodes, so
// their quads are added from emitter capacity — two triangles each, as Away3D's ParticleGeometry
// builds them. The axes grid is excluded: it is a line list here, where Away3D expands each
// SegmentSet segment into a quad, so the original reads 132 higher (66 segments x 2) than this.
let triangleCount = trails.length * PARTICLE_COUNT * 2;
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
  position: 'fixed', left: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

function frame(timestamp: number): void {
  const deltaTime = Math.min(0.1, (timestamp - previousTime) / 1000);
  previousTime = timestamp;
  angle += deltaTime * 2.4;

  setVector3(trails[0]!.emitter.position, Math.cos(angle) * 500, 300, -Math.sin(angle) * 500);
  setVector3(trails[1]!.emitter.position, Math.sin(angle) * 500, 300, 0);
  for (const trail of trails) {
    invalidateNodeLocalTransform(trail.emitter);
    stepParticleEmitter3D(trail.emitter, trail.state, trailConfig, deltaTime);
  }

  orbit.update();
  framesThisSecond++;
  if (timestamp - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (timestamp - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = timestamp;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;
  ctx.render(scene.root, camera, lights);
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
