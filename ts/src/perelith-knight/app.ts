import type { GlRenderEffectPipeline, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  advanceAnimationPlayer,
  beginGlRenderEffectPipeline,
  configureDirectionalShadowCamera3DTightFit,
  createStandardPbrMaterial,
  createCamera3D,
  createFxaaEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DLights,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  drawGlScene3D,
  drawGlScene3DShadowMap,
  endGlRenderEffectPipeline,
  loadImageResourceFromUrl,
  bakeGlEnvironmentIbl,
  registerGlStandardPbrMaterial,
  registerGlRenderEffect,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  sampleAnimationTrack,
  setTextureUvScale,
  updateMeshMorph,
} from '@flighthq/sdk';

import {
  awayDirection,
  bindOrbitDrag,
  createCameraFromAway,
  createOrbitControllerFromAway,
} from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { loadKnights } from './knights';

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
registerGlStandardPbrMaterial(state);
registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);
let pipeline: GlRenderEffectPipeline | null = null;

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60, far: 5000 });

// Everything in this scene is now a StandardPbrMaterial, whose diffuse BRDF divides albedo by π, so the
// lights take the Phong→PBR ×π exposure. This has to move together with the materials: when the knights
// became PBR while this still read 'phong', they were lit ~π× too dim, their skins crushed toward black
// and lost saturation, and the whole army took on a dull grey cast. That looks like a material or
// reflection problem and is not one — no amount of metalness or environment tuning corrects an exposure
// mismatch. If any material here is ever converted back, this has to change with it.
//
// tuning lifts the linear-space result back toward AwayJS's gamma-space look, but it has to leave the
// floor below the ACES shoulder. The shadow map only attenuates the DIRECTIONAL term, so a floor whose
// ambient-only value already tone-maps to white cannot show a cast shadow at all — lit and shadowed
// both land on the flat part of the curve. Keeping the lit floor near 1.0 pre-tone-map (and ambient
// near a third of that) is what makes the knights' shadows read, and it costs nothing elsewhere: the
// key light carries the knights' lit sides instead of a heavy ambient fill washing everything out.
const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(-0.5, -1, -1),
  ambient: 0.4,
  shading: 'pbr',
  tuning: { diffuse: 1.7, ambient: 0.8 },
});
directional.castsShadow = true;
directional.pcfRadius = 2;
directional.shadowBias = 0.0025;
directional.normalBias = 1;
const lights = createScene3DLights({ ambient, directional });

// The checker is the brightest albedo in the scene and the knights' skins are among the darkest, so one
// global exposure cannot serve both: set it to read the armour and the floor clips flat, taking the cast
// shadows with it. Holding the floor's albedo just below white keeps its lit squares off the ceiling so
// the knights' shadows still have somewhere to darken into.
// PBR like the knights, so one light rig serves both. Mixing kinds is what broke this: the light was
// still declared shading:'phong' — no ×π exposure — after the knights became PBR materials that divide
// albedo by π, so they were lit roughly π× too dim and the skins crushed toward black, losing their
// colour. That reads as a dull grey sheen over everything, and no amount of metalness or environment
// tuning fixes it, because the problem is exposure rather than material. Specular black and shininess 1
// on the old Blinn material meant "matte", which is roughness 1 here.
const floorMaterial = createStandardPbrMaterial({
  baseColor: 0xf2f2f2ff,
  metallic: 0,
  roughness: 1,
});
floorMaterial.doubleSided = true;

const floorImage = await loadImageResourceFromUrl('floor_diffuse.jpg');
const floorTex = createTexture({ source: floorImage, sampler: createTilingSampler() });
setTextureUvScale(floorTex, 5, 5);
floorMaterial.baseColorMap = floorTex;

const floorGeometry = createPlaneMeshGeometry(5000, 5000, 1, 1);
const floor = createMesh(floorGeometry, [floorMaterial]);
addNodeChild(scene.root, floor);

const { animationBuckets, environment } = await loadKnights(scene);
bakeGlEnvironmentIbl(state, environment);

const orbit = createOrbitControllerFromAway(camera, {
  distance: 2000,
  panAngle: 45,
  tiltAngle: 20,
  minTiltAngle: 5,
  maxTiltAngle: 90,
});

bindOrbitDrag(canvas, orbit, { minDistance: 100, maxDistance: 2000 });

let keyUp = false;
let keyDown = false;
let keyLeft = false;
let keyRight = false;

document.addEventListener('keydown', (e: KeyboardEvent) => {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
    case 'KeyZ':
      keyUp = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keyDown = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
    case 'KeyQ':
      keyLeft = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keyRight = true;
      break;
  }
});

document.addEventListener('keyup', (e: KeyboardEvent) => {
  switch (e.code) {
    case 'ArrowUp':
    case 'KeyW':
    case 'KeyZ':
      keyUp = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      keyDown = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
    case 'KeyQ':
      keyLeft = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      keyRight = false;
      break;
  }
});

// Directional shadow: render scene depth from the light's point of view into the shadow map, which the
// classic (BlinnPhong) shading then PCF-samples so the knights cast onto the floor and each other. The
// orthographic light camera is sized to a static bound covering the 5000×5000 floor and the knight
// field above it; direction and bounds never change, so the camera is configured once. The tight-fit
// variant fits the eight bounds corners in light space rather than the rotation-stable bounding sphere,
// which is ~1.3× more shadow-map texel density here — worth it for silhouettes this small. The depth pass
// applies the same morph as the forward pass, so re-rendering each frame gives shadows that track the
// knights' animation (as AwayJS's shadow mapper does).
const shadowCamera = createCamera3D({
  near: 1,
  far: 1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
const sceneBounds = {
  min: { x: -2600, y: 0, z: -2600 },
  max: { x: 2600, y: 700, z: 2600 },
};
configureDirectionalShadowCamera3DTightFit(shadowCamera, directional.direction, sceneBounds);

let lastTime = 0;

function frame(now: number): void {
  const dt = lastTime === 0 ? 1 / 60 : Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  if (keyUp) orbit.target.x -= 10;
  if (keyDown) orbit.target.x += 10;
  if (keyLeft) orbit.target.z += 10;
  if (keyRight) orbit.target.z -= 10;

  for (const { driver: mesh, player, track } of animationBuckets) {
    if (player !== null && track !== null && mesh.morph != null) {
      advanceAnimationPlayer(player, dt * 0.5);
      sampleAnimationTrack(mesh.morph.weights, track, player.time);
      updateMeshMorph(mesh);
    }
  }

  orbit.update();
  drawGlScene3DShadowMap(state, scene.root, shadowCamera, directional);
  if (pipeline === null) {
    pipeline = createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil' });
  }
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  state.gl.depthMask(true);
  state.gl.clearDepth(1);
  state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
  drawGlScene3D(state, scene.root, camera, lights);
  // AwayJS applies no tone mapping at all, so the default ACES curve was the single largest source of
  // mismatch: its shoulder compressed the mid-tones, crushed the darks and desaturated the armour.
  // Reinhard with a high white point is near-linear across this scene's range — closest to AwayJS's
  // straight gamma-space output while still clamping the few specular pixels above 1.
  endGlRenderEffectPipeline(state, pipeline, [
    createToneMapEffect({ operator: 'reinhard', white: 8, exposure: 1.0 }),
    createFxaaEffect(),
  ]);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  state.gl.viewport(0, 0, canvas.width, canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

requestAnimationFrame(frame);
