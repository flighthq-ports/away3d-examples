import { webHostImage } from '@flighthq/host-web';
import {
  addNodeChild,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DLights,
  invalidateNodeLocalTransform,
  setVector3,
  stepParticleEmitter3D,
} from '@flighthq/sdk';

import {
  awayDirection,
  bindOrbitDrag,
  createCameraFromAway,
  createOrbitControllerFromAway,
} from '../../shared/camera';
import { createDirectionalLightFromAway, createPointLightFromAway } from '../../shared/lighting';
import { createFireEmitters, startFiresSequentially } from './fire';
import { createFloorMaterial, loadFloorTextures } from './floor';
import { setupRenderer } from './render.gl';

const FIRE_START_INTERVAL = 1000;
const FIRE_LIGHT_COUNT = 2;
const FIRE_LIGHT_REFERENCE_DISTANCE = 360;

const renderer = setupRenderer();

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60 });

const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(0, -1, 0),
  color: 0xeedddd,
  diffuse: 0.5,
  ambient: 0.5,
  ambientColor: 0x808090,
  shading: 'phong',
});

const planeMaterial = createFloorMaterial();
const planeGeometry = createPlaneMeshGeometry(1000, 1000, 1, 1);
const plane = createMesh(planeGeometry, [planeMaterial]);
plane.position.y = -20;
invalidateNodeLocalTransform(plane);
addNodeChild(scene.root, plane);

loadFloorTextures(webHostImage, planeMaterial);

const { fires, config } = await createFireEmitters(webHostImage, scene);
startFiresSequentially(fires, FIRE_START_INTERVAL);

// Light the first two sequential emitters. Each light remains dark until its own fire starts, then
// flickers independently so the second pool appears directly under the second emitter rather than
// merging into a single synthetic floor glow.
const litFires = fires.slice(0, FIRE_LIGHT_COUNT).map((fire) => {
  const light = createPointLightFromAway({
    color: 0xff3301,
    diffuse: 1,
    range: 400,
    referenceDistance: FIRE_LIGHT_REFERENCE_DISTANCE,
    shading: 'phong',
  });
  const fullIntensity = light.intensity;
  light.intensity = 0;
  setVector3(light.position, fire.emitter.position.x, fire.emitter.position.y, fire.emitter.position.z);
  return { fire, fullIntensity, light };
});

const lights = createScene3DLights({ ambient, directional, point: litFires.map(({ light }) => light) });

const orbit = createOrbitControllerFromAway(camera, {
  distance: 1000,
  panAngle: 45,
  tiltAngle: 20,
  minTiltAngle: 0,
  maxTiltAngle: 90,
});

bindOrbitDrag(renderer.canvas, orbit);

let lastTs = 0;

function frame(ts: number): void {
  const dt = Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;

  for (const fire of fires) {
    if (!fire.active) continue;

    stepParticleEmitter3D(fire.emitter, fire.state, config, dt);

    if (fire.strength < 1) fire.strength += 0.1;
    const litFire = litFires.find((entry) => entry.fire === fire);
    if (litFire) {
      litFire.light.range = 380 + Math.random() * 20;
      litFire.light.intensity = litFire.fullIntensity * (Math.min(1, fire.strength) + Math.random() * 0.2);
    }
  }

  orbit.update();

  renderer.render(scene.root, camera, lights);

  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
