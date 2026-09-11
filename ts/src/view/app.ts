import {
  addNodeChild,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createTexture,
  createUnlitMaterial,
  createVector3,
  DEG_TO_RAD,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  setQuaternionFromAxisAngle,
} from '@flighthq/sdk';

import { createCameraFromAway } from '../../shared/camera';
import { setupRendering } from './render.gl';

const rendering = setupRendering();
const scene = createScene3D();
const camera = createCameraFromAway({ y: 500, z: -600, fov: 60 });

const image = await loadImageResourceFromUrl(rendering.host, 'floor_diffuse.jpg');
const texture = createTexture({ source: image });
const material = createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: texture });
const plane = createMesh(createPlaneMeshGeometry(700, 700), [material]);
addNodeChild(scene.root, plane);

const yAxis = createVector3(0, 1, 0);
let angle = 0;

function frame(): void {
  angle -= DEG_TO_RAD;
  setQuaternionFromAxisAngle(plane.rotation, yAxis, angle);
  invalidateNodeLocalTransform(plane);

  rendering.render(scene.root, camera);
  requestAnimationFrame(frame);
}

rendering.resize(camera);
window.addEventListener('resize', () => rendering.resize(camera));
requestAnimationFrame(frame);
