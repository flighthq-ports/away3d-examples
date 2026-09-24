import type { Plugin } from 'vite';
import { createRequirementCatalog } from '@flighthq/requirement-catalog/contract';
import { createManifestPlugin } from '@flighthq/vite-plugin-manifest';

import { FLIGHT_CATALOG_ENTRIES } from './manifestCatalog';

/** Bundled by vite.config.ts and invoked there; see the comment on `manifest()` for why. */
export function createFlightManifestPlugin(): Plugin {
  return createManifestPlugin({
    catalog: createRequirementCatalog(FLIGHT_CATALOG_ENTRIES),
  }) as unknown as Plugin;
}
