import type { ImageResource, PerspectiveProjection, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DLights,
  createTexture,
  createToneMapEffect,
  createUnlitMaterial,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  setQuaternionFromEuler,
  setTextureSource,
  setTextureUvOffset,
  setTextureUvScale,
  setVector3,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect(), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ y: 200, z: -1500, far: 4000 });
const lights = createScene3DLights();
const sheets: ImageResource[] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, 'away3d/BasicSpriteSheet/testSheet1.jpg'),
  loadImageResourceFromUrl(ctx.host, 'away3d/BasicSpriteSheet/testSheet2.jpg'),
]);
const textures: Texture[] = [createTexture({ source: sheets[0]! }), createTexture({ source: sheets[0]! })];
for (let i = 0; i < 2; i++) {
  setTextureUvScale(textures[i]!, 0.5, 0.5);
  const plane = createMesh(createPlaneMeshGeometry(700, 700), [createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: textures[i]! })]);
  setVector3(plane.position, i === 0 ? -400 : 400, 0, 0); setQuaternionFromEuler(plane.rotation, Math.PI / 2, 0, 0);
  invalidateNodeLocalTransform(plane); addNodeChild(scene.root, plane);
}
function selectFrame(texture: Texture, frame: number): void {
  setTextureUvOffset(texture, (frame % 2) * 0.5, Math.floor((frame % 4) / 2) * 0.5);
}
function frame(ts: number): void {
  selectFrame(textures[0]!, Math.floor(ts / 250) % 4);
  const cycle = Math.floor(ts / 100) % 14; const frameNumber = cycle < 8 ? cycle : 14 - cycle;
  setTextureSource(textures[1]!, sheets[Math.floor(frameNumber / 4)]!);
  selectFrame(textures[1]!, frameNumber);
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
