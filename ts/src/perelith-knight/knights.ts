import type { AnimationPlayer, AnimationTrack, Environment, Image, Mesh, Scene3D, StandardPbrMaterial } from '@flighthq/sdk';

import {
  addNodeChild,
  cloneMeshGeometry,
  createAnimationPlayer,
  createCubeTexture,
  createEnvironment,
  createImageResourceFromCanvas,
  createMesh,
  createScene3DFromMd2,
  createStandardPbrMaterial,
  createTexture,
  getNodeChildren,
  invalidateNodeLocalTransform,
  isMesh,
  loadImageResourceFromUrl,
  setCubeTextureFace,
  setVector3,
} from '@flighthq/sdk';

export interface KnightAnimationBucket {
  driver: Mesh;
  player: AnimationPlayer | null;
  track: AnimationTrack | null;
}

export interface KnightsResult {
  animationBuckets: KnightAnimationBucket[];
  knightMaterials: StandardPbrMaterial[];
  environment: Environment;
}

/**
 * A sky-over-ground gradient, built on a canvas rather than loaded, because this demo ships no skybox.
 *
 * Metal is defined by what it reflects. With a single directional light and nothing in the world to
 * mirror, polished steel has no way to announce itself — the previous material chased the look by
 * driving the Blinn exponent to four times the source value, which buys one hard glint per surface and
 * leaves everything facing away from the light reading as flat white plastic. Widening the lobe instead
 * only spreads that into a sheen; measured, it moved highlight coverage from 6.9% to 7.9% and changed
 * nothing about the character of the surface.
 *
 * Six 64px faces of bright sky above, mid grey at the horizon and near-black below is the smallest
 * environment that fixes it. Armour picks up a light top edge and a dark underside, which is the cue
 * the eye actually reads as metal. It is never drawn — the background stays black as in the source —
 * so this only feeds the IBL.
 */
function buildGradientEnvironment(): Environment {
  const SIZE = 64;
  const SKY = '#dfe6f2';
  const HORIZON = '#8f97a8';
  const GROUND = '#14161c';
  const faces = [];
  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    // Face order is +X, -X, +Y, -Y, +Z, -Z: the poles are flat, the four sides carry the gradient.
    if (face === 2) {
      ctx.fillStyle = SKY;
    } else if (face === 3) {
      ctx.fillStyle = GROUND;
    } else {
      const gradient = ctx.createLinearGradient(0, 0, 0, SIZE);
      gradient.addColorStop(0, SKY);
      gradient.addColorStop(0.5, HORIZON);
      gradient.addColorStop(1, GROUND);
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, SIZE, SIZE);
    faces.push(createImageResourceFromCanvas(canvas));
  }
  const cube = createCubeTexture();
  for (let face = 0; face < faces.length; face++) setCubeTextureFace(cube, face, faces[face]!);
  return createEnvironment({ environment: cube, intensity: 1 });
}

/** Saturation at or below this reads as bare steel; at or above CHROMA_PAINT it reads as paint. */
const CHROMA_STEEL = 0.05;
const CHROMA_PAINT = 0.15;
/**
 * Lit plate sits at value ~0.15 and the black hood at ~0.12, so a floor just between them keeps shadow
 * and dark cloth dielectric. Without it, 44% of every texel classified as metal was simply dark — the
 * hood around the face, and painted shading inside every crease — which is what made the whole model
 * read as metallic rather than the plates reading as metal.
 */
const VALUE_FLOOR = 0.13;
const VALUE_RAMP = 0.06;
/** Ceiling on metalness. Can sit high now that the mask actually isolates plate from cloth and skin. */
const MAX_METALNESS = 0.85;
const STEEL_ROUGHNESS = 0.32;
const PAINT_ROUGHNESS = 0.62;

/**
 * Derive where the armour is actually metal, from the skin itself.
 *
 * There is no metalness map in the source, and a single global value is wrong either way: at 0 the
 * plate is dull, at 0.9 the painted face inside the helm dissolves into reflection. But the art mostly
 * separates them — id painted steel near-neutral grey and everything else with colour — so saturation
 * works as a mask. Measured on pknight1: bare plate sits at chroma 0.046, the red cloak at 0.343, the
 * shield heraldry at 0.245. The threshold belongs well below those, hence 0.05–0.15; an earlier
 * 0.10–0.30 ramp put the boundary right on top of the face's own 0.324 and pulled half its texels into
 * metal, which is what made the helm read as a hollow.
 *
 * Chroma alone is not enough, though, and the second term matters more than the first. Three quarters of
 * the skin came out metal on chroma alone, and 44% of that was simply dark — the hood, and the painted
 * shading inside every crease and fold. Requiring the texel to be lit as well drops metal coverage from
 * 53% to 27%, and that 27% is the plates: masked and viewed, the individual armour pieces show up as
 * solid shapes while the face, the cloak and the heraldry go to black.
 *
 * It still is not exact — nothing derived from a 256px painted skin will be — but the failures are now
 * small and dark rather than broad, which is why MAX_METALNESS can sit high. Lower it if a particular
 * skin shows sheen where it should not; that is the dial, and it is cheaper than chasing the thresholds.
 *
 * glTF packs roughness in G and metallic in B.
 */
