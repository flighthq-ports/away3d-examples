import type { Camera3D, GlEffectState, GlRenderRegistries, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  allocateEmptyGlRenderRegistries,
  beginGlEffectPass,
  clearGlRenderTarget,
  createFxaaEffect,
  createGlEffectState,
  endGlEffectPass,
  // glScene3DRenderRegistries,
  glUnlitMeshMaterialRenderer,
  registerGlFxaaEffect,
  renderGlScene3D,
  setCamera3DAspect,
  standardGlTextureResolvers,
  UnlitMaterialKind,
  withRegistryTableEntry,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// Both eyes draw the same unlit scene; only the colour mask differs between them. The sample
// applies FXAA alone, so no tone-map runner is registered.
function createMinimalScene3DGlRegistries(): GlRenderRegistries {
  const registries = allocateEmptyGlRenderRegistries();
  return {
    ...registries,
    meshMaterialRenderers: withRegistryTableEntry(
      registries.meshMaterialRenderers,
      UnlitMaterialKind,
      glUnlitMeshMaterialRenderer,
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

  registerGlFxaaEffect(state);

  const effects = [createFxaaEffect()];
  let effectState: GlEffectState | null = null;

  return {
    canvas,
    state,
    renderAnaglyph(
      scene: Readonly<Node3D>,
      leftCamera: Readonly<Camera3D>,
      rightCamera: Readonly<Camera3D>,
      lights: Readonly<Scene3DLights>,
    ): void {
      effectState ??= createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil' });
      const gl = state.gl;
      gl.colorMask(true, true, true, true);
      const pass = beginGlEffectPass(state, effectState, clear);

      // The effect pass already cleared color and depth with every channel writable.
      gl.colorMask(true, false, false, true);
      renderGlScene3D(pass, scene, leftCamera, lights);

      // Depth is cleared between eyes so the second view is not occluded by the first.
      clearGlRenderTarget(pass.target, { depth: 1 });
      gl.colorMask(false, true, true, true);
      renderGlScene3D(pass, scene, rightCamera, lights);

      gl.colorMask(true, true, true, true);
      endGlEffectPass(pass, effectState, effects);
    },
    resize(leftCamera: Camera3D, rightCamera: Camera3D): void {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      state.pixelRatio = pixelRatio;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      state.gl.viewport(0, 0, canvas.width, canvas.height);
      setCamera3DAspect(leftCamera, width / height);
      setCamera3DAspect(rightCamera, width / height);
    },
  };
}
