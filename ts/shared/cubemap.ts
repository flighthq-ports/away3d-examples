import type { CubeTexture, Image } from '@flighthq/sdk';
import {
  createCubeTexture,
  captureBitmapFromImageResource,
  createBitmapRegion,
  flipBitmapHorizontal,
  flipBitmapVertical,
  setCubeTextureFace,
} from '@flighthq/sdk';

/**
 * Build a Flight cube texture from six AwayJS-convention face images.
 *
 * AwayJS is left-handed (+Z into screen); Flight is right-handed (+Z out).
 * The Z-negate requires:
 *  - X faces (+X, -X): stay in slot, horizontally flipped
 *  - Y faces (+Y, -Y): stay in slot, vertically flipped
 *  - Z faces (+Z, -Z): swap slots AND horizontally flip
 *
 * @param faces Six Image values in AwayJS convention:
 *              [posX, negX, posY, negY, posZ, negZ]
 */
export function createCubeTextureFromAwayFaces(faces: readonly Image[]): CubeTexture {
  const cube = createCubeTexture();

  for (let i = 0; i < 6; i++) {
    const isY = i === 2 || i === 3;
    const surface = captureBitmapFromImageResource(faces[i]!);
    const region = createBitmapRegion(surface);

    if (isY) {
      flipBitmapVertical(region, region);
    } else {
      flipBitmapHorizontal(region, region);
    }

    const faceIndex = i === 4 ? 5 : i === 5 ? 4 : i;
    setCubeTextureFace(cube, faceIndex, surface);
  }

  return cube;
}
