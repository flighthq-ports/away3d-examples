import type {
  Adjustment,
  Camera3D,
  Environment,
  GlEffectState,
  GlRenderState,
  Node3D,
  Effect,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlEffectPass,
  createGlEffectState,
  createToneMapEffect,
  glFxaaEffectRunner,
  glScreenSpaceFogEffectRunner,
  glToneMapEffectRunner,
  renderGlEnvironmentSkybox,
  renderGlScene3D,
  endGlEffectPass,
  registerGlBlinnPhongMaterial,
  registerBuiltInGlModifierSnippets,
  registerGlExtendedPbrMaterial,
  registerGlEffect,
  registerGlShadedMaterial,
  registerGlSpecularPbrExtension,
  registerStandardGlTextureResolvers,
  registerGlStandardPbrMaterial,
  registerGlUnlitMaterial,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// Standalone GL setup for this example: canvas, render state, the material/effect registrations this
// scene needs, and an HDR effect pipeline that tone-maps the result. Each awayjs example carries its
// own copy so it reads end to end without chasing shared harness code.
export interface Scene3DContext {
  canvas: HTMLCanvasElement;
  height: number;
  render: (
    scene: Readonly<Node3D>,
    camera: Readonly<Camera3D>,
    lights: Readonly<Scene3DLights>,
    environment?: Readonly<Environment>,
    onBeforeScene?: () => void,
  ) => void;
  state: GlRenderState;
  width: number;
}

export interface Scene3DOptions {
  backgroundColor?: number;
  height?: number;
  width?: number;
  effects?: ReadonlyArray<Effect | Adjustment>;
}

export function createScene3DContext(options: Readonly<Scene3DOptions> = {}): Scene3DContext {
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const pixelRatio = window.devicePixelRatio || 1;
  const mount = document.getElementById('app');
  const { canvas, clear, state } = createExampleGlSurface(
    width, height, pixelRatio, options.backgroundColor ?? 0x000000ff,
  );

  if (mount) {
    mount.replaceWith(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  document.body.style.margin = '0';


  // Textured materials resolve their maps through the backing-kind registry; without this every
  // texture resolves to null and the scene renders untextured.
  registerStandardGlTextureResolvers(state);
  registerGlUnlitMaterial(state);
  registerGlBlinnPhongMaterial(state);
  registerGlStandardPbrMaterial(state);
  registerGlExtendedPbrMaterial(state);
  registerGlSpecularPbrExtension(state);
  registerGlShadedMaterial(state);
  registerBuiltInGlModifierSnippets(state);
  const effects = options.effects ?? [createToneMapEffect()];
  registerGlEffect(state, 'FxaaEffect', glFxaaEffectRunner);
  registerGlEffect(state, 'ScreenSpaceFogEffect', glScreenSpaceFogEffectRunner);
  registerGlEffect(state, 'ToneMapEffect', glToneMapEffectRunner);

  let effectState: GlEffectState | null = null;

  return {
    canvas,
    height,
    render(scene, camera, lights, environment, onBeforeScene) {
      if (effectState === null) {
        effectState = createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil-sampled' });
      }
      const pass = beginGlEffectPass(state, effectState, clear);
      if (environment) renderGlEnvironmentSkybox(state, environment, camera, canvas.width / canvas.height);
      // The live capture is baked HERE, between the skybox and the lit draws, and this hook exists
      // only for that. The PBR path takes a baked IBL only while its stamped revision still matches
      // the runtime's (glLitProgram: `runtime.ibl?.environmentSourceRevision ===
      // runtime.environmentSourceRevision ? runtime.ibl : null`), and renderGlEnvironmentSkybox above
      // can advance that revision. Baking after it keeps the two equal for the meshes that follow;
      // bake before it and every PBR surface silently loses its ambient term, which renders the
      // reflective head pure black.
      onBeforeScene?.();
      renderGlScene3D(pass, scene, camera, lights);
      endGlEffectPass(pass, effectState, effects);
    },
    state,
    width,
  };
}
