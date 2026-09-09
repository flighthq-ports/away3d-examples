import type {
  BlinnPhongMaterial,
  Mesh,
  PerspectiveProjection,
} from '@flighthq/sdk';
import {
  addNodeChild,
  appendMatrix4,
  createFxaaEffect,
  createMatrix4,
  createScene3D,
  createScene3DFromAwd2,
  createScene3DLights,
  createToneMapEffect,
  createVector3,
  DEG_TO_RAD,
  findNode,
  getNodeLocalMatrix4,
  isMesh,
  rotateMatrix4,
  scaleMatrix4,
  setMatrix4Identity,
  setNodeLocalMatrix4,
  translateMatrix4,
} from '@flighthq/sdk';

import { awayDirection, createCameraFromAway } from '../../shared/camera';
import { applyAwayGloss, createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x030404ff,
  effects: [createToneMapEffect(), createFxaaEffect()],
});

const scene = createScene3D();

const camera = createCameraFromAway({ z: -2000, fov: 60 });

const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(1, 0, 0),
  color: 0x683019,
  diffuse: 2.8,
  ambient: 0.5,
  ambientColor: 0x30353b,
  tuning: {
    diffuse: 0.7,
    ambient: 0.2,
  },
});
const lights = createScene3DLights({ ambient, directional });

const buffer = await fetch('suzanne.awd').then((r) => r.arrayBuffer());
const modelScene = createScene3DFromAwd2(new Uint8Array(buffer));

const templateMesh = findNode(modelScene.root, isMesh) as Mesh | null;
if (!templateMesh?.geometry) throw new Error('No mesh found in suzanne.awd');
const defaultMaterial = templateMesh.materials[0] as BlinnPhongMaterial;
applyAwayGloss(defaultMaterial, { gloss: 50, specular: 1.8 });

const orient = createMatrix4();
const orientSource = getNodeLocalMatrix4(templateMesh);
orient.m.set(orientSource.m);

addNodeChild(scene.root, templateMesh);

const yAxis = createVector3(0, 1, 0);
const scratchMatrix = createMatrix4();
let rotationAngle = 0;

function frame(): void {
  rotationAngle += -1 * DEG_TO_RAD;
  setMatrix4Identity(scratchMatrix);
  translateMatrix4(scratchMatrix, scratchMatrix, 0, -300, 0);
  rotateMatrix4(scratchMatrix, scratchMatrix, yAxis, rotationAngle);
  scaleMatrix4(scratchMatrix, scratchMatrix, 900, 900, 900);
  appendMatrix4(scratchMatrix, scratchMatrix, orient);
  setNodeLocalMatrix4(templateMesh!, scratchMatrix);

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
