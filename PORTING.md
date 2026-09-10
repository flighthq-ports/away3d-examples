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

- **Planar reflection capture:** closed, but NOT by reflecting the camera. `reflectCamera3DByPlane`
  and `applyObliqueNearClipPlane` both exist and work, yet they do not compose with
  `drawGlScene3D`: a reflected view matrix mirrors handedness, so every triangle arrives with its
  winding reversed, and `glMeshProgram` chooses the front-face convention per mesh from the WORLD
  matrix alone (`isMirroringWorldMatrix(proxy.worldMatrix.m)`), which a reflected camera leaves
  untouched. It also rewrites `gl.frontFace` on every draw, so setting it from application code is
  overwritten before the first triangle, and there is no pass-level or camera-level override.

  The visible failure is that the surfaces the reflection should show get culled: flat ground
  disappears entirely and only the steeper slopes survive, as torn ribbons with the skybox through
  the gaps. Disabling culling (`doubleSided`) does not fix it — those surfaces then draw as back
  faces and shade black. Both symptoms are the same bug.

  `planar-reflections` therefore mirrors the SCENE instead: it flips `scene.root` through the
  mirror plane (`scale.z = -1`, `position.z = 2 * MIRROR_Z`) and renders with the ordinary camera.
  The projection is identical, but now the world matrices genuinely mirror, `isMirroringWorldMatrix`
  sees it, and the renderer flips the winding itself. The directional light is mirrored with the
  scene so reflected shading matches. The environment cannot be mirrored by a node transform, so the
  skybox alone is still drawn with `reflectCamera3DByPlane` — consistent, because the reflected
  camera's view of the real world and the real camera's view of the mirrored world are the same
  projection. A custom-shader material samples the render texture by screen position
  (`gl_FragCoord.xy / u_resolution`), and the mirror is hidden for the pass so it cannot reflect
  itself.

  Clipping at the mirror plane still uses `nearClipPlane`, now on the ordinary camera, with the
  normal pointing along +Z (reflections live BEHIND the glass) and the plane expressed in that
  camera's view space; it is reset to `null` after the pass so the main render is unaffected.
  Requires SDK 0.5.1-next.1056 or newer.

  *Worth raising upstream:* the reflection primitives are advertised for exactly this use, but the
  GL mesh path cannot be told that a pass is mirrored. A `frontFaceOverride` on the draw call, or
  folding the view matrix's determinant into the `isMirroringWorldMatrix` test, would make
  `reflectCamera3DByPlane` usable as documented.

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

## Comparing against the original (ground truth)

The Haxe originals build and run headless, which is the only reliable way to settle "is this
faithful?" questions — several defects below were found only by putting the two side by side, and
two earlier conclusions of mine were wrong until I did.

```sh
sudo apt-get install -y haxe                 # 4.3.7 + neko
haxelib setup /tmp/haxelib
haxelib install lime && haxelib install openfl && haxelib install away3d
git clone --depth 1 https://github.com/openfl/away3d-samples.git
cd away3d-samples/intermediate/PlanarReflections && echo n | haxelib run lime build html5
# serve Export/html5/bin and screenshot it with the same Playwright/SwiftShader setup as the port
```

Compare by measuring, not by eye: probe the same pixel row/column in both screenshots and diff the
positions of strong transitions (the terrain skyline is a good signal). That is how the heightmap
flip below was confirmed — the skyline moved from 106/66, 79/55, 65/16 (original/port) to
106/106, 79/72, 65/62 once fixed.

### Elevation heightmap row was mirrored in Z (fixed)

Away3D's `Elevation.buildGeometry` samples one texel per vertex at column `xi * (mapW - 1)/segW`
and row `(segH - zi) * (mapH - 1)/segH`. That row counts DOWN as Away3D z rises. These ports negate
z against Away3D, so the row has to count UP with Flight z — but all four terrain samples sampled
`1 - v`, which mirrored the entire terrain front-to-back. It was easy to miss because a mirrored
dune field still looks like a plausible dune field; it only became obvious against the original.

Fixed in `planar-reflections`, `terrain-demo`, `real-time-env-map` and `fractal-tree-demo`. Note
the port also scaled by `mapW`/`mapH` where Away3D scales by `mapW - 1`/`mapH - 1`, and Away3D
truncates (`Std.int`), so the ports now use `Math.floor(v * (mapH - 1))`.

