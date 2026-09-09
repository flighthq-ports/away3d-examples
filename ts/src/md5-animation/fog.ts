import type { GlRenderEffectRunner, ScreenSpaceFogEffect } from '@flighthq/sdk';
// These three are not on the @flighthq/sdk barrel — writing a custom effect runner needs the GL
// plumbing directly, so effects-gl and render-gl are real dependencies of this example and are
// declared as such in package.json. They must be upgraded in lockstep with the sdk: upgrading the sdk
// alone leaves these pinned to the older prerelease, npm nests a second @flighthq/types under the sdk,
// and the duplicate module makes the sdk's star re-exports ambiguous — which silently drops exported
// bindings at bundle time rather than failing loudly.
import { getGlEffectProgram, getGlEffectUniformLocation } from '@flighthq/effects-gl/contract';
import { drawGlFullscreenPass } from '@flighthq/render-gl/contract';

export const backgroundAwareFogEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  const fogEffect = effect as ScreenSpaceFogEffect;
  const packed = fogEffect.color ?? 0xc8d2dcff;
  const red = ((packed >>> 24) & 0xff) / 255;
  const green = ((packed >>> 16) & 0xff) / 255;
  const blue = ((packed >>> 8) & 0xff) / 255;
  const depthTexture = ctx.sceneDepthTexture;
  const program = getGlEffectProgram(ctx.state, 'md5.backgroundAwareFog', BACKGROUND_AWARE_FOG_FRAGMENT_SOURCE);
  const inputs = depthTexture ? [ctx.source.texture, depthTexture] : [ctx.source.texture];

  drawGlFullscreenPass(ctx.state, program, inputs, ctx.dest, (gl, compiled) => {
    gl.uniform3f(getGlEffectUniformLocation(ctx.state, compiled, 'u_fogColor'), red, green, blue);
    gl.uniform1f(getGlEffectUniformLocation(ctx.state, compiled, 'u_density'), fogEffect.density ?? 1);
    gl.uniform1f(getGlEffectUniformLocation(ctx.state, compiled, 'u_near'), fogEffect.near ?? 0);
    gl.uniform1f(getGlEffectUniformLocation(ctx.state, compiled, 'u_far'), fogEffect.far ?? 1);
    gl.uniform1f(getGlEffectUniformLocation(ctx.state, compiled, 'u_hasDepth'), depthTexture ? 1 : 0);
  });
};

const BACKGROUND_AWARE_FOG_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec3 u_fogColor;
uniform float u_density;
uniform float u_near;
uniform float u_far;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec4 color = texture(u_texture0, v_texCoord);
  float fog;
  if (u_hasDepth > 0.5) {
    float depth = texture(u_texture1, v_texCoord).r;
    if (depth >= 1.0) {
      // The skybox does not write depth. Preserve those cleared-depth pixels while nearby geometry
      // fades fully into the matching horizon colour before it reaches the camera's far clip.
      fog = 0.0;
    } else {
      float distance = clamp((depth - u_near) / max(u_far - u_near, 1e-4), 0.0, 1.0);
      fog = clamp(1.0 - exp(-u_density * distance), 0.0, 1.0);
    }
  } else {
    fog = clamp((1.0 - v_texCoord.y) * u_density, 0.0, 1.0);
  }
  o_color = vec4(mix(color.rgb, u_fogColor, fog), color.a);
}`;
