import type { Camera3D, Mesh, Scene3D } from '@flighthq/sdk';
import {
  addNodeChild,
  copyQuaternion,
  createCylinderMeshGeometry,
  createMesh,
  createQuaternion,
  createSphereMeshGeometry,
  createVector3,
  invalidateNodeLocalTransform,
  matrix4TransformPoint,
  multiplyQuaternion,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

import { createAwayMatteMaterial } from '../../shared/materials';
import { whiteMaterial } from './objects';

export interface Tracers {
  pickingTracer: Mesh;
  sceneTracer: Mesh;
  pickingNormalTracer: Mesh;
  sceneNormalTracer: Mesh;
  tracerMeshes: Set<Mesh>;
}

export function createTracers(scene: Scene3D): Tracers {
  const greenTracerMaterial = createAwayMatteMaterial(0x00ff00ff, 10);
  const blueTracerMaterial = createAwayMatteMaterial(0x0000ffff, 10);

  const pickingTracer = createMesh(createSphereMeshGeometry(2, 8, 6), [greenTracerMaterial]);
  pickingTracer.visible = false;
  addNodeChild(scene.root, pickingTracer);

  const sceneTracer = createMesh(createSphereMeshGeometry(2, 8, 6), [blueTracerMaterial]);
  sceneTracer.visible = false;
  addNodeChild(scene.root, sceneTracer);

  const normalTracerGeometry = createCylinderMeshGeometry(0.5, 0.5, 25, 6, true);
  const pickingNormalTracer = createMesh(normalTracerGeometry, [whiteMaterial]);
  pickingNormalTracer.visible = false;
  addNodeChild(scene.root, pickingNormalTracer);

  const sceneNormalTracer = createMesh(createCylinderMeshGeometry(0.5, 0.5, 25, 6, true), [whiteMaterial]);
  sceneNormalTracer.visible = false;
  addNodeChild(scene.root, sceneNormalTracer);

  const tracerMeshes = new Set<Mesh>([pickingTracer, sceneTracer, pickingNormalTracer, sceneNormalTracer]);

  return { pickingTracer, sceneTracer, pickingNormalTracer, sceneNormalTracer, tracerMeshes };
}

const xAxis = { x: 1, y: 0, z: 0 };
const yAxis = { x: 0, y: 1, z: 0 };
const scratchQuatA = createQuaternion();
const scratchQuatB = createQuaternion();
const scratchViewPosition = createVector3();

export function updateNormalTracerStroke(
  tracer: Mesh,
  camera: Readonly<Camera3D>,
  viewportHeight: number,
  thickness: number,
): void {
  if (!tracer.visible || camera.projection.kind !== 'perspective' || viewportHeight <= 0) return;

  matrix4TransformPoint(scratchViewPosition, camera.view, tracer.position);
  const viewDepth = Math.max(0, -scratchViewPosition.z);
  const worldUnitsPerPixel = (2 * viewDepth * Math.tan(camera.projection.fovY / 2)) / viewportHeight;

  // AwayJS LineSegment thickness is screen-space. Flight has no 3D stroke primitive, so scale only
  // the cylinder's cross-section to keep its apparent width stable while preserving its 25-unit length.
  tracer.scale.x = thickness * worldUnitsPerPixel;
  tracer.scale.z = thickness * worldUnitsPerPixel;
  invalidateNodeLocalTransform(tracer);
}

export function positionNormalTracer(
  tracer: Mesh,
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number,
): void {
  setVector3(tracer.position, px, py, pz);

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 0.001) {
    const dnx = nx / len;
    const dny = ny / len;
    const dnz = nz / len;

    const yaw = Math.atan2(dnx, dnz);
    const pitch = Math.asin(-dny);

    setQuaternionFromAxisAngle(scratchQuatA, yAxis, yaw);
    setQuaternionFromAxisAngle(scratchQuatB, xAxis, pitch + Math.PI / 2);
    multiplyQuaternion(scratchQuatA, scratchQuatA, scratchQuatB);
  } else {
    scratchQuatA.x = 0;
    scratchQuatA.y = 0;
    scratchQuatA.z = 0;
    scratchQuatA.w = 1;
  }
  copyQuaternion(tracer.rotation, scratchQuatA);
  invalidateNodeLocalTransform(tracer);
}
