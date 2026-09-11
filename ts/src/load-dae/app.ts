import type { Mesh, Node3D, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  configureDirectionalShadowCamera3D,
  createAabb,
  createBuiltInScene3DResourceResolver,
  createCamera3D,
  createFxaaEffect,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFromDocument,
  createScene3DLights,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  createToneMapEffect,
  createVector3,
  drawGlScene3DShadowMap,
  findNode,
  invalidateMeshGeometry,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  loadScene3DResources,
  parseCollada,
  setQuaternionFromAxisAngle,
  setQuaternionFromEuler,
  setVector3,
  walkNodeDescendants,
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
  distance: 1000,
  panAngle: 15,
  tiltAngle: 10,
  targetY: 250,
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
// The original softens the horse's shadow onto the carpet with a SoftShadowMapMethod.
directional.castsShadow = true;
directional.pcfRadius = 2;
directional.shadowBias = 0.002;
directional.normalBias = 1;
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
// parseCollada merges every <triangles> group of a geometry into ONE MeshGeometry subset while
// still recording one material per group, so materials[1] is unreachable and the whole model
// draws with the first material — the rocking horse's runners came out wood instead of black.
// The renderer itself is fine: it resolves a material per subset (drawGlScene3D), and
// MeshGeometry.subsets exists for exactly this. So the subsets are rebuilt here from the group
// sizes in the source document. The groups are concatenated in document order, which is what
// makes the offsets recoverable.
const triangleGroupCounts = [...source.matchAll(/<triangles[^>]*\bcount="(\d+)"/g)]
  .map((match) => Number(match[1]));
if (horse.geometry && triangleGroupCounts.length > 1 && horse.geometry.subsets.length === 1) {
  const total = triangleGroupCounts.reduce((sum, count) => sum + count, 0) * 3;
  if (total === horse.geometry.subsets[0]!.indexCount) {
    let indexOffset = 0;
    horse.geometry.subsets = triangleGroupCounts.map((count) => {
      const subset = { indexCount: count * 3, indexOffset };
      indexOffset += count * 3;
      return subset;
    });
    invalidateMeshGeometry(horse.geometry);
  }
}

addNodeChild(scene.root, model.root);

// The original enables texture repeat but never scales the UVs, so each 2500-unit surface shows
// the carpet/wallpaper exactly once rather than as a tiled grid.
const roomSampler = createTilingSampler();
const carpetTexture = createTexture({ source: carpetImage, sampler: roomSampler });
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
const wallMaterial = createStandardPbrMaterial({
  baseColor: 0xffffffff,
  baseColorMap: wallTexture,
  metallic: 0,
  roughness: 1,
});
wallMaterial.doubleSided = true;
const wallGeometry = createPlaneMeshGeometry(2500, 2500, 1, 1);
// The original stands every wall up with `rotationX = -90` on a shared template and then turns
// each one into place with its own `rotationY` — two rotations composed, in that order. Both
// parts matter. Collapsing them into a single axis-angle broke the side walls: a rotation about
// Y alone leaves a horizontal plane horizontal, so instead of standing at x = +/-1250 they lay
// flat at y = 1250 and read as a lopsided ceiling. Standing them up about Z instead fixes the
// geometry but carries the UVs round with it, which lays the wallpaper's stripes on their side.
// Keeping the shared X rotation and varying only the yaw keeps the stripes upright on all four.
//
// Both angles flip sign against Away3D: mirroring Z negates rotations about X and Y, and the
// wall positions on Z negate with it.
const WALL_PITCH = Math.PI / 2; // Away3D rotationX = -90
const wallSpecs = [
  { x: -1250, z: 0, yaw: Math.PI / 2 }, // Away3D x = -1250, rotationY = -90
  { x: 1250, z: 0, yaw: -Math.PI / 2 }, // Away3D x =  1250, rotationY =  90
  { x: 0, z: -1250, yaw: 0 }, // Away3D z =  1250, rotationY =   0
  { x: 0, z: 1250, yaw: Math.PI }, // Away3D z = -1250, rotationY = 180
] as const;
for (const spec of wallSpecs) {
  const wall = createMesh(wallGeometry, [wallMaterial]);
  setVector3(wall.position, spec.x, 1250, spec.z);
  // YXZ applies X before Y, which is the order the original composes them in.
  setQuaternionFromEuler(wall.rotation, WALL_PITCH, spec.yaw, 0, 'YXZ');
  invalidateNodeLocalTransform(wall);
  addNodeChild(scene.root, wall);
}

// Only the horse casts: the original clears castsShadows on the carpet and every wall, so the
// shadow pass is fed the imported model's subtree rather than the whole scene.
const shadowCamera = createCamera3D({
  near: 1,
  far: 10,
  projection: createOrthographicProjection({ halfWidth: 1, halfHeight: 1 }),
});
const shadowBounds = createAabb(-700, -20, -700, 700, 900, 700);

// Stands in for the original's away3d.debug.AwayFPS readout.
function countTriangles(root: Readonly<Node3D>): number {
  let triangles = 0;
  walkNodeDescendants(root, (node) => {
    if (isMesh(node) && node.geometry) {
      const geometry = node.geometry;
      const indexed = geometry.indices !== null
        ? geometry.indices.length
        : geometry.vertices.length / (geometry.layout.stride / 4);
      triangles += Math.floor(indexed / 3);
    }
    return true;
  });
  return triangles;
}
const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', left: '10px', top: '10px', zIndex: '3', color: '#fff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textShadow: '0 1px 3px #000',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
const triangleCount = countTriangles(scene.root);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;

const zAxis = createVector3(0, 0, 1);
function frame(time: number): void {
  const phase = time / 500;
  const travel = Math.sin(phase) * -25;
  setVector3(model.root.position, travel, Math.abs(travel * 0.5) + 10, 0);
  setQuaternionFromAxisAngle(model.root.rotation, zAxis, Math.sin(phase) * Math.PI / 12);
  invalidateNodeLocalTransform(model.root);
  orbit.update();

  framesThisSecond++;
  if (time - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (time - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = time;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${triangleCount}`;

  configureDirectionalShadowCamera3D(shadowCamera, directional.direction, shadowBounds);
  drawGlScene3DShadowMap(ctx.state, model.root, shadowCamera, directional);
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
