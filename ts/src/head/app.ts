import type { Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createFxaaEffect,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createToneMapEffect,
  findNode,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  setVector3,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect({ exposure: 1.2 }), createFxaaEffect()] });
const scene = createScene3D();
const camera = createCameraFromAway({ far: 3000 });
const point = createPointLightFromAway({ range: 3000, referenceDistance: 500 });
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
head.materials = [createStandardPbrMaterial({
  baseColor: 0xffffffff, baseColorMap: createTexture({ source: diffuse }), normalMap: createTexture({ source: normal }),
  metallicRoughnessMap: createTexture({ source: specular, colorSpace: 'linear' }), metallic: 0.08, roughness: 0.34,
})];
setVector3(head.scale, 100, 100, 100); invalidateNodeLocalTransform(head); addNodeChild(scene.root, head);

function frame(): void {
  orbit.update(); setVector3(point.position, orbit.eye.x, orbit.eye.y, orbit.eye.z);
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
