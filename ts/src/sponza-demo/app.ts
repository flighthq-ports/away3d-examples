import type { ExtendedPbrMaterial, Node3D, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  cloneMesh,
  configureDirectionalShadowCamera3DTightFit,
  createAabb,
  createCamera3D,
  createEnvironment,
  createFxaaEffect,
  createOrthographicProjection,
  createScene3D,
  createScene3DFromAwd2,
  createScene3DLights,
  createScreenSpaceFogEffect,
  createToneMapEffect,
  getNodeChildren,
  getNode3DWorldBounds,
  getNodeWorldMatrix4,
  isMesh,
  loadImageResourceFromUrl,
  orientScene3DBillboardsToCamera,
  packOpaqueColor,
  drawGlScene3DShadowMap,
  setNodeLocalMatrix4,
} from '@flighthq/sdk';

import {
  awayDirection,
  createCameraFromAway,
  createFirstPersonControllerFromAway,
} from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { bindFirstPersonControls } from './controls';
import { createScene3DContext } from './renderer';
import type { SkyboxRenderState } from './skybox';
import { renderSkyboxScene } from './skybox';
import { createSponzaTorches } from './torches';
import {
  createTextureMap,
  loadSponzaTextures,
  materialNameToNormalFile,
  materialNameToSpecularFile,
  materialNameToTextureFile,
  walkAndAssignMaterials,
} from './materials';

// AwayJS used linear fog from 0–4,000 world units. Flight's post effect consumes the camera's
// nonlinear window depth, so this starts around 1,050 units and reaches the background near 4,000.
const fogEffect = createScreenSpaceFogEffect({
  // Applied in the HDR pipeline before tone mapping, so the original bright lavender reads nearly
  // white. A deep blue-grey keeps the atmosphere visible without bleaching the distant materials.
  color: packOpaqueColor(0x30384a),
  near: 0.985,
  far: 0.999,
  density: 1.8,
});
const effects = [fogEffect, createToneMapEffect(), createFxaaEffect()];

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: packOpaqueColor(0x9090e7),
  effects,
});

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60, far: 5000 });

const lightElevation = Math.PI / 18;
const lightAzimuth = Math.PI / 2;
const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(
    Math.sin(lightElevation) * Math.cos(lightAzimuth),
    -Math.cos(lightElevation),
    Math.sin(lightElevation) * Math.sin(lightAzimuth),
  ),
  color: 0xeedddd,
  // Declared to keep the AwayJS light description complete, but INERT in this scene: the baked
  // environment IBL below replaces the ambient term rather than summing with it. Raising this 4.7×
  // moves mean luma by 0.5 and near-black by 0.2 points — i.e. nothing. Tune `intensity` on the
  // environment instead; this is not the fill dial it looks like.
  ambient: 0.3,
  ambientColor: 0x808090,
});
directional.castsShadow = true;
directional.pcfRadius = 2;
directional.shadowBias = 0.0025;
directional.normalBias = 1;

const sponzaTextureFiles = [
  ...new Set([
    ...Object.values(materialNameToTextureFile),
    ...Object.values(materialNameToNormalFile),
    ...Object.values(materialNameToSpecularFile),
  ]),
];

const skyboxFaceFiles = [
  'hourglass_posX.jpg',
  'hourglass_negX.jpg',
  'hourglass_posY.jpg',
  'hourglass_negY.jpg',
  'hourglass_posZ.jpg',
  'hourglass_negZ.jpg',
];

const [awdBuffer, sponzaTextureImages, skyboxFaceImages, fireImage] = await Promise.all([
  fetch('sponza/sponza.awd').then((r) => r.arrayBuffer()),
  loadSponzaTextures(ctx.host, sponzaTextureFiles),
  Promise.all(skyboxFaceFiles.map((file) => loadImageResourceFromUrl(ctx.host, `skybox/${file}`))),
  loadImageResourceFromUrl(ctx.host, 'fire.png'),
]);

const textureMap = createTextureMap(sponzaTextureFiles, sponzaTextureImages);
const materialCache = new Map<string, ExtendedPbrMaterial>();

const awdScene = createScene3DFromAwd2(new Uint8Array(awdBuffer));

walkAndAssignMaterials(awdScene.root, materialCache, textureMap);

for (const child of getNodeChildren(awdScene.root)) {
  addNodeChild(scene.root, child);
}

// The shadow-map renderer intentionally visits every drawable node, including hidden ones. Build a
// flat, world-space clone containing only the visible architecture so discarded AWD pieces and the
// additive flame cards cannot cover the open courtyard in the sun pass.
const shadowScene = createScene3D();
function addVisibleShadowMeshes(source: Node3D, parentVisible = true): void {
  const visible = parentVisible && source.enabled && source.visible;
  if (!visible) return;

  if (isMesh(source)) {
    const shadowMesh = cloneMesh(source);
    setNodeLocalMatrix4(shadowMesh, getNodeWorldMatrix4(source));
    addNodeChild(shadowScene.root, shadowMesh);
  }

  for (const child of getNodeChildren(source)) addVisibleShadowMeshes(child as Node3D, visible);
}
addVisibleShadowMeshes(scene.root);

const shadowBounds = createAabb();
getNode3DWorldBounds(shadowBounds, shadowScene.root);
const shadowCamera = createCamera3D({
  near: 1,
  far: 3000,
  projection: createOrthographicProjection({ halfWidth: 1000, halfHeight: 1000 }),
});
configureDirectionalShadowCamera3DTightFit(shadowCamera, directional.direction, shadowBounds, 1.02);
drawGlScene3DShadowMap(ctx.state, shadowScene.root, shadowCamera, directional);

const torches = createSponzaTorches(scene.root, fireImage);
const lights = createScene3DLights({ ambient, directional, point: torches.lights });

const cubeTexture = createCubeTextureFromAwayFaces(ctx.host, skyboxFaceImages);
const environment = createEnvironment({
  environment: cubeTexture,
  // The original skybox was only a backdrop. This is the scene's entire fill: baking an IBL supersedes
  // the AmbientLight above rather than adding to it, so `ambient: 0.3` contributes nothing and this
  // number is the only dial that opens the arcades. At the previous 0.4 the shadow side crushed —
  // 16% of the frame sat at near-black — which is what read as harsh contrast rather than any
  // highlight clipping, of which there was none. Raised until the darks hold detail without
  // flattening the courtyard's sun/shadow split.
  intensity: 0.85,
});
bakeGlEnvironmentIbl(ctx.state, environment);
const skyboxRef: SkyboxRenderState = { pipeline: null };
const fps = createFirstPersonControllerFromAway(camera, {
  y: 150,
  yaw: 90,
  minPitch: -80,
  maxPitch: 80,
});

const step = bindFirstPersonControls(ctx.canvas, fps);

function frame(timeMs: number): void {
  step();
  torches.update(timeMs);
  orientScene3DBillboardsToCamera(scene.root, camera);
  renderSkyboxScene(ctx.state, ctx.canvas, skyboxRef, environment, scene.root, camera, lights, effects);
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
