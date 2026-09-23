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
  // glScene3DRenderPreset,
  glStandardPbrMeshMaterialRenderer,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlScene3D,
  renderGlScene3DShadowMap,
  setCamera3DAspect,
  standardGlTextureResolvers,
  StandardPbrMaterialKind,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// Every knight shades through one StandardPbr material; the MD2 import is re-materialled on load.
function createMinimalScene3DGlRegistries(): GlRenderStateOptions {
  return {
    materialRenderers: new Map([[StandardPbrMaterialKind, glStandardPbrMeshMaterialRenderer]]),
    textureResolvers: standardGlTextureResolvers,
  };
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

  const effects = [
    // AwayJS applies no tone mapping at all, so the default ACES curve was the single largest source of
    // mismatch: its shoulder compressed the mid-tones, crushed the darks and desaturated the armour.
    // Reinhard with a high white point is near-linear across this scene range — closest to AwayJS
    // straight gamma-space output while still clamping the few specular pixels above 1.
    createToneMapEffect({ operator: 'reinhard', white: 8, exposure: 1.0 }),
    createFxaaEffect(),
  ];
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
