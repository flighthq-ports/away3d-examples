# Port coverage

The gallery covers every example in `openfl/away3d-samples`. “Reused” means the mature Flight port
from `flighthq-ports/awayjs-examples` was brought across and adapted to this repository. “Remastered”
means the OpenFL sample was implemented directly with current Flight APIs and a current material and
lighting treatment.

| OpenFL sample | Flight sample | Approach |
| --- | --- | --- |
| BasicSpriteSheet | `basic-sprite-sheet` | Remastered |
| BitmapFont | `bitmap-font` | Remastered |
| Fire | `fire` | Reused Flight port |
| Load3DS | `load-3ds` | Reused Flight port |
| LoadAWD | `load-awd` | Reused Flight port |
| LoadDAE | `load-dae` | Remastered with native COLLADA import; see importer defects |
| MipMapping | `mip-mapping` | Remastered |
| Particles | `particles` | Remastered |
| Shading | `shading` | Reused Flight port |
| SkyBox | `skybox` | Reused Flight port |
| Stereo | `stereo` | Remastered |
| Tweening3D | `tweening-3d` | Remastered |
| UVAnimation | `uv-animation` | Remastered |
| View | `view` | Reused Flight port |
| Globe | `globe` | Reused Flight port |
| Head | `head` | Remastered |
| LightProbes | `light-probes` | Remastered with interpolated SH probe grid |
| Lines | `lines` | Remastered |
| MD5Animation | `md5-animation` | Reused Flight port |
| MonsterHeadShading | `monster-head-shading` | Reused Flight port |
| MouseInteraction | `mouse-interaction` | Reused Flight port |
| OnkbaAWDAnimation | `onkba-awd-animation` | Remastered |
| ParticleExplosions | `particle-explosions` | Reused Flight port |
| ParticleTrails | `particle-trails` | Remastered |
| PerelithKnightMD2 | `perelith-knight` | Reused Flight port |
| PlanarReflections | `planar-reflections` | Remastered with mirrored-scene fallback |
| PolarBearAWDAnimation | `polar-bear-awd-animation` | Remastered |
| RealTimeEnvMap | `real-time-env-map` | Remastered with live environment capture |
| SpriteSheetAnimation | `sprite-sheet-animation` | Remastered |
| FractalTreeDemo | `fractal-tree-demo` | Remastered |
| MultiPassSponzaDemo | `sponza-demo` | Reused Flight port |
| ShallowWaterDemo | `shallow-water-demo` | Remastered |
| TerrainDemo | `terrain-demo` | Remastered |

## Flight capability gaps (as of SDK 0.5.1-next.1019.1274ec5 — see update below)

The samples keep these gaps visible instead of silently converting the input or dropping the feature:

- **Planar reflection capture:** closed. `planar-reflections` renders a real reflection.
  `reflectCamera3DByPlane` mirrors the camera through the mirror's world plane; the scene and
  skybox are drawn from that camera into a render texture taken from a `GlRenderTexturePool`; and
  a small custom-shader material samples that texture by screen position
  (`gl_FragCoord.xy / u_resolution`), which is the correct lookup because the reflection shares
  the main view's projection and resolution. The mirror is hidden for the reflection pass so it
  cannot reflect itself, and the winding order is flipped for it because reflecting a camera
  reverses handedness.

  Clipping at the mirror plane is handled too, so geometry behind the mirror cannot leak into the
  reflection: the reflected camera's `nearClipPlane` is set to the mirror plane expressed in that
  camera's view space, and `getCamera3DViewProjectionMatrix4` feeds it through
  `applyObliqueNearClipPlane` internally. Two details matter — the plane must be in VIEW space with
  its normal pointing into the visible half-space (`d = -dot(normal, pointOnPlane)`, which is what
  `setPlaneFromNormalAndPoint` produces), and it has to be assigned AFTER `reflectCamera3DByPlane`,
  which copies `nearClipPlane` from its source camera. Requires SDK 0.5.1-next.1056 or newer.

Compressed AWD assets in the Onkba, polar bear, and clock samples are supported. Those examples call
`registerDeflateDecompressor()` before parsing, then use the imported skeleton clips or named clock
meshes directly.

