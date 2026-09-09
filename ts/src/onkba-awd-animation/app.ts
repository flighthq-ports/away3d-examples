import type { Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createBuiltInScene3DResourceResolver,
  createFxaaEffect,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createToneMapEffect,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DDocumentFromAwd2Url,
  loadScene3DResources,
  prepareMeshSkinning,
  registerDeflateDecompressor,
  registerWebImageDecoders,
  updateMeshSkin,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createAnimationController } from './animation';
import { createScene3DContext } from './renderer';

registerDeflateDecompressor(); registerWebImageDecoders();
const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, effects: [createToneMapEffect({ exposure: 1.15 }), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ fov: 70, near: 1, far: 30000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 1000, panAngle: 180, tiltAngle: 0, minTiltAngle: -60, maxTiltAngle: 60, targetY: 120 });
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 100, maxDistance: 2000 });
const { directional, ambient } = createDirectionalLightFromAway({ direction: { x: -1, y: -1, z: 1 }, diffuse: 1.2, ambient: 0.18 });
const lights = createScene3DLights({ ambient: ambient ?? createAmbientLight({ intensity: 0.15 }), directional });

const document3d = await loadScene3DDocumentFromAwd2Url('away3d/OnkbaAWDAnimation/onkba/onkba.awd');
if (!document3d) throw new Error('Could not load compressed Onkba AWD');
const model = createScene3DFromDocument(document3d);
await loadScene3DResources(model, createBuiltInScene3DResourceResolver());
const [heroImage, normalImage, gunImage] = await Promise.all([
  loadImageResourceFromUrl('away3d/OnkbaAWDAnimation/onkba/onkba_diffuse.png'),
  loadImageResourceFromUrl('away3d/OnkbaAWDAnimation/onkba/onkba_normals.jpg'),
  loadImageResourceFromUrl('away3d/OnkbaAWDAnimation/onkba/gun_diffuse.jpg'),
]);
const heroMaterial = createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: heroImage }), normalMap: createTexture({ source: normalImage }), metallic: 0, roughness: 0.6 });
const gunMaterial = createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: gunImage }), metallic: 0.72, roughness: 0.28 });
const skinned: Mesh[] = [];
walkNodeDescendants(model.root, (node) => {
  if (isMesh(node)) {
    if (node.name === 'Onkba') node.materials = [heroMaterial];
    else if (node.name === 'Gun') node.materials = [gunMaterial];
    if (node.skin) { prepareMeshSkinning(node); skinned.push(node); }
  }
  return true;
});
addNodeChild(scene.root, model.root);
const animation = createAnimationController(model.animations, 'Breathe', ['Breathe', 'Walk', 'Run', 'Fight', 'Boxe']);
const help = document.createElement('div'); help.textContent = 'Drag to orbit · wheel to zoom · 1–5 animations';
Object.assign(help.style, { position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui', textShadow: '0 1px 4px #000' }); document.body.appendChild(help);
let last = 0;
function frame(ts: number): void {
  const dt = last ? Math.min((ts - last) / 1000, 0.1) : 0; last = ts;
  animation.step(dt); for (const mesh of skinned) updateMeshSkin(mesh); orbit.update();
  ctx.render(scene.root, camera, lights); requestAnimationFrame(frame);
}
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
