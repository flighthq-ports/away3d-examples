import type { ExtendedPbrMaterial, HasGraphicsImage, ImageResource, Material, Mesh, Node3D, Texture2D } from '@flighthq/sdk';
import {
  createExtendedPbrMaterial,
  createStandardPbrMaterialProperties,
  createTexture,
  createTilingSampler,
  getNodeChildren,
  isMesh,
  loadImageResourceFromUrl,
} from '@flighthq/sdk';

export const materialNameToTextureFile: Record<string, string> = {
  arch: 'arch_diff.jpg',
  Material__298: 'background.jpg',
  bricks: 'bricks_a_diff.jpg',
  ceiling: 'ceiling_a_diff.jpg',
  chain: 'chain_texture.png',
  column_a: 'column_a_diff.jpg',
  column_b: 'column_b_diff.jpg',
  column_c: 'column_c_diff.jpg',
  fabric_g: 'curtain_blue_diff.jpg',
  fabric_c: 'curtain_diff.jpg',
  fabric_f: 'curtain_green_diff.jpg',
  details: 'details_diff.jpg',
  fabric_d: 'fabric_blue_diff.jpg',
  fabric_a: 'fabric_diff.jpg',
  fabric_e: 'fabric_green_diff.jpg',
  flagpole: 'flagpole_diff.jpg',
  floor: 'floor_a_diff.jpg',
  '16___Default': 'gi_flag.jpg',
  Material__25: 'lion.jpg',
  roof: 'roof_diff.jpg',
  leaf: 'thorn_diff.png',
  vase: 'vase_dif.jpg',
  vase_hanging: 'vase_hanging.jpg',
  Material__57: 'vase_plant.png',
  vase_round: 'vase_round.jpg',
};

export const materialNameToNormalFile: Record<string, string> = {
  arch: 'arch_ddn.jpg',
  Material__298: 'background_ddn.jpg',
  bricks: 'bricks_a_ddn.jpg',
  chain: 'chain_texture_ddn.jpg',
  column_a: 'column_a_ddn.jpg',
  column_b: 'column_b_ddn.jpg',
  column_c: 'column_c_ddn.jpg',
  Material__25: 'lion2_ddn.jpg',
  leaf: 'thorn_ddn.jpg',
  vase: 'vase_ddn.jpg',
  vase_round: 'vase_round_ddn.jpg',
};

export const materialNameToSpecularFile: Record<string, string> = {
  arch: 'arch_spec.jpg',
  bricks: 'bricks_a_spec.jpg',
  ceiling: 'ceiling_a_spec.jpg',
  column_a: 'column_a_spec.jpg',
  column_b: 'column_b_spec.jpg',
  column_c: 'column_c_spec.jpg',
  fabric_g: 'curtain_spec.jpg',
  fabric_c: 'curtain_spec.jpg',
  fabric_f: 'curtain_spec.jpg',
  details: 'details_spec.jpg',
  fabric_d: 'fabric_spec.jpg',
  fabric_a: 'fabric_spec.jpg',
  fabric_e: 'fabric_spec.jpg',
  flagpole: 'flagpole_spec.jpg',
  floor: 'floor_a_spec.jpg',
  leaf: 'thorn_spec.jpg',
  Material__57: 'vase_plant_spec.jpg',
  vase_round: 'vase_round_spec.jpg',
};

export const alphaCutoutMaterials = new Set(['chain', 'leaf', 'Material__57']);

export async function loadSponzaTextures(
  host: Readonly<HasGraphicsImage>,
  files: readonly string[],
): Promise<ImageResource[]> {
  return Promise.all(files.map((file) => loadImageResourceFromUrl(host, `sponza/${file}`)));
}

export function createTextureMap(
  sponzaTextureFiles: readonly string[],
  sponzaTextureImages: readonly ImageResource[],
): Map<string, Texture2D> {
  const textureMap = new Map<string, Texture2D>();
  // Sponza's authored UVs deliberately extend well outside the unit square. AwayJS applies
  // ImageSampler(repeat=true, smooth=true, mipmap=true) to every material map, so use Flight's
  // equivalent tiling sampler for diffuse, normal, and specular textures.
  const sampler = createTilingSampler();
  for (const file of new Set(Object.values(materialNameToTextureFile))) {
    const image = sponzaTextureImages[sponzaTextureFiles.indexOf(file)];
    if (image) textureMap.set(file, createTexture({ source: image, sampler }));
  }
  for (const file of new Set(Object.values(materialNameToNormalFile))) {
    const image = sponzaTextureImages[sponzaTextureFiles.indexOf(file)];
    if (image) textureMap.set(file, createTexture({ source: image, colorSpace: 'linear', sampler }));
  }
  for (const file of new Set(Object.values(materialNameToSpecularFile))) {
    const image = sponzaTextureImages[sponzaTextureFiles.indexOf(file)];
    if (image) textureMap.set(file, createTexture({ source: image, colorSpace: 'linear', sampler }));
  }
  return textureMap;
}

const knownMaterialNames = new Set(Object.keys(materialNameToTextureFile));

// Deliberately empty. This used to carry a per-fabric colour multiply — blue, red and green tints on
// the six fabric_* materials — to force the curtain dyes back after they washed toward grey. It worked,
// and it cost the gold: a multiply rescales every hue in a map toward the tint, and these maps also
// carry gold medallions and borders. A representative gold texel at hue 41° came out at 22° (orange),
// 59° (olive) or 79° (chartreuse) depending on the curtain, losing up to two thirds of its saturation.
// The gold could not survive it, which is why Sponza had none.
//
// The washing it compensated for came from the specular extension below, not from the textures — those
// are vivid, 68–85% saturation. With that fixed the dyes stand on their own and no tint is needed.
const materialBaseColor: Partial<Record<string, number>> = {};