function buildMetalnessMap(skin: Image): Image | null {
  const source = skin.source;
  if (!source) return null;
  const canvas = document.createElement('canvas');
  canvas.width = skin.width;
  canvas.height = skin.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const max = Math.max(r, g, b);
    const chroma = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    const paint = Math.max(0, Math.min(1, (chroma - CHROMA_STEEL) / (CHROMA_PAINT - CHROMA_STEEL)));
    const lit = Math.max(0, Math.min(1, (max / 255 - VALUE_FLOOR) / VALUE_RAMP));
    const metal = (1 - paint) * lit * MAX_METALNESS;
    data[i] = 0;
    const dielectric = 1 - (1 - paint) * lit;
    data[i + 1] = Math.round((STEEL_ROUGHNESS + (PAINT_ROUGHNESS - STEEL_ROUGHNESS) * dielectric) * 255);
    data[i + 2] = Math.round(metal * 255);
    data[i + 3] = 255;
  }
  ctx.putImageData(frame, 0, 0);
  return createImageResourceFromCanvas(canvas);
}

export async function loadKnights(scene: Readonly<Scene3D>): Promise<KnightsResult> {
  const environment = buildGradientEnvironment();
  const knightMaterials: StandardPbrMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    // Both factors are 1 so the per-skin map below owns metalness and roughness. A single global metallic
    // value cannot work here: these skins are painted art, not reflectance maps — one texture carries
    // steel plate, cloth, heraldry and the knight's own face. Turn the whole material metallic and the
    // paint stops being albedo and becomes reflection tint, so the face inside the helm dissolves into
    // sheen and the opening reads as a hollow rather than a head.
    const material = createStandardPbrMaterial({ baseColor: 0xffffffff, metallic: 1, roughness: 1 });
    material.doubleSided = true;
    knightMaterials.push(material);
  }

  const knightImages = await Promise.all([
    loadImageResourceFromUrl('pknight1.png'),
    loadImageResourceFromUrl('pknight2.png'),
    loadImageResourceFromUrl('pknight3.png'),
    loadImageResourceFromUrl('pknight4.png'),
  ]);

  for (let i = 0; i < 4; i++) {
    // AwayJS shades directly from the stored 8-bit values — they ARE its reflectances, never decoded.
    // Declaring the skins linear reproduces that: an sRGB decode would instead push the armour's darkest
    // texels ~50× lower, and no amount of ambient recovers them (they are near-zero albedo, so ambient
    // scales them by ~nothing). That is what left the knights reading as black silhouettes.
    knightMaterials[i]!.baseColorMap = createTexture({ source: knightImages[i]!, colorSpace: 'linear' });
    const metalness = buildMetalnessMap(knightImages[i]!);
    knightMaterials[i]!.metallicRoughnessMap = metalness ? createTexture({ source: metalness, colorSpace: 'linear' }) : null;
  }

  const md2Buffer = await fetch('pknight.md2').then((r) => r.arrayBuffer());
  const md2Scene = await createScene3DFromMd2(new Uint8Array(md2Buffer));
  const md2Clips = Object.values(md2Scene.animations);

  let templateMesh: Mesh | null = null;
  for (const child of getNodeChildren(md2Scene.root)) {
    if (isMesh(child)) {
      templateMesh = child as Mesh;
      break;
    }
  }

  if (!templateMesh?.geometry) {
    throw new Error('No mesh found in MD2 file');
  }

  const templateGeometry = templateMesh.geometry;
  const templateMorph = templateMesh.morph;

  const animationBuckets: KnightAnimationBucket[] = [];
  const numWide = 20;
  const numDeep = 20;
  // CPU morphing rewrites and uploads a full geometry each frame, so the crowd shares phased geometries
  // rather than giving all 400 knights their own. AwayJS animates every knight independently; buckets buy
  // that variety back at a linear CPU cost. The count is deliberately NOT capped by the clip count — the
  // model only carries 16 named actions, but each bucket also starts at its own offset into its clip, so
  // more buckets keep going even once every clip is in use. Every visible knight still has its own
  // transform/material and participates in both the shadow and forward passes.
  const ANIMATION_BUCKETS = 48;
  const animationBucketCount = templateMorph != null && md2Clips.length > 0 ? ANIMATION_BUCKETS : 1;

  for (let i = 0; i < animationBucketCount; i++) {
    const geometry = cloneMeshGeometry(templateGeometry);
    const driver = createMesh(geometry, []);
    const clip = md2Clips[i % md2Clips.length] ?? null;
    let player: AnimationPlayer | null = null;
    let track: AnimationTrack | null = null;
    if (templateMorph != null && clip != null) {
      driver.morph = { targets: templateMorph.targets, weights: new Float32Array(templateMorph.weights.length) };
      player = createAnimationPlayer(clip, {
        loop: true,
        time: (i / animationBucketCount) * clip.duration,
      });
      track = clip.channels[0]?.track ?? null;
    }
    animationBuckets.push({ driver, player, track });
  }

  // Seeded rather than Math.random(). The army needs to look unplanned, but it does not need to be
  // different every time the page loads — and while it was, no two runs of this example could be
  // compared. A regression that changed how the knights shade was indistinguishable from the shuffle
  // handing you a different mix of skins and poses, which is exactly the trap it laid for the review
  // that found the winding bug. One constant makes the scene reproducible while looking identical.
  let rngState = 0x9e3779b9;
  const nextRandom = (): number => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  };

  for (let i = 0; i < numWide; i++) {
    for (let j = 0; j < numDeep; j++) {
      const material = knightMaterials[Math.floor(nextRandom() * knightMaterials.length)]!;
      const bucket = animationBuckets[Math.floor(nextRandom() * animationBuckets.length)]!;
      const knight = createMesh(bucket.driver.geometry, [material]);

      const x = ((i - (numWide - 1) / 2) * 5000) / numWide;
      const z = ((j - (numDeep - 1) / 2) * 5000) / numDeep;
      setVector3(knight.position, x, 120, z);
      setVector3(knight.scale, 5, 5, 5);
      invalidateNodeLocalTransform(knight);
      addNodeChild(scene.root, knight);
    }
  }

  return { animationBuckets, knightMaterials, environment };
}
