import type { ParticleEmitter3D, Node3D } from '@flighthq/sdk';
import {
  addNodeChild,
  appendParticleEmitter3DParticle,
  copyQuaternion,
  createParticleEmitter3D,
  createQuaternion,
  DEG_TO_RAD,
  invalidateNodeLocalTransform,
  reserveParticleEmitter3D,
  setParticleEmitter3DParticleColor,
  setQuaternionFromAxisAngle,
} from '@flighthq/sdk';

const PARTICLE_SIZE = 2;
const NUM_ANIMATORS = 4;
const CONTROL_RADIUS = 500;

export const CURVE_TIME_SCALE_SECONDS = 5;

interface SampledPixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
}

function samplePixels(img: HTMLImageElement): SampledPixel[] {
  const offscreen = document.createElement('canvas');
  offscreen.width = img.naturalWidth;
  offscreen.height = img.naturalHeight;
  const ctx2d = offscreen.getContext('2d')!;
  ctx2d.drawImage(img, 0, 0);
  const { data, width: w, height: h } = ctx2d.getImageData(0, 0, img.naturalWidth, img.naturalHeight);

  const results: SampledPixel[] = [];
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const idx = (j * w + i) * 4;
      if (data[idx + 3]! > 0xb0) {
        results.push({
          x: i - w / 2,
          y: -(j - h / 2),
          r: data[idx]! / 255,
          g: data[idx + 1]! / 255,
          b: data[idx + 2]! / 255,
        });
      }
    }
  }
  return results;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

interface LogoDefinition {
  url: string;
  offset: readonly [number, number, number];
  end: readonly [number, number, number];
}

const logoDefinitions: readonly LogoDefinition[] = [
  {
    url: 'chrome.png',
    offset: [-100 * PARTICLE_SIZE, 0, 0],
    end: [300 * PARTICLE_SIZE, 0, 0],
  },
  {
    url: 'firefox.png',
    offset: [100 * PARTICLE_SIZE, 0, 0],
    end: [-300 * PARTICLE_SIZE, 0, 0],
  },
  {
    url: 'safari.png',
    offset: [0, 0, -100 * PARTICLE_SIZE],
    end: [0, 0, 300 * PARTICLE_SIZE],
  },
  {
    url: 'ie.png',
    offset: [0, 0, 100 * PARTICLE_SIZE],
    end: [0, 0, -300 * PARTICLE_SIZE],
  },
];

interface ParticlePath {
  startX: number;
  startY: number;
  startZ: number;
  controlX: number;
  controlY: number;
  controlZ: number;
  endX: number;
  endY: number;
  endZ: number;
  r: number;
  g: number;
  b: number;
}

export interface ParticleCloud {
  emitter: ParticleEmitter3D;
  phase: number;
}

export interface ParticleSystem {
  clouds: ParticleCloud[];
  paths: ParticlePath[];
}

// AwayJS builds the four logo silhouettes out of particles, then clones that combined particle sprite
// four times. There are no separate static logo objects: a recognizable "logo" is simply one cloud at
// t=0, while its phase-shifted siblings can be visibly exploded at the same moment. Mirroring that layout
// cuts Flight's draw calls from 16 per-logo emitters to four combined clouds.
export async function loadParticleClouds(sceneRoot: Node3D): Promise<ParticleSystem> {
  const images = await Promise.all(logoDefinitions.map((logo) => loadImage(logo.url)));
  const paths: ParticlePath[] = [];

  for (let logoIndex = 0; logoIndex < logoDefinitions.length; logoIndex++) {
    const logo = logoDefinitions[logoIndex]!;
    for (const pixel of samplePixels(images[logoIndex]!)) {
      const degree1 = Math.random() * Math.PI * 2;
      const degree2 = Math.random() * Math.PI * 2;
      paths.push({
        startX: logo.offset[0] + pixel.x * PARTICLE_SIZE,
        startY: logo.offset[1] + pixel.y * PARTICLE_SIZE,
        startZ: logo.offset[2],
        controlX: CONTROL_RADIUS * Math.sin(degree1) * Math.cos(degree2),
        controlY: CONTROL_RADIUS * Math.cos(degree1) * Math.cos(degree2),
        controlZ: CONTROL_RADIUS * Math.sin(degree2),
        endX: logo.end[0],
        endY: logo.end[1],
        endZ: logo.end[2],
        r: pixel.r,
        g: pixel.g,
        b: pixel.b,
      });
    }
  }

  const clouds: ParticleCloud[] = [];
  for (let animator = 0; animator < NUM_ANIMATORS; animator++) {
    const emitter = createParticleEmitter3D();
    emitter.blendMode = 'normal';
    reserveParticleEmitter3D(emitter, paths.length);

    for (const path of paths) {
      const index = appendParticleEmitter3DParticle(
        emitter,
        0,
        path.startX,
        path.startY,
        path.startZ,
        0,
        PARTICLE_SIZE,
      );
      setParticleEmitter3DParticleColor(emitter, index, path.r, path.g, path.b);
    }

    const rotationY = -45 * (animator - 1) * DEG_TO_RAD;
    const emitterQuat = createQuaternion();
    setQuaternionFromAxisAngle(emitterQuat, { x: 0, y: 1, z: 0 }, rotationY);
    copyQuaternion(emitter.rotation, emitterQuat);
    invalidateNodeLocalTransform(emitter);
    addNodeChild(sceneRoot, emitter);
    clouds.push({ emitter, phase: (Math.PI * animator) / 4 });
  }

  return { clouds, paths };
}

export function updateParticleCloud(cloud: ParticleCloud, paths: ParticlePath[], time: number): void {
  // Exact AwayJS input: animator.update(1000 * (sin(time / 5000 + phase) + 1)). ParticleTimeState divides
  // milliseconds by 1000, yielding a Bezier lifetime t in [0, 2]. ParticleAnimationSet's default
  // usesDuration=false keeps every particle visible throughout; t>1 deliberately extrapolates the curve
  // into the wide explosion before it reverses and reforms.
  const t = Math.sin(time / CURVE_TIME_SCALE_SECONDS + cloud.phase) + 1;
  const curveWeight = 2 * t * (1 - t);
  const endWeight = t * t;
  const transforms = cloud.emitter.data.transforms;
  const positionsZ = cloud.emitter.data.positionsZ;

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]!;
    const transformIndex = i * 4;
    transforms[transformIndex] = path.startX + curveWeight * path.controlX + endWeight * path.endX;
    transforms[transformIndex + 1] = path.startY + curveWeight * path.controlY + endWeight * path.endY;
    positionsZ[i] = path.startZ + curveWeight * path.controlZ + endWeight * path.endZ;
  }
}
