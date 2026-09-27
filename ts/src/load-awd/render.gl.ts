import type {
  Camera3D,
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
  endGlEffectPass,
  // glScene3DRenderPreset,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlScene3D,
  setCamera3DAspect,
  standardGlTextureResolvers,
} from '@flighthq/sdk';
// The material renderers suzanne.awd needs, generated from the file itself. This sample keeps the
// material the importer builds rather than substituting its own, which is what makes the asset's
// own manifest the truth here — the sibling AWD examples all re-material after import, so theirs
// would describe a scene they do not draw.
import { glOptions } from '../../../assets/suzanne.awd?manifest';

import { createExampleGlSurface } from '../../shared/glSurface';
import { mergeGlRegistries } from '../../shared/registries';

function createMinimalScene3DGlRegistries(): GlRenderStateOptions {
  return mergeGlRegistries(glOptions, {
    // Not derivable from content: a texture resolver is chosen by how the host supplies pixels, not
    // by anything the AWD file says.
    textureResolvers: standardGlTextureResolvers,
  });
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene3DRenderPreset; // import all
  const registries = createMinimalScene3DGlRegistries();
  const { canvas, clear, state } = createExampleGlSurface(
    window.innerWidth, window.innerHeight, pixelRatio, 0x030404ff, registries,
  );
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceChildren(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  registerGlToneMapEffect(state);
  registerGlFxaaEffect(state);

  const effects = [createToneMapEffect(), createFxaaEffect()];
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
