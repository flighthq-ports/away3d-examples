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
| LoadDAE | `load-dae` | Remastered with native COLLADA import |
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
| RealTimeEnvMap | `real-time-env-map` | Remastered with static IBL fallback |
| SpriteSheetAnimation | `sprite-sheet-animation` | Remastered |
| FractalTreeDemo | `fractal-tree-demo` | Remastered |
| MultiPassSponzaDemo | `sponza-demo` | Reused Flight port |
| ShallowWaterDemo | `shallow-water-demo` | Remastered |
| TerrainDemo | `terrain-demo` | Remastered |

## Flight capability gaps (as of SDK 0.5.1-next.1019.1274ec5 — see update below)

The samples keep these gaps visible instead of silently converting the input or dropping the feature:

- **Planar reflection capture:** The scene renderer has no Away3D-style planar reflection texture with
  an oblique clip plane. `planar-reflections` keeps the moving reflected subject and mirror composition
  through an explicit mirrored-scene fallback.
- **Dynamic environment capture:** Flight can upload cube faces and bake static IBL, but it has no
  scene-level helper that renders six views into a live environment cube. `real-time-env-map` uses the
  original sky cube as static IBL while preserving the moving subject and reflective PBR head.

Compressed AWD assets in the Onkba, polar bear, and clock samples are supported. Those examples call
`registerDeflateDecompressor()` before parsing, then use the imported skeleton clips or named clock
meshes directly.

**Update (SDK 0.5.1-next.1047.858b9b6):** the SDK bump this project now uses adds COLLADA import,
local light-probe volumes, and dynamic environment capture. `load-dae` now parses and renders the
original carousel directly with `parseCollada()`, while `light-probes` projects all four source
environment maps into spherical harmonics and interpolates them through a real `LightProbeGrid`.
The real dynamic six-face environment-cube capture pipeline
(`createGlCubeRenderTarget` + `renderGlEnvironmentCapture` + `getGlEnvironmentCaptureTexture`, plus
`getCubeCaptureFaceCamera3D`). The cube-capture pipeline unblocks `real-time-env-map` directly; it is
not a literal oblique-clip-plane planar mirror, so it only partially helps `planar-reflections`. The
remaining gaps above still describe the code as it stands until those samples are integrated.

## Fidelity audit (2026-09-09)

An audit against the real `openfl/away3d-samples` sources (not just the general subject each sample
covers) found that "Remastered" has drifted from "current APIs, same demonstrated technique" toward
"same subject, sometimes a different technique" for several samples. Camera framing, materials, and
lighting are expected to modernize in a remaster and are not fidelity issues by themselves; the items
below are cases where the sample's actual demonstrated technique or a named subsystem was dropped or
replaced with something unrelated, undocumented anywhere until now.

**Invented mechanism — same asset/subject, unrelated technique (fix first):**
- `lines` — original scrolls a simplex-noise terrain with an auto-panning camera and a 500-particle
  additive spark emitter; port is a static orbit-camera grid on a hand-written sin/cos wave with three
  orbiting spheres and no particle system at all.
- `particles` — original's own doc comment: "a random spray of particles emanating from a central
  point," 20000 particles launched outward on random spherical vectors with a 5s respawn loop; port
  pre-scatters 500 particles at fixed positions that only jitter in place — no emission, no travel.
- `sprite-sheet-animation` — original's whole point is the `SpriteSheetAnimator`/`SpriteSheetHelper`
  frame-animation API, plus a pulsing "button" mesh and an autonomous Actuate-tweened camera; port
  draws live Canvas-2D text onto a texture each second (no sprite-sheet machinery at all), has no
  button animation, and uses a static user-drag camera instead of the autonomous tween.
- `particle-trails` — original reuses one `ParticleAnimationSet` across animators with
  `ParticleFollowNode` trailing a moving target (real GPU particle lifecycle: spawn time, velocity,
  fade); port manually overwrites fixed particle positions every frame with a hand-computed spiral —
  no spawn/fade lifecycle, no follow target, a card-suit texture swapped for flat colors.

**Drops a real, named subsystem — undocumented (fix next):**
- `bitmap-font` — drops the 3D rotating text ring (14 meshes on a spinning radial arrangement,
  "THIS IS A TEST") for an unrelated 2D screen-space Lissajous bounce showing different text.
- `uv-animation` — original demonstrates two techniques side by side (continuous scroll vs. keyframed
  `UVAnimationFrame` sequences); port's keyframe half is replaced with more continuous procedural
  motion, dropping the technique the bottom two panels exist to teach.
- `head` — original's stated purpose is subsurface-scattering + Fresnel skin shading with an A/B
  toggle against basic shading; port uses a generic PBR material with no SSS, no Fresnel method, no
  toggle.
- `polar-bear-awd-animation` — drops the original's 3000-particle falling-snow system, skybox, shadow
  mapping, and fog; only the skeletal-clip switching survives.
- `real-time-env-map` — beyond the documented static-IBL swap, also drops the heightmap terrain
  entirely (head and R2D2 float over bare skybox) and replaces WASD physics-driven R2D2 control with a
  scripted auto-orbit.
- `fractal-tree-demo` — the recursive tree-branching technique is genuinely ported, but the original's
  Perlin-noise/splat-blended terrain is replaced with a flat textured plane, and the 25-tree forest
  (demonstrating GPU-efficient cloning) is dropped to a single tree.
- `shallow-water-demo` — the original's namesake technique, a real shallow-water-equations grid solver,
  is replaced with a closed-form sine-ripple formula; the environment-map goal is dropped outright.

**Faithful** (camera/material/lighting modernized, core technique intact): `basic-sprite-sheet`,
`mip-mapping`, `stereo`, `tweening-3d`, `light-probes`,
`onkba-awd-animation`, `planar-reflections` (within the documented capture gap), `terrain-demo`.
The 13 "Reused" samples pulled from `flighthq-ports/awayjs-examples` were not in scope for this audit.
