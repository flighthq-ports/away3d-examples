import { webHostImage } from '@flighthq/host-web';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createScene3D,
  createTexture,
  createTextureAtlas,
  loadImageResourceFromUrl,
  prewarmParticleEmitter3D,
  stepParticleEmitter3D,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { setupRenderer } from './render.gl';

const PARTICLE_COUNT = 20_000;
const LIFETIME = 5;

const renderer = setupRenderer();
const scene = createScene3D();
const camera = createCameraFromAway({ far: 4000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 1000, panAngle: 45, tiltAngle: 20 });
bindOrbitDrag(renderer.canvas, orbit);

const image = await loadImageResourceFromUrl(webHostImage, 'blue.png');
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
  renderer.render(scene.root, camera);
  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
