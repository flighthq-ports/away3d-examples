import { inflateRawSync, inflateSync } from 'node:zlib';

import type { Plugin } from 'vite';
import type { HostDecompressDeflateCapability, RequirementCatalog } from '@flighthq/types/contract';
import { CompressionFraming } from '@flighthq/types/contract';
import {
  BUILT_IN_REQUIREMENT_CATALOG_ENTRIES,
  BUILT_IN_REQUIREMENT_TRANSLATIONS,
  createRequirementCatalog,
} from '@flighthq/requirement-catalog/contract';
import { createManifestPlugin } from '@flighthq/vite-plugin-manifest';

/**
 * The build-time decompressor the analyzers need. Without one every compressed asset analyzes to
 * nothing: a `CWS` swf (digits.swf) and a deflate-bodied awd (tictac.awd, onkba.awd) are three of
 * this repo's eight, so most of the corpus would produce an empty manifest. Node's zlib rather than
 * the SDK's web host because this runs in Vite, not a browser.
 *
 * AWD2 frames its body as raw deflate and SWF as zlib, which is why framing is a parameter and not
 * an assumption.
 */
const nodeDeflate: HostDecompressDeflateCapability = {
  decompress(compressed, _uncompressedLength, framing) {
    try {
      const input = Buffer.from(compressed.buffer, compressed.byteOffset, compressed.byteLength);
      return new Uint8Array(framing === CompressionFraming.Raw ? inflateRawSync(input) : inflateSync(input));
    } catch {
      // null is the contract's "this codec could not read it", which the analyzer turns into a
      // diagnostic. Throwing here would fail the whole build on one malformed asset.
      return null;
    }
  },
};

/**
 * Flight's own ownership rows, which cover every SWF tag and AWD2 block its handlers claim. The
 * translations are spread in separately because `createRequirementCatalog` takes only entries — they
 * are what carries a `document.format` requirement over to the node kinds a renderer needs, so
 * without them the parser fragment resolves and every render fragment comes back empty.
 */
function builtInCatalog(): RequirementCatalog {
  return {
    ...createRequirementCatalog(BUILT_IN_REQUIREMENT_CATALOG_ENTRIES),
    translations: BUILT_IN_REQUIREMENT_TRANSLATIONS,
  };
}

/** Bundled by vite.config.ts and invoked there; see the comment on `manifest()` for why. */
export function createFlightManifestPlugin(): Plugin {
  return createManifestPlugin({
    catalog: builtInCatalog(),
    deflate: nodeDeflate,
    onDiagnostic: (message) => console.warn(`[flight-manifest] ${message}`),
  }) as unknown as Plugin;
}
