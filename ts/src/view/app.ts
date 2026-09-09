import type {
  PerspectiveProjection,
} from '@flighthq/sdk';
import {
  addNodeChild,
  copyQuaternion,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createTexture,
  createToneMapEffect,
  createUnlitMaterial,
  createVector3,
  DEG_TO_RAD,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  setQuaternionFromAxisAngle,
} from '@flighthq/sdk';

import { createCameraFromAway } from '../../shared/camera';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  effects: [createToneMapEffect(), createFxaaEffect()],
});

const scene = createScene3D();

const material = createUnlitMaterial({ baseColor: 0xffffffff });
const geometry = createPlaneMeshGeometry(700, 700);
const mesh = createMesh(geometry, [material]);
addNodeChild(scene.root, mesh);

const camera = createCameraFromAway({ y: 500, z: -600, fov: 60 });

const lights = createScene3DLights();
const yAxis = createVector3(0, 1, 0);
const scratchQuat = createQuaternion();

const image = await loadImageResourceFromUrl('floor_diffuse.jpg');
const texture = createTexture({ source: image });
material.baseColorMap = texture;

let angle = 0;

function frame(): void {
  angle -= DEG_TO_RAD;

  setQuaternionFromAxisAngle(scratchQuat, yAxis, angle);
  copyQuaternion(mesh.rotation, scratchQuat);
  invalidateNodeLocalTransform(mesh);

  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  ctx.canvas.width = w * pixelRatio;
  ctx.canvas.height = h * pixelRatio;
  ctx.canvas.style.width = `${w}px`;
  ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

frame();
