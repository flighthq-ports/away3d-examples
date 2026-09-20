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
  beginGlEffectPass,
  clearGlRenderTarget,
  createGlEffectState,
  createToneMapEffect,
  defaultGlFxaaEffectRunner,
  defaultGlToneMapEffectRunner,
  renderGlScene3D,
  endGlEffectPass,
  registerGlBlinnPhongMaterial,
  registerBuiltInGlModifierSnippets,
  registerGlExtendedPbrMaterial,
  registerGlRenderEffect,
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
  renderAnaglyph: (
    scene: Readonly<Node3D>,
    leftCamera: Readonly<Camera3D>,
    rightCamera: Readonly<Camera3D>,
    lights: Readonly<Scene3DLights>,
  ) => void;
  state: GlRenderState;
  width: number;
}

export interface Scene3DOptions {
  backgroundColor?: number;
  height?: number;
  mountId?: string;
  width?: number;
  effects?: ReadonlyArray<RenderEffect | Adjustment>;
}

export function createScene3DContext(options: Readonly<Scene3DOptions> = {}): Scene3DContext {
  const width = options.width ?? 800;
  const height = options.height ?? 600;
  const pixelRatio = window.devicePixelRatio || 1;
  const mount = document.getElementById(options.mountId ?? 'app');
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
  registerGlRenderEffect(state, 'FxaaEffect', defaultGlFxaaEffectRunner);
  registerGlRenderEffect(state, 'ToneMapEffect', defaultGlToneMapEffectRunner);

  let effectState: GlEffectState | null = null;

  return {
    canvas,
    height,
    // Stands in for Away3D's StereoView3D + AnaglyphStereoRenderMethod: one image, with the left
    // eye written to the red channel and the right eye to green+blue, so the pair fuses through
    // red/cyan glasses. Both eyes are drawn inside the same effect pipeline pass and the channel
    // split is done with a colour mask, so the composite reaches the canvas as a single picture
    // rather than as two side-by-side viewports.
    renderAnaglyph(scene, leftCamera, rightCamera, lights) {
      if (effectState === null) {
        effectState = createGlEffectState(state, { format: 'rgba16f', depth: 'depth-stencil' });
      }
      const gl = state.gl;
      gl.colorMask(true, true, true, true);
      const pass = beginGlEffectPass(state, effectState, clear);

      // The effect pass already cleared color and depth with every channel writable.
      gl.colorMask(true, false, false, true);
      renderGlScene3D(pass, scene, leftCamera, lights);

      // Depth is cleared between eyes so the second view is not occluded by the first.
      clearGlRenderTarget(pass.target, { depth: 1 });
      gl.colorMask(false, true, true, true);
      renderGlScene3D(pass, scene, rightCamera, lights);

      gl.colorMask(true, true, true, true);
      endGlEffectPass(pass, effectState, effects);
    },
    state,
    width,
  };
}
