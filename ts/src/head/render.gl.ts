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
  ExtendedPbrMaterialKind,
  glExtendedPbrMeshMaterialRenderer,
  // glScene3DRenderPreset,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlScene3D,
  setCamera3DAspect,
  SpecularPbrExtensionKind,
  specularPbrGlExtension,
  standardGlTextureResolvers,
  WrappedDiffusePbrExtensionKind,
  wrappedDiffusePbrGlExtension,
} from '@flighthq/sdk';
// What head.obj itself needs, generated at build time; merged with the renderers this example
// adds on its own.
import { glOptions } from '../../../assets/head.obj?manifest';

import { createExampleGlSurface } from '../../shared/glSurface';
import { mergeGlRegistries } from '../../shared/registries';

// The head draws with a single ExtendedPbr skin material; its two PBR extensions are the only
// other things the registries carry.
function createMinimalScene3DGlRegistries(): GlRenderStateOptions {
  return mergeGlRegistries(glOptions, {
    materialRenderers: new Map([[ExtendedPbrMaterialKind, glExtendedPbrMeshMaterialRenderer]]),
    pbrExtensions: new Map([
      [SpecularPbrExtensionKind, specularPbrGlExtension],
      [WrappedDiffusePbrExtensionKind, wrappedDiffusePbrGlExtension],
    ]),
    textureResolvers: standardGlTextureResolvers,
  });
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  // const registries = glScene3DRenderPreset; // import all
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

  const effects = [createToneMapEffect({ exposure: 1.2 }), createFxaaEffect()];
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
