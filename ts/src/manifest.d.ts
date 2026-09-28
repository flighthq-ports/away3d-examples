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

declare module '*.3ds?manifest' {
  import type { GlRenderStateOptions, ThreeDsImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<ThreeDsImportOptions>;
}

declare module '*.dae?manifest' {
  import type { ColladaImportOptions, GlRenderStateOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<ColladaImportOptions>;
}

declare module '*.md2?manifest' {
  import type { GlRenderStateOptions, Md2ImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<Md2ImportOptions>;
}

declare module '*.md5mesh?manifest' {
  import type { GlRenderStateOptions, Md5ImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<Md5ImportOptions>;
}

declare module '*.obj?manifest' {
  import type { GlRenderStateOptions, ObjImportOptions } from '@flighthq/sdk';

  export const glOptions: Readonly<GlRenderStateOptions>;
  export const parserOptions: Readonly<ObjImportOptions>;
}

declare module '*.fnt?manifest' {
  import type { BitmapFont, BitmapFontParseOptions, ImportDiagnostic } from '@flighthq/sdk';

  /**
   * The one BMFont reader this file's bytes actually need. BMFont writes binary, text, XML and JSON
   * all as `.fnt`, so the manifest resolves the format from the content and names the reader for it
   * — which is why there is no handler list here, and why the source type is the union: the binary
   * reader takes bytes where the three text ones take a string.
   */
  export const contentParser: (
    source: string & Uint8Array extends never ? never : string,
    options?: Readonly<BitmapFontParseOptions>,
    diagnostics?: ImportDiagnostic[],
  ) => BitmapFont | null;
}

declare module '*.swf?manifest' {
  import type { CanvasRenderStateOptions, GlRenderStateOptions, SwfTagHandler } from '@flighthq/sdk';

  export const canvasOptions: Readonly<CanvasRenderStateOptions>;
  export const domOptions: Readonly<Record<string, never>>;
  export const glOptions: Readonly<GlRenderStateOptions>;
  export const wgpuOptions: Readonly<Record<string, never>>;
  export const parserOptions: { readonly tags: readonly SwfTagHandler[] };
}
