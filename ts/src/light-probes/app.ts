import type { ImageResource, LightProbe, Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  LIGHT_PROBE_SH_FLOATS,
  addNodeChild,
  captureBitmapFromImageResource,
  createAabb,
  createAmbientLight,
  createFxaaEffect,
  createHemisphereLight,
  createLightProbe,
  createLightProbeGrid,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createToneMapEffect,
  createVector3,
  evaluateLightProbeSh,
  findNode,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  packLinearToColor,
  sampleLightProbeGrid,
  setLightProbeShFromColors,
  setVector3,
} from '@flighthq/sdk';

import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const assetRoot = 'away3d/LightProbes/';
const faceNames = ['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'] as const;
// Away3D's +Z points into the screen. The two Z directions therefore swap meaning in Flight's
// right-handed world; face orientation does not affect the mean radiance projected here.
const faceDirections = new Float32Array([
  1, 0, 0,
  -1, 0, 0,
  0, 1, 0,
  0, -1, 0,
  0, 0, -1,
  0, 0, 1,
]);

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x151515ff,
  effects: [createToneMapEffect({ exposure: 1.15 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 2000 });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 950,
  panAngle: 180,
  tiltAngle: 12,
  targetY: 180,
});
bindOrbitDrag(ctx.canvas, orbit);

function srgbToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function averageLinearRgb(image: ImageResource): [number, number, number] {
  const bitmap = captureBitmapFromImageResource(ctx.host, image);
  if (!bitmap) throw new Error('The web host cannot read a light-probe cube face.');
  const data = bitmap.data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  // These maps are already low-frequency diffuse captures. Sampling every fourth texel keeps startup
  // light while preserving their directional room colour.
  for (let i = 0; i < data.length; i += 16) {
    red += srgbToLinear(data[i]!);
    green += srgbToLinear(data[i + 1]!);
    blue += srgbToLinear(data[i + 2]!);
    samples++;
  }
  return [red / samples, green / samples, blue / samples];
}

async function loadProbe(folder: string, x: number, z: number): Promise<LightProbe> {
  const images = await Promise.all(
    faceNames.map((face) => loadImageResourceFromUrl(ctx.host, `${assetRoot}cornellEnvMap/${folder}/${face}.jpg`)),
  );
  const colors = new Float32Array(18);
  for (let face = 0; face < images.length; face++) {
    colors.set(averageLinearRgb(images[face]!), face * 3);
  }
  const probe = createLightProbe(createVector3(x, 180, z));
  setLightProbeShFromColors(probe, colors, faceDirections);
  return probe;
}

// X-fastest, then Z, matching createLightProbeGrid's lattice order.
const probeGrid = createLightProbeGrid(
  await Promise.all([
    loadProbe('negXnegZ', -240, -240),
    loadProbe('posXnegZ', 240, -240),
    loadProbe('negXposZ', -240, 240),
    loadProbe('posXposZ', 240, 240),
  ]),
  createAabb(-240, 0, -240, 240, 400, 240),
  createVector3(2, 1, 2),
);

const keyLight = createPointLightFromAway({
  color: 0xffffff,
  diffuse: 1,
  range: 950,
  referenceDistance: 300,
  shading: 'pbr',
});
setVector3(keyLight.position, 0, 420, 0);
const probeLight = createHemisphereLight({
  skyColor: 0xffffffff,
  groundColor: 0x303030ff,
  intensity: 1.35,
});
const lights = createScene3DLights({
  ambient: createAmbientLight({ intensity: 0.03 }),
  hemisphere: [probeLight],
  point: [keyLight],
});

const [roomObj, headObj, roomImage, diffuse, normal, ao] = await Promise.all([
  fetch(`${assetRoot}cornell.obj`).then((response) => response.text()),
  fetch(`${assetRoot}head.obj`).then((response) => response.text()),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}cornell_baked.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}head_diffuse.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}head_normals.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}head_AO.jpg`),
]);
const roomScene = createScene3DFromObj(roomObj);
const room = findNode(roomScene.root, isMesh) as Mesh | null;
if (room) {
  room.materials = [createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: createTexture({ source: roomImage }),
    metallic: 0,
    roughness: 0.92,
  })];
  setVector3(room.scale, 380, 380, 380);
  invalidateNodeLocalTransform(room);
  addNodeChild(scene.root, room);
}

const headScene = createScene3DFromObj(headObj);
const loadedHead = findNode(headScene.root, isMesh) as Mesh | null;
if (!loadedHead) throw new Error('head.obj contains no mesh.');
const head: Mesh = loadedHead;
head.materials = [createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: createTexture({ source: diffuse }),
  normalMap: createTexture({ source: normal, colorSpace: 'linear' }),
  occlusionMap: createTexture({ source: ao, colorSpace: 'linear' }),
  metallic: 0.05,
  roughness: 0.3,
})];
setVector3(head.scale, 85, 85, 85);
invalidateNodeLocalTransform(head);
addNodeChild(scene.root, head);

const sampledSh = new Float32Array(LIGHT_PROBE_SH_FLOATS);
const sky = new Float32Array(3);
const ground = new Float32Array(3);
const up = createVector3(0, 1, 0);
const down = createVector3(0, -1, 0);
function packProbeColor(rgb: Float32Array): number {
  return packLinearToColor([
    Math.max(0, Math.min(1, rgb[0]!)),
    Math.max(0, Math.min(1, rgb[1]!)),
    Math.max(0, Math.min(1, rgb[2]!)),
    1,
  ]);
}

const note = document.createElement('div');
note.textContent = 'Drag to orbit · real 2×1×2 spherical-harmonic probe grid';
Object.assign(note.style, {
  position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui',
  textShadow: '0 1px 4px #000', pointerEvents: 'none',
});
document.body.appendChild(note);

function frame(time: number): void {
  const phase = time / 1700;
  setVector3(head.position, Math.sin(phase) * 240, 170 + Math.sin(phase * 1.7) * 35, Math.cos(phase * 0.73) * 240);
  invalidateNodeLocalTransform(head);
  if (sampleLightProbeGrid(sampledSh, head.position, probeGrid)) {
    evaluateLightProbeSh(sky, up, sampledSh);
    evaluateLightProbeSh(ground, down, sampledSh);
    probeLight.skyColor = packProbeColor(sky);
    probeLight.groundColor = packProbeColor(ground);
  }
  orbit.update();
  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio;
  ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`;
  ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});

requestAnimationFrame(frame);