### Away3D `moveForward` + `rotationY` invert under the Z negation (fixed)

These ports negate Away3D's z. That reverses **two** things at once for any object steered the
Away3D way — the sense of a rotation about Y, and the world direction the mesh's local +Z points
in — so both the accumulated heading and the translation step have to be negated. Getting only one
of them produces a robot that drives in the direction it is *not* facing; getting neither, as
`planar-reflections` and `real-time-env-map` both did, produces controls that are exactly backwards
(forward drives away, left steers right). The same sign rule applies to any fixed `rotationY` taken
from an original: `real-time-env-map` sets `head.rotationY = -90`, which is `+Math.PI / 2` here.

Verified against the original: holding W drives R2D2 toward the camera in both, and A takes the
heading from 0 to +31.4 degrees, rotating the forward vector from -Z toward -X — a left turn.

### Live environment capture and an Environment skybox contend for one slot

`real-time-env-map` renders a live cube capture and bakes it as the scene IBL. The PBR path accepts
a baked IBL only while its stamped revision still matches the runtime's:

```js
// glLitProgram.js
const ibl = runtime.ibl?.environmentSourceRevision === runtime.environmentSourceRevision ? runtime.ibl : null;
```

`bakeGlEnvironmentCaptureIbl` destroys the environment source cube (bumping that revision) and
`drawGlEnvironmentSkybox` rebuilds it (bumping it again), so the two features fight over a single
runtime slot. The practical consequences, both of which cost every PBR surface its ambient term and
render the reflective head pure black:

- the bake must come **after** the skybox draw and before the lit draws — hence the `onBeforeScene`
  hook in that sample's `renderer.ts`;
- it must run on **every** frame. Capturing every N frames leaves the IBL stale on the other N-1,
  so the head flickers black — and a screenshot almost always catches a bad frame, which is exactly
  how this was initially misdiagnosed as "the capture produces a black cube". Reading a pixel back
  out of a captured face (it was correctly full of sky and sand) is what ruled that out.

Away3D has no equivalent problem because its `SkyBox` is an ordinary scene node, so
`reflectionTexture.render(view)` picks it up for free. Flight's skybox is not in the scene graph, so
the six faces are driven by hand here in order to draw the sky into each one.

*Worth raising upstream:* `GlEnvironmentCaptureOptions` has no way to include an environment in the
capture, and the capture/skybox revision contention is invisible to callers — it fails silently, as
a lighting term quietly dropping out.

### Deliberate deviation: planar-reflections uses a daytime sky

The original pairs the `space_*` starfield with `FogMethod(0, 2000, 0x100215)`, but its desert is
lit by a warm sun and renders bright — a night sky never agreed with it, and the mirror made the
mismatch plain by putting dark sky beside lit ground. The port uses the `sky_*` faces Away3D ships
with `RealTimeEnvMap` (same desert asset set) and the fog colour Away3D pairs with them there,
`0x5f5e6e`. This also fixes R2D2 reading as murky grey: its IBL had been a black starfield.

### HoverController.wrapPanAngle matters wherever the pan target comes from atan2

`shared/camera.ts` eases the applied pan toward the target (`currentPan += (panAngle - currentPan)
/ (steps + 1)`), so a target that wraps makes the camera glide the long way round. Any sample that
drives `panAngle` from `atan2` — `real-time-env-map` follows R2D2 with
`cameraController.panAngle = 90 - 180*atan2(r2d2.z, r2d2.x)/PI` — jumps 2*PI at the branch cut and
spins backwards once per lap. `AwayOrbitOptions.wrapPanAngle` reproduces AwayJS's
`HoverController.wrapPanAngle`: it rebases the applied angle onto the nearest equivalent of the
target so every step is a short one. Off by default, as in AwayJS.

Measured over a simulated lap, the worst per-frame swing in the direction the camera actually
faces drops from 38.65 degrees to 9.18 degrees. Measure the *facing*, not the raw number — a 2*PI
jump in the stored angle is visually identical, and grading the raw value reports the fix as a
regression.

### Where the real-time env map's frame time goes