**Update (SDK 0.5.1-next.1047.858b9b6):** the SDK bump this project now uses adds COLLADA import,
local light-probe volumes, and dynamic environment capture. `load-dae` now parses and renders the
original carousel directly with `parseCollada()`, while `light-probes` projects all four source
environment maps into spherical harmonics and interpolates them through a real `LightProbeGrid`.
`real-time-env-map` uses the new six-face pipeline (`createGlCubeRenderTarget` +
`renderGlEnvironmentCapture` + `bakeGlEnvironmentCaptureIbl`) to update the reflective head from the
live terrain and moving R2D2 scene. Cube capture is not a literal oblique-clip-plane planar mirror, so
it does not close the remaining `planar-reflections` gap.

## Fidelity audit (2026-09-09)

An audit against the real `openfl/away3d-samples` sources (not just the general subject each sample
covers) found eleven places where a remaster had replaced the demonstrated technique or dropped a
named subsystem. Those gaps are now corrected:

- `lines`, `particles`, and `particle-trails` use Flight particle lifecycles for the original spray,
  sparks, and moving-target trails; `lines` also restores scrolling simplex terrain and its autonomous
  camera.
- `sprite-sheet-animation` selects frames from generated digit, delimiter, and pulse atlases, including
  the animated button and autonomous camera, rather than redrawing live text into textures.
- `bitmap-font` renders fourteen real textured 3D text meshes as the original flat radial signs and
  restores its desktop mouse-idle dimming overlay.
- `uv-animation` keeps its continuous upper pair and restores the two explicit lower keyframe clips.
- `head` provides the original A/B shading comparison through wrapped subsurface diffuse and PBR
  Fresnel/specular extensions versus a basic material.
- `polar-bear-awd-animation` restores the 3,000-particle snow field, visible sky environment, shadow
  map, depth fog, and keyboard animation controls.
- `real-time-env-map` restores the heightmap desert, keyboard vehicle physics, following camera, and
  live six-face environment capture.
- `fractal-tree-demo` places twenty-five GPU-instanced copies of the generated tree across elevated,
  three-layer splat-composited terrain.
- `shallow-water-demo` now advances displacement and velocity grids with a fixed-step finite-difference
  shallow-water solver; pointer and rain impulses propagate through the field, and the snow environment
  is visible and reflected by the water.

## Upstream asset and importer defects

The original PolarBear and tictac AWD files tag their tightly packed 16-bit triangle-index streams as
32-bit. Away3D ignores that tag and always reads these indices as unsigned shorts, while Flight honors
it. The copied assets normalize those stream tags to 16-bit so both standalone samples render. Run
`npm run normalize:awd-indices` after refreshing either asset from upstream. Flight's AWD parser also
uses an external texture block's display name instead of its URL payload; `sprite-sheet-animation`
therefore assigns its shipped textures explicitly while that importer gap remains.

Flight's COLLADA importer has three defects that `load-dae` currently renders around rather than
hides. Against `hobbelpaard.dae`, whose geometry carries a `TEXCOORD` input (`shape0-lib-map`,
22,860 floats) and two `<triangles>` groups of 3,366 and 444 triangles bound to `material0` and
`material1`:

- **`TEXCOORD` is not read.** The imported mesh carries a `uv0` attribute whose values are all zero,
  so every vertex samples one texel and the horse renders as flat colour despite its wood texture
  resolving correctly. This is the visible symptom; the model is not actually untextured.
- **Only the first `<triangles>` group is imported.** The mesh arrives with a single 3,366-triangle
  subset, so the 444-triangle `material1` group is missing from the scene entirely.
- **`instance_material` bindings do not resolve.** Both bindings emit
  `collada.missing-reference` diagnostics, so the two parsed materials are never bound per subset.

The document-level parse is otherwise sound — both materials are built with their `baseColorMap`
textures resolved. These are engine-side gaps, not sample workarounds waiting to be written: papering
over them in the sample would mean re-implementing the parser.

**Faithful** (camera/material/lighting modernized, core technique intact): `basic-sprite-sheet`, `bitmap-font`,
`fractal-tree-demo`, `head`, `lines`, `mip-mapping`, `particle-trails`, `particles`,
`polar-bear-awd-animation`, `shallow-water-demo`, `sprite-sheet-animation`, `stereo`,
`tweening-3d`, `uv-animation`, `light-probes`,
`onkba-awd-animation`, `planar-reflections` (within the documented capture gap),
`real-time-env-map`, `terrain-demo`.
The 13 "Reused" samples pulled from `flighthq-ports/awayjs-examples` were not in scope for this audit.
