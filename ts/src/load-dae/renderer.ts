import type {
  Adjustment,
  Camera3D,
  GlRenderEffectPipeline,
  GlRenderState,
  Node3D,
  RenderEffect,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createEmptyGlRegistries,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlPipeline,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createToneMapEffect,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  drawGlScene3D,
  endGlRenderEffectPipeline,
  registerBuiltInGlModifierSnippets,
  registerGlBlinnPhongMaterial,
  registerGlExtendedPbrMaterial,
  registerGlRenderEffect,
  registerGlShadedMaterial,
  registerGlSpecularPbrExtension,
  registerGlStandardPbrMaterial,
  registerGlUnlitMaterial,
  registerStandardGlTextureResolvers,
  renderGlBackground,
} from '@flighthq/sdk';
import { enableHostWebGlRenderSurface, webHost } from '@flighthq/host-web';

// This sample keeps its complete renderer setup beside the COLLADA import so it remains independently
// ejectable and readable without a gallery bootstrap.
export interface Scene3DContext {
  canvas: HTMLCanvasElement;
  host: typeof webHost;
  render: (scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>) => void;
  state: GlRenderState;
}

export interface Scene3DOptions {
  backgroundColor?: number;
  effects?: ReadonlyArray<RenderEffect | Adjustment>;
  height?: number;
  width?: number;
}

export function createScene3DContext(options: Readonly<Scene3DOptions> = {}): Scene3DContext {
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const pixelRatio = window.devicePixelRatio || 1;
  const mount = document.getElementById('app');
  enableHostWebGlRenderSurface();
  const canvas = createGlCanvasElement(width, height, pixelRatio);

  if (mount) mount.replaceWith(canvas);
  else document.body.appendChild(canvas);
  document.body.style.margin = '0';

  const gl = createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  });
  const state = createGlRenderState(
    createGlContextState(gl),
    createGlPipeline(createEmptyGlRegistries()),
    { backgroundColor: options.backgroundColor ?? 0x000000ff, pixelRatio },
  );

  registerStandardGlTextureResolvers(state);
  registerGlUnlitMaterial(state);
  registerGlBlinnPhongMaterial(state);
  registerGlStandardPbrMaterial(state);
  registerGlExtendedPbrMaterial(state);
  registerGlSpecularPbrExtension(state);
  registerGlShadedMaterial(state);
  registerBuiltInGlModifierSnippets(state);
  const effects = options.effects ?? [createToneMapEffect()];
  registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
  registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);

  let pipeline: GlRenderEffectPipeline | null = null;
  return {
    canvas,
    host: webHost,
    render(scene, camera, lights) {
      pipeline ??= createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil' });
      beginGlRenderEffectPipeline(state, pipeline);
      renderGlBackground(state);
      state.gl.depthMask(true);
      state.gl.clearDepth(1);
      state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
      drawGlScene3D(state, scene, camera, lights);
      endGlRenderEffectPipeline(state, pipeline, effects);
    },
    state,
  };
}
