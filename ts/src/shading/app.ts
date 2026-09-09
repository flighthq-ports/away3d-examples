import type {
  PerspectiveProjection,
} from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  configureDirectionalShadowCamera3D,
  copyQuaternion,
  createAabb,
  createBitmap,
  createBoxMeshGeometry,
  createCamera3D,
  createCubeTexture,
  createEnvironment,
  createFxaaEffect,
  createHemisphereLight,
  createImageResourceFromBitmap,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createQuaternion,
  createScene3D,
  createScene3DLights,
  createSphereMeshGeometry,
  createTilingSampler,
  createToneMapEffect,
  createTorusMeshGeometry,
  createVector3,
  drawGlScene3DShadowMap,
  invalidateNodeLocalTransform,
  scaleMeshGeometryUvs,
  setCubeTextureFace,
  setDirectionalLightDirection,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

import {
  awayDirection,
  awayPosition,
  bindOrbitDrag,
  createCameraFromAway,
  createOrbitControllerFromAway,
} from '../../shared/camera';
import {
  awayIntensity,
  createDirectionalLightFromAway,
  createPointLightFromAway,
} from '../../shared/lighting';
import { createSceneMaterials, loadSceneTextures } from './materials';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x000000ff,
  effects: [createToneMapEffect({ exposure: 0.7 }), createFxaaEffect()],
});

// Keep the original black void as the visible backdrop, but give the remastered PBR materials a dim
// studio to reflect. Broad cool light above, a faint warm bounce below, and dark horizon cards make
// metal and vinyl read naturally without lifting the scene's established black point.
const studioEnvironmentCube = createCubeTexture();
const studioEnvironmentFaces = [0x07131aff, 0x07131aff, 0x31576aff, 0x1c100aff, 0x0b1820ff, 0x0b1820ff];
for (let i = 0; i < studioEnvironmentFaces.length; i++) {
  setCubeTextureFace(
    studioEnvironmentCube,
    i,
    createImageResourceFromBitmap(createBitmap(8, 8, studioEnvironmentFaces[i])),
  );
}
const studioEnvironment = createEnvironment({ environment: studioEnvironmentCube, intensity: 0.35 });
bakeGlEnvironmentIbl(ctx.state, studioEnvironment);

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60 });

// Repeating textures are viewed at grazing angles (the ground plane, the ring's tube), so retain
// high anisotropy on Flight's mipmapped tiling sampler to keep the detail smooth.
const tilingSampler = createTilingSampler();
tilingSampler.anisotropy = 16;

// AwayJS lights the scene with two directionals: a white primary (diffuse 0.7, ambient 0.1) whose
// direction sweeps the horizon each frame, and a static cyan secondary (0x00ffff, diffuse 0.7,
// ambient 0.1) pointing straight down. Flight's Scene3DLights carries one directional, so the animated
// white primary stays the directional — it's the moving light, grazing the surfaces so the shading
// and the specular highlights on the metal sweep as it turns (this is what keeps the scene lively).
// Approximate the downward cyan secondary with a distant overhead point plus a faint hemisphere skirt.
// A hemisphere alone has no punctual specular lobe, which left the vinyl and trinket looking flat; the
// point restores the original shaped cyan highlight while remaining nearly parallel across this scene.
const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(0, -1, 0),
  diffuse: 0.7,
  ambient: 0.1,
  // The broad cyan fill below otherwise dominates the energy-correct PBR response and makes the
  // scene look uniformly self-lit. Let the moving white key do more of the shaping so its highlights
  // travel across the ball, trinket, and ring as clearly as they do in AwayJS.
  tuning: { diffuse: 1.12 },
});
directional.castsShadow = true;
directional.pcfRadius = 2;
directional.shadowBias = 0.0025;
directional.normalBias = 1;

