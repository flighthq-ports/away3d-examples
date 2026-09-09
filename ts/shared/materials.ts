import type { StandardPbrMaterial } from '@flighthq/sdk';
import { createStandardPbrMaterial, getPbrRoughnessFromPhongShininess } from '@flighthq/sdk';

export function createAwayMatteMaterial(baseColor: number, shininess = 20): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor,
    metallic: 0,
    roughness: getPbrRoughnessFromPhongShininess(shininess),
  });
}
