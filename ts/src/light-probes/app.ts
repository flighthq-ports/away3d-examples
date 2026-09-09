import type { Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  bakeGlEnvironmentIbl,
  createAmbientLight,
  createEnvironment,
  createFxaaEffect,
  createPointLight,
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
import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';
import { createScene3DContext } from './renderer';

const ctx = createScene3DContext({ width: innerWidth, height: innerHeight, backgroundColor: 0x151515ff, effects: [createToneMapEffect({ exposure: 1.15 }), createFxaaEffect()] });
const scene = createScene3D(); const camera = createCameraFromAway({ far: 2000 });
const orbit = createOrbitControllerFromAway(camera, { distance: 950, panAngle: 180, tiltAngle: 12, targetY: 180 }); bindOrbitDrag(ctx.canvas, orbit);
const probeColors = [0xff765cff, 0x65a2ffff, 0x6dff9aff, 0xffd16cff];
const probePositions = [[-280, 300, -280], [280, 300, -280], [-280, 300, 280], [280, 300, 280]] as const;
const probes = probeColors.map((color, i) => {
  const light = createPointLight({ color, intensity: 5, range: 750 });
  const position = probePositions[i]!;
  setVector3(light.position, position[0], position[1], position[2]);
  return light;
});
const lights = createScene3DLights({ ambient: createAmbientLight({ intensity: 0.08 }), point: probes });
const base = 'away3d/LightProbes/';
const faces = await Promise.all(['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'].map((face) => loadImageResourceFromUrl(`${base}cornellEnvMap/posXposZ/${face}.jpg`)));
bakeGlEnvironmentIbl(ctx.state, createEnvironment({ environment: createCubeTextureFromAwayFaces(faces), intensity: 0.4 }));
const [roomObj, headObj, roomImage, diffuse, normal, ao] = await Promise.all([
  fetch(`${base}cornell.obj`).then((r) => r.text()), fetch(`${base}head.obj`).then((r) => r.text()),
  loadImageResourceFromUrl(`${base}cornell_baked.jpg`), loadImageResourceFromUrl(`${base}head_diffuse.jpg`),
  loadImageResourceFromUrl(`${base}head_normals.jpg`), loadImageResourceFromUrl(`${base}head_AO.jpg`),
]);
const roomScene = createScene3DFromObj(roomObj);
const room = findNode(roomScene.root, isMesh) as Mesh | null;
if (room) { room.materials = [createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: roomImage }), metallic: 0, roughness: 0.92 })]; setVector3(room.scale, 380, 380, 380); invalidateNodeLocalTransform(room); addNodeChild(scene.root, room); }
const headScene = createScene3DFromObj(headObj); const loadedHead = findNode(headScene.root, isMesh) as Mesh | null;
if (!loadedHead) throw new Error('head.obj contains no mesh');
const head: Mesh = loadedHead;
head.materials = [createStandardPbrMaterial({ baseColor: 0xffffffff, baseColorMap: createTexture({ source: diffuse }), normalMap: createTexture({ source: normal }), occlusionMap: createTexture({ source: ao, colorSpace: 'linear' }), metallic: 0.05, roughness: 0.3 })];
setVector3(head.scale, 85, 85, 85); invalidateNodeLocalTransform(head); addNodeChild(scene.root, head);
const note = document.createElement('div');
note.textContent = 'Drag to orbit · global IBL + local colored lights (spatial probe interpolation is a Flight gap)';
Object.assign(note.style, { position: 'fixed', left: '16px', top: '14px', color: '#fff', font: '14px system-ui', textShadow: '0 1px 4px #000', pointerEvents: 'none' });
document.body.appendChild(note);
function frame(ts: number): void { const t = ts / 1700; setVector3(head.position, Math.sin(t) * 240, 170 + Math.sin(t * 1.7) * 35, Math.cos(t * 0.73) * 240); invalidateNodeLocalTransform(head); orbit.update(); ctx.render(scene.root, camera, lights); requestAnimationFrame(frame); }
window.addEventListener('resize', () => { const w = innerWidth; const h = innerHeight; const pr = devicePixelRatio || 1; ctx.canvas.width = w * pr; ctx.canvas.height = h * pr; ctx.canvas.style.width = `${w}px`; ctx.canvas.style.height = `${h}px`; ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height); (camera.projection as PerspectiveProjection).aspect = w / h; });
requestAnimationFrame(frame);
