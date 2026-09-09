import type { PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  appendParticleEmitter3DParticle,
  createFxaaEffect,
  createParticleEmitter3D,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTextureAtlas,
  createToneMapEffect,
  loadImageResourceFromUrl,
  reserveParticleEmitter3D,
  setParticleEmitter3DParticleColor,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect(), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ far: 4000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 1000, panAngle: 45, tiltAngle: 20 });
bindOrbitDrag(ctx.canvas, orbit); const lights = createScene3DLights();
const image = await loadImageResourceFromUrl(ctx.host, 'blue.png');
const atlas = createTextureAtlas({ texture: createTexture({ source: image }) });
addTextureAtlasRegion(atlas, 0, 0, image.width, image.height);
const emitter = createParticleEmitter3D(); emitter.blendMode = 'add'; emitter.data.atlas = atlas;
const count = 500; reserveParticleEmitter3D(emitter, count);
const speed = new Float32Array(count * 3); const initial = new Float32Array(count * 3);
for (let i = 0; i < count; i++) {
  const x = Math.random() * 500 - 250; const y = Math.random() * 500 - 250; const z = Math.random() * 500 - 250;
  appendParticleEmitter3DParticle(emitter, i, x, y, z, Math.random() * Math.PI * 2, 10);
  setParticleEmitter3DParticleColor(emitter, i, 0.25 + Math.random() * 0.25, 0.55 + Math.random() * 0.35, 1);
  initial[i * 3] = x; initial[i * 3 + 1] = y; initial[i * 3 + 2] = z;
  speed[i * 3] = Math.random() * 120 - 60; speed[i * 3 + 1] = Math.random() * 120 - 60; speed[i * 3 + 2] = Math.random() * 120 - 60;
}
addNodeChild(scene.root, emitter);
function frame(ts: number): void {
  const t = ts / 1000; const transforms = emitter.data.transforms; const positionsZ = emitter.data.positionsZ;
  for (let i = 0; i < count; i++) {
    transforms[i * 4] = initial[i * 3]! + Math.sin(t + i * 0.17) * speed[i * 3]!;
    transforms[i * 4 + 1] = initial[i * 3 + 1]! + Math.cos(t * 0.8 + i * 0.11) * speed[i * 3 + 1]!;
    positionsZ[i] = initial[i * 3 + 2]! + Math.sin(t * 1.3 + i * 0.07) * speed[i * 3 + 2]!;
  }
  orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
