import type { BlinnPhongMaterial, Image, Texture } from '@flighthq/sdk';
import {
  createBlinnPhongMaterial,
  createSampler,
  createTexture,
  loadImageResourceFromUrl,
  setTextureUvScale,
} from '@flighthq/sdk';

// AwayJS's MethodMaterial is a classic specular material, and Flight's Blinn-Phong lane can consume
// the same three maps directly. Keeping the normal and specular images as data textures is important:
// an sRGB decode distorts packed normals and turns the specular mask into a rough color approximation.
export function createFloorMaterial(): BlinnPhongMaterial {
  const material = createBlinnPhongMaterial({
    diffuse: 0xffffffff,
    // Strengthen the tangent-space relief so the tile edges cut as deeply as the reference grooves.
    normalScale: 2.4,
    // AwayJS also applies a 10x specular strength. Flight's classic material has no independent
    // strength channel, so a broader lobe recovers the prominent floor reflection without fake decals.
    shininess: 24,
    specular: 0xffffffff,
  });
  material.doubleSided = true;
  return material;
}

function createFloorTexture(image: Image, colorSpace: 'linear' | 'srgb' = 'srgb'): Texture {
  // The AwayJS sample explicitly requests repeat + smooth filtering with mipmaps disabled. Flight's
  // tiling preset enables trilinear mipmaps, which selects a visibly soft mip over this oblique floor.
  const sampler = createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmaps: false,
    wrapU: 'repeat',
    wrapV: 'repeat',
  });
  const tex = createTexture({ source: image, sampler, colorSpace });
  setTextureUvScale(tex, 2, 2);
  return tex;
}

export async function loadFloorTextures(material: BlinnPhongMaterial): Promise<void> {
  const [diffuseImg, normalImg, specularImg] = await Promise.all([
    loadImageResourceFromUrl('floor_diffuse.jpg'),
    loadImageResourceFromUrl('floor_normal.jpg'),
    loadImageResourceFromUrl('floor_specular.jpg'),
  ]);
  material.diffuseMap = createFloorTexture(diffuseImg);
  material.normalMap = createFloorTexture(normalImg, 'linear');
  material.specularMap = createFloorTexture(specularImg, 'linear');
}
