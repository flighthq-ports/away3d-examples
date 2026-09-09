import type { PerspectiveProjection } from '@flighthq/sdk';
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
  loadImageResourceFromUrl,
  prewarmParticleEmitter3D,
  stepParticleEmitter3D,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const PARTICLE_COUNT = 20_000;
const LIFETIME = 5;

const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  effects: [createToneMapEffect(), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 4000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 1000, panAngle: 45, tiltAngle: 20 });
bindOrbitDrag(ctx.canvas, orbit);
const lights = createScene3DLights();

const image = await loadImageResourceFromUrl(ctx.host, 'blue.png');
const atlas = createTextureAtlas({ texture: createTexture({ source: image }) });
addTextureAtlasRegion(atlas, 0, 0, image.width, image.height);

const emitter = createParticleEmitter3D();
emitter.blendMode = 'add';
emitter.data.atlas = atlas;
addNodeChild(scene.root, emitter);

const state = createParticleEmitterState();
const config = createParticleEmitterConfig({
  maxParticles: PARTICLE_COUNT,
  spawnRate: PARTICLE_COUNT / LIFETIME,
  duration: -1,
  loop: true,
  lifetimeMin: LIFETIME,
  lifetimeMax: LIFETIME,
  emitterShape: 'sphere',
  emitterRadius: 0,
  speedMin: 400,
  speedMax: 450,
  scaleMin: 10,
  scaleMax: 10,
  alphaStart: 1,
  alphaEnd: 1,
  blendMode: 'add',
});

// The Away3D animator starts with random start times in [-5, 0], so the first displayed frame is
// already a full spray rather than a visibly empty emitter warming up.
prewarmParticleEmitter3D(emitter, state, config, LIFETIME, 1 / 60);

let previousTime = performance.now();
function frame(timestamp: number): void {
  const deltaTime = Math.min(0.1, (timestamp - previousTime) / 1000);
  previousTime = timestamp;
  stepParticleEmitter3D(emitter, state, config, deltaTime);
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
