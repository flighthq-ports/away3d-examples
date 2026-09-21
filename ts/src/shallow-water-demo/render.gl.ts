import type { Camera3D, Environment, GlEffectState, GlRenderRegistries, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  allocateEmptyGlRenderRegistries,
  beginGlEffectPass,
  createFxaaEffect,
  createGlEffectState,
  createToneMapEffect,
  endGlEffectPass,
  // glScene3DRenderRegistries,
  glStandardPbrMeshMaterialRenderer,
  glUnlitMeshMaterialRenderer,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlEnvironmentSkybox,
  renderGlScene3D,
  setCamera3DAspect,
  standardGlTextureResolvers,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
  withRegistryTableEntry,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// The water and terrain shade through StandardPbr; the sky dome quad is unlit.
function createMinimalScene3DGlRegistries(): GlRenderRegistries {
  const registries = allocateEmptyGlRenderRegistries();
  let meshMaterialRenderers = registries.meshMaterialRenderers;
  meshMaterialRenderers = withRegistryTableEntry(
    meshMaterialRenderers, StandardPbrMaterialKind, glStandardPbrMeshMaterialRenderer,
  );
  meshMaterialRenderers = withRegistryTableEntry(
    meshMaterialRenderers, UnlitMaterialKind, glUnlitMeshMaterialRenderer,
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
    window.innerWidth, window.innerHeight, pixelRatio, 0x071a27ff, registries,
  );
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceChildren(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  registerGlToneMapEffect(state);
  registerGlFxaaEffect(state);

  const effects = [createToneMapEffect({ exposure: 1.25 }), createFxaaEffect()];
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
      effectState ??= createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil' });
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
