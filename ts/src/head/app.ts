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
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect({ exposure: 1.2 }), createFxaaEffect()] });
const scene = createScene3D();
const camera = createCameraFromAway({ far: 3000 });
const point = createPointLightFromAway({ color: 0xffddbb, diffuse: 2, range: 40000, referenceDistance: 5000 });
const lights = createScene3DLights({ ambient: createAmbientLight({ intensity: 0.08 }), point: [point] });
const orbit = createOrbitControllerFromAway(camera, { distance: 800, panAngle: 45, tiltAngle: 10, minTiltAngle: -30, maxTiltAngle: 80 });
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 300, maxDistance: 1400 });

const [obj, diffuse, normal, specular] = await Promise.all([
  fetch('head.obj').then((r) => r.text()), loadImageResourceFromUrl(ctx.host, 'head_diffuse.jpg'),
  loadImageResourceFromUrl(ctx.host, 'head_normals.jpg'), loadImageResourceFromUrl(ctx.host, 'head_specular.jpg'),
]);
const imported = createScene3DFromObj(obj);
const head = findNode(imported.root, isMesh) as Mesh | null;
if (!head) throw new Error('head.obj contains no mesh');
const diffuseTexture = createTexture({ source: diffuse });
const normalTexture = createTexture({ source: normal, colorSpace: 'linear' });
const specularTexture = createTexture({ source: specular, colorSpace: 'linear' });
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
    createWrappedDiffusePbrExtension({
      thickness: 2,
      wrappedDiffuseColor: 0xff7733ff,
      wrappedDiffuseStrength: 0.72,
    }),
    createSpecularPbrExtension({
      specular: 1,
      specularColor: 0xffddccff,
      specularMap: specularTexture,
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

const help = document.createElement('div');
function updateHelp(): void {
  help.textContent = advancedMethod
    ? 'Skin: wrapped subsurface diffuse + Fresnel PBR specular · release any key to compare'
    : 'Skin: basic diffuse + specular · release any key to compare';
}
updateHelp();
Object.assign(help.style, {
  position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui',
  textShadow: '0 1px 4px #000', pointerEvents: 'none',
});
document.body.appendChild(help);
window.addEventListener('keyup', () => {
  advancedMethod = !advancedMethod;
  head.materials = [advancedMethod ? skinMaterial : basicMaterial];
  updateHelp();
});

function frame(timestamp: number): void {
  orbit.update();
  setVector3(point.position, Math.sin(timestamp / 10000) * 15000, 1000, -Math.cos(timestamp / 10000) * 15000);
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
