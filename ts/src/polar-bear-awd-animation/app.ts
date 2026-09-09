import type { Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createBuiltInScene3DResourceResolver,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DDocumentFromAwd2Url,
  loadScene3DResources,
  prepareMeshSkinning,
  registerDeflateDecompressor,
  registerWebImageDecoders,
  scaleMeshGeometryUvs,
  updateMeshSkin,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createAnimationController } from './animation';
import { createScene3DContext } from './renderer';

registerDeflateDecompressor(); registerWebImageDecoders();
const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, backgroundColor: 0x9ac3d8ff, effects: [createToneMapEffect({ exposure: 1.05 }), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ y: 500, far: 5000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 1050, panAngle: 180, tiltAngle: 12, targetY: 180 }); bindOrbitDrag(ctx.canvas, orbit);
const { directional, ambient } = createDirectionalLightFromAway({ direction: { x: -1, y: -1, z: -0.4 }, diffuse: 1.4, ambient: 0.35, ambientColor: 0xbad9ef });
const lights = createScene3DLights({ ambient, directional });
const [diffuse, normal, snow] = await Promise.all([
  loadImageResourceFromUrl(ctx.host, 'away3d/PolarBearAWDAnimation/polarbear_diffuse.jpg'),
  loadImageResourceFromUrl(ctx.host, 'away3d/PolarBearAWDAnimation/polarbear_normals.jpg'),
  loadImageResourceFromUrl(ctx.host, 'away3d/PolarBearAWDAnimation/snow_diffuse.png'),
]);
const document3d = await loadScene3DDocumentFromAwd2Url(ctx.host, 'away3d/PolarBearAWDAnimation/PolarBear.awd');
if (!document3d) throw new Error('Could not load PolarBear.awd');
const model = createScene3DFromDocument(document3d); await loadScene3DResources(model, createBuiltInScene3DResourceResolver(ctx.host));
const bearMaterial = createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: diffuse }), normalMap: createTexture({ source: normal }), metallic: 0, roughness: 0.78 });
const skinned: Mesh[] = [];
walkNodeDescendants(model.root, (node) => { if (isMesh(node)) { node.materials = [bearMaterial]; if (node.skin) { prepareMeshSkinning(node); skinned.push(node); } } return true; });
addNodeChild(scene.root, model.root);
const sampler = createTilingSampler(); const groundGeometry = createPlaneMeshGeometry(50000, 50000); scaleMeshGeometryUvs(groundGeometry, 50, 50);
const ground = createMesh(groundGeometry, [createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: snow, sampler }), metallic: 0, roughness: 0.92 })]); addNodeChild(scene.root, ground);
const animation = createAnimationController(model.animations, 'Breathe', ['Breathe', 'Walk', 'Run']);
const help = document.createElement('div'); help.textContent = 'Drag to orbit · 1 breathe · 2 walk · 3 run';
Object.assign(help.style, { position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui', textShadow: '0 1px 4px #234' }); document.body.appendChild(help);
let last = 0;
function frame(ts: number): void { const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0; last = ts; animation.step(dt); for (const mesh of skinned) updateMeshSkin(mesh); orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame); }
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
