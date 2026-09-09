import type { ParticleEmitter3D, ParticleEmitterState, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createFxaaEffect,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTextureAtlas,
  createToneMapEffect,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  prewarmParticleEmitter3D,
  setVector3,
  stepParticleEmitter3D,
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
const orbit = createOrbitControllerFromAway(camera, {
  distance: 1000,
  panAngle: 45,
  tiltAngle: 20,
  steps: 5,
});
bindOrbitDrag(ctx.canvas, orbit);
const lights = createScene3DLights();

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
