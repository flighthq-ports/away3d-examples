import type { GlRenderEffectPipeline, Mesh, PerspectiveProjection } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  computeMeshGeometryNormals,
  configureDirectionalShadowCamera3D,
  createAabb,
  createCamera3D,
  createExtendedPbrMaterial,
  createFxaaEffect,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createScene3D,
  createScene3DFrom3ds,
  createNode3D,
  createScene3DLights,
  createSpecularPbrExtension,
  createTexture,
  createToneMapEffect,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  drawGlScene3D,
  drawGlScene3DShadowMap,
  endGlRenderEffectPipeline,
  getNodeChildren,
  loadImageResourceFromUrl,
  registerGlExtendedPbrMaterial,
  registerGlRenderEffect,
  registerGlSpecularPbrExtension,
  registerStandardGlTextureResolvers,
  registerGlStandardPbrMaterial,
  renderGlBackground,
  setDirectionalLightDirection,
  invalidateNodeLocalTransform,
  setVector3,
} from '@flighthq/sdk';

import {
  awayDirection,
  bindOrbitDrag,
  createCameraFromAway,
  createOrbitControllerFromAway,
} from '../../shared/camera';
import { createDirectionalLightFromAway } from '../../shared/lighting';
import { createAwayMatteMaterial } from '../../shared/materials';

const pixelRatio = window.devicePixelRatio || 1;

const mount = document.getElementById('app');
const canvas = createGlCanvasElement(window.innerWidth, window.innerHeight, pixelRatio);
if (mount) {
  mount.replaceWith(canvas);
} else {
  document.body.appendChild(canvas);
}
document.body.style.margin = '0';

const state = createGlRenderState(canvas, {
  backgroundColor: 0x000000ff,
  contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  pixelRatio,
});

// Textured materials resolve their maps through the backing-kind registry; without this every
// texture resolves to null and the scene renders untextured.
registerStandardGlTextureResolvers(state);
registerGlStandardPbrMaterial(state);
registerGlExtendedPbrMaterial(state);
registerGlSpecularPbrExtension(state);
registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);
// The ground is HDR-lit and clips to flat white when it fills the view; ACES tone mapping
// compresses the highlights back into range, matching the LDR AwayJS original.
const effects = [createToneMapEffect({ operator: 'aces' }), createFxaaEffect()];
let pipeline: GlRenderEffectPipeline | null = null;

const scene = createScene3D();

const camera = createCameraFromAway({ fov: 60, far: 2100 });

// AwayJS's DirectionalLight defaults to ambient 0 and this sample adds no ambient light, so the
// ground is lit by the directional alone. A flat ambient here washes out the plane (its edges glow
// against the black background), so let the helper supply the matching ~zero ambient.
const { directional, ambient } = createDirectionalLightFromAway({
  direction: awayDirection(-1, -1, 1),
});

// AwayJS casts the ant's soft shadow onto the ground (ShadowSoftMethod + castsShadows). Enable the
// directional shadow map and reconfigure its orthographic light camera each frame to the animated
// direction. Bounds cover the 1000x1000 ground plane and the ant standing on it.
directional.castsShadow = true;
directional.pcfRadius = 2;
directional.shadowBias = 0.0025;
directional.normalBias = 1;
const shadowCamera = createCamera3D({
  near: 1,
  far: 10,
  projection: createOrthographicProjection({ halfWidth: 1, halfHeight: 1 }),
});
const shadowBounds = createAabb(-500, -20, -500, 500, 250, 500);

const lights = createScene3DLights({ ambient, directional });

// AwayJS sets the ground's specularMethod.strength = 0 (fully matte). Plain metallic-roughness keeps a
// fixed 0.04 dielectric spec that can't be zeroed (glossy highlight when panning, or a broad grey wash
// at max roughness), so use KHR_materials_specular with specular = 0 to remove the specular lobe while
// keeping the correct PBR diffuse energy.
const groundMaterial = createExtendedPbrMaterial({ extensions: [createSpecularPbrExtension({ specular: 0 })] });
groundMaterial.standard.baseColor = 0xffffffff;
groundMaterial.standard.metallic = 0;
groundMaterial.standard.roughness = 1;
groundMaterial.doubleSided = true;

const groundGeometry = createPlaneMeshGeometry(1000, 1000, 1, 1);
const ground = createMesh(groundGeometry, [groundMaterial]);
addNodeChild(scene.root, ground);

const [modelBuffer, antImage, sandImage] = await Promise.all([
  fetch('soldier_ant.3ds').then((r) => r.arrayBuffer()),
  loadImageResourceFromUrl('soldier_ant.jpg'),
  loadImageResourceFromUrl('CoarseRedSand.jpg'),
]);

groundMaterial.standard.baseColorMap = createTexture({ source: sandImage });

const modelScene = createScene3DFrom3ds(new Uint8Array(modelBuffer));
const antTexture = createTexture({ source: antImage });

const antMaterial = createAwayMatteMaterial(0xffffffff);
antMaterial.baseColorMap = antTexture;

for (const child of getNodeChildren(modelScene.root)) {
  const mesh = child as Mesh;
  if (mesh.geometry) {
    computeMeshGeometryNormals(mesh.geometry, mesh.geometry);
    if (mesh.materials) {
      if (mesh.materials.length === 0) {
        mesh.materials.push(antMaterial);
      } else {
        for (let i = 0; i < mesh.materials.length; i++) {
          mesh.materials[i] = antMaterial;
        }
      }
    }
  }
}

const modelContainer = createNode3D();
for (const child of getNodeChildren(modelScene.root)) {
  addNodeChild(modelContainer, child);
}

modelContainer.position.z = 200;
setVector3(modelContainer.scale, 300, 300, 300);
invalidateNodeLocalTransform(modelContainer);
addNodeChild(scene.root, modelContainer);

const orbit = createOrbitControllerFromAway(camera, {
  distance: 1000,
  panAngle: 45,
  tiltAngle: 20,
  minTiltAngle: 10,
  maxTiltAngle: 90,
});

bindOrbitDrag(canvas, orbit);

let startTime = 0;

function frame(ts: number): void {
  if (startTime === 0) startTime = ts;
  const elapsed = ts - startTime;

  const dir = awayDirection(-Math.sin(elapsed / 4000), -1, -Math.cos(elapsed / 4000));
  setDirectionalLightDirection(directional, dir.x, dir.y, dir.z);

  orbit.update();

  // Shadow depth pass from the light's view, before the lit scene draw samples it.
  configureDirectionalShadowCamera3D(shadowCamera, dir, shadowBounds);
  drawGlScene3DShadowMap(state, scene.root, shadowCamera, directional);

  // Effect-pipeline present: draw the scene into the pipeline's HDR target (clearing background and
  // depth as a direct present would), then run the post-process stack (ACES tone map) to the canvas.
  if (pipeline === null) {
    pipeline = createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil' });
  }
  beginGlRenderEffectPipeline(state, pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlScene3D(state, scene.root, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, effects);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  state.gl.viewport(0, 0, canvas.width, canvas.height);
  (camera.projection as PerspectiveProjection).aspect = w / h;
});

requestAnimationFrame(frame);
