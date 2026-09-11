import type { Camera3D, GlRenderEffectPipeline, GlRenderState, Node3D } from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createFxaaEffect,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createEmptyGlRegistries,
  createGlPipeline,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createScene3DLights,
  createToneMapEffect,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  drawGlScene3D,
  endGlRenderEffectPipeline,
  registerGlRenderEffect,
  registerStandardGlTextureResolvers,
  registerGlUnlitMaterial,
  renderGlBackground,
  setCamera3DAspect,
} from '@flighthq/sdk';
import { enableHostWebGlRenderSurface, webHost } from '@flighthq/host-web';

function createRenderState(canvas: HTMLCanvasElement, pixelRatio: number): GlRenderState {
  const gl = createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  });

  const state = createGlRenderState(
    createGlContextState(gl),
    createGlPipeline(createEmptyGlRegistries()), // Use scene3DGlPipeline here for the complete registry.
    { backgroundColor: 0x000000ff, pixelRatio },
  );
  registerStandardGlTextureResolvers(state);
  registerGlUnlitMaterial(state);
  registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
  registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);
  return state;
}

export function setupRendering() {
  const pixelRatio = window.devicePixelRatio || 1;
  enableHostWebGlRenderSurface();

  const canvas = createGlCanvasElement(window.innerWidth, window.innerHeight, pixelRatio);
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceWith(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  const state = createRenderState(canvas, pixelRatio);
  const lights = createScene3DLights();
  const effects = [createToneMapEffect(), createFxaaEffect()];
  let pipeline: GlRenderEffectPipeline | null = null;

  return {
    host: webHost,
    render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>): void {
      pipeline ??= createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil' });
      beginGlRenderEffectPipeline(state, pipeline);
      renderGlBackground(state);
      state.gl.depthMask(true);
      state.gl.clearDepth(1);
      state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
      drawGlScene3D(state, scene, camera, lights);
      endGlRenderEffectPipeline(state, pipeline, effects);
    },
    resize(camera: Camera3D): void {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      state.gl.viewport(0, 0, canvas.width, canvas.height);
      setCamera3DAspect(camera, width / height);
    },
  };
}
