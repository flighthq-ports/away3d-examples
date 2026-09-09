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
  loadImageResourceFromUrl('away3d/UVAnimation/wheel.png'),
  loadImageResourceFromUrl('away3d/UVAnimation/road.jpg'),
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
  setTextureUvOffset(textures[1]!, 0, -seconds * 0.35);
  const pulse = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(seconds * 2));
  setTextureUvScale(textures[2]!, pulse, pulse);
  setTextureUvOffset(textures[2]!, (1 - pulse) / 2, (1 - pulse) / 2);
  setTextureUvRotation(textures[3]!, Math.sin(seconds) * Math.PI * 0.45);
  setTextureUvScale(textures[3]!, 0.75 + Math.sin(seconds * 1.7) * 0.2, 0.75 + Math.cos(seconds * 1.7) * 0.2);
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
