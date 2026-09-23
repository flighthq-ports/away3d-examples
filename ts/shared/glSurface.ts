import type { GlRenderState, GlRenderStateOptions, RenderTargetClear } from '@flighthq/sdk';
import { createGlRenderState, unpackColorRgba } from '@flighthq/sdk';
import { createWebGlContext } from '@flighthq/host-web';

export interface ExampleGlSurface {
  canvas: HTMLCanvasElement;
  clear: RenderTargetClear;
  state: GlRenderState;
}

export function createExampleGlSurface(
  width: number,
  height: number,
  pixelRatio: number,
  backgroundColor: number,
  registries: Readonly<GlRenderStateOptions> = {},
): ExampleGlSurface {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;

  const gl = createWebGlContext(canvas, {
    contextAttributes: { alpha: false, depth: true, preserveDrawingBuffer: false },
  });
  const state = createGlRenderState(gl, { ...registries, pixelRatio });
  const color: [number, number, number, number] = [0, 0, 0, 0];
  unpackColorRgba(color, backgroundColor);

  return { canvas, clear: { color, depth: 1 }, state };
}
