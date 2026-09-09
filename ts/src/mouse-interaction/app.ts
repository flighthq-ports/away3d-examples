import type {
  Mesh,
  PerspectiveProjection,
} from '@flighthq/sdk';
import {
  createAmbientLight,
  createFxaaEffect,
  createScene3D,
  createScene3DLights,
  createToneMapEffect,
} from '@flighthq/sdk';

import { createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { bindHoverPicking, bindOrbitControls } from './controls';
import type { ObjectInfo } from './objects';
import { createRandomObject, loadHeadModel } from './objects';
import { createTracers, updateNormalTracerStroke } from './tracers';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  effects: [createToneMapEffect({ exposure: 1.5 }), createFxaaEffect()],
});

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60 });

const pointLight = createPointLightFromAway({ range: 10000, referenceDistance: 300 });
// AwayJS uses only a point light at the camera — no ambient. A tiny ambient keeps PBR
// surfaces from going pure black in shadow without washing out the dramatic headlight look.
const ambient = createAmbientLight({ color: 0xffffffff, intensity: 0.05 });
const lights = createScene3DLights({
  ambient,
  directional: null,
  point: [pointLight],
});

const objectInfos: ObjectInfo[] = [];
const meshToInfo = new Map<Mesh, ObjectInfo>();

for (let i = 0; i < 40; i++) {
  createRandomObject(scene, objectInfos, meshToInfo);
}

const headMesh = await loadHeadModel(scene, objectInfos, meshToInfo);

const tracers = createTracers(scene);

const orbit = createOrbitControllerFromAway(camera, {
  distance: 320,
  panAngle: 180,
  tiltAngle: 20,
  minTiltAngle: 5,
  maxTiltAngle: 90,
});

const updateCamera = bindOrbitControls(ctx.canvas, orbit, pointLight);
bindHoverPicking(ctx.canvas, scene, camera, tracers, meshToInfo, headMesh);

updateCamera();

function frame(): void {
  updateCamera();
  updateNormalTracerStroke(tracers.pickingNormalTracer, camera, ctx.canvas.clientHeight, 3);
  updateNormalTracerStroke(tracers.sceneNormalTracer, camera, ctx.canvas.clientHeight, 3);

  tracers.sceneTracer.visible = false;
  tracers.sceneNormalTracer.visible = false;

  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = window.devicePixelRatio || 1;
  ctx.canvas.width = w * pr;
  ctx.canvas.height = h * pr;
  ctx.canvas.style.width = `${w}px`;
  ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

requestAnimationFrame(frame);
