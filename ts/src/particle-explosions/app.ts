import type {
  Scene3DLights,
} from '@flighthq/sdk';
import {
  createAmbientLight,
  createPointLight,
  createScene3D,
  createScene3DLights,
  DEG_TO_RAD,
} from '@flighthq/sdk';

import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { loadParticleClouds, updateParticleCloud } from './particles';
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60, aspect: window.innerWidth / window.innerHeight });

const greenLight = createPointLight({ color: 0x00ff00ff, intensity: 5, range: 600 });
const blueLight = createPointLight({ color: 0x0000ffff, intensity: 5, range: 600 });
const ambient = createAmbientLight({ color: 0xffffffff, intensity: 1 });
const lights: Scene3DLights = createScene3DLights({ ambient, point: [greenLight, blueLight] });

const orbit = createOrbitControllerFromAway(camera, {
  distance: 1000,
  panAngle: 225,
  tiltAngle: 10,
  minTiltAngle: -89,
  maxTiltAngle: 89,
});

bindOrbitDrag(renderer.canvas, orbit);

const { clouds, paths } = await loadParticleClouds(scene.root);

// AwayJS starts _time at zero before applying each animator's phase offset.
let time = 0;
let lightAngle = 0;
let lastTs = 0;

function frame(ts: number): void {
  const dt = lastTs === 0 ? 1 / 60 : Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;
  time += dt;

  orbit.panAngle += 0.2 * DEG_TO_RAD;
  orbit.update();

  lightAngle += (Math.PI * dt) / 180;
  greenLight.position.x = Math.sin(lightAngle) * 600;
  greenLight.position.y = 0;
  greenLight.position.z = -Math.cos(lightAngle) * 600;
  blueLight.position.x = Math.sin(lightAngle + Math.PI) * 600;
  blueLight.position.y = 0;
  blueLight.position.z = -Math.cos(lightAngle + Math.PI) * 600;

  for (const cloud of clouds) {
    updateParticleCloud(cloud, paths, time);
  }

  renderer.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
