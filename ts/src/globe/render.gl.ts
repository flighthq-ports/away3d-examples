import type {
  Camera3D,
  Environment,
  GlEffectState,
  GlRenderStateOptions,
  Node3D,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlEffectPass,
  createFxaaEffect,
  createGlEffectState,
  createToneMapEffect,
  CustomShaderMaterialKind,
  emissiveGlModifierSnippet,
  EmissiveModifierKind,
  endGlEffectPass,
  glCustomShaderMeshMaterialRenderer,
  // glScene3DRenderPreset,
  glShadedMeshMaterialRenderer,
  glUnlitMeshMaterialRenderer,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlEnvironmentSkybox,
  renderGlScene3D,
  setCamera3DAspect,
  ShadedMaterialKind,
  standardGlTextureResolvers,
  UnlitMaterialKind,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';
import { registerEarthShader } from './earthShader';

// The earth is a custom-shader material, the atmosphere a ShadedMaterial with an emissive
// modifier, and the sun disc an unlit quad.
function createMinimalScene3DGlRegistries(): GlRenderStateOptions {
  return {
    materialRenderers: new Map([
      [CustomShaderMaterialKind, glCustomShaderMeshMaterialRenderer],
      [ShadedMaterialKind, glShadedMeshMaterialRenderer],
      [UnlitMaterialKind, glUnlitMeshMaterialRenderer],
    ]),
    modifierSnippets: new Map([[EmissiveModifierKind, emissiveGlModifierSnippet]]),
    textureResolvers: standardGlTextureResolvers,
  };
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene3DRenderPreset; // import all
  const registries = createMinimalScene3DGlRegistries();
  const { canvas, clear, state } = createExampleGlSurface(
    window.innerWidth, window.innerHeight, pixelRatio, 0x000005ff, registries,
  );
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceChildren(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  registerGlToneMapEffect(state);
  registerGlFxaaEffect(state);

  // The earth's own program is registered here, with the GL state it compiles against.
  registerEarthShader(state);

  const effects = [createToneMapEffect(), createFxaaEffect()];
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
