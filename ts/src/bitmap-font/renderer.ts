import type {
  Adjustment,
  Camera3D,
  GlEffectState,
  GlRenderState,
  Node3D,
  RenderEffect,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlEffectState,
  createGlEffectState,
  createToneMapEffect,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  renderGlScene3D,
  endGlEffectState,
  registerBuiltInGlModifierSnippets,
  registerGlBlinnPhongMaterial,
  registerGlExtendedPbrMaterial,
  registerGlRenderEffect,
  registerGlShadedMaterial,
  registerGlSpecularPbrExtension,
  registerGlStandardPbrMaterial,
  registerGlUnlitMaterial,
  registerStandardGlTextureResolvers,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

export interface Scene3DContext {
  canvas: HTMLCanvasElement;
  height: number;
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
  const { canvas, clear, state } = createExampleGlSurface(
    width, height, pixelRatio, options.backgroundColor ?? 0x000000ff,
  );
  const mount = document.getElementById('app');
  if (mount) mount.replaceWith(canvas);
  else document.body.appendChild(canvas);
  document.body.style.margin = '0';

  registerStandardGlTextureResolvers(state);
  registerGlUnlitMaterial(state);
  registerGlBlinnPhongMaterial(state);
  registerGlStandardPbrMaterial(state);
  registerGlExtendedPbrMaterial(state);
  registerGlSpecularPbrExtension(state);
  registerGlShadedMaterial(state);
  registerBuiltInGlModifierSnippets(state);
  registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
  registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);
  const effects = options.effects ?? [createToneMapEffect()];
  let effectState: GlEffectState | null = null;

  return {
    canvas,
    height,
    render(scene, camera, lights) {
      effectState ??= createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil' });
      const pass = beginGlEffectState(state, effectState, clear);
      renderGlScene3D(pass, scene, camera, lights);
      endGlEffectState(pass, effectState, effects);
    },
    state,
    width,
  };
}
