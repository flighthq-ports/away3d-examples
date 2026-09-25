import { webHostBitmapReadback, webHostImage } from '@flighthq/host-web';
import type { ExtendedPbrMaterial, Node3D } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  cloneMesh,
  configureDirectionalShadowCamera3DTightFit,
  createAabb,
  createCamera3D,
  createEnvironment,
  createOrthographicProjection,
  createScene3D,
  createScene3DFromAwd2,
  createScene3DLights,
  getNode3DWorldBounds,
  getNodeChildren,
  getNodeWorldMatrix4,
  isMesh,
  loadImageResourceFromUrl,
  orientScene3DBillboardsToCamera,
  sdkHostDecompressDeflate,
  setNodeLocalMatrix4,
} from '@flighthq/sdk';

import {
  awayDirection,
  createCameraFromAway,
  createFirstPersonControllerFromAway,
} from '../../shared/camera';
// The block handlers for this file, generated at build time by
// @flighthq/vite-plugin-manifest: it walks the same block headers the importer will, so the
// list cannot drift from the asset.
import { parserOptions } from '../../../assets/sponza/sponza.awd?manifest';

import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { bindFirstPersonControls } from './controls';
import { setupRenderer } from './render.gl';
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

const renderer = setupRenderer();

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
  loadSponzaTextures(webHostImage, sponzaTextureFiles),
  Promise.all(skyboxFaceFiles.map((file) => loadImageResourceFromUrl(webHostImage, `skybox/${file}`))),
  loadImageResourceFromUrl(webHostImage, 'fire.png'),
]);

const textureMap = createTextureMap(sponzaTextureFiles, sponzaTextureImages);
const materialCache = new Map<string, ExtendedPbrMaterial>();

const awdScene = createScene3DFromAwd2(new Uint8Array(awdBuffer), {
  ...parserOptions,
  deflate: sdkHostDecompressDeflate,
});

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
renderer.renderShadowMap(shadowScene.root, shadowCamera, directional);

const torches = createSponzaTorches(scene.root, fireImage);
const lights = createScene3DLights({ ambient, directional, point: torches.lights });

const cubeTexture = createCubeTextureFromAwayFaces(webHostBitmapReadback, skyboxFaceImages);
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
bakeGlEnvironmentIbl(renderer.state, environment);
const fps = createFirstPersonControllerFromAway(camera, {
  y: 150,
  yaw: 90,
  minPitch: -80,
  maxPitch: 80,
});

const step = bindFirstPersonControls(renderer.canvas, fps);

function frame(timeMs: number): void {
  step();
  torches.update(timeMs);
  orientScene3DBillboardsToCamera(scene.root, camera);
  renderer.render(scene.root, camera, lights, environment);
  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
