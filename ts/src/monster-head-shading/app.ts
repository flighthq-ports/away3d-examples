import type { GlRenderEffectPipeline, PerspectiveProjection, Node3D } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  configureDirectionalShadowCamera3D,
  createAabb,
  createCamera3D,
  createFxaaEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createOrthographicProjection,
  createScene3D,
  createScene3DFromAwd2,
  createScene3DLights,
  createShadedMaterial,
  createTexture,
  createToneMapEffect,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  drawGlScene3D,
  drawGlScene3DShadowMap,
  endGlRenderEffectPipeline,
  getNodeChildren,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  registerGlRenderEffect,
  registerGlShadedMaterial,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  setVector3,
} from '@flighthq/sdk';

import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway, createPointLightFromAway } from '../../shared/lighting';

const pixelRatio = window.devicePixelRatio || 1;

const mount = document.getElementById('app');
const canvas = createGlCanvasElement(window.innerWidth, window.innerHeight, pixelRatio);
if (mount) {
  mount.replaceWith(canvas);
} else {
  document.body.appendChild(canvas);
}
document.body.style.margin = '0';

const state = createGlRenderState(canvas, {
  backgroundColor: 0x000000ff,
  contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  pixelRatio,
});

// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(state);
registerGlShadedMaterial(state);
registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);
let pipeline: GlRenderEffectPipeline | null = null;

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60, far: 1000 });

const lightDirection = (120 * Math.PI) / 180;
const lightElevation = (30 * Math.PI) / 180;

const lightDir = {
  x: Math.sin(lightElevation) * Math.cos(lightDirection),
  y: -Math.cos(lightElevation),
  z: -Math.sin(lightElevation) * Math.sin(lightDirection),
};

const { directional, ambient } = createDirectionalLightFromAway({
  direction: lightDir,
  color: 0xffeedd,
  ambient: 1,
  ambientColor: 0x101025,
  shading: 'phong',
});

directional.castsShadow = true;
directional.pcfRadius = 2;
directional.shadowBias = 0.0025;
directional.normalBias = 1;

const shadowCamera = createCamera3D({
  near: 1,
  far: 2000,
  projection: createOrthographicProjection({ halfWidth: 300, halfHeight: 300 }),
});
const shadowBounds = createAabb(-200, -200, -200, 200, 200, 200);

const blueLight = createPointLightFromAway({
  color: 0x4080ff,
  range: 100000,
  shading: 'phong',
  referenceDistance: 3000,
});
blueLight.position.x = 3000;
blueLight.position.z = -700;
blueLight.position.y = 20;

const redLight = createPointLightFromAway({
  color: 0x802010,
  range: 100000,
  shading: 'phong',
  referenceDistance: 2200,
});
redLight.position.x = -2000;
redLight.position.z = -800;
redLight.position.y = -400;

const lights = createScene3DLights({
  ambient,
  directional,
  point: [blueLight, redLight],
});

// AwayJS uses SpecularFresnelMethod (fresnelPower=3, strength=3, gloss=10) which
// suppresses specular at direct incidence and amplifies at glancing angles. Flight has
// no Fresnel modifier, so specular is set low as a visual compromise to avoid the white
// sheen on camera-facing surfaces (especially the eyes). Shininess 10 maps directly from
// AwayJS's Blinn-based gloss=10. The diffuse tint compensates for AwayJS's style.color
// (0x303040) which darkens/tints the ambient contribution.
// `specular` is a packed 0xRRGGBBAA colour, not a 0..1 scalar — the renderer runs it through
// unpackColorToLinear. A fractional value bit-shifts to zero in every channel, which silently
// disabled specular entirely; 0x262626ff is the intended ~15% grey.
const headMaterial = createShadedMaterial({
  diffuse: 0x606878ff,
  shininess: 10,
  specular: 0x262626ff,
});

async function tryLoadImage(url: string): Promise<Awaited<ReturnType<typeof loadImageResourceFromUrl>> | null> {
  try {
    return await loadImageResourceFromUrl(url);
  } catch {
    return null;
  }
}

const [diffuseImage, specularImage, normalImage, awdBuffer] = await Promise.all([
  tryLoadImage('monsterhead/monsterhead_diffuse.jpg'),
  tryLoadImage('monsterhead/monsterhead_specular.jpg'),
  tryLoadImage('monsterhead/monsterhead_normals.jpg'),
  fetch('monsterhead/MonsterHead.awd').then((r) => r.arrayBuffer()),
]);

if (diffuseImage) headMaterial.diffuseMap = createTexture({ source: diffuseImage });
if (specularImage)
  headMaterial.specularMap = createTexture({
    source: specularImage,
    colorSpace: 'linear',
  });
if (normalImage) headMaterial.normalMap = createTexture({ source: normalImage, colorSpace: 'linear' });

const awdScene = createScene3DFromAwd2(new Uint8Array(awdBuffer));

function assignMaterialToMeshes(node: Node3D): void {
  if (isMesh(node)) {
    if (node.materials.length === 0) node.materials.push(headMaterial);
    for (let i = 0; i < node.materials.length; i++) {
      node.materials[i] = headMaterial;
    }
  }
  for (const child of getNodeChildren(node)) {
    assignMaterialToMeshes(child);
  }
}

assignMaterialToMeshes(awdScene.root);

for (const child of getNodeChildren(awdScene.root)) {
  child.position.y = -20;
  setVector3(child.scale, 4, 4, 4);
  invalidateNodeLocalTransform(child);
  addNodeChild(scene.root, child);
}

const orbit = createOrbitControllerFromAway(camera, {
  distance: 800,
  panAngle: 225,
  tiltAngle: 10,
  minTiltAngle: -90,
  maxTiltAngle: 90,
});

bindOrbitDrag(canvas, orbit);

function frame(): void {
  orbit.update();
  if (pipeline === null) {
    pipeline = createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil' });
  }

  configureDirectionalShadowCamera3D(shadowCamera, lightDir, shadowBounds);
  drawGlScene3DShadowMap(state, scene.root, shadowCamera, directional);

  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  state.gl.depthMask(true);
  state.gl.clearDepth(1);
  state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
  drawGlScene3D(state, scene.root, camera, lights);
  // A modest lift keeps the textured mid-tones readable without flattening the black backdrop or
  // the source's deep Fresnel/shadow contrast.
  endGlRenderEffectPipeline(state, pipeline, [createToneMapEffect({ exposure: 1.55 }), createFxaaEffect()]);
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

requestAnimationFrame(frame);
