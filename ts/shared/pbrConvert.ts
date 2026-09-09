import type { Bitmap, HasGraphicsBitmapReadback, ImageResource } from '@flighthq/sdk';
import { captureBitmapFromImageResource } from '@flighthq/sdk';

export interface PbrChannels {
  roughness: number;
  metallic: number;
}

/**
 * Convert an AwayJS specular/gloss map into a glTF metallic-roughness image.
 *
 * Reads every pixel of `source`, passes its normalised (r, g, b, a) to `mapPixel`,
 * and writes the returned roughness/metallic values into the green/blue channels:
 * R=0, G=roughness, B=metallic, A=255 — the standard glTF ORM packing.
 *
 * Returns a Bitmap so the caller can wrap it in
 * createTexture with their own sampler and colorSpace.
 *
 * @param source   The specular or gloss map as an image resource.
 * @param mapPixel Callback receiving normalised [0..1] RGBA, returning normalised
 *                 roughness and metallic values.
 */
export function createMetallicRoughnessImage(
  host: Readonly<HasGraphicsBitmapReadback>,
  source: ImageResource,
  mapPixel: (r: number, g: number, b: number, a: number) => PbrChannels,
): Bitmap {
  const surface = captureBitmapFromImageResource(host, source);
  if (!surface) throw new Error('Unable to read the source image for PBR conversion.');
  const data = surface.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]! / 255;
    const g = data[i + 1]! / 255;
    const b = data[i + 2]! / 255;
    const a = data[i + 3]! / 255;

    const result = mapPixel(r, g, b, a);

    data[i] = 0;
    data[i + 1] = Math.round(result.roughness * 255);
    data[i + 2] = Math.round(result.metallic * 255);
    data[i + 3] = 255;
  }

  return surface;
}
