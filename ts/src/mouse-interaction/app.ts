import type {
  Mesh,
} from '@flighthq/sdk';
import {
  createAmbientLight,
  createScene3D,
  createScene3DLights,
} from '@flighthq/sdk';

import { createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { bindHoverPicking, bindOrbitControls } from './controls';
import type { ObjectInfo } from './objects';
import { createRandomObject, loadHeadModel } from './objects';
import { createTracers, updateNormalTracerStroke } from './tracers';
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();

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

const updateCamera = bindOrbitControls(renderer.canvas, orbit, pointLight);
bindHoverPicking(renderer.canvas, scene, camera, tracers, meshToInfo, headMesh);

updateCamera();

function frame(): void {
  updateCamera();
  updateNormalTracerStroke(tracers.pickingNormalTracer, camera, renderer.canvas.clientHeight, 3);
  updateNormalTracerStroke(tracers.sceneNormalTracer, camera, renderer.canvas.clientHeight, 3);

  tracers.sceneTracer.visible = false;
  tracers.sceneNormalTracer.visible = false;

  renderer.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
