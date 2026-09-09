import type { Image, ParticleEmitter3D, ParticleEmitterConfig, ParticleEmitterState, Scene3D } from '@flighthq/sdk';
import {
  addNodeChild,
  createImageResource,
  createParticleEmitter3D,
  createParticleEmitterConfig,
  createParticleEmitterState,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  setVector3,
} from '@flighthq/sdk';

import { createSingleSpriteAtlas } from '../../shared/particles';

const NUM_FIRES = 10;
const FIRE_RADIUS = 400;
const FIRE_SPRITE_SIZE = 38;

export interface FireEntry {
  emitter: ParticleEmitter3D;
  state: ParticleEmitterState;
  active: boolean;
  strength: number;
}

export interface FireEmittersResult {
  fires: FireEntry[];
  config: ParticleEmitterConfig;
}

// AwayJS applies its ParticleColorNode as a ColorTransform with zero RGB multipliers and color offsets.
// In other words, blue.png supplies coverage, not hue: the start/end fire colors replace its blue RGB.
// Flight's particle tint multiplies texture RGB, so first reduce the source to the same white alpha mask.
function createFireSpriteMask(source: Readonly<Image>): Image {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(source.source, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return createImageResource(canvas);
}

export async function createFireEmitters(scene: Readonly<Scene3D>): Promise<FireEmittersResult> {
  const fireImage = await loadImageResourceFromUrl('blue.png');
  const fireAtlas = createSingleSpriteAtlas(createFireSpriteMask(fireImage));

  const config: ParticleEmitterConfig = createParticleEmitterConfig({
    maxParticles: 500,
    spawnRate: 170,
    duration: -1,
    loop: true,
    lifetimeMin: 0.1,
    lifetimeMax: 4.1,
    emitterShape: 'cone3d',
    emitterConeAngle: 0.32,
    emitterRadius: 0,
    directionX: 0,
    directionY: 1,
    directionZ: 0,
    speedMin: 85,
    speedMax: 105,
    // Keep close to AwayJS's 5:1 lifetime shrink while keeping the plume narrow enough for its height.
    scaleMin: FIRE_SPRITE_SIZE,
    scaleMax: FIRE_SPRITE_SIZE,
    scaleEnd: 0.18,
    colorStartR: 1,
    colorStartG: 0.1,
    colorStartB: 0.001,
    colorEndR: 0.6,
    colorEndG: 0,
    colorEndB: 0,
    alphaStart: 1,
    alphaEnd: 1,
    blendMode: 'add',
  });

  const fires: FireEntry[] = [];

  for (let i = 0; i < NUM_FIRES; i++) {
    const emitter = createParticleEmitter3D();
    emitter.blendMode = 'add';
    emitter.data.atlas = fireAtlas;
    const state = createParticleEmitterState();

    const angle = (i / NUM_FIRES) * Math.PI * 2;
    const x = Math.sin(angle) * FIRE_RADIUS;
    const z = -Math.cos(angle) * FIRE_RADIUS;
    const y = 5;

    setVector3(emitter.position, x, y, z);
    invalidateNodeLocalTransform(emitter);

    addNodeChild(scene.root, emitter);
    fires.push({ emitter, state, active: false, strength: 0 });
  }

  return { fires, config };
}

export function startFiresSequentially(fires: readonly FireEntry[], interval: number): void {
  let started = 0;
  const timer = setInterval(() => {
    if (started >= fires.length) {
      clearInterval(timer);
      return;
    }
    fires[started]!.active = true;
    started++;
  }, interval);
}