// The source only supplies diffuse/specular/normal maps, so these are deliberately conservative
// material classifications rather than an attempted texture-channel conversion. Roughness carries
// the broad physical character while the original specular texture preserves the authored detail.
const materialRoughness: Partial<Record<string, number>> = {
  arch: 0.68,
  Material__298: 0.82,
  bricks: 0.78,
  ceiling: 0.82,
  chain: 0.38,
  column_a: 0.62,
  column_b: 0.58,
  column_c: 0.62,
  fabric_g: 0.88,
  fabric_c: 0.88,
  fabric_f: 0.88,
  details: 0.55,
  fabric_d: 0.9,
  fabric_a: 0.9,
  fabric_e: 0.9,
  flagpole: 0.32,
  floor: 0.52,
  '16___Default': 0.85,
  Material__25: 0.58,
  roof: 0.8,
  leaf: 0.75,
  vase: 0.42,
  vase_hanging: 0.5,
  Material__57: 0.7,
  vase_round: 0.4,
};

const materialMetallic: Partial<Record<string, number>> = {
  chain: 0.85,
  flagpole: 0.75,
};

export function getOrCreateMaterial(
  name: string,
  textureMap: ReadonlyMap<string, Texture2D>,
  materialCache: Map<string, ExtendedPbrMaterial>,
): ExtendedPbrMaterial {
  let mat = materialCache.get(name);
  if (mat) return mat;

  const textureFile = materialNameToTextureFile[name];
  const normalFile = materialNameToNormalFile[name];

  // No specular extension, despite Sponza shipping RGB specular maps that it would seem to want. Routed
  // through specularColorMap it desaturates the whole scene: with the fabric tints removed and fill held
  // constant, dropping the extension moves overall saturation from 45% to 66% and lifts the curtain dyes
  // from an indistinguishable brown back to red, blue and green — with the gold trim legible again.
  //
  // This is not simply a strength problem, and the obvious fixes were tried and measured. A specular
  // factor of 0.2 or 0.35 does not recover the colour. Nor does correcting the colour space: these maps
  // were built as 'linear' while the SDK's own glTF loader resolves specularColorTexture as 'srgb', and
  // fixing that to match — which should drop a #333 map from F0 0.2 to about 0.033, below the 0.04
  // dielectric default and therefore near-invisible — still leaves saturation at 45%. A map that faint
  // should be indistinguishable from no extension at all, so the desaturation looks like a defect in the
  // extension rather than a value we are choosing badly. Worth raising upstream with these numbers.
  //
  // Note the same extension behaves correctly on the hellknight in md5-animation, where its near-black
  // map suppresses specular and keeps the hide matte — removing it there makes the creature glossy. So
  // this is not "the extension is broken everywhere"; it is specific to how these maps land here, which
  // is worth stating in any upstream report.
  //
  // The cost of leaving it out is the authored specular variation on stone, floor and metal. Judged the
  // lesser loss: it costs some highlight detail, where the extension costs every material its colour.
  //
  // materialNameToSpecularFile and its eighteen maps are still declared and still fetched, so restoring
  // this is one line once the extension behaves. That is deliberate, not an oversight — but it is real
  // load-time waste in the meantime, and should be dropped if the extension stays out for good.
  mat = createExtendedPbrMaterial({
    standard: createStandardPbrMaterialProperties({
      baseColor: materialBaseColor[name] ?? 0xffffffff,
      baseColorMap: textureFile ? (textureMap.get(textureFile) ?? null) : null,
      metallic: materialMetallic[name] ?? 0,
      normalMap: normalFile ? (textureMap.get(normalFile) ?? null) : null,
      roughness: materialRoughness[name] ?? 0.7,
    }),
    extensions: [],
  });

  if (alphaCutoutMaterials.has(name)) {
    mat.alphaMode = 'mask';
    mat.alphaCutoff = 0.5;
    mat.doubleSided = true;
  }

  materialCache.set(name, mat);
  return mat;
}

const hiddenMeshNames = new Set(['sponza_04', 'sponza_379']);
const skippedFlagpoleNums = new Set([260, 261, 263, 265, 268, 269, 271, 273]);

export function walkAndAssignMaterials(
  node: Node3D,
  materialCache: Map<string, ExtendedPbrMaterial>,
  textureMap: ReadonlyMap<string, Texture2D>,
): void {
  if (isMesh(node)) {
    const mesh = node as Mesh;
    const meshName = mesh.name ?? '';

    if (hiddenMeshNames.has(meshName)) {
      mesh.visible = false;
      for (const child of getNodeChildren(node)) walkAndAssignMaterials(child as Node3D, materialCache, textureMap);
      return;
    }

    const awdMat = mesh.materials[0] as Material | undefined;
    const materialName = awdMat?.name ?? meshName;
    const matchedName = knownMaterialNames.has(materialName) ? materialName : null;

    if (matchedName) {
      const num = Number(meshName.substring(7));
      if (matchedName === 'column_c' && (num < 22 || num > 33)) {
        mesh.visible = false;
      } else if (matchedName === 'flagpole' && skippedFlagpoleNums.has(num)) {
        mesh.visible = false;
      } else {
        mesh.materials[0] = getOrCreateMaterial(matchedName, textureMap, materialCache);
      }
    } else {
      mesh.visible = false;
    }
  }

  for (const child of getNodeChildren(node)) {
    walkAndAssignMaterials(child as Node3D, materialCache, textureMap);
  }
}
