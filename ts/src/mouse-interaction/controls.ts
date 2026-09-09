import type { Camera3D, Mesh, PointLight, Scene3D, Scene3DHit } from '@flighthq/sdk';
import { createScene3DHit, DEG_TO_RAD, invalidateNodeLocalTransform, pickScene3D, setVector3 } from '@flighthq/sdk';

import type { OrbitController } from '../../shared/camera';
import { bindOrbitDrag } from '../../shared/camera';
import type { ObjectInfo } from './objects';
import { whiteMaterial } from './objects';
import type { Tracers } from './tracers';
import { positionNormalTracer } from './tracers';

export function bindOrbitControls(
  canvas: HTMLCanvasElement,
  orbit: OrbitController,
  pointLight: PointLight,
): () => void {
  bindOrbitDrag(canvas, orbit, { minDistance: 100, maxDistance: 2000 });

  let tiltSpeed = 4;
  let panSpeed = 4;
  let distanceSpeed = 4;
  let tiltIncrement = 0;
  let panIncrement = 0;
  let distanceIncrement = 0;

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        tiltIncrement = tiltSpeed;
        break;
      case 's':
      case 'arrowdown':
        tiltIncrement = -tiltSpeed;
        break;
      case 'a':
      case 'arrowleft':
        panIncrement = panSpeed;
        break;
      case 'd':
      case 'arrowright':
        panIncrement = -panSpeed;
        break;
      case 'z':
        distanceIncrement = distanceSpeed;
        break;
      case 'x':
        distanceIncrement = -distanceSpeed;
        break;
    }
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    switch (e.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
      case 's':
      case 'arrowdown':
        tiltIncrement = 0;
        break;
      case 'a':
      case 'arrowleft':
      case 'd':
      case 'arrowright':
        panIncrement = 0;
        break;
      case 'z':
      case 'x':
        distanceIncrement = 0;
        break;
    }
  });

  return function updateCamera(): void {
    orbit.panAngle += panIncrement * DEG_TO_RAD;
    orbit.tiltAngle += tiltIncrement * DEG_TO_RAD;
    orbit.distance += distanceIncrement;

    if (orbit.distance < 100) orbit.distance = 100;
    else if (orbit.distance > 2000) orbit.distance = 2000;

    orbit.update();

    setVector3(pointLight.position, orbit.eye.x, orbit.eye.y, orbit.eye.z);
  };
}

export function bindHoverPicking(
  canvas: HTMLCanvasElement,
  scene: Scene3D,
  camera: Camera3D,
  tracers: Tracers,
  meshToInfo: Map<Mesh, ObjectInfo>,
  headMesh: Mesh | null,
): void {
  const hit: Scene3DHit = createScene3DHit();
  let previousHoveredInfo: ObjectInfo | null = null;

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const screenX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const screenY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    const result = pickScene3D(scene.root, camera, screenX, screenY, hit, {
      predicate: (node) => !tracers.tracerMeshes.has(node as Mesh),
    });

    if (result) {
      const hitMesh = result.node as Mesh;
      const info = meshToInfo.get(hitMesh);

      if (info && info.mouseEnabled && info.hasListeners) {
        if (previousHoveredInfo && previousHoveredInfo !== info) {
          previousHoveredInfo.mesh.materials = [previousHoveredInfo.baseMaterial];
        }

        if (hitMesh !== headMesh) {
          hitMesh.materials = [whiteMaterial];
        }
        previousHoveredInfo = info;

        tracers.pickingTracer.visible = true;
        setVector3(tracers.pickingTracer.position, result.pointX, result.pointY, result.pointZ);
        invalidateNodeLocalTransform(tracers.pickingTracer);

        tracers.pickingNormalTracer.visible = true;
        positionNormalTracer(
          tracers.pickingNormalTracer,
          result.pointX,
          result.pointY,
          result.pointZ,
          result.normalX,
          result.normalY,
          result.normalZ,
        );
      } else {
        if (previousHoveredInfo) {
          previousHoveredInfo.mesh.materials = [previousHoveredInfo.baseMaterial];
          previousHoveredInfo = null;
        }
        tracers.pickingTracer.visible = false;
        tracers.pickingNormalTracer.visible = false;
      }
    } else {
      if (previousHoveredInfo) {
        previousHoveredInfo.mesh.materials = [previousHoveredInfo.baseMaterial];
        previousHoveredInfo = null;
      }
      tracers.pickingTracer.visible = false;
      tracers.pickingNormalTracer.visible = false;
    }
  });
}
