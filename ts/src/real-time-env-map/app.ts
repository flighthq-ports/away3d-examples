import type { Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  createAmbientLight,
  createEnvironment,
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
  setQuaternionFromEuler,
  setVector3,
  walkNodeDescendants,
} from '@flighthq/sdk';
import { bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, backgroundColor: 0x8ba3b5ff, effects: [createToneMapEffect({ exposure: 1.05 }), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ far: 4000 }); const orbit = createOrbitControllerFromAway(camera, { distance: 650, panAngle: 90, tiltAngle: 12, targetY: 120 }); bindOrbitDrag(ctx.canvas, orbit);
const { directional, ambient } = createDirectionalLightFromAway({ direction: { x: -1, y: -1, z: -1 }, diffuse: 1.1, ambient: 0.2 });
const lights = createScene3DLights({ ambient: ambient ?? createAmbientLight({ intensity: 0.1 }), directional });
const root = 'away3d/RealTimeEnvMap/';
const faceImages = await Promise.all(['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'].map((face) => loadImageResourceFromUrl(`${root}skybox/sky_${face}.jpg`)));
bakeGlEnvironmentIbl(ctx.state, createEnvironment({ environment: createCubeTextureFromAwayFaces(faceImages), intensity: 1.2 }));
const [headObj, r2Obj, r2Image] = await Promise.all([fetch(`${root}head.obj`).then((r) => r.text()), fetch(`${root}R2D2.obj`).then((r) => r.text()), loadImageResourceFromUrl(`${root}r2d2_diffuse.jpg`)]);
const headScene = createScene3DFromObj(headObj); const head = findNode(headScene.root, isMesh) as Mesh | null;
if (!head) throw new Error('head.obj contains no mesh');
head.materials = [createStandardPbrMaterial({ baseColor: 0x18202aff, metallic: 1, roughness: 0.08 })]; setVector3(head.scale, 60, 60, 60); setVector3(head.position, 0, 180, 0); setQuaternionFromEuler(head.rotation, 0, -Math.PI / 2, 0); invalidateNodeLocalTransform(head); addNodeChild(scene.root, head);
const r2Scene = createScene3DFromObj(r2Obj); const r2Material = createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: r2Image }), metallic: 0.35, roughness: 0.38 });
walkNodeDescendants(r2Scene.root, (node) => { if (isMesh(node)) node.materials = [r2Material]; return true; }); setVector3(r2Scene.root.scale, 5, 5, 5); invalidateNodeLocalTransform(r2Scene.root); addNodeChild(scene.root, r2Scene.root);
const note = document.createElement('div'); note.textContent = 'Drag to orbit · static IBL fallback (dynamic cube capture is a Flight gap)'; Object.assign(note.style, { position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui', textShadow: '0 1px 4px #000' }); document.body.appendChild(note);
function frame(ts: number): void { const a = ts / 1800; setVector3(r2Scene.root.position, Math.cos(a) * 330, 30, Math.sin(a) * 330); setQuaternionFromEuler(r2Scene.root.rotation, 0, -a + Math.PI / 2, 0); invalidateNodeLocalTransform(r2Scene.root); orbit.panAngle = Math.PI / 2 - a; orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame); }
window.addEventListener('resize', () => { const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1; ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`; ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h; });
requestAnimationFrame(frame);
