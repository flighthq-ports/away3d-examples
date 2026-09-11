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
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createToneMapEffect,
  defaultGlBloomEffectRunner,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  drawGlScene3D,
  endGlRenderEffectPipeline,
  registerGlBlinnPhongMaterial,
  registerBuiltInGlModifierSnippets,
  registerGlExtendedPbrMaterial,
  registerGlRenderEffect,
  registerGlShadedMaterial,
  registerGlSpecularPbrExtension,
  registerStandardGlTextureResolvers,
  registerGlStandardPbrMaterial,
  registerGlUnlitMaterial,
  renderGlBackground,
} from '@flighthq/sdk';
import { enableHostWebGlRenderSurface, webHost } from '@flighthq/host-web';

// Standalone GL setup for this example: canvas, render state, the material/effect registrations this
// scene needs, and an HDR effect pipeline that tone-maps the result. Each awayjs example carries its
// own copy so it reads end to end without chasing shared harness code.
export interface Scene3DContext {
  canvas: HTMLCanvasElement;
  height: number;
  host: typeof webHost;
  render: (scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>) => void;
  state: GlRenderState;
  width: number;
}

export interface Scene3DOptions {
  backgroundColor?: number;
  height?: number;
  width?: number;
  effects?: ReadonlyArray<RenderEffect | Adjustment>;
}

export function createScene3DContext(options: Readonly<Scene3DOptions> = {}): Scene3DContext {
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const pixelRatio = window.devicePixelRatio || 1;
  const mount = document.getElementById('app');
  enableHostWebGlRenderSurface();
  const canvas = createGlCanvasElement(width, height, pixelRatio);

  if (mount) {
    mount.replaceWith(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  document.body.style.margin = '0';

  const gl = createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  });
  const state = createGlRenderState(
    createGlContextState(gl),
    createGlPipeline(createEmptyGlRegistries()),
    { backgroundColor: options.backgroundColor ?? 0x000000ff, pixelRatio },
  );

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
  registerGlRenderEffect(state, 'BloomEffect', defaultGlBloomEffectRunner);
  registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
  registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);

  let pipeline: GlRenderEffectPipeline | null = null;

  return {
    canvas,
    height,
    host: webHost,
    render(scene, camera, lights) {
      if (pipeline === null) {
        pipeline = createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil' });
      }
      beginGlRenderEffectPipeline(state, pipeline);
      renderGlBackground(state);
      const gl = state.gl;
      gl.depthMask(true);
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      drawGlScene3D(state, scene, camera, lights);
      endGlRenderEffectPipeline(state, pipeline, effects);
    },
    state,
    width,
  };
}
