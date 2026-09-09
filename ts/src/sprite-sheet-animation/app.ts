import type { PerspectiveProjection, Texture, UnlitMaterial } from '@flighthq/sdk';
import {
  addNodeChild,
  createBuiltInScene3DResourceResolver,
  createFxaaEffect,
  createImageResource,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createTexture,
  createToneMapEffect,
  createUnlitMaterial,
  isMesh,
  loadScene3DDocumentFromAwd2Url,
  loadScene3DResources,
  registerDeflateDecompressor,
  registerWebImageDecoders,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

registerDeflateDecompressor(); registerWebImageDecoders();
const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, backgroundColor: 0x121821ff, effects: [createToneMapEffect({ exposure: 1.1 }), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ near: 1000, far: 100000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 25000, panAngle: -118, tiltAngle: 28, minTiltAngle: 5, maxTiltAngle: 75 });
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 10000, maxDistance: 50000 });
const lights = createScene3DLights({ point: [
  createPointLightFromAway({ color: 0xffd26a, diffuse: 2, range: 60000, referenceDistance: 18000 }),
  createPointLightFromAway({ color: 0x5aaeff, diffuse: 1.5, range: 60000, referenceDistance: 18000 }),
] });
lights.point![0]!.position.x = -12000; lights.point![0]!.position.y = 9000;
lights.point![1]!.position.x = 12000; lights.point![1]!.position.y = 6000;

const doc = await loadScene3DDocumentFromAwd2Url('away3d/SpriteSheetAnimation/tictac/tictac.awd');
if (!doc) throw new Error('Could not load compressed tictac AWD');
const clock = createScene3DFromDocument(doc); await loadScene3DResources(clock, createBuiltInScene3DResourceResolver());
addNodeChild(scene.root, clock.root);
const digitMaterials = new Map<string, UnlitMaterial>();
walkNodeDescendants(clock.root, (node) => {
  if (isMesh(node) && ['hours', 'minutes', 'seconds', 'delimiter'].includes(node.name ?? '')) {
    const material = createUnlitMaterial({ baseColor: 0xffffffff }); node.materials = [material]; digitMaterials.set(node.name!, material);
  }
  return true;
});
function clockTexture(text: string, accent: string): Texture {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const g = canvas.getContext('2d')!; g.clearRect(0, 0, 512, 256); g.shadowColor = accent; g.shadowBlur = 28;
  g.fillStyle = accent; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 170px ui-monospace, monospace'; g.fillText(text, 256, 132);
  return createTexture({ source: createImageResource(canvas) });
}
let shownSecond = -1;
function updateClock(): void {
  const now = new Date(); if (shownSecond === now.getSeconds()) return; shownSecond = now.getSeconds();
  digitMaterials.get('hours')!.baseColorMap = clockTexture(String(now.getHours()).padStart(2, '0'), '#ff5a40');
  digitMaterials.get('minutes')!.baseColorMap = clockTexture(String(now.getMinutes()).padStart(2, '0'), '#ffc44d');
  digitMaterials.get('seconds')!.baseColorMap = clockTexture(String(now.getSeconds()).padStart(2, '0'), '#53d8ff');
  digitMaterials.get('delimiter')!.baseColorMap = clockTexture(now.getSeconds() % 2 ? ':' : ' ', '#ffffff');
}
function frame(): void { updateClock(); orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame); }
window.addEventListener('resize', () => {
  const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1;
  ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h;
});
requestAnimationFrame(frame);
