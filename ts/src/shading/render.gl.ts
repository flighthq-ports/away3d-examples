import type { Camera3D, DirectionalLight, GlEffectState, GlRenderRegistries, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  allocateEmptyGlRenderRegistries,
  beginGlEffectPass,
  createFxaaEffect,
  createGlEffectState,
  createToneMapEffect,
  endGlEffectPass,
  // glScene3DRenderRegistries,
  glStandardPbrMeshMaterialRenderer,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlScene3D,
  renderGlScene3DShadowMap,
  setCamera3DAspect,
  standardGlTextureResolvers,
  StandardPbrMaterialKind,
  withRegistryTableEntry,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// The scene shades entirely through the standard PBR material, so that is the only renderer it needs.
function createMinimalScene3DGlRegistries(): GlRenderRegistries {
  const registries = allocateEmptyGlRenderRegistries();
  return {
    ...registries,
    meshMaterialRenderers: withRegistryTableEntry(
      registries.meshMaterialRenderers,
      StandardPbrMaterialKind,
      glStandardPbrMeshMaterialRenderer,
    ),
    textureResolvers: standardGlTextureResolvers,
  };
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene3DRenderRegistries; // import all
  const registries = createMinimalScene3DGlRegistries();
  const { canvas, clear, state } = createExampleGlSurface(
    window.innerWidth, window.innerHeight, pixelRatio, 0x000000ff, registries,
  );
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceChildren(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  registerGlToneMapEffect(state);
  registerGlFxaaEffect(state);

  const effects = [createToneMapEffect({ exposure: 0.7 }), createFxaaEffect()];
  let effectState: GlEffectState | null = null;

  return {
    canvas,
    state,
    render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
      effectState ??= createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil' });
      const pass = beginGlEffectPass(state, effectState, clear);
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
