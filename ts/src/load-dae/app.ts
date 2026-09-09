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
  createVector3,
  findNode,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DResources,
  parseCollada,
  setQuaternionFromAxisAngle,
  setTextureUvScale,
  setVector3,
} from '@flighthq/sdk';

import { awayDirection, bindOrbitDrag, createCameraFromAway, createOrbitControllerFromAway } from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createScene3DContext } from './renderer';

const assetRoot = 'away3d/LoadDAE/';
const ctx = createScene3DContext({
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: 0x1e2125ff,
  effects: [createToneMapEffect({ exposure: 1.05 }), createFxaaEffect()],
});
const scene = createScene3D();
const camera = createCameraFromAway({ far: 5000, fov: 60 });
const orbit = createOrbitControllerFromAway(camera, {
  distance: 1250,
  panAngle: 15,
  tiltAngle: 14,
  targetY: 260,
  minTiltAngle: 0,
  maxTiltAngle: 45,
});
bindOrbitDrag(ctx.canvas, orbit, { minDistance: 700, maxDistance: 2200 });

const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(0.4, -0.3, -0.4),
  color: 0x808080,
  diffuse: 2.2,
  ambient: 0.75,
  ambientColor: 0x60657b,
  shading: 'pbr',
});
const lights = createScene3DLights({ ambient, directional });

const [source, carpetImage, wallpaperImage] = await Promise.all([
  fetch(`${assetRoot}hobbelpaard.dae`).then((response) => response.text()),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}carpet.jpg`),
  loadImageResourceFromUrl(ctx.host, `${assetRoot}wallpaper.jpg`),
]);
const imported = parseCollada(source, { baseUrl: assetRoot });
const model = createScene3DFromDocument(imported.document);
const resolver = createBuiltInScene3DResourceResolver(ctx.host, {
  // The source document refers to ../images/*.jpg; the sample archive stores those files beside the DAE.
  fetch: (reference, signal) => {
    const filename = reference.uri.split('/').pop();
    return filename ? loadImageResourceFromUrl(ctx.host, `${assetRoot}${filename}`, 'anonymous', signal) : Promise.resolve(null);
  },
});
await loadScene3DResources(model, resolver);
const horse = findNode(model.root, isMesh) as Mesh | null;
if (!horse) throw new Error('The COLLADA carousel contains no renderable mesh.');
addNodeChild(scene.root, model.root);

const roomSampler = createTilingSampler();
const carpetTexture = createTexture({ source: carpetImage, sampler: roomSampler });
setTextureUvScale(carpetTexture, 5, 5);
const carpetMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: carpetTexture,
  metallic: 0,
  roughness: 1,
});
carpetMaterial.doubleSided = true;
const carpet = createMesh(createPlaneMeshGeometry(2500, 2500, 1, 1), [carpetMaterial]);
addNodeChild(scene.root, carpet);

const wallTexture = createTexture({ source: wallpaperImage, sampler: roomSampler });
setTextureUvScale(wallTexture, 5, 5);
const wallMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: wallTexture,
  metallic: 0,
  roughness: 1,
});
wallMaterial.doubleSided = true;
const wallGeometry = createPlaneMeshGeometry(2500, 2500, 1, 1);
const wallSpecs = [
  { x: -1250, y: 1250, z: 0, axis: createVector3(0, 1, 0), angle: -Math.PI / 2 },
  { x: 1250, y: 1250, z: 0, axis: createVector3(0, 1, 0), angle: Math.PI / 2 },
  { x: 0, y: 1250, z: 1250, axis: createVector3(1, 0, 0), angle: Math.PI / 2 },
  { x: 0, y: 1250, z: -1250, axis: createVector3(1, 0, 0), angle: -Math.PI / 2 },
] as const;
for (const spec of wallSpecs) {
  const wall = createMesh(wallGeometry, [wallMaterial]);
  setVector3(wall.position, spec.x, spec.y, spec.z);
  setQuaternionFromAxisAngle(wall.rotation, spec.axis, spec.angle);
  invalidateNodeLocalTransform(wall);
  addNodeChild(scene.root, wall);
}

const zAxis = createVector3(0, 0, 1);
function frame(time: number): void {
  const phase = time / 500;
  const travel = Math.sin(phase) * -25;
  setVector3(model.root.position, travel, Math.abs(travel * 0.5) + 10, 0);
  setQuaternionFromAxisAngle(model.root.rotation, zAxis, Math.sin(phase) * Math.PI / 12);
  invalidateNodeLocalTransform(model.root);
  orbit.update();
  ctx.render(scene.root, camera, lights);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  ctx.canvas.width = width * pixelRatio;
  ctx.canvas.height = height * pixelRatio;
  ctx.canvas.style.width = `${width}px`;
  ctx.canvas.style.height = `${height}px`;
  ctx.state.gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
  (camera.projection as PerspectiveProjection).aspect = width / height;
});

requestAnimationFrame(frame);
