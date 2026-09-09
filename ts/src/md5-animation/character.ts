import type { AnimationClip, Image, Mesh, Node3D, Scene3D, Texture2D } from '@flighthq/sdk';
import {
  addNodeChild,
  createExtendedPbrMaterial,
  createImageResourceFromCanvas,
  createScene3D,
  createScene3DFromMd5Mesh,
  createSpecularPbrExtension,
  createStandardPbrMaterial,
  createStandardPbrMaterialProperties,
  createTexture,
  createTilingSampler,
  getNodeChildren,
  isMesh,
  loadImageResourceFromUrl,
  parseMd5Anim,
} from '@flighthq/sdk';

/** Roughness at the dull end of the specular map — bare hide, the great majority of the body. */
const HIDE_ROUGHNESS = 0.66;
/** Roughness at the bright end — eyes, teeth, the wet interior of open wounds. */
const WET_ROUGHNESS = 0.22;
// Percentiles of the map's own luma treated as each end of the range. Deliberately lopsided: the map's
// luma is a tight cluster and nearly all of that cluster IS dry hide, so a symmetric 2/98 stretch spread
// the bulk across the whole range and made typical hide glossier than leaving it alone — median
// roughness 0.52 before, 0.48 after, exactly backwards. Anchoring the floor above the cluster keeps the
// body at HIDE_ROUGHNESS and lets only the bright tail — eyes, teeth, wound interiors — travel toward wet.
const GLOSS_FLOOR_PERCENTILE = 0.8;
const GLOSS_CEIL_PERCENTILE = 0.999;

/**
 * A Doom-era specular map encodes two things PBR keeps apart: how strongly a texel reflects, and how
 * tightly. Feeding it only to the specular extension supplies the first and leaves roughness a single
 * constant for the whole body, so the eyes, teeth and the wet interior of open wounds got the same
 * broad lobe as dry hide and never read as wet. Deriving roughness from the same map recovers the
 * second half of what it describes.
 *
 * The specular extension stays alongside this rather than being replaced by it. Dropping it and
 * letting roughness carry the material alone is the more orthodox reading, and it was measurably
 * worse here: the body gained about 10% luma and lost a third of its warmth, going chalky and
 * blue-grey because nothing was tempering the diffuse response any more. Both halves of the original
 * map are doing work, so both are kept.
 *
 * The map's luma has to be rescaled to its own range before it can drive anything. It occupies roughly
 * 0.06 to 0.23 — id authored it as a specular *multiplier*, not as a 0–1 material parameter — so reading
 * it directly produced roughness between 0.51 and 0.55 across the entire body. WET_ROUGHNESS was never
 * reached anywhere: measured over the whole map, 0% of the surface came out below 0.40. The wet/dry
 * variation this function exists to create simply did not happen. Normalising against the map's own
 * percentiles is what makes the two constants above mean what they say.
 *
 * Rescaling also raises the hide off that accidental 0.52. That matters beyond appearance: a tight
 * specular lobe over this normal map aliases badly, throwing isolated bright pixels across the body at
 * one sample per pixel. Widening the lobe on the 98% of the surface that is dry hide is the part of
 * that fix available from here — FXAA cannot touch it, since the aliasing is in the shading rather
 * than on a geometric edge.
 *
 * glTF packs roughness in G and metallic in B, which is what the renderer samples.
 */
function buildRoughnessMapFromSpecular(specular: Image): Image | null {
  const source = specular.source;
  if (!source) return null;
  const canvas = document.createElement('canvas');
  canvas.width = specular.width;
  canvas.height = specular.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  // Rec. 601 luma throughout: the map is near-grey, but the wound interiors carry a red tint that a
  // plain red-channel read would exaggerate into glossy patches across the surrounding hide.
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.round(data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114)]! += 1;
  }
  const texels = data.length / 4;
  const percentile = (target: number): number => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += histogram[v]!;
      if (seen >= texels * target) return v / 255;
    }
    return 1;
  };
  const floor = percentile(GLOSS_FLOOR_PERCENTILE);
  const span = Math.max(1e-4, percentile(GLOSS_CEIL_PERCENTILE) - floor);

  for (let i = 0; i < data.length; i += 4) {
    const luma = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) / 255;
    const gloss = Math.max(0, Math.min(1, (luma - floor) / span));
    data[i] = 0;
    data[i + 1] = Math.round((HIDE_ROUGHNESS + (WET_ROUGHNESS - HIDE_ROUGHNESS) * gloss) * 255);
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return createImageResourceFromCanvas(canvas);
}

export const ANIM_NAMES = [
  'idle2',
  'walk7',
  'attack3',
  'turret_attack',
  'attack2',
  'chest',
  'roar1',
  'leftslash',
  'headpain',
  'pain1',
  'pain_luparm',
  'range_attack2',
];
export const IDLE_NAME = 'idle2';
export const WALK_NAME = 'walk7';

