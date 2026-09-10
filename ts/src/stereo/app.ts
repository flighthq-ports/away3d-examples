import type { PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  copyQuaternion,
  createBoxMeshGeometry,
  createFxaaEffect,
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

// The original renders a red/cyan anaglyph, so the two eyes composite into ONE picture rather than
// being drawn as a side-by-side stereo pair. Tone mapping is deliberately left out: it would shift
// the channel balance the anaglyph depends on. FXAA stands in for the original's `antiAlias = 4`.
const ctx = createScene3DContext({
  width: innerWidth,
  height: innerHeight,
  backgroundColor: 0x000000ff,
  effects: [createFxaaEffect()],
});

const scene = createScene3D();
const lights = createScene3DLights();

// CubeGeometry() defaults to 100 units in Away3D and the sample scales it by 5.
const cube = createMesh(createBoxMeshGeometry(500, 500, 500), [
  createUnlitMaterial({ baseColor: 0xffcc00ff }),
]);
addNodeChild(scene.root, cube);

// StereoCamera3D with stereoOffset = 50, i.e. the eyes sit 25 units either side of centre.
const EYE_SEPARATION = 50;
const aspect = innerWidth / innerHeight;
const leftCamera = createCameraFromAway({ far: 5000, aspect });
const rightCamera = createCameraFromAway({ far: 5000, aspect });
const target = createVector3(0, 0, 0);
const up = createVector3(0, 1, 0);
const leftEye = createVector3(-EYE_SEPARATION / 2, 0, 1000);
const rightEye = createVector3(EYE_SEPARATION / 2, 0, 1000);
setCamera3DViewMatrix4FromLookAt(leftCamera, leftEye, target, up);
setCamera3DViewMatrix4FromLookAt(rightCamera, rightEye, target, up);

// The original spins the cube on Y alone, at 2 degrees per frame (~120 degrees/second).
const DEGREES_PER_SECOND = 2 * 60;
const yAxis = createVector3(0, 1, 0);
const rotation = createQuaternion();

function frame(timestamp: number): void {
  const radians = (timestamp / 1000) * DEGREES_PER_SECOND * Math.PI / 180;
  setQuaternionFromAxisAngle(rotation, yAxis, radians);
  copyQuaternion(cube.rotation, rotation);
  invalidateNodeLocalTransform(cube);

  ctx.renderAnaglyph(scene.root, leftCamera, rightCamera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const width = innerWidth;
  const height = innerHeight;
  const pixelRatio = devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio;
  ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`;
  ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (leftCamera.projection as PerspectiveProjection).aspect = width / height;
  (rightCamera.projection as PerspectiveProjection).aspect = width / height;
});

requestAnimationFrame(frame);
