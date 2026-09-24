import type {
  BlinnPhongMaterial,
  Mesh,
  MeshGeometry,
} from '@flighthq/sdk';
import {
  addNodeChild,
  createMatrix4,
  createScene3D,
  createScene3DFromAwd2,
  createScene3DLights,
  createVector3,
  DEG_TO_RAD,
  findNode,
  getNodeLocalMatrix4,
  isMesh,
  prepareScene3DRender,
  prependMatrix4,
  rotateMatrix4,
  scaleMatrix4,
  sdkHostDecompressDeflate,
  setMatrix4Identity,
  setNodeLocalMatrix4,
  translateMatrix4,
} from '@flighthq/sdk';

// The handler list for this file, generated at build time by @flighthq/vite-plugin-manifest: it
// reads suzanne.awd with the SDK's own `parseAwd2Requirements` walk and resolves what it finds
// against the catalog in scripts/manifestCatalog.ts. Naming the asset instead of a family list is
// what keeps the two from drifting -- and it is tighter than the families were, since suzanne.awd
// has no Container block and so never links awd2ContainerHandler.
import { parserOptions } from '../../../assets/suzanne.awd?manifest';

import { awayDirection, createCameraFromAway } from '../../shared/camera';
import { applyAwayGloss, createDirectionalLightFromAway } from '../../shared/lighting';
import { setupRenderer } from './render.gl';

const renderer = setupRenderer();

const scene = createScene3D();

const camera = createCameraFromAway({ z: -2000, fov: 60 });

const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(1, 0, 0),
  color: 0x683019,
  diffuse: 2.8,
  ambient: 0.5,
  ambientColor: 0x30353b,
  tuning: {
    diffuse: 0.7,
    ambient: 0.2,
  },
});
const lights = createScene3DLights({ ambient, directional });

const buffer = await fetch('suzanne.awd').then((r) => r.arrayBuffer());
const modelScene = createScene3DFromAwd2(new Uint8Array(buffer), {
  ...parserOptions,
  deflate: sdkHostDecompressDeflate,
});

const templateMesh = findNode(modelScene.root, isMesh) as Mesh | null;
if (!templateMesh?.geometry) throw new Error('No mesh found in suzanne.awd');
const defaultMaterial = templateMesh.materials[0] as BlinnPhongMaterial;
applyAwayGloss(defaultMaterial, { gloss: 50, specular: 1.8 });

const orient = createMatrix4();
const orientSource = getNodeLocalMatrix4(templateMesh);
orient.m.set(orientSource.m);

addNodeChild(scene.root, templateMesh);

const yAxis = createVector3(0, 1, 0);
const scratchMatrix = createMatrix4();
let rotationAngle = 0;

function geometryPolygonCount(geometry: Readonly<MeshGeometry>): number {
  return geometry.subsets.reduce((count, subset) => {
    if (geometry.topology === 'triangle-list') return count + Math.floor(subset.indexCount / 3);
    if (geometry.topology === 'triangle-strip') return count + Math.max(0, subset.indexCount - 2);
    return count;
  }, 0);
}

function scenePolygonCount(): number {
  const renderList = prepareScene3DRender(
    renderer.state, scene.root, camera, lights, renderer.canvas.width / renderer.canvas.height,
  );
  let polygons = 0;
  for (let i = 0; i < renderList.meshCount; i++) {
    polygons += geometryPolygonCount(renderList.visibleMeshes[i]!.geometry);
  }
  for (let i = 0; i < renderList.instancedMeshCount; i++) {
    const mesh = renderList.visibleInstancedMeshes[i]!;
    polygons += geometryPolygonCount(mesh.geometry) * mesh.instanceCount;
  }
  return polygons;
}

const stats = document.createElement('div');
Object.assign(stats.style, {
  position: 'fixed', left: '10px', top: '10px', zIndex: '3', color: '#fff',
  font: '12px ui-monospace, monospace', whiteSpace: 'pre', textShadow: '0 1px 3px #000',
  pointerEvents: 'none',
});
document.body.appendChild(stats);
let framesThisSecond = 0;
let statsWindowStart = performance.now();
let displayedFps = 0;
function updateStats(timestamp: number): void {
  framesThisSecond++;
  if (timestamp - statsWindowStart >= 1000) {
    displayedFps = Math.round((framesThisSecond * 1000) / (timestamp - statsWindowStart));
    framesThisSecond = 0;
    statsWindowStart = timestamp;
  }
  stats.textContent = `FPS: ${displayedFps}\nPLY: ${scenePolygonCount()}`;
}

function frame(timestamp: number): void {
  rotationAngle += -1 * DEG_TO_RAD;
  setMatrix4Identity(scratchMatrix);
  translateMatrix4(scratchMatrix, scratchMatrix, 0, -300, 0);
  rotateMatrix4(scratchMatrix, scratchMatrix, yAxis, rotationAngle);
  scaleMatrix4(scratchMatrix, scratchMatrix, 900, 900, 900);
  prependMatrix4(scratchMatrix, scratchMatrix, orient);
  setNodeLocalMatrix4(templateMesh!, scratchMatrix);

  renderer.render(scene.root, camera, lights);
  updateStats(timestamp);
  requestAnimationFrame(frame);
}

renderer.resize(camera);
window.addEventListener('resize', () => renderer.resize(camera));

requestAnimationFrame(frame);
