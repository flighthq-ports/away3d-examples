import type {
  PerspectiveProjection,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  copyQuaternion,
  createAmbientLight,
  createBoxMeshGeometry,
  createDirectionalLight,
  createEmissiveMaterial,
  createEnvironment,
  createFxaaEffect,
  createGlCanvasElement,
  createGlRenderState,
  createMesh,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createStandardPbrMaterial,
  createToneMapEffect,
  createTorusMeshGeometry,
  createVector3,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  DEG_TO_RAD,
  invalidateNodeLocalTransform,
  loadImageResourceFromUrl,
  multiplyQuaternion,
  registerGlEmissiveMaterial,
  registerGlRenderEffect,
  registerStandardGlTextureResolvers,
  registerGlStandardPbrMaterial,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

import { awayDirection, createCameraFromAway, setAwayPosition } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import type { SkyboxRenderState } from './skybox';
import { renderSkyboxScene } from './skybox';
const width = window.innerWidth;
const height = window.innerHeight;
const pixelRatio = window.devicePixelRatio || 1;

const mount = document.getElementById('app');
const canvas = createGlCanvasElement(width, height, pixelRatio);

if (mount) {
  mount.replaceWith(canvas);
} else {
  document.body.appendChild(canvas);
}

document.body.style.margin = '0';

const state = createGlRenderState(canvas, {
  backgroundColor: 0xffff00ff,
  contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  pixelRatio,
});

// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(state);
registerGlStandardPbrMaterial(state);
registerGlEmissiveMaterial(state);
registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);
const scene = createScene3D();

const torusMaterial = createStandardPbrMaterial({
  baseColor: 0xccccccff,
  metallic: 1,
  roughness: 0,
});

const geometry = createTorusMeshGeometry(150, 60, 40, 20);
const torus = createMesh(geometry, [torusMaterial]);
addNodeChild(scene.root, torus);

// AwayJS torus.boundsVisible = true draws the torus's bounding box outline, rotating with the torus.
// Flight's GL wireframe draws every triangle edge (diagonals) and ignores thickness, so build a clean,
// bold outline from thin emissive beams along the 12 box edges. Half-extents: radius+tube in X/Y, tube
// in Z. Beams overlap by their thickness at the corners so the edges meet cleanly. Parented to the torus
// so the outline inherits the spin.
const boundsMaterial = createEmissiveMaterial({ emissive: 0xffffffff });
const halfXY = 150 + 60;
const halfZ = 60;
const beam = 4;

function addBoundsBeam(w: number, h: number, d: number, x: number, y: number, z: number): void {
  const edge = createMesh(createBoxMeshGeometry(w, h, d), [boundsMaterial]);
  setVector3(edge.position, x, y, z);
  invalidateNodeLocalTransform(edge);
  addNodeChild(torus, edge);
}

for (const sy of [-halfXY, halfXY]) {
  for (const sz of [-halfZ, halfZ]) {
    addBoundsBeam(2 * halfXY + beam, beam, beam, 0, sy, sz);
  }
}
for (const sx of [-halfXY, halfXY]) {
  for (const sz of [-halfZ, halfZ]) {
    addBoundsBeam(beam, 2 * halfXY + beam, beam, sx, 0, sz);
  }
}
for (const sx of [-halfXY, halfXY]) {
  for (const sy of [-halfXY, halfXY]) {
    addBoundsBeam(beam, beam, 2 * halfZ + beam, sx, sy, 0);
  }
}

const camera = createCameraFromAway({ fov: 90 });

const directional = createDirectionalLight({
  direction: awayDirection(0, -1, -1),
  color: 0xffffffff,
  intensity: 5,
});

const ambient = createAmbientLight({ color: 0xffffffff, intensity: 1.5 });
const lights: Scene3DLights = createScene3DLights({ ambient, directional });

const faceUrls = [
  'skybox/snow_positive_x.jpg',
  'skybox/snow_negative_x.jpg',
  'skybox/snow_positive_y.jpg',
  'skybox/snow_negative_y.jpg',
  'skybox/snow_positive_z.jpg',
  'skybox/snow_negative_z.jpg',
];

const faceImages = await Promise.all(faceUrls.map((url) => loadImageResourceFromUrl(url)));
const cubeTexture = createCubeTextureFromAwayFaces(faceImages);

const environment = createEnvironment({ environment: cubeTexture, intensity: 1 });
bakeGlEnvironmentIbl(state, environment);

const skyboxRef: SkyboxRenderState = { pipeline: null };

let mouseX = width / 2;
let cameraRotationY = 0;

const eye = createVector3(0, 0, 600);
const target = createVector3(0, 0, 0);
const up = createVector3(0, 1, 0);

const xAxis = createVector3(1, 0, 0);
const yAxis = createVector3(0, 1, 0);
const scratchQuatA = createQuaternion();
const scratchQuatB = createQuaternion();

document.addEventListener('mousemove', (event: MouseEvent) => {
  mouseX = event.clientX;
});

let torusRotX = 0;
let torusRotY = 0;

function frame(): void {
  torusRotX -= 2 * DEG_TO_RAD;
  torusRotY -= 1 * DEG_TO_RAD;

  setQuaternionFromAxisAngle(scratchQuatA, xAxis, torusRotX);
  setQuaternionFromAxisAngle(scratchQuatB, yAxis, torusRotY);
  multiplyQuaternion(scratchQuatA, scratchQuatA, scratchQuatB);
  copyQuaternion(torus.rotation, scratchQuatA);
  invalidateNodeLocalTransform(torus);

  cameraRotationY += (0.5 * (mouseX - window.innerWidth / 2)) / 800;
  const rotRad = cameraRotationY * DEG_TO_RAD;

  setAwayPosition(eye, -600 * Math.sin(rotRad), 0, -600 * Math.cos(rotRad));

  setCamera3DViewMatrix4FromLookAt(camera, eye, target, up);

  renderSkyboxScene(state, canvas, skyboxRef, environment, scene.root, camera, lights, [
    createToneMapEffect(),
    createFxaaEffect(),
  ]);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pr = window.devicePixelRatio || 1;
  canvas.width = w * pr;
  canvas.height = h * pr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  state.gl.viewport(0, 0, canvas.width, canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

frame();