Instrumented with a `gl.finish()` on both sides of each half: the six face renders cost ~44ms and
the IBL bake ~0.3ms. The expensive part is re-rendering all 178k triangles six times, not the
bake — so the two are now on separate cadences. The bake still runs every frame (it must, or the
IBL goes stale and the head blacks out), while the faces refresh every `CAPTURE_FACE_INTERVAL`
frames. Under software rendering, where the main pass dominates, that took the mean frame from
1717ms to 1357ms; on a GPU the capture is a larger share of the frame, so expect more.

### A mirror can be two-sided even though the original's is not

The original's mirror is a single-sided plane and simply vanishes from behind. Reflecting the
scene through the plane is normal-agnostic, so the only thing that has to change with the viewer's
side is the oblique clip: the half-space to keep is always the one the camera is NOT in. In view
space the camera sits at the origin, so it is on the normal's side exactly when `dot(N, P) < 0` —
flipping the normal there makes the panel reflect correctly from either face for no extra pass.

## Polar bear (fixed against the built original)

- **Fog.** The colour was passed as raw sRGB (`0x5f5e6eff`) where the effect consumes LINEAR, and
  the window was an ad-hoc `near: 0.96, far: 1, density: 3`. Together they washed the whole frame
  to pale lilac. Now linearised, with the window derived from the original's `FogMethod(0, 3000)`
  through the same depth curve the depth buffer uses.
- **Lighting.** `DirectionalLight(-1, -0.4, 1)` was passed as a raw literal instead of through
  `awayDirection()`, so the sun sat on the wrong side. That also flattened the snow, whose relief
  is entirely normal-mapped, and it is why the bear had no shadow to speak of.
- **Shadow.** The shadow pass was handed `scene.root`, which makes the 50000x50000 ground a caster
  lying exactly on the receiving surface; the bear's shadow was lost in the ground's own
  self-shadowing. Only the bear casts now, and the shadow volume follows him (the original uses
  `NearDirectionalShadowMapper(0.5)` to keep the map near the subject for the same reason).
- **The bear never moved.** He only turned. The AWD walk and run clips carry their travel on
  channel 0, a three-component translation track, and `applyAnimationClipToScene3D` does not apply
  it — its target does not resolve to a scene node, so nothing moved and nothing double-counts
  either. `createAnimationRootMotionExtractor` on that channel gives the per-step delta, which is
  scaled by the mesh (45) and turned by the bear's heading. Measured 0.572 units/step at the
  clip's own rate, about 257 world units/second at walk speed.
- **The camera never followed.** The port orbited a fixed point. The original binds no mouse
  listeners at all: the camera stands at (0, 500, 0) and a `LookAtController` tracks the bear, so
  he genuinely shrinks into the distance as he walks away. Replaced with a fixed eye and a
  per-frame look-at.
- Text is the original's two lines, and the AwayStats stand-in is top right (this sample moves it
  in `onResize`, like RealTimeEnvMap).

### Screen-space fog cannot spare the skybox

Away3D's `FogMethod` is a MATERIAL method, so its skybox is never fogged and stays crisp. Flight's
fog is a post effect over the depth buffer with no background skip:

```glsl
float d = clamp((depth - u_near) / max(u_far - u_near, 1e-4), 0.0, 1.0);
fog = clamp(1.0 - exp(-u_density * d), 0.0, 1.0);
```

The skybox sits at depth 1.0, so it always takes the full ramp, and distant ground sits at
essentially the same depth (0.997 at 3000 units against 1.0) — no window can fog one and spare the
other. The sample keeps what the fog does to the sky mild rather than pretending to hide it.
*Worth raising upstream:* a background skip, or a max-depth cutoff, would let a port reproduce
Away3D's per-material fog.

### SDK 1059: one of the two capture fixes lands, one constraint remains

`GlEnvironmentCaptureOptions.environment` works — `real-time-env-map` no longer drives six cube
faces by hand. The IBL revision change did NOT lift the ordering constraint, though. Measured on
1059, with the capture otherwise unchanged:

| bake position | bake cadence | reflective head |
| --- | --- | --- |
| after the skybox draw (`onBeforeScene`) | every frame | correct |
| after the skybox draw | every 4th frame | black |
| before `ctx.render` | every frame | black |

So `bakeGlEnvironmentCaptureIbl` must still be the last thing to touch the revision before the lit
draws, and must still run on every frame. The face renders are the expensive half (~44ms against
~0.3ms), so those alone are throttled and the bake stays per-frame.
