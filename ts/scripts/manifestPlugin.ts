import { inflateRawSync, inflateSync } from 'node:zlib';

import type { Plugin } from 'vite';
import type { HostDecompressDeflateCapability } from '@flighthq/types/contract';
import { CompressionFraming } from '@flighthq/types/contract';
import { createRequirementCatalog } from '@flighthq/requirement-catalog/contract';
import { createManifestPlugin } from '@flighthq/vite-plugin-manifest';

import { FLIGHT_CATALOG_ENTRIES } from './manifestCatalog';

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
 * Content kinds Flight reads but deliberately implements nowhere, so no catalog row can exist for
 * them: SWF tags the timeline walker consumes structurally (`ShowFrame`), and authoring metadata the
 * importer ignores. The plugin reports every unresolved requirement — correctly, since it cannot
 * know which gaps are intentional — but a catalog row is a fact about an IMPLEMENTATION and there is
 * nothing to point these at. Without this filter a complete, correct build warns six times per SWF,
 * which trains the reader to ignore exactly the channel that reports a real missing handler.
 */
const STRUCTURAL_KINDS = new Set([
  'CSMTextSettings',
  'DefineFontAlignZones',
  'DefineFontName',
  'FileAttributes',
  'Metadata',
  'ShowFrame',
]);

/** Bundled by vite.config.ts and invoked there; see the comment on `manifest()` for why. */
export function createFlightManifestPlugin(): Plugin {
  return createManifestPlugin({
    catalog: createRequirementCatalog(FLIGHT_CATALOG_ENTRIES),
    deflate: nodeDeflate,
    onDiagnostic(message) {
      const kind = /^no catalog entry for document\.format (\S+):/.exec(message)?.[1];
      if (kind !== undefined && STRUCTURAL_KINDS.has(kind)) return;
      console.warn(`[flight-manifest] ${message}`);
    },
  }) as unknown as Plugin;
}
