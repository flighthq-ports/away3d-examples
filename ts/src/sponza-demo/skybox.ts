import type {
  Adjustment,
  Camera3D,
  Environment,
  GlRenderEffectPipeline,
  GlRenderState,
  Node3D,
  RenderEffect,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlRenderEffectPipeline,
  createGlRenderEffectPipeline,
  createToneMapEffect,
  drawGlEnvironmentSkybox,
  drawGlScene3D,
  endGlRenderEffectPipeline,
  renderGlBackground,
} from '@flighthq/sdk';

// Standalone skybox pass for this example: draws the environment cube behind the scene inside the
// same HDR effect pipeline. Kept local so the example reads end to end.
export interface SkyboxRenderState {
  pipeline: GlRenderEffectPipeline | null;
}

export function renderSkyboxScene(
  state: GlRenderState,
  canvas: HTMLCanvasElement,
  ref: SkyboxRenderState,
  environment: Readonly<Environment>,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  effects: ReadonlyArray<RenderEffect | Adjustment> = [createToneMapEffect()],
): void {
  if (ref.pipeline === null) {
    ref.pipeline = createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil-sampled' });
  }
  beginGlRenderEffectPipeline(state, ref.pipeline);
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlEnvironmentSkybox(state, environment, camera, canvas.width / canvas.height);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, ref.pipeline, effects);
}
