import type {
  Camera3D,
  GlEffectState,
  GlRenderStateOptions,
  Node3D,
  Scene3DLights,
} from '@flighthq/sdk';
import {
  beginGlEffectPass,
  createBloomEffect,
  createFxaaEffect,
  createGlEffectState,
  createToneMapEffect,
  endGlEffectPass,
  // glScene3DRenderPreset,
  glStandardPbrMeshMaterialRenderer,
  glUnlitMeshMaterialRenderer,
  registerGlBloomEffect,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlScene3D,
  setCamera3DAspect,
  standardGlTextureResolvers,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
} from '@flighthq/sdk';
import { createExampleGlSurface } from '../../shared/glSurface';

// The room shades through StandardPbr; the clock face and its digits are unlit sprite-sheet quads.
function createMinimalScene3DGlRegistries(): GlRenderStateOptions {
  return {
    materialRenderers: new Map([
      [StandardPbrMaterialKind, glStandardPbrMeshMaterialRenderer],
      [UnlitMaterialKind, glUnlitMeshMaterialRenderer],
    ]),
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
  registerGlBloomEffect(state);

  const effects = [
    // The digits are unlit materials at full texture brightness against a near-black room, so
    // they are the only thing above the threshold — the bloom reads as the LEDs themselves
    // emitting rather than as a general haze over the image.
    // Threshold has to sit below the DIGITS' luminance, which is far lower than their apparent
    // brightness: 0xff3a08 decodes to linear (1.0, 0.042, 0.002), and red carries only 0.2126 of
    // luma, so the digits weigh in at 0.243. A 0.35 threshold excluded them entirely and the
    // bloom did nothing. Anything above this is the white silkscreen on the display face, which
    // is a small area and reads fine slightly hot.
    createBloomEffect({ threshold: 0.15, intensity: 1.4, radius: 1.3, passes: 5 }),
    createToneMapEffect({ exposure: 1.1 }),
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
