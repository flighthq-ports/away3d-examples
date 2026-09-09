import type { PerspectiveProjection, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createUnlitMaterial,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  setQuaternionFromEuler,
  setTextureUvOffset,
  setTextureUvRotation,
  setTextureUvScale,
  setVector3,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect(), createFxaaEffect()] });
const scene = createScene3D();
const camera = createCameraFromAway({ x: 500, y: 500, z: -1500, far: 5000 });
const lights = createScene3DLights();
const [wheelImage, roadImage] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, 'away3d/UVAnimation/wheel.png'),
  loadImageResourceFromUrl(ctx.host, 'away3d/UVAnimation/road.jpg'),
]);
const sampler = createTilingSampler();
const textures: Texture[] = [
  createTexture({ source: wheelImage, sampler }), createTexture({ source: roadImage, sampler }),
  createTexture({ source: wheelImage, sampler }), createTexture({ source: wheelImage, sampler }),
];
const positions = [[-300, 300], [300, 300], [300, -300], [-300, -300]] as const;
for (let i = 0; i < 4; i++) {
  const mesh = createMesh(createPlaneMeshGeometry(500, 500), [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: textures[i]! })]);
  setVector3(mesh.position, positions[i]![0], positions[i]![1], 0);
  setQuaternionFromEuler(mesh.rotation, Math.PI / 2, 0, 0);
  invalidateNodeLocalTransform(mesh); addNodeChild(scene.root, mesh);
}
function frame(ts: number): void {
  const seconds = ts / 1000;
  setTextureUvRotation(textures[0]!, seconds * 1.1);
  setTextureUvOffset(textures[1]!, 0, -seconds * 0.6);

  // The lower pair are explicit UVAnimationFrame sequences from the Away3D sample. They are kept
  // separate from the continuous upper pair so the example still demonstrates both animator modes.
  const firstKeyframes = [
    { duration: 1, scaleU: 1, scaleV: 1, rotation: 0 },
    { duration: 1, scaleU: 2, scaleV: 2, rotation: 0 },
    { duration: 1, scaleU: 1, scaleV: 1, rotation: Math.PI / 2 },
    { duration: 1, scaleU: 1, scaleV: 1, rotation: Math.PI / 2 },
    { duration: 1, scaleU: 1, scaleV: 1, rotation: Math.PI / 2 },
  ] as const;
  const secondKeyframes = [
    { duration: 0.25, scaleU: 1, scaleV: 1, rotation: 0 },
    { duration: 1, scaleU: 4, scaleV: 4, rotation: 0 },
  ] as const;

  function applyKeyframes(texture: Texture, frames: typeof firstKeyframes | typeof secondKeyframes): void {
    const duration = frames.reduce((sum, keyframe) => sum + keyframe.duration, 0);
    let localTime = seconds % duration;
    let index = 0;
    while (localTime >= frames[index]!.duration) {
      localTime -= frames[index]!.duration;
      index++;
    }
    const current = frames[index]!;
    const next = frames[(index + 1) % frames.length]!;
    const amount = localTime / current.duration;
    const scaleU = current.scaleU + (next.scaleU - current.scaleU) * amount;
    const scaleV = current.scaleV + (next.scaleV - current.scaleV) * amount;
    const rotation = current.rotation + (next.rotation - current.rotation) * amount;
    setTextureUvScale(texture, scaleU, scaleV);
    setTextureUvRotation(texture, rotation);
    setTextureUvOffset(texture, 0, 0);
  }

  applyKeyframes(textures[2]!, firstKeyframes);
  applyKeyframes(textures[3]!, secondKeyframes);
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