const shadowCamera = createCamera3D({
  near: 1,
  far: 1,
  projection: createOrthographicProjection({ halfWidth: 1, halfHeight: 1 }),
});
const shadowBounds = createAabb(-900, -20, -900, 900, 380, 900);
const cyanFill = createHemisphereLight({
  skyColor: 0x00ffffff,
  groundColor: 0x000000ff,
  intensity: awayIntensity(0.2),
});
const cyanKey = createPointLightFromAway({
  color: 0x00ffff,
  diffuse: 0.38,
  range: 4000,
  referenceDistance: 1800,
});
setVector3(cyanKey.position, ...awayPosition(300, 1800, 300));
const lights = createScene3DLights({ ambient, directional, hemisphere: [cyanFill], point: [cyanKey] });

const { planeMaterial, sphereMaterial, cubeMaterial, torusMaterial } = createSceneMaterials();

const planeGeometry = createPlaneMeshGeometry(1000, 1000, 1, 1);
const plane = createMesh(planeGeometry, [planeMaterial]);
plane.position.y = -20;
invalidateNodeLocalTransform(plane);
addNodeChild(scene.root, plane);

const sphereGeometry = createSphereMeshGeometry(150, 40, 20);
const sphere = createMesh(sphereGeometry, [sphereMaterial]);
setVector3(sphere.position, ...awayPosition(300, 160, 300));
const sphereRotation = createQuaternion();
setQuaternionFromAxisAngle(sphereRotation, createVector3(0, 1, 0), Math.PI);
copyQuaternion(sphere.rotation, sphereRotation);
invalidateNodeLocalTransform(sphere);
addNodeChild(scene.root, sphere);

const cubeGeometry = createBoxMeshGeometry(200, 200, 200);
const cube = createMesh(cubeGeometry, [cubeMaterial]);
setVector3(cube.position, ...awayPosition(300, 160, -250));
invalidateNodeLocalTransform(cube);
addNodeChild(scene.root, cube);

const torusGeometry = createTorusMeshGeometry(150, 60, 40, 20);
// Match AwayJS's scaleUV(10, 5) weave density. Baking the tiling into the vertex UVs (rather than a
// KHR_texture_transform uvScale on the texture) keeps the mip LOD derivative-correct, so the fine
// weave stays crisp instead of aliasing into speckle on the ring's minified far side.
scaleMeshGeometryUvs(torusGeometry, 10, 5);
const torus = createMesh(torusGeometry, [torusMaterial]);
setVector3(torus.position, ...awayPosition(-250, 160, -250));
const torusRotation = createQuaternion();
setQuaternionFromAxisAngle(torusRotation, createVector3(1, 0, 0), Math.PI / 2);
copyQuaternion(torus.rotation, torusRotation);
invalidateNodeLocalTransform(torus);
addNodeChild(scene.root, torus);

await loadSceneTextures({ planeMaterial, sphereMaterial, cubeMaterial, torusMaterial }, tilingSampler);

const orbit = createOrbitControllerFromAway(camera, {
  distance: 1000,
  panAngle: 45,
  tiltAngle: 20,
  minTiltAngle: 0,
  maxTiltAngle: 90,
});

bindOrbitDrag(ctx.canvas, orbit, { minDistance: 100, maxDistance: 2000 });

function frame(ts: number): void {
  // AwayJS sweeps the white light around the horizon (nearly horizontal, a slight downward tilt) so
  // the shading and the metal highlights rotate around the objects. Keep it grazing, not overhead —
  // that grazing angle is what lights the metal frame/ring and the floor's normal relief.
  const lightX = Math.sin(ts / 10000);
  const lightZ = -Math.cos(ts / 10000);
  // Retain the original grazing sweep while giving it just enough elevation to produce legible,
  // slow-moving shadows across the enlarged studio floor.
  setDirectionalLightDirection(directional, lightX, -0.22, lightZ);

  orbit.update();
  configureDirectionalShadowCamera3D(shadowCamera, directional.direction, shadowBounds);
  drawGlScene3DShadowMap(ctx.state, scene.root, shadowCamera, directional);
  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  ctx.canvas.width = w * pixelRatio;
  ctx.canvas.height = h * pixelRatio;
  ctx.canvas.style.width = `${w}px`;
  ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

requestAnimationFrame(frame);
