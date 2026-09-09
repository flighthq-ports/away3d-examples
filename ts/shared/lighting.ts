import type { AmbientLight, BlinnPhongMaterial, DirectionalLight, PointLight, Vector3Like } from '@flighthq/sdk';
import {
  applyLightExposure,
  createAmbientLight,
  createDirectionalLight,
  createPointLight,
  getPhongToPbrLightExposure,
  packOpaqueColor,
} from '@flighthq/sdk';

// The Flight material model a demo's ports shade with. AwayJS lights are authored for classic Phong:
// gamma-space radiance whose Lambert diffuse term does NOT divide albedo by π. The light energy has to
// match whichever model receives it, so this is the dial:
//   - 'pbr'   → StandardPbrMaterial's diffuse BRDF divides albedo by π for energy conservation, so the
//               light needs the Phong→PBR ×π exposure (getPhongToPbrLightExposure) or the scene renders
//               ~π× too dark — the classic "ported scene is far too dark" failure.
//   - 'phong' → BlinnPhongMaterial keeps the classic Lambert term (no /π), so the AwayJS intensity passes
//               through unchanged; applying the ×π boost would blow every surface out ~π× too bright.
// Most ports use StandardPbrMaterial, so 'pbr' is the default.
export type AwayShadingModel = 'pbr' | 'phong';

const DEFAULT_SHADING_MODEL: AwayShadingModel = 'pbr';

function awayIntensity(intensity: number, shading: AwayShadingModel = DEFAULT_SHADING_MODEL): number {
  const exposure = shading === 'pbr' ? getPhongToPbrLightExposure() : 0;
  return applyLightExposure(intensity, exposure);
}

// AwayJS color hex are sRgb values, which is exactly what Flight's light `color` expects: the renderer
// gamma-decodes them to linear (unpackColorToLinear) and the gamma.ts pass re-encodes at display, so
// the hue round-trips to the AwayJS look. Only the intensity needs the ×π energy boost above.
function awayLightColor(hex: number): number {
  return packOpaqueColor(hex);
}

// AwayJS MethodMaterial `gloss` is a Phong specular exponent; Flight's BlinnPhongMaterial.shininess feeds a
// Blinn-Phong (half-vector) lobe, which needs roughly this multiple for a highlight of the same tightness.
const PHONG_TO_BLINN_SHININESS = 3.6;

function scaleColorBrightness(color: number, factor: number): number {
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(((color >>> 24) & 0xff) * f);
  const g = Math.round(((color >>> 16) & 0xff) * f);
  const b = Math.round(((color >>> 8) & 0xff) * f);
  return ((r << 24) | (g << 16) | (b << 8) | (color & 0xff)) >>> 0;
}

export interface AwayGlossOptions {
  gloss?: number; // AwayJS MethodMaterial gloss (Phong exponent)
  specular?: number; // AwayJS light.specular multiplier
  specularColor?: number; // Flight specular color 0xRRGGBBAA
}

// Bakes AwayJS's material gloss + light.specular multiplier into a Flight BlinnPhongMaterial. AwayJS drives
// specular strength from the light, which Flight has no equivalent for, so it folds into the specular color
// here — clamped to white, since a >1 multiplier can't reflect past full white.
export function applyAwayGloss(material: BlinnPhongMaterial, opts: Readonly<AwayGlossOptions> = {}): void {
  material.shininess = (opts.gloss ?? 50) * PHONG_TO_BLINN_SHININESS;
  material.specular = scaleColorBrightness(opts.specularColor ?? 0xffffffff, opts.specular ?? 1);
}

export interface AwayLightTuning {
  // Flight-specific art direction layered on the AwayJS→Flight conversion — the demo still declares the true
  // AwayJS values; only this block bridges Flight's linear/energy-correct shading to AwayJS's gamma-space
  // look. `diffuse`/`ambient` scale the converted intensities; `ambientColor` overrides the fill color in
  // Flight space (an sRgb ambient can read differently once linearized). All default to a no-op.
  diffuse?: number;
  ambient?: number;
  ambientColor?: number;
}

export interface AwayDirectionalLightOptions {
  direction: Vector3Like;
  color?: number;
  diffuse?: number;
  ambient?: number;
  ambientColor?: number;
  shading?: AwayShadingModel;
  tuning?: AwayLightTuning;
}

export interface AwayDirectionalLightResult {
  directional: DirectionalLight;
  ambient: AmbientLight;
}

export function createDirectionalLightFromAway(
  opts: Readonly<AwayDirectionalLightOptions>,
): AwayDirectionalLightResult {
  const color = opts.color ?? 0xffffff;
  const diffuse = opts.diffuse ?? 1;
  const ambient = opts.ambient ?? 0;
  const ambientColor = opts.tuning?.ambientColor ?? opts.ambientColor ?? 0xffffff;
  const diffuseScale = opts.tuning?.diffuse ?? 1;
  const ambientScale = opts.tuning?.ambient ?? 1;
  const shading = opts.shading ?? DEFAULT_SHADING_MODEL;

  return {
    directional: createDirectionalLight({
      direction: opts.direction,
      color: awayLightColor(color),
      intensity: awayIntensity(diffuse, shading) * diffuseScale,
    }),
    ambient: createAmbientLight({
      color: awayLightColor(ambientColor),
      intensity: awayIntensity(ambient, shading) * ambientScale,
    }),
  };
}

export interface AwayPointLightOptions {
  color?: number;
  diffuse?: number;
  range: number;
  shading?: AwayShadingModel;
  // AwayJS point lights deliver constant brightness across their range. Flight uses inverse-square
  // falloff (brightness = intensity / d²). To match the AwayJS look at a chosen distance, set
  // referenceDistance — the Flight intensity is scaled by d² so both engines agree at that distance.
  // Objects closer than referenceDistance will be brighter, objects farther will be dimmer — this is
  // physically correct but different from AwayJS's flat model. Omit to pass intensity through without
  // inverse-square compensation (the original behaviour).
  referenceDistance?: number;
}

export function createPointLightFromAway(opts: Readonly<AwayPointLightOptions>): PointLight {
  const color = opts.color ?? 0xffffff;
  const diffuse = opts.diffuse ?? 1;
  const shading = opts.shading ?? DEFAULT_SHADING_MODEL;
  const d = opts.referenceDistance;
  const falloffScale = d != null ? d * d : 1;

  return createPointLight({
    color: awayLightColor(color),
    intensity: awayIntensity(diffuse, shading) * falloffScale,
    range: opts.range,
  });
}

export { awayIntensity };
