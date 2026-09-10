import type { GlRenderState } from '@flighthq/sdk';
import { registerGlCustomShaderMaterial, registerGlCustomMaterialShader } from '@flighthq/sdk';

// The mirror samples a reflection that was rendered from a camera reflected through the mirror
// plane, at the same resolution and projection as the main view. Because the two share a
// projection, the correct texel for a mirror fragment is simply the one at its own screen
// position, so the lookup is gl_FragCoord over the viewport size rather than a mesh UV.
//
// The original is ColorMaterial(0x000000, 0.9) with a PlanarReflectionMethod layered on top: a
// black panel with the reflection added over it, which is what the tint below reproduces.
export function registerMirrorShader(state: GlRenderState): void {
  registerGlCustomShaderMaterial(state);
  registerGlCustomMaterialShader(state, 'planarMirror', {
    vertex: `#version 300 es
layout(location = 0) in vec3 a_position;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}`,
    fragment: `#version 300 es
precision highp float;
uniform sampler2D u_reflection;
uniform vec2 u_resolution;
uniform float u_strength;
out vec4 o_color;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 reflection = texture(u_reflection, uv).rgb;
  o_color = vec4(reflection * u_strength, 1.0);
}`,
  });
}
