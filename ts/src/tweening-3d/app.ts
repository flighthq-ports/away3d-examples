import { webHostImage } from '@flighthq/host-web';
import {
  addNodeChild,
  createBoxMeshGeometry,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DHit,
  createTexture,
  createUnlitMaterial,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  pickScene3D,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();
const scene = createScene3D();
const camera = createCameraFromAway({ y: 500, z: -600, far: 3000 });
const [floorImage, cubeImage] = await Promise.all([
  loadImageResourceFromUrl(webHostImage, 'floor_diffuse.jpg'), loadImageResourceFromUrl(webHostImage, 'trinket_diffuse.jpg'),
]);
const floor = createMesh(createPlaneMeshGeometry(700, 700), [
  createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: floorImage }) }),
]);
const cube = createMesh(createBoxMeshGeometry(100, 100, 100), [
  createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: cubeImage }) }),
]);
cube.position.y = 50;
invalidateNodeLocalTransform(cube);
addNodeChild(scene.root, floor); addNodeChild(scene.root, cube);

let startX = 0; let startZ = 0; let targetX = 0; let targetZ = 0; let started = -1;
const hit = createScene3DHit();
renderer.canvas.addEventListener('pointerup', (event) => {
  const rect = renderer.canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
  const picked = pickScene3D(scene.root, camera, x, y, hit);
  if (picked?.node !== floor) return;
  startX = cube.position.x; startZ = cube.position.z;
  targetX = picked.pointX; targetZ = picked.pointZ; started = performance.now();
});

// This sample has no overlay at all: the original adds neither a TextField nor AwayStats, so the
// only thing on screen is the floor and the crate.
function frame(ts: number): void {
  if (started >= 0) {
    const t = Math.min(1, (ts - started) / 500);
    const u = 1 - t;
    cube.position.x = u * u * startX + 2 * u * t * targetX + t * t * targetX;
    cube.position.z = u * u * startZ + 2 * u * t * startZ + t * t * targetZ;
    cube.position.y = 50 + Math.sin(t * Math.PI) * 35;
    invalidateNodeLocalTransform(cube);
    if (t === 1) started = -1;
  }
  renderer.render(scene.root, camera); requestAnimationFrame(frame);
}
renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));
requestAnimationFrame(frame);
