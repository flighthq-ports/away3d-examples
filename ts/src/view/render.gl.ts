import type { Camera3D, GlPipeline, GlRenderEffectPipeline, Node3D } from '@flighthq/sdk';
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
  drawGlScene3D,
  endGlRenderEffectPipeline,
  registerGlFxaaEffect,
  registerGlToneMapEffect,
  renderGlBackground,
  // scene3DGlPipeline,
  setCamera3DAspect,
  standardGlTextureResolvers,
  UnlitMaterialKind,
  unlitGlMeshMaterialRenderer,
  withRegistryTableEntry,
} from '@flighthq/sdk';
import { enableHostWebGlRenderSurface } from '@flighthq/host-web';

function createMinimalScene3DGlPipeline(): GlPipeline {
  const registries = createEmptyGlRegistries();
  return createGlPipeline({
    ...registries,
    meshMaterialRenderers: withRegistryTableEntry(
      registries.meshMaterialRenderers,
      UnlitMaterialKind,
      unlitGlMeshMaterialRenderer,
    ),
    textureResolvers: standardGlTextureResolvers,
  });
}

export function setupRenderer() {
  const pixelRatio = window.devicePixelRatio || 1;
  enableHostWebGlRenderSurface();

  const canvas = createGlCanvasElement(window.innerWidth, window.innerHeight, pixelRatio);
  const mount = document.getElementById('app');
  if (mount) {
    mount.replaceChildren(canvas);
  } else {
    document.body.appendChild(canvas);
  }

  const gl = createGlContextFromCanvasElement(canvas, {
    contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  });
  const pipeline = createMinimalScene3DGlPipeline(); // Or use scene3DGlPipeline.
  const state = createGlRenderState(
    createGlContextState(gl),
    pipeline,
    { backgroundColor: 0x000000ff, pixelRatio },
  );
  registerGlToneMapEffect(state);
  registerGlFxaaEffect(state);

  const lights = createScene3DLights();
  const effects = [createToneMapEffect(), createFxaaEffect()];
  let effectPipeline: GlRenderEffectPipeline | null = null;

  return {
    render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>): void {
      effectPipeline ??= createGlRenderEffectPipeline(state, { format: 'rgba16f', depth: 'depth-stencil' });
      beginGlRenderEffectPipeline(state, effectPipeline, 'linear');
      renderGlBackground(state);
      drawGlScene3D(state, scene, camera, lights);
      endGlRenderEffectPipeline(state, effectPipeline, effects);
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
