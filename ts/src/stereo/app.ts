import type { PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  copyQuaternion,
  createBoxMeshGeometry,
  createMesh,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createUnlitMaterial,
  createVector3,
  invalidateNodeLocalTransform,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
} from '@flighthq/sdk';
import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const width = innerWidth / 2;
const left = createScene3DContext({ width, height: innerHeight, mountId: 'left-eye', backgroundColor: 0x07090fff });
const right = createScene3DContext({ width, height: innerHeight, mountId: 'right-eye', backgroundColor: 0x07090fff });
const scene = createScene3D();
const material = createUnlitMaterial({ baseColor: 0xffcc00ff });
const cube = createMesh(createBoxMeshGeometry(260, 260, 260), [material]);
addNodeChild(scene.root, cube);
const leftCamera = createCameraFromAway({ far: 3000, aspect: width / innerHeight });
const rightCamera = createCameraFromAway({ far: 3000, aspect: width / innerHeight });
const target = createVector3(0, 0, 0); const up = createVector3(0, 1, 0);
const leftEye = createVector3(-25, 0, 600); const rightEye = createVector3(25, 0, 600);
setCamera3DViewMatrix4FromLookAt(leftCamera, leftEye, target, up);
setCamera3DViewMatrix4FromLookAt(rightCamera, rightEye, target, up);
const lights = createScene3DLights();
const rotation = createQuaternion(); const axis = createVector3(0.4, 1, 0.2);
function frame(ts: number): void {
  setQuaternionFromAxisAngle(rotation, axis, ts / 1200); copyQuaternion(cube.rotation, rotation); invalidateNodeLocalTransform(cube);
  left.render(scene.root, leftCamera, lights); right.render(scene.root, rightCamera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth / 2; const h = innerHeight; const pr = devicePixelRatio || 1;
  for (const ctx of [left, right]) {
    ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  (leftCamera.projection as PerspectiveProjection).aspect = w / h;
  (rightCamera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
