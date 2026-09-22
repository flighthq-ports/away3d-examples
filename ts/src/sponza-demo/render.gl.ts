import type {
  Camera3D,
  DirectionalLight,
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
  createToneMapEffect,
  endGlEffectPass,
  ExtendedPbrMaterialKind,
  glExtendedPbrMeshMaterialRenderer,
  // glScene3DRenderRegistries,
  glUnlitMeshMaterialRenderer,
  packOpaqueColor,
  registerGlFxaaEffect,
  registerGlScreenSpaceFogEffect,
  registerGlToneMapEffect,
  renderGlEnvironmentSkybox,
  renderGlScene3D,
  renderGlScene3DShadowMap,
  setCamera3DAspect,
  SpecularPbrExtensionKind,
  specularPbrGlExtension,
  standardGlTextureResolvers,
  UnlitMaterialKind,
  withRegistryTableEntry,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// The atrium imports as ExtendedPbr with a specular extension; the torch flames are unlit quads.
function createMinimalScene3DGlRegistries(): GlRenderRegistries {
  const registries = allocateEmptyGlRenderRegistries();
  let materialRenderers = registries.materialRenderers;
  materialRenderers = withRegistryTableEntry(
    materialRenderers, ExtendedPbrMaterialKind, glExtendedPbrMeshMaterialRenderer,
  );
  materialRenderers = withRegistryTableEntry(
    materialRenderers, UnlitMaterialKind, glUnlitMeshMaterialRenderer,
  );
  return {
    ...registries,
    materialRenderers,
    pbrExtensions: withRegistryTableEntry(
      registries.pbrExtensions,
      SpecularPbrExtensionKind,
      specularPbrGlExtension,
    ),
    textureResolvers: standardGlTextureResolvers,
  };
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene3DRenderRegistries; // import all
  const registries = createMinimalScene3DGlRegistries();
  const { canvas, clear, state } = createExampleGlSurface(
    window.innerWidth, window.innerHeight, pixelRatio, packOpaqueColor(0x9090e7), registries,
  );
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceChildren(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  registerGlToneMapEffect(state);
  registerGlFxaaEffect(state);
  registerGlScreenSpaceFogEffect(state);

  const effects = [
    createScreenSpaceFogEffect({
      // Applied in the HDR pipeline before tone mapping, so the original bright lavender reads nearly
      // white. A deep blue-grey keeps the atmosphere visible without bleaching the distant materials.
      color: packOpaqueColor(0x30384a),
      near: 0.985,
      far: 0.999,
      density: 1.8,
    }),
    createToneMapEffect(),
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
    // The shadow map is its own pass, drawn straight to the state before the effect pass opens.
    renderShadowMap(
      scene: Readonly<Node3D>,
      shadowCamera: Readonly<Camera3D>,
      light: Readonly<DirectionalLight>,
    ): void {
      renderGlScene3DShadowMap(state, scene, shadowCamera, light);
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
