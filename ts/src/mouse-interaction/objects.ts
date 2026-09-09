import type { Mesh, Scene3D, StandardPbrMaterial } from '@flighthq/sdk';
import {
  addNodeChild,
  copyQuaternion,
  createBoxMeshGeometry,
  createCylinderMeshGeometry,
  createMesh,
  createQuaternion,
  createScene3DFromObj,
  createSphereMeshGeometry,
  createTorusMeshGeometry,
  DEG_TO_RAD,
  getNodeChildren,
  invalidateNodeLocalTransform,
  packOpaqueColor,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';

import { createAwayMatteMaterial } from '../../shared/materials';

export interface ObjectInfo {
  mesh: Mesh;
  mouseEnabled: boolean;
  hasListeners: boolean;
  shapeFlag: boolean;
  baseMaterial: StandardPbrMaterial;
}

export const whiteMaterial = createAwayMatteMaterial(0xffffffff);
export const blackMaterial = createAwayMatteMaterial(packOpaqueColor(0x333333));
export const grayMaterial = createAwayMatteMaterial(packOpaqueColor(0xcccccc));
export const blueMaterial = createAwayMatteMaterial(0x0000ffff);
export const redMaterial = createAwayMatteMaterial(0xff0000ff);
export const headMaterial = createAwayMatteMaterial(packOpaqueColor(0xcccccc));

export function chooseMaterial(info: ObjectInfo): StandardPbrMaterial {
  if (!info.mouseEnabled) return blackMaterial;
  if (!info.hasListeners) return grayMaterial;
  return info.shapeFlag ? redMaterial : blueMaterial;
}

const zAxis = { x: 0, y: 0, z: 1 };
const scratchQuat = createQuaternion();

export function createRandomObject(
  scene: Scene3D,
  objectInfos: ObjectInfo[],
  meshToInfo: Map<Mesh, ObjectInfo>,
): ObjectInfo {
  const rand = Math.random();
  let mesh: Mesh;
  if (rand > 0.75) {
    mesh = createMesh(createBoxMeshGeometry(25, 50, 25), [grayMaterial]);
  } else if (rand > 0.5) {
    mesh = createMesh(createSphereMeshGeometry(12, 16, 12), [grayMaterial]);
  } else if (rand > 0.25) {
    mesh = createMesh(createCylinderMeshGeometry(12, 12, 25, 16, true), [grayMaterial]);
  } else {
    mesh = createMesh(createTorusMeshGeometry(12, 12, 16, 12), [grayMaterial]);
  }

  const isMouseEnabled = Math.random() > 0.25;
  const hasListeners = isMouseEnabled && Math.random() > 0.25;
  const shapeFlag = Math.random() > 0.5;

  const info: ObjectInfo = {
    mesh,
    mouseEnabled: isMouseEnabled,
    hasListeners,
    shapeFlag,
    baseMaterial: grayMaterial,
  };
  info.baseMaterial = chooseMaterial(info);
  mesh.materials = [info.baseMaterial];

  const rotZ = 360 * Math.random() * DEG_TO_RAD;
  const r = 200 + 100 * Math.random();
  const azimuth = 2 * Math.PI * Math.random();
  const elevation = 0.25 * Math.PI * Math.random();
  setVector3(
    mesh.position,
    r * Math.cos(elevation) * Math.sin(azimuth),
    r * Math.sin(elevation),
    r * Math.cos(elevation) * Math.cos(azimuth),
  );
  setQuaternionFromAxisAngle(scratchQuat, zAxis, rotZ);
  copyQuaternion(mesh.rotation, scratchQuat);
  invalidateNodeLocalTransform(mesh);

  addNodeChild(scene.root, mesh);
  objectInfos.push(info);
  meshToInfo.set(mesh, info);

  return info;
}

export async function loadHeadModel(
  scene: Scene3D,
  objectInfos: ObjectInfo[],
  meshToInfo: Map<Mesh, ObjectInfo>,
): Promise<Mesh | null> {
  let headMesh: Mesh | null = null;

  try {
    const objText = await fetch('head.obj').then((r) => r.text());
    const headScene = createScene3DFromObj(objText);
    const children = getNodeChildren(headScene.root);
    for (const child of children) {
      addNodeChild(scene.root, child);
      const m = child as Mesh;
      // AwayJS loads head.obj through new OBJParser(25), which scales the geometry 25x;
      // createScene3DFromObj applies no scale, so match it here or the head renders 1/25 size.
      setVector3(m.scale, 25, 25, 25);
      invalidateNodeLocalTransform(m);
      if (m.materials) {
        m.materials = [headMaterial];
        headMesh = m;
        const info: ObjectInfo = {
          mesh: m,
          mouseEnabled: true,
          hasListeners: true,
          shapeFlag: true,
          baseMaterial: headMaterial,
        };
        objectInfos.push(info);
        meshToInfo.set(m, info);
      }
    }
  } catch {
    console.warn('Could not load head.obj; skipping head model.');
  }

  return headMesh;
}
