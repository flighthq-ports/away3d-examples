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
const scene = createScene3D(); const camera = createCameraFromAway({ far: 5000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 1000, panAngle: 45, tiltAngle: 20 });
bindOrbitDrag(ctx.canvas, orbit); const lights = createScene3DLights();
const image = await loadImageResourceFromUrl(ctx.host, 'away3d/ParticleTrails/cards_suit.png');
const atlas = createTextureAtlas({ texture: createTexture({ source: image }) });
addTextureAtlasRegion(atlas, 0, 0, image.width, image.height);
const count = 400;
const emitters = [createParticleEmitter3D(), createParticleEmitter3D()];
for (const emitter of emitters) {
  emitter.blendMode = 'normal'; emitter.data.atlas = atlas; reserveParticleEmitter3D(emitter, count);
  for (let i = 0; i < count; i++) {
    appendParticleEmitter3DParticle(emitter, i, 0, 0, 0, 0, 28);
    const red = i % 2 === 0; setParticleEmitter3DParticleColor(emitter, i, red ? 0.95 : 0.08, red ? 0.08 : 0.08, red ? 0.08 : 0.12);
  }
  addNodeChild(scene.root, emitter);
}
function updateTrail(emitter: typeof emitters[number], time: number, mirror: number): void {
  const transforms = emitter.data.transforms; const positionsZ = emitter.data.positionsZ;
  for (let i = 0; i < count; i++) {
    const p = (i / count + time * 0.08) % 1; const angle = p * Math.PI * 6 + mirror * Math.PI;
    const radius = 360 - p * 230;
    transforms[i * 4] = Math.cos(angle) * radius * mirror;
    transforms[i * 4 + 1] = (p - 0.5) * 620 + Math.sin(angle * 0.5) * 70;
    transforms[i * 4 + 3] = angle;
    positionsZ[i] = Math.sin(angle) * radius * mirror;
  }
}
function frame(ts: number): void {
  const t = ts / 1000; updateTrail(emitters[0]!, t, 1); updateTrail(emitters[1]!, t + 0.45, -1);
  orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