export interface CharacterData {
  clips: Map<string, AnimationClip>;
  skinnedMeshes: Mesh[];
  jointNodes: Node3D[];
  characterPositionNode: Scene3D;
  characterNode: Scene3D;
  gobTexture: Texture2D;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export async function loadCharacter(): Promise<CharacterData> {
  const [bodyDiffuse, bodyNormal, bodySpecular, gobImage] = await Promise.all([
    loadImageResourceFromUrl('hellknight/hellknight_diffuse.jpg'),
    loadImageResourceFromUrl('hellknight/hellknight_normals.png'),
    loadImageResourceFromUrl('hellknight/hellknight_specular.png'),
    loadImageResourceFromUrl('hellknight/gob.png'),
  ]);
  // The source drives specular strength from hellknight_specular.png. That map is mostly dark, so it is
  // what keeps the hide matte and confines the wet sheen to the eyes, teeth and open wounds — a uniform
  // roughness in its place made the whole body read as glossy rubber. It also feeds the roughness map
  // below, which is the half of it the specular extension alone could not express.
  const roughnessImage = buildRoughnessMapFromSpecular(bodySpecular);
  const bodyMaterial = createExtendedPbrMaterial({
    standard: createStandardPbrMaterialProperties({
      baseColor: 0xffffffff,
      baseColorMap: createTexture({ source: bodyDiffuse }),
      metallic: 0,
      metallicRoughnessMap: roughnessImage
        ? createTexture({ source: roughnessImage, colorSpace: 'linear' })
        : null,
      normalMap: createTexture({ source: bodyNormal, colorSpace: 'linear' }),
      // A modest lift over AwayJS's full strength, matching what environment.ts does for the ground.
      // The hellknight's relief is carried almost entirely by this map — the mesh is 2,626 triangles —
      // and now that the tangent basis is continuous across its mirrored UV seams the extra strength
      // reads as musculature rather than as the noise it produced while the basis was still broken.
      normalScale: 1.1,
      // A multiplier on the map's G channel, so this stays 1 and the map owns the variation. Without
      // the map (canvas unavailable) this falls back to a uniformly matte hide, which is the safer of
      // the two extremes for a creature that is bare skin almost everywhere.
      roughness: roughnessImage ? 1 : HIDE_ROUGHNESS,
    }),
    extensions: [
      createSpecularPbrExtension({
        specular: 1,
        specularColorMap: createTexture({ source: bodySpecular, colorSpace: 'linear' }),
      }),
    ],
  });

  const gobTexture = createTexture({ source: gobImage, sampler: createTilingSampler() });
  const gobMaterial = createStandardPbrMaterial({
    baseColor: 0xcbd8cfff,
    baseColorMap: gobTexture,
    emissive: 0x101810ff,
    emissiveStrength: 0.2,
    metallic: 0,
    roughness: 0.18,
  });
  // Flight now draws blended materials after opaque geometry, so the source's translucent scrolling
  // saliva can be restored without the old transparent depth-write hiding the character body.
  gobMaterial.alphaMode = 'blend';
  gobMaterial.doubleSided = true;

  const meshText = await fetchText('hellknight/hellknight.md5mesh');
  const md5Scene = createScene3DFromMd5Mesh(meshText);

  const md5Children = getNodeChildren(md5Scene.root);
  const characterPositionNode = createScene3D();
  const characterNode = createScene3D();
  const skinnedMeshes: Mesh[] = [];
  let meshIndex = 0;
  for (const child of md5Children) {
    if (isMesh(child)) {
      child.materials[0] = meshIndex === 0 ? bodyMaterial : gobMaterial;
      skinnedMeshes.push(child);
      meshIndex++;
    }
    addNodeChild(characterNode.root, child);
  }
  // Every mesh in a .md5mesh shares the file's one skeleton, so the first skinned mesh supplies the
  // joints all clips bind to. Without it parseMd5Anim would bind to an empty array and hand back clips
  // that animate nothing, which is indistinguishable from a working load until the model stands still.
  const skeleton = skinnedMeshes[0]?.skin?.skeleton;
  if (!skeleton) {
    throw new Error('hellknight.md5mesh produced no skinned mesh');
  }
  const jointNodes = skeleton.joints;
  addNodeChild(characterPositionNode.root, characterNode.root);

  // A clip that fails to load is skipped rather than fatal — app.ts falls back to leaving that action
  // unplayed — but it is reported, so a 404 is never mistaken for an animation the model simply lacks.
  const animTexts = await Promise.all(
    ANIM_NAMES.map((name) =>
      fetchText(`hellknight/${name}.md5anim`).catch((error: unknown) => {
        console.error(`animation "${name}" failed to load: ${String(error)}`);
        return null;
      }),
    ),
  );

  const clips: Map<string, AnimationClip> = new Map();
  for (let i = 0; i < ANIM_NAMES.length; i++) {
    const animText = animTexts[i];
    if (animText == null) continue;
    const clip = parseMd5Anim(animText, jointNodes);
    if (!clip) {
      console.error(`animation "${ANIM_NAMES[i]}" failed to parse`);
      continue;
    }
    // AwayJS consumes joint zero's translation as owner root motion and omits it from the rendered
    // skeleton for every clip. Zero it here so the skeleton doesn't shift inside the mesh.
    for (const channel of clip.channels) {
      const target = channel.targetRef as { node?: Node3D; path?: string } | null;
      if (target?.node === jointNodes[0] && target.path === 'Translation') {
        channel.track.values = new Float32Array(channel.track.values.length);
      }
    }
    clips.set(ANIM_NAMES[i]!, clip);
  }

  return { clips, skinnedMeshes, jointNodes, characterPositionNode, characterNode, gobTexture };
}
