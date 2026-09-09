import type { Environment, Image, Mesh, ScreenSpaceFogEffect } from '@flighthq/sdk';
import {
  createEnvironment,
  createImageResourceFromCanvas,
  createMesh,
  createPlaneMeshGeometry,
  createScreenSpaceFogEffect,
  createStandardPbrMaterial,
  createTexture,
  createTilingSampler,
  loadImageResourceFromUrl,
  setTextureUvScale,
} from '@flighthq/sdk';

import { createCubeTextureFromAwayFaces } from '../../shared/cubemap';

/** How much of the rock's own hue survives. 0 is fully neutral, 1 leaves the AwayJS orange untouched. */
const GROUND_CHROMA = 0.22;
/** Slate the neutralised rock is tinted toward, sampled from grimnight's own faces (#12111f–#272342). */
const GROUND_TINT = [0.78, 0.80, 0.98] as const;

/**
 * rockbase_diffuse.jpg is a warm rust orange, and against grimnight — a cold blue-violet night sky —
 * it reads as two unrelated scenes sharing a horizon. The sky is the fixed point here: it is the
 * backdrop, it carries the moon, and the eye-level camera now puts it across half the frame.
 *
 * So the ground moves to meet it. Desaturating toward luma and tinting the result to slate keeps every
 * bit of the rock's relief and cracking — the detail lives in the luminance, not the hue — while
 * dropping the orange that was fighting the sky. A material baseColor tint alone cannot do this: the
 * texture is so red-dominant that a multiply strong enough to neutralise it also crushes the ground
 * into darkness.
 */
function coolGroundDiffuse(rock: Image): Image | null {
  const source = rock.source;
  if (!source) return null;
  const canvas = document.createElement('canvas');
  canvas.width = rock.width;
  canvas.height = rock.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    for (let c = 0; c < 3; c++) {
      const neutral = luma * GROUND_TINT[c]!;
      data[i + c] = Math.min(255, Math.round(neutral + (data[i + c]! - neutral) * GROUND_CHROMA));
    }
  }
  ctx.putImageData(image, 0, 0);
  return createImageResourceFromCanvas(canvas);
}

export interface EnvironmentData {
  environment: Environment;
  groundMesh: Mesh;
  fogEffect: ScreenSpaceFogEffect;
}

export async function loadEnvironment(): Promise<EnvironmentData> {
  const skyFaceNames = ['posX', 'negX', 'posY', 'negY', 'posZ', 'negZ'];
  const skyImages = await Promise.all(
    skyFaceNames.map((face) => loadImageResourceFromUrl(`skybox/grimnight_${face}.png`)),
  );
  const skyTexture = createCubeTextureFromAwayFaces(skyImages);
  // Keep the sky as the backdrop while restraining its IBL contribution: a strong environment fill
  // washes out both the directional contact shadow and the ground normal-map response.
  const environment = createEnvironment({ environment: skyTexture, intensity: 0.45 });

  const [rockDiffuse, rockNormal] = await Promise.all([
    loadImageResourceFromUrl('rockbase_diffuse.jpg'),
    loadImageResourceFromUrl('rockbase_normals.png'),
  ]);

  const groundSampler = createTilingSampler();
  const groundDiffuseTexture = createTexture({ source: coolGroundDiffuse(rockDiffuse) ?? rockDiffuse });
  const groundNormalTexture = createTexture({ source: rockNormal, colorSpace: 'linear' });
  groundDiffuseTexture.sampler = groundSampler;
  groundNormalTexture.sampler = groundSampler;
  setTextureUvScale(groundDiffuseTexture, 200, 200);
  setTextureUvScale(groundNormalTexture, 200, 200);

  // Deliberately a plain StandardPbrMaterial rather than an extended one carrying the rock's specular
  // map. That map is near-black across the whole plane, so routing it through the specular extension
  // costs most of the ground's brightness while adding nothing a uniform roughness does not already
  // express. The character's body does use the extension — its specular map is genuinely varied.
  const groundMaterial = createStandardPbrMaterial({
    baseColor: 0xffffffff,
    baseColorMap: groundDiffuseTexture,
    metallic: 0,
    normalMap: groundNormalTexture,
    // AwayJS applies the map at full strength; the small lift accounts for Flight's smoother PBR
    // response and makes the same rock relief legible under the moving lights.
    normalScale: 1.35,
    roughness: 0.62,
  });
  groundMaterial.doubleSided = false;

  const groundMesh = createMesh(createPlaneMeshGeometry(50000, 50000, 1, 1), [groundMaterial]);

  // WebGL stores perspective depth nonlinearly. These window-depth values correspond to the AwayJS
  // fog interval of 2,500–5,000 world units for this camera's near/far planes. The background-aware
  // runner leaves the skybox untouched, allowing the ground to fade almost completely into its dark
  // lower horizon before the far-plane clip.
  const fogEffect = createScreenSpaceFogEffect({
    color: 0x02040aff,
    near: 0.995984,
    far: 1,
    density: 4,
  });

  return { environment, groundMesh, fogEffect };
}
