import type {
  Adjustment,
  Camera3D,
  Environment,
  GlEffectState,
  GlRenderState,
  Node3D,
  RenderEffect,
  RenderTargetClear,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlEffectState,
  createGlEffectState,
  createToneMapEffect,
  drawGlEnvironmentSkybox,
  renderGlScene3D,
  endGlEffectState,
} from '@flighthq/sdk';

// Standalone skybox pass for this example: draws the environment cube behind the scene inside the
// same HDR effect pipeline. Kept local so the example reads end to end.
export interface SkyboxRenderState {
  effectState: GlEffectState | null;
}

export function renderSkyboxScene(
  state: GlRenderState,
  canvas: HTMLCanvasElement,
  ref: SkyboxRenderState,
  clear: Readonly<RenderTargetClear>,
  environment: Readonly<Environment>,
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  effects: ReadonlyArray<RenderEffect | Adjustment> = [createToneMapEffect()],
): void {
  if (ref.effectState === null) {
    ref.effectState = createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil-sampled' });
  }
  const pass = beginGlEffectState(state, ref.effectState, clear);
  drawGlEnvironmentSkybox(state, environment, camera, canvas.width / canvas.height);
  renderGlScene3D(pass, scene, camera, lights);
  endGlEffectState(pass, ref.effectState, effects);
}
