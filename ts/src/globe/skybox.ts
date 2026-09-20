import type {
  Adjustment,
  Camera3D,
  Environment,
  GlEffectState,
  GlRenderState,
  Node3D,
  Effect,
  RenderTargetClear,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlEffectPass,
  createGlEffectState,
  createToneMapEffect,
  renderGlEnvironmentSkybox,
  renderGlScene3D,
  endGlEffectPass,
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
  effects: ReadonlyArray<Effect | Adjustment> = [createToneMapEffect()],
): void {
  if (ref.effectState === null) {
    ref.effectState = createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil' });
  }
  const pass = beginGlEffectPass(state, ref.effectState, clear);
  renderGlEnvironmentSkybox(state, environment, camera, canvas.width / canvas.height);
  renderGlScene3D(pass, scene, camera, lights);
  endGlEffectPass(pass, ref.effectState, effects);
}
