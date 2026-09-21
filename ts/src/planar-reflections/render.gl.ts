import type {
  Camera3D,
  Environment,
  GlEffectState,
  GlRenderRegistries,
  Node3D,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  allocateEmptyGlRenderRegistries,
  beginGlEffectPass,
  createFxaaEffect,
  createGlEffectState,
  createScreenSpaceFogEffect,
  CustomShaderMaterialKind,
  endGlEffectPass,
  glCustomShaderMeshMaterialRenderer,
  // glScene3DRenderRegistries,
  glStandardPbrMeshMaterialRenderer,
  registerGlFxaaEffect,
  registerGlScreenSpaceFogEffect,
  renderGlEnvironmentSkybox,
  renderGlScene3D,
  setCamera3DAspect,
  standardGlTextureResolvers,
  StandardPbrMaterialKind,
  withRegistryTableEntry,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// Camera depth range and the distance fog derived from it. These live beside the renderer because
// the fog effect is expressed in WINDOW depth, which only means anything against this near/far
// pair; app.ts builds its camera from the same two numbers.
export const CAMERA_NEAR = 20;
export const CAMERA_FAR = 4000;
const FOG_COLOR = 0x5f5e6e;
const FOG_FAR = 3000;
const FOG_VISIBLE_NEAR = 500;

function depthAt(distance: number): number {
  const d = Math.max(distance, CAMERA_NEAR);
  return (CAMERA_FAR * (d - CAMERA_NEAR)) / (d * (CAMERA_FAR - CAMERA_NEAR));
}

// The clear colour and the fog are consumed as LINEAR values, so the sRGB constants are decoded
// once here rather than per frame.
function linearChannel(channel: number): number {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearRgba(srgb: number): number {
  let out = 0;
  for (let shift = 16; shift >= 0; shift -= 8) {
    out = (out << 8) | Math.round(linearChannel((srgb >> shift) & 0xff) * 255);
  }
  return ((out << 8) | 0xff) >>> 0;
}

// The desert shades through StandardPbr; the mirror is a custom-shader material that samples the
// reflection texture app.ts renders for it.
function createMinimalScene3DGlRegistries(): GlRenderRegistries {
  const registries = allocateEmptyGlRenderRegistries();
  let meshMaterialRenderers = registries.meshMaterialRenderers;
  meshMaterialRenderers = withRegistryTableEntry(
    meshMaterialRenderers, CustomShaderMaterialKind, glCustomShaderMeshMaterialRenderer,
  );
  meshMaterialRenderers = withRegistryTableEntry(
    meshMaterialRenderers, StandardPbrMaterialKind, glStandardPbrMeshMaterialRenderer,
  );
  return {
    ...registries,
    meshMaterialRenderers,
    textureResolvers: standardGlTextureResolvers,
  };
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene3DRenderRegistries; // import all
  const registries = createMinimalScene3DGlRegistries();
  const { canvas, clear, state } = createExampleGlSurface(
    window.innerWidth, window.innerHeight, pixelRatio, linearRgba(FOG_COLOR), registries,
  );
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceChildren(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  registerGlFxaaEffect(state);
  registerGlScreenSpaceFogEffect(state);

  const effects = [
    createScreenSpaceFogEffect({
      color: linearRgba(FOG_COLOR),
      near: depthAt(FOG_VISIBLE_NEAR),
      far: depthAt(FOG_FAR),
      density: 1,
    }),
    createFxaaEffect(),
  ];
  let effectState: GlEffectState | null = null;

  return {
    canvas,
    state,
    render(
      scene: Readonly<Node3D>,
      camera: Readonly<Camera3D>,
      lights: Readonly<Scene3DLights>,
      environment: Readonly<Environment> | null,
    ): void {
      effectState ??= createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil-sampled' });
      const pass = beginGlEffectPass(state, effectState, clear);
      // The skybox fills the target before the scene draws over it, inside the same pass.
      if (environment !== null) {
        renderGlEnvironmentSkybox(state, environment, camera, canvas.width / canvas.height);
      }
      renderGlScene3D(pass, scene, camera, lights);
      endGlEffectPass(pass, effectState, effects);
    },
    resize(camera: Camera3D): void {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      state.pixelRatio = pixelRatio;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      state.gl.viewport(0, 0, canvas.width, canvas.height);
      setCamera3DAspect(camera, width / height);
    },
  };
}
