import type { Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createExtendedPbrMaterial,
  createFxaaEffect,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createSpecularPbrExtension,
  createStandardPbrMaterial,
  createStandardPbrMaterialProperties,
  createTexture,
  createToneMapEffect,
  createWrappedDiffusePbrExtension,
  findNode,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  setQuaternionFromEuler,
  setVector3,
} from '@flighthq/sdk';
import { awayPosition, bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect({ exposure: 1.2 }), createFxaaEffect()] });
const scene = createScene3D();
const camera = createCameraFromAway({ far: 3000 });
// PointLight at x 15000, z 15000, colour 0xffddbb, ambient 1, with ambientColor 0x303040 on the
// material. The port had almost no ambient (0.08, untinted), which left the diffuse term so weak
// that the specular carried the image — and since the specular map has the stubble painted into
// it as black, the beard read as a shadow rather than as skin that simply is not shiny.
const point = createPointLightFromAway({ color: 0xffddbb, diffuse: 2, range: 40000, referenceDistance: 5000 });
const [lightX, lightY, lightZ] = awayPosition(15000, 0, 15000);
setVector3(point.position, lightX, lightY, lightZ);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x303040, intensity: 1 }),
  point: [point],
});
const orbit = createOrbitControllerFromAway(camera, { distance: 800, panAngle: 45, tiltAngle: 10, minTiltAngle: -30, maxTiltAngle: 80 });
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 300, maxDistance: 1400 });

const [obj, diffuse, normal] = await Promise.all([
  fetch('head.obj').then((r) => r.text()), loadImageResourceFromUrl(ctx.host, 'head_diffuse.jpg'),
  loadImageResourceFromUrl(ctx.host, 'head_normals.jpg'),
]);
const imported = createScene3DFromObj(obj);
const head = findNode(imported.root, isMesh) as Mesh | null;
if (!head) throw new Error('head.obj contains no mesh');
const diffuseTexture = createTexture({ source: diffuse });
const normalTexture = createTexture({ source: normal, colorSpace: 'linear' });
const basicMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: diffuseTexture,
  normalMap: normalTexture,
  metallic: 0.02,
  roughness: 0.25,
});
const skinMaterial = createExtendedPbrMaterial({
  standard: createStandardPbrMaterialProperties({
    baseColor: 0xffffffff,
    baseColorMap: diffuseTexture,
    normalMap: normalTexture,
    metallic: 0,
    roughness: 0.46,
  }),
  extensions: [
    // SubsurfaceScatteringDiffuseMethod(2048, 2), scatterColor 0xff7733, scattering 0.05,
    // translucency 4. Scattering is only 0.05 — a faint warmth under the skin, not a tint. At
    // 0.72 the whole head came out lurid orange.
    createWrappedDiffusePbrExtension({
      thickness: 2,
      wrappedDiffuseColor: 0xff7733ff,
      wrappedDiffuseStrength: 0.16,
    }),
    // FresnelSpecularMethod over the material's specularMap. The map is deliberately NOT bound
    // here: binding a texture to SpecularPbrExtension darkens the surface itself wherever the map
    // is dark — the stubble and eyebrows, which this map paints black, came out as hard black
    // patches rather than as skin that simply is not shiny. It is not an f0 effect (a uniform
    // black specularColor, f0 = 0 everywhere, shades correctly) and it happens even with
    // specular: 0, so the texture is reaching the surface outside the specular term. The stubble
    // still reads, because it is painted into the diffuse map too.
    createSpecularPbrExtension({
      specular: 1,
      specularColor: 0xffddccff,
    }),
  ],
});
let advancedMethod = true;
head.materials = [skinMaterial];
setVector3(head.scale, 100, 100, 100);
setVector3(head.position, 0, -50, 0);
setQuaternionFromEuler(head.rotation, 0, Math.PI, 0);
invalidateNodeLocalTransform(head);
addNodeChild(scene.root, head);

// This sample has no instructions overlay — the original adds only AwayStats, and never moves it,
// so the readout sits top left. Releasing any key still swaps the two shading paths, as it does
// in the original.
let triangleCount = 0;
if (head.geometry) {
  const geometry = head.geometry;
  const indexed = geometry.indices !== null
    ? geometry.indices.length
    : geometry.vertices.length / (geometry.layout.stride / 4);
  triangleCount = Math.floor(indexed / 3);
}
const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', left: '10px', top: '10px', zIndex: '2', color: '#ffffff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

window.addEventListener('keyup', () => {
  advancedMethod = !advancedMethod;
  head.materials = [advancedMethod ? skinMaterial : basicMaterial];
});

function frame(timestamp: number): void {
  orbit.update();
  framesThisSecond++;
  if (timestamp - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (timestamp - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = timestamp;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
