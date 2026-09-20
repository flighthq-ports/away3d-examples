import { webHostImage } from '@flighthq/host-web';
import type { ImageResource, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createTexture,
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
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();
const scene = createScene3D(); const camera = createCameraFromAway({ y: 200, z: -1500, far: 4000 });
const sheets: ImageResource[] = await Promise.all([
  loadImageResourceFromUrl(webHostImage, 'away3d/BasicSpriteSheet/testSheet1.jpg'),
  loadImageResourceFromUrl(webHostImage, 'away3d/BasicSpriteSheet/testSheet2.jpg'),
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
  renderer.render(scene.root, camera); requestAnimationFrame(frame);
}
renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));
requestAnimationFrame(frame);
