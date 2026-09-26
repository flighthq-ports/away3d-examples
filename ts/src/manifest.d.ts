// `import { parserOptions } from './asset.awd?manifest'` is served by @flighthq/vite-plugin-manifest,
// which generates the module at build time from the file's own content. The plugin always exports one
// fragment per backend plus the parser's, so a fragment for a backend this file needs nothing for
// spreads to nothing rather than failing to import.
//
// Declared per extension rather than as one `*?manifest`: which parser field a manifest carries is
// decided by the format (`blocks` for AWD2, `tags` for SWF), and a single declaration would have to
// make both optional — which loses the guarantee that spreading one satisfies the parser's options.
declare module '*.awd?manifest' {
  import type { Awd2BlockHandler, CanvasRenderStateOptions, GlRenderStateOptions } from '@flighthq/sdk';

  export const canvasOptions: Readonly<CanvasRenderStateOptions>;
  export const domOptions: Readonly<Record<string, never>>;
  export const glOptions: Readonly<GlRenderStateOptions>;
  export const wgpuOptions: Readonly<Record<string, never>>;
  export const parserOptions: { readonly blocks: readonly Awd2BlockHandler[] };
}

// The static 3D formats carry no handler list to select — `parserOptions` is empty for them — so only
// the render fragments are declared here.
declare module '*.dae?manifest' {
  import type { CanvasRenderStateOptions, GlRenderStateOptions } from '@flighthq/sdk';

  export const canvasOptions: Readonly<CanvasRenderStateOptions>;
  export const domOptions: Readonly<Record<string, never>>;
  export const glOptions: Readonly<GlRenderStateOptions>;
  export const wgpuOptions: Readonly<Record<string, never>>;
}

declare module '*.swf?manifest' {
  import type { CanvasRenderStateOptions, GlRenderStateOptions, SwfTagHandler } from '@flighthq/sdk';

  export const canvasOptions: Readonly<CanvasRenderStateOptions>;
  export const domOptions: Readonly<Record<string, never>>;
  export const glOptions: Readonly<GlRenderStateOptions>;
  export const wgpuOptions: Readonly<Record<string, never>>;
  export const parserOptions: { readonly tags: readonly SwfTagHandler[] };
}
