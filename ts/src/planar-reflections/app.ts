import type { PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  createFxaaEffect,
  createMesh,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFromObj,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createUnlitMaterial,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  scaleMeshGeometryUvs,
  setQuaternionFromEuler,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, backgroundColor: 0x161b25ff, effects: [createToneMapEffect({ exposure: 1.05 }), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ far: 4000 }); const orbit = createOrbitControllerFromAway(camera, { distance: 750, panAngle: 180, tiltAngle: 10, targetY: 100 }); bindOrbitDrag(ctx.canvas, orbit);
const { directional, ambient } = createDirectionalLightFromAway({ direction: { x: -1, y: -1, z: -1 }, diffuse: 1.2, ambient: 0.25 }); const lights = createScene3DLights({ ambient, directional });
const root = 'away3d/PlanarReflections/'; const [obj, image, sand] = await Promise.all([fetch(`${root}R2D2.obj`).then((r) => r.text()), loadImageResourceFromUrl(ctx.host, `${root}r2d2_diffuse.jpg`), loadImageResourceFromUrl(ctx.host, `${root}desertsand.jpg`)]);
const r2Material = createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: image }), metallic: 0.35, roughness: 0.4 });
function loadR2D2(reflected: boolean) { const model = createScene3DFromObj(obj); walkNodeDescendants(model.root, (node) => { if (isMesh(node)) node.materials = [reflected ? createUnlitMaterial({ baseColor: 0x99bfe0a0, baseColorMap: createTexture({ source: image }), alphaMode: 'blend' }) : r2Material]; return true; }); setVector3(model.root.scale, reflected ? -5 : 5, 5, 5); invalidateNodeLocalTransform(model.root); addNodeChild(scene.root, model.root); return model.root; }
const real = loadR2D2(false); const reflection = loadR2D2(true);
const sandSampler = createTilingSampler(); const floorGeometry = createPlaneMeshGeometry(1800, 1800); scaleMeshGeometryUvs(floorGeometry, 9, 9); const floor = createMesh(floorGeometry, [createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: sand, sampler: sandSampler }), metallic: 0, roughness: 0.95 })]); addNodeChild(scene.root, floor);
const mirrorMaterial = createStandardPbrMaterial({ baseColor: 0x55728c9a, metallic: 0.95, roughness: 0.08, alphaMode: 'blend', doubleSided: true }); const mirror = createMesh(createPlaneMeshGeometry(480, 260), [mirrorMaterial]); setVector3(mirror.position, 0, 170, -260); setQuaternionFromEuler(mirror.rotation, Math.PI / 2, 0, 0); invalidateNodeLocalTransform(mirror); addNodeChild(scene.root, mirror);
const note = document.createElement('div'); note.textContent = 'Drag to orbit · mirrored-scene fallback (planar render textures are a Flight gap)'; Object.assign(note.style, { position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui', textShadow: '0 1px 4px #000' }); document.body.appendChild(note);
function frame(ts: number): void { const a = ts / 1500; const x = Math.sin(a) * 170; setVector3(real.position, x, 30, 40); setVector3(reflection.position, -x, 30, -560); setQuaternionFromEuler(real.rotation, 0, a, 0); setQuaternionFromEuler(reflection.rotation, 0, -a, 0); invalidateNodeLocalTransform(real); invalidateNodeLocalTransform(reflection); orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame); }
window.addEventListener('resize', () => { const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1; ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`; ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h; });
requestAnimationFrame(frame);
