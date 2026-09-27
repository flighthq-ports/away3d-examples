import type {
  Camera3D,
  DirectionalLight,
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
  glStandardPbrMeshMaterialRenderer,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlScene3D,
  renderGlScene3DShadowMap,
  setCamera3DAspect,
  SpecularPbrExtensionKind,
  specularPbrGlExtension,
  standardGlTextureResolvers,
  StandardPbrMaterialKind,
} from '@flighthq/sdk';
// What soldier_ant.3ds itself needs, generated at build time; merged with the renderers this example
// adds on its own.
import { glOptions } from '../../../assets/soldier_ant.3ds?manifest';

import { createExampleGlSurface } from '../../shared/glSurface';
import { mergeGlRegistries } from '../../shared/registries';

// The ant imports as StandardPbr; the ground plane adds an ExtendedPbr material carrying a
// specular extension.
function createMinimalScene3DGlRegistries(): GlRenderStateOptions {
  return mergeGlRegistries(glOptions, {
    materialRenderers: new Map([
      [ExtendedPbrMaterialKind, glExtendedPbrMeshMaterialRenderer],
      [StandardPbrMaterialKind, glStandardPbrMeshMaterialRenderer],
    ]),
    pbrExtensions: new Map([[SpecularPbrExtensionKind, specularPbrGlExtension]]),
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

  const effects = [createToneMapEffect({ operator: 'aces' }), createFxaaEffect()];
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
