import type { Billboard, Image, Node3D, PointLight, Texture2D } from '@flighthq/sdk';
import {
  addNodeChild,
  BlendMode,
  createBillboard,
  createQuadMeshGeometry,
  createSampler,
  createTexture,
  createUnlitMaterial,
  setTextureFlip,
  setTextureUvOffset,
  setTextureUvScale,
} from '@flighthq/sdk';

import { setAwayPosition } from '../../shared/camera';
import { createPointLightFromAway } from '../../shared/lighting';

const TORCH_POSITIONS = [
  [-625, 165, 219],
  [485, 165, 219],
  [-625, 165, -148],
  [485, 165, -148],
] as const;

export interface SponzaTorches {
  billboards: readonly Billboard[];
  lights: readonly PointLight[];
  update: (timeMs: number) => void;
}

export function createSponzaTorches(root: Node3D, fireImage: Image): SponzaTorches {
  const fireTexture: Texture2D = createTexture({
    source: fireImage,
    sampler: createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmaps: false,
      wrapU: 'repeat',
      wrapV: 'clamp-to-edge',
    }),
  });
  // Flight's billboard quad addresses V opposite to AwayJS's plane geometry. Flip the atlas once so
  // every animated frame rises from the torch instead of hanging downward.
  setTextureFlip(fireTexture, false, true);
  setTextureUvScale(fireTexture, 1 / 16, 1);

  const flameMaterial = createUnlitMaterial({
    baseColor: 0xffffffff,
    baseColorMap: fireTexture,
  });
  flameMaterial.alphaMode = 'blend';
  flameMaterial.blendMode = BlendMode.Add;
  flameMaterial.doubleSided = true;

  const billboards: Billboard[] = [];
  const lights: PointLight[] = [];
  const baseIntensities: number[] = [];

  for (const [x, y, z] of TORCH_POSITIONS) {
    const billboard = createBillboard(createQuadMeshGeometry(40, 80), [flameMaterial], 'axisY');
    setAwayPosition(billboard.position, x, y, z);
    addNodeChild(root, billboard);
    billboards.push(billboard);

    const light = createPointLightFromAway({
      color: 0xffaa44,
      diffuse: 1,
      range: 400,
      referenceDistance: 200,
    });
    // AwayJS offsets the point light ten units above its flame sprite.
    setAwayPosition(light.position, x, y + 10, z);
    lights.push(light);
    baseIntensities.push(light.intensity);
  }

  return {
    billboards,
    lights,
    update(timeMs) {
      const frame = Math.floor(timeMs / 70) % 16;
      setTextureUvOffset(fireTexture, frame / 16, 0);

      for (let i = 0; i < lights.length; i++) {
        // A pair of incommensurate waves gives a lively flicker without the harsh frame-to-frame
        // random changes in the original sample.
        const phase = i * 1.73;
        const flicker = Math.sin(timeMs * 0.014 + phase) * Math.sin(timeMs * 0.023 + phase * 0.7);
        lights[i]!.intensity = baseIntensities[i]! * (0.95 + flicker * 0.05);
        lights[i]!.range = 390 + flicker * 10;
      }
    },
  };
}
