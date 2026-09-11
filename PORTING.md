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

## AwayFPS audit (2026-09-09)

Every original `Source/Main.hx` was checked for an `AwayFPS` constructor. Five samples create the
debug readout; all five place it at `(10, 10)` in white. Their Flight ports show FPS over a rolling
one-second window and derive PLY from the live geometry being drawn. The other 28 ports intentionally
omit it.

| Original source | Flight sample | AwayFPS |
| --- | --- | --- |
| `basic/BasicSpriteSheet` | `basic-sprite-sheet` | No |
| `basic/BitmapFont` | `bitmap-font` | Yes |
| `basic/Fire` | `fire` | No |
| `advanced/FractalTreeDemo` | `fractal-tree-demo` | No |
| `intermediate/Globe` | `globe` | No |
| `intermediate/Head` | `head` | No |
| `intermediate/LightProbes` | `light-probes` | No |
| `intermediate/Lines` | `lines` | Yes |
| `basic/Load3DS` | `load-3ds` | No |
| `basic/LoadAWD` | `load-awd` | Yes |
| `basic/LoadDAE` | `load-dae` | Yes |
| `intermediate/MD5Animation` | `md5-animation` | No |
| `basic/MipMapping` | `mip-mapping` | Yes |
| `intermediate/MonsterHeadShading` | `monster-head-shading` | No |
| `intermediate/MouseInteraction` | `mouse-interaction` | No |
| `intermediate/OnkbaAWDAnimation` | `onkba-awd-animation` | No |
| `intermediate/ParticleExplosions` | `particle-explosions` | No |
| `intermediate/ParticleTrails` | `particle-trails` | No |
| `basic/Particles` | `particles` | No |
| `intermediate/PerelithKnightMD2` | `perelith-knight` | No |
| `intermediate/PlanarReflections` | `planar-reflections` | No |
| `intermediate/PolarBearAWDAnimation` | `polar-bear-awd-animation` | No |
| `intermediate/RealTimeEnvMap` | `real-time-env-map` | No |
| `basic/Shading` | `shading` | No |
| `advanced/ShallowWaterDemo` | `shallow-water-demo` | No |
| `basic/SkyBox` | `skybox` | No |
| `advanced/MultiPassSponzaDemo` | `sponza-demo` | No |
| `intermediate/SpriteSheetAnimation` | `sprite-sheet-animation` | No |
| `basic/Stereo` | `stereo` | No |
| `advanced/TerrainDemo` | `terrain-demo` | No |
| `basic/Tweening3D` | `tweening-3d` | No |
| `basic/UVAnimation` | `uv-animation` | No |
| `basic/View` | `view` | No |

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
- **The root motion was applied twice.** The walk and run clips animate `ZeroJoint`, the
  skeleton's root, by about 6.2 units a cycle — that IS the bear's travel. Left in the pose it
  carries the whole bear forward inside his container and snaps back when the clip loops, so with
  the mesh also accumulating the same delta the bear slid ahead of himself and reset while the
  container crept along. Away3D lifts that motion off the pose onto the mesh
  (`SkeletonAnimator.updatePosition`); the port now does the same by pinning the joint's x and z
  back to their bind values every frame, after the clip is applied and before the skin is
  evaluated. Y is left animated so the body still rises and falls with the gait.

  This hid behind a bad probe for two rounds. The probe that "proved" no joint translated built a
  map keyed by node NAME — and the carrier's name collided with other unnamed nodes under a single
  `'?'` key, so it was overwritten before the comparison. Keying by index found it immediately.
  `channel.targetRef` is `{node, path}`, not the node, so identity comparisons against it also
  fail silently.

- **The walk reset every cycle.** `extractAnimationRootMotion` documents its range as *unwrapped*
  — "times may cross any number of repeat boundaries or run backward" — but it was being handed
  `player.time`, which wraps to zero every cycle. Each loop therefore looked to it like a jump back
  to the start of the clip, and it answered with a whole cycle of travel in reverse: the bear crept
  forward for five frames, snapped back to where he started, and repeated. The controller now keeps
  its own monotonic clock (`unwrappedTime += dt * player.speed`) and passes that. Reverse playback
  then falls out for free, because the same call accepts a decreasing range — which retired an
  earlier two-piece workaround for backing up across the loop point.

  The lesson is narrow and worth keeping: a wrapped playhead and an unwrapped clock are not
  interchangeable, and the failure is silent — steady-state frames look perfect and only the frame
  at the loop boundary is wrong.

- **Forward was inverted, and backing up lurched.** Two separate bugs on top of the missing
  motion below. First, the delta was rotated with the sign flipped: this model's forward is local
  +Z (at heading 0 he faces the camera, which sits on +Z from him), so it needs a plain Y
  rotation. Negating it made him moonwalk — walk cycle playing while travelling backwards, every
  key driving him the wrong way. Second, reverse playback: `extractAnimationRootMotion` only reads
  a range FORWARDS, and a backward step that runs past zero wraps to the END of the clip, so
  `endTime` lands ABOVE `startTime`. Swapping the two then hands the extractor a decreasing range,
  which it reads as a wrap and answers with nearly a whole cycle of forward travel — a single
  283-unit lurch the instant S went down, which swamped the correct backward steps that followed.
  A wrapped reverse step is summed in two pieces instead. Test the SPEED SIGN, never the
  timestamps: a wrapped reverse step is indistinguishable from a forward wrap by ordering alone.

  Verified numerically at heading 0 (he faces the camera, so forward raises z toward 0):
  W steps +25.75/frame with z rising, S steps -25.75/frame with z falling and no first-frame
  spike, A raises the heading (his left), D lowers it, and at the default 45 degrees W moves +x
  and +z together — along the facing. Held for 22 seconds, travel is monotonic with no reset:
  (0, -1000) to (1707, 707) walking, and Shift runs at a longer stride as RUN_SPEED intends.

- **The bear never moved at all.** He only turned. The AWD walk and run clips carry their travel on
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

## Fractal tree demo

### The upstream OpenFL demo shows no tree at all

Not a porting mistake — the Flash original drove everything from a `SimpleGUI` panel, and the
OpenFL port has that whole block commented out in `initGUI()`. `generateTree` and `generateClones`
are referenced **only** from inside the commented-out block, so nothing ever calls them and the
demo renders an empty terrain. There is no running original to compare against; the port is built
from the source's intent instead.

That intent is legible in the numbers. `FractalTreeRound(width 1000, height 10, stretching 3, ...,
level 10)` builds its first box from a 1000-unit square and makes it `height` times as tall — a
10000-unit trunk — after which each level is only `stretching` times its own rapidly shrinking
side, summing to roughly 4500 more. So one tall tree about 15000 units high, at the origin, framed
by a camera 25000 away: `generateTree()` places that one, and `generateClones()` scatters 24 more
across the whole terrain (`terrainWidth*random() - terrainWidth/2`).

The port had the tree at about 1280 units total and bunched the clones into the middle 82% of the
terrain, which read as scrub with trunks crowding the camera.

### An instanced mesh holds at most MAX_TEXTURE_SIZE / 4 instances

This is the trap that hid the forest. `uploadGlSkinPaletteTexture` uploads instance matrices as a
**single-row** RGBA32F texture, four texels per instance:

```js
const width = jointCount * texelsPerJoint;
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, 1, 0, gl.RGBA, gl.FLOAT, jointMatrices);
```

So one instanced mesh caps at `MAX_TEXTURE_SIZE / 4` — 4096 on a typical GPU, 2048 under
SwiftShader. Exceed it and the upload fails with `GL_INVALID_OPERATION: glTexSubImage2DRobustANGLE:
Level of detail outside of range`, after which **the entire mesh silently draws nothing**. At 94
branches x 25 trees the port sat at 2350: over the software limit (so the trees never appeared in
any headless capture) and just under the hardware one (so they did appear on a real GPU). The
sample now reads `MAX_TEXTURE_SIZE` at startup and spreads instances over as many meshes as the
limit requires, so the count is no longer bounded by it.

*Worth raising upstream:* a wrapped, multi-row palette would lift this entirely, and the failure
should not be silent.

## Head

The upstream OpenFL demo does not run: Away3D's AGAL compiler throws `Error: Register overflow!`
from `RegisterPool.requestFreeVectorReg` while compiling the head material, and the sample renders
an empty stage with `POLY: 0`. As with the fractal tree, the port is built from the source rather
than from a running original.

What the source asks for: one `PointLight` at x 15000, z 15000, colour 0xffddbb, `ambient = 1`,
with `ambientColor 0x303040` and `ambient 1` on the material; `SubsurfaceScatteringDiffuseMethod`
with `scattering = 0.05`, and `FresnelSpecularMethod`; `HoverController(45, 10, 800)`; no
instructions overlay at all, just `AwayStats`, which `onResize` never moves — so top left.

Fixed in the port:

- The light **orbited the head** on a timer. The original's is static. It was also unpositioned in
  world terms until that timer ran.
- Ambient was 0.08 and untinted against the original's `0x303040` at full strength. Combined with
  the point light that left the diffuse term so weak the specular carried the image.
- Subsurface strength was 0.72 where the original scatters at 0.05 — the head came out lurid
  orange rather than warm.
- The invented instructions line is gone and the AwayStats stand-in (FPS/PLY) added, top left.

### Binding a texture to SpecularPbrExtension darkens the surface

The "beard" was this. The head's specular map paints the stubble and eyebrows black — correct
content, marking skin that is not shiny — but binding it produced hard black patches there instead.

Narrowed down by bisection:

| configuration | result |
| --- | --- |
| `specularMap` (sampled `.a`) bound | black stubble and eyebrows |
| `specularColorMap` (sampled `.rgb`) bound | identical black |
| no map, uniform `specularColor: 0x000000` (f0 = 0 everywhere) | **shades correctly** |
| map bound with `specular: 0`, extension contributing nothing | **still black** |
| specular extension alone, no wrapped-diffuse extension | still black |
| no map bound | correct — soft stubble from the diffuse map |

So it is not an f0 effect and not an interaction between extensions: merely binding a texture to
the extension darkens the base surface wherever that texture is dark, even when the extension is
told to contribute nothing. That reads like a texture-unit collision between the extension's
sampler and a core PBR sampler. *Worth raising upstream* — with this repro. Meanwhile the sample
leaves the map unbound; the stubble still reads, because it is painted into the diffuse map too.

Also worth noting for other ports: Away3D specular maps are grayscale RGB, while
`SpecularPbrExtension.specularMap` follows glTF and samples **alpha**, which a JPEG does not have.
`specularColorMap` is the RGB-reading slot.

## Load DAE

The original builds the room in code, not from the COLLADA file: a 2500x2500 carpet plus **four**
walls, each a 2500x2500 plane standing on a shared template (`rotationX = -90`, `y = 1250`) and
turned into place by its own `rotationY`. There is no ceiling.

### Two walls lay flat as a ceiling

The port collapsed those two rotations into a single axis-angle per wall, and for the two side
walls it picked the **Y** axis — which leaves a horizontal plane horizontal. Instead of standing at
x = +/-1250 they lay flat at y = 1250, so the room lost two walls and gained a lopsided ceiling
made of them.

Standing them up about Z instead fixes the geometry but rotates the UVs with the wall, which lays
the wallpaper's stripes on their side. The fix keeps the original's structure: one shared X
rotation for every wall, with only the yaw differing, composed via
`setQuaternionFromEuler(..., 'YXZ')` because YXZ applies X before Y — the order the original
composes them in. Both angles flip sign against Away3D (mirroring Z negates rotations about X and
Y), and the wall positions on Z negate with them.

### parseCollada merges every `<triangles>` group into one subset

`hobbelpaard.dae` has one geometry with two `<triangles>` groups — 3366 triangles on `material0`
and 444 on `material1`, the black rocker runners and the eye. The import resolves both materials
(`materials.length === 2`, so `instance_material` binding works now), but emits a single geometry
subset spanning all 11430 indices:

```
mesh#0 tris=3810 materials=2 subsets=1 [0+11430]
```

The renderer resolves a material per subset and `MeshGeometry.subsets` exists for exactly this, so
with one subset `materials[1]` is unreachable and the whole model draws with the first material —
the runners came out wood-coloured instead of black. The sample rebuilds the subsets from the
group sizes in the source document; the groups are concatenated in document order, which is what
makes the offsets recoverable, and the runners turning black confirms it.

*Worth raising upstream:* one subset per `<triangles>` group would fix this at the importer, and
it is the last of the three COLLADA defects this port has hit — the other two (TEXCOORD not read,
only the first group imported) are no longer reproducible.

## Particle trails

Three gaps against the original, all found by building it and comparing.

- **The WireframeAxesGrid was missing entirely.** `scene.addChild(new WireframeAxesGrid(10, 1500))`
  draws three grid planes through the origin as `SegmentSet`s, and without them the particles
  float in an empty void with no frame of reference. Rebuilt from the primitive's own defaults
  (`away3d.debug.WireframeAxesGrid`): XY blue `0x0000FF`, ZY red `0xFF0000`, XZ green `0x00FF00`,
  spanning +/-gridSize/2 with `subDivision` steps, inclusive of both bounds — 11 lines per
  direction per plane. The grid is symmetric about the origin on every axis, so the usual Z
  negation does not apply to it.
- **`steps` was passed where the original passes `minTiltAngle`.** `HoverController(camera, null,
  45, 20, 1000, 5)` — the sixth constructor argument is `minTiltAngle`, not `steps`. The port read
  it as the easing step count, which both changed the drag feel and left the tilt unclamped, so
  the camera could swing under the floor grid.
- **No AwayStats readout.** Added, top left, which is where this sample leaves it.

### Why the poly count reads 4000 against the original's 4132

Both are correct for what they draw. The particles are 2 emitters x 1000 particles x 2 triangles =
4000, and the original adds 132 on top: Away3D's `SegmentSet` expands every line segment into a
quad, and the axes grid has 66 of them (3 planes x 22). This port draws the grid as a GL line
list, so those segments are not triangles at all. The particle quads are counted from emitter
capacity rather than from the scene walk, because the emitters are not Mesh nodes.

## Terrain demo

Five gaps against the original, all found by building it and comparing.

- **No skybox.** The assets were in the tree but never loaded; the sky was a flat clear colour and
  the water had nothing to reflect. Now loaded as the snow cube the original uses for both.
- **No fog.** `FogMethod(0, 8000, 0xcfd9de)`, linearised, over a depth-space window. A near plane
  of 1 crushes the depth curve hard — depth(100) is already 0.990 — so the haze window is chosen
  against that curve rather than by transplanting the original's world-linear range.
- **Scene constants had drifted**: terrain 5200 wide at 920 tall with a -80 offset over 128
  segments, against the original's `Elevation(..., 5000, 1300, 5000, 250, 250)` at y = 0; water at
  y = 205 with UVs 24x against 285 and 50x; camera far 9000 / near 5 against 4000 / 1; and the
  terrain-follow offset was +70 where the original uses `+ 20`. With the segment count corrected
  the poly readout is 125002, matching the original exactly.
- **The instructions were invented** and there was no stats readout. Both now match, with the
  readout top right — this sample moves it there in `onResize`.
- **The water never rendered.** Covered below.

### An ARGB literal read as RGBA

Away3D builds the lake from `new BitmapData(512, 512, true, 0xaa404070)`. That is **ARGB**: alpha
`0xaa` over a dark blue-grey `0x404070`. The port read the same digits as RGBA — a bright cyan
`0x3d92b0` at half alpha — and additionally set `metallic: 0.72`, which leaves a metal with
almost no diffuse. Against a pale foggy sky the surface was invisible: not dim, absent.

It took a bisect to see that, because the symptom looked like a missing mesh:

| configuration | result |
| --- | --- |
| water at y = 285 | nothing visible |
| water raised to y = 900, above the camera | still nothing |
| `alphaMode: 'opaque'` | renders clearly — so geometry, position and culling are fine |
| `alphaMode: 'blend'` with alpha 255 | barely visible |
| corrected colour `0x404070aa`, `metallic: 0` | reads as water |

The lesson is the cheap one: when a mesh seems missing, force it opaque before suspecting the
scene graph. Two of these steps would have been unnecessary had I checked the literal's channel
order first — Away3D `BitmapData` colours are ARGB and Flight's are RGBA.

### The water never scrolled: a UV transform only the base colour map can switch on

The original animates its lake every frame — `water1OffsetX += .005`, `water1OffsetY += .007`, and
a second layer at `.003`/`.004` — roughly 0.3 and 0.42 UV/second at 60fps. The port drifted one
layer at 0.025 UV/second, which against UVs tiled 50x is a few thousandths of the pattern per
second: a still surface. But correcting the rate changed nothing, because the offset was never
reaching the shader at all.

The GL PBR path compiles its UV transform in only when the **base colour map** carries one:

```js
// glPbrStandardBlock.js
hasUvTransform: baseColorMap !== null && isGlTextureReady(state, baseColorMap) && hasTextureUvTransform(baseColorMap),
```

and every map then samples the single transformed `v_uv0`. A material with only a normal map
therefore ignores `setTextureUvOffset` entirely, silently. The water now carries a 1x1 white base
colour map purely to switch the transform on, which costs nothing visually and scrolls the
normals with it. Measured over six seconds, the lake region went from 0.0% of pixels changing to
15.1%.

*Worth raising upstream:* the flag is per-material but derived from one specific map, so scrolling
any other map is a no-op with no diagnostic. Deriving it from any transformed map would fix it.

### Fog was burying the sky

The skybox has a sun, clouds and dark peaks, and at density 1 the fog replaced 63% of it with flat
grey — the effect has no background skip, so whatever reaches the far terrain reaches the sky
(documented under the polar bear). Density is held at 0.22 with the window starting close in, so
the clouds and sun read while the mountains keep their haze, and exposure is up from 1.05 to 1.3.
This is a trade the depth-only fog forces, not a faithful reproduction of a material-level fog.

### Still different: the opening vista, and no splat map

Two things this port does not reproduce, both stated rather than papered over.

The original's `TerrainDiffuseMethod` blends beach, grass and rock through a splat map at
per-layer tiling `[1, 50, 150, 100]`; the port uses `terrain_diffuse.jpg` alone, so the ground
lacks close-up detail. Those four assets are present and unused. Reproducing it needs a custom
shader, which would step outside the PBR lighting path the rest of the sample uses.

The opening view also differs: both cameras sit at the same spot and settle onto the terrain, but
ours lands on a ridge looking down at the lake while the original looks out across it. The height
sampling at the origin is 617 either way — the centre texel is flip-invariant, so that test cannot
discriminate — and the row-mapping rule in use here is the one verified against ground truth in
`planar-reflections`, so it was left alone rather than flipped on a hunch.

## Tweening 3D

Matches the original closely. The only change: the port added an instructions line, and the
original has no overlay at all — neither a TextField nor AwayStats.

### Walking clipped through the terrain

Two compounding errors, both in the port. The original's walk settles at `s = (s + walkIncrement)
* drag` with `walkIncrement = 2` and `drag = 0.5`, i.e. **2 units per frame — 120/second at
60fps**. The port ran at 480, or 1050 with a Shift-to-run the original does not have and its own
instructions do not mention. Meanwhile the height follow was *slower* than the original's:
`camera.y += 0.2 * (getHeightAt + 20 - camera.y)` every frame against the port's `seconds * 5`,
which is 0.083 per frame at 60fps — lagging 2.4x further behind rising ground. Moving up to 8.75x
too fast with a follow 2.4x too slow pushed the camera straight through hillsides.

Speed is now the original's 120/second, and the follow is its 0.2-per-frame step written
framerate-independently (`1 - pow(0.8, seconds * 60)`) so it does not slacken when the frame rate
drops. Measured over a 25-second walk, minimum camera clearance above the ground went from
**-125.5** (that far *inside* the hill) to **+12.1**, against a settled target of 20.

Note the camera does still start inside the terrain for a moment: `camera.y = 300` while the
ground at the origin is 617, so the first frames rise out of the hillside. That is the original's
behaviour too and was left alone.

## Sprite sheet animation

The upstream OpenFL demo does not run here: it throws `Invalid code point 4038624` out of the SWF
asset library and renders black. As with the fractal tree and the head, the port is judged against
the source and the shipped art rather than a running original.

### The clock face was a font, not a display

The original builds all three animated sheets at runtime from MovieClips inside `digits.swf`
(`SpriteSheetHelper.generateFromMovieClip`): `digits` at 60 frames over 2 maps of 6x5 at 512,
`pulse` at 12 frames 4x3 at 256 driven back-and-forth at 12fps, and `delimiter` at 5 frames 5x2 at
256 at 6fps.

The port could not read the SWF, so it drew its own sheets — with `ui-monospace` text and a
red-to-amber-to-**cyan** gradient. That is why the clock read as a different clock, and why the
separator looked like an exclamation mark rather than a colon.

The shipped art says plainly what these should look like. `m_hours.jpg`, `m_minutes.jpg` and
`m_seconds.jpg` are placeholders — red seven-segment digits with the element's name and a cross
through them — and `m_delimiter.jpg` is a real texture showing the separator is two horizontal
bars, with the unlit segments still faintly visible beside the lit ones. The sheets are now drawn
as seven-segment LEDs on that model: bright `#ff3a08` segments with a small bloom, unlit segments
at low alpha, and a two-bar colon that pulses.

**Now resolved — the sheets are built from `digits.swf` itself.** Flight reads SWF directly, so
`swfSheets.ts` does what the original does: parse the file, find the named clip, step it frame by
frame with `gotoAndStopMovieClip`, and rasterise each frame into one cell of a sheet. The digits
on screen are the artwork from the SWF, not a redrawing of it. `@flighthq/swf`,
`@flighthq/movieclip`, `@flighthq/scene2d-canvas` and `@flighthq/render` are now direct
dependencies (all were already present transitively at the same version). The parse reports only
`Skip`-severity diagnostics — scene names and an unrepresentable filter field — and the clips come
through with exactly the frame counts the original expects: digits 60, pulse 12, delimiter 10.

Three things about that pipeline cost real time and are worth writing down:

- **`prepareScene2DRender` is required before `renderCanvasScene2D`.** Without it every node is
  skipped — `getRenderProxy2D` returns undefined and the draw loop `continue`s — so the canvas
  comes back empty with no error.
- **Place the clip with `setCanvasRenderTransform2D`, not by assigning `node.x/y/scaleX/scaleY`.**
  A node's transform is captured into a cached render proxy when it is prepared, so mutating the
  node between passes did not reach the draw and produced silently empty frames. The state
  transform is read per draw.
- **Measure at the centre of a large canvas.** A SWF clip's contents sit wherever its own
  coordinate space puts them — the digits clip spans x -41..83, i.e. mostly *left* of its origin —
  and anything outside the canvas is not rasterised, so drawing at 0,0 measured it as a 64px
  fragment in the corner. Measuring the union of all frames (rather than each frame separately)
  is also deliberate: it keeps a `1` in the same place an `8` sits, instead of re-centring every
  frame and making the digits jitter as the clock runs.

### Digits rendered small: a black backdrop inflating the fit

Each clip in `digits.swf` carries a black background shape much larger than the artwork in front
of it. Isolating the children shows the scale of it: in the `digits` clip the backdrop spans
125x64 while the two digit glyphs occupy only `-41..10` horizontally — 52 wide, 41% of the union.
Fitting each cell to the opaque union therefore rendered the digits at 41% of the width they
should have, pushed to one side, with dead black filling the rest.

The sheet builder now measures the **lit** artwork rather than the merely opaque artwork (a pixel
counts when `max(r, g, b) > 24`). The backdrops are black against a black display, so excluding
them costs nothing, and it matches the placeholder textures shipped with the model — `m_hours.jpg`
and its siblings show digits filling their texture.

Frames are also scaled to fill their cell on both axes independently, which is what
`SpriteSheetHelper` does (`sclw = destCellW/mcFrameW; sclh = destCellH/mcFrameH`) — the previous
uniform fit with a margin left the content letterboxed a second time. Because the cell is sized to
the content's aspect first, this stays close to uniform and simply removes the dead margin.

### Deliberate deviation: the clock lights its own room

The faithful lighting below is documented because it explains what the original does, but the
sample no longer uses it. Its conclusion — that only the blue key reaches the clock — also means
the room is lit blue by a lamp that exists nowhere in the scene. At the user's request the sample
now lights the room from the one source it actually contains:

- a dim cool ambient (`0x0c1018`) standing in for night through a window, and
- a warm point light in the LED's own colour (`0xff3a08`) just in front of the display, at
  `(-564, 237, 3800)`. The display face centres on the frontscreen mesh at `(286, 237, 2952)` and
  hours-to-minutes runs along `(0.707, 0, 0.708)`, so the face normal toward the viewer is
  `(-0.708, 0, 0.707)`; the light sits along it, in front of the glass rather than inside the case.

The display meshes are unlit materials, so the digits keep glowing at full strength while the
table and wallpaper fall away into the dark and pick up the red spill. The digits are also inset
to 84% of their cell (`CONTENT_FILL`), because the display quad maps the whole cell and filling it
edge to edge pushes them against the bezel.

Taken further at the user's request: the room is now near black and the light comes off the digit
groups themselves rather than from one lamp in front of the case.

- **Four emitters, one per lit element** — hours, minutes, seconds and the delimiter — each at its
  own mesh position pushed `400` clear of the glass along the face normal, each individually weak
  (`diffuse 0.85`, `range 9000`, `referenceDistance 1100`) so the glow dies within arm's reach.
  Four is the entire forward-light budget (`MAX_FORWARD_LIGHTS = 4`), which is exactly the number
  of lit elements on the clock.
- **Bloom** (`threshold 0.35`, `intensity 1.5`, `radius 1.1`, `passes 4`), registered in this
  sample's renderer. The digits are unlit materials at full texture brightness against a near
  black room, so they are the only thing over the threshold and the bloom reads as the LEDs
  emitting rather than as haze over the image.
- **Ambient down to `0x04060b`**, and two things that were quietly keeping the room lit:
  - `bakeGlEnvironmentIbl` was baking the `back_CB*` cube at intensity `0.7`. The original uses
    that cube through an `EnvMapMethod` — a reflection on specific materials, not a light — but
    baked as scene IBL it behaves as a large ambient source and lit the whole room regardless of
    the lamps. Now `0.05`, enough to catch the chrome bezel and nothing more.
  - the clear colour. The room is a partial set (a wall and a table, no floor), so the clear
    colour shows at the edges of frame. It is consumed as LINEAR and re-encoded for display, so
    it comes out far brighter than the hex suggests — `0x02040a` displayed as roughly
    `(16, 23, 56)`, reading as a lit wall. Now black.

Three follow-ups after looking at it on real hardware:

- **The bloom was not reaching the digits.** Threshold has to sit below their *luminance*, which
  is much lower than their apparent brightness. `0xff3a08` decodes to linear
  `(1.0, 0.042, 0.002)`, and red contributes only `0.2126` of luma, so the digits weigh in at
  **0.243** — under the `0.35` threshold, so they never entered the bloom pass and the effect did
  nothing visible. At `0.15` they halo properly. Worth remembering generally: a saturated red that
  looks blinding is a dim colour by luminance, and any luminance-thresholded effect will skip it.
- **The bezel is plastic, not metal.** It is named `chromebody`, but on an alarm clock of this
  kind it is chromed plastic. At `metallic 0.82` its albedo tinted the reflection and it mirrored
  the room; as a dielectric (`metallic 0`, `roughness 0.34`) it keeps a tight specular roll-off
  along the rim — which is what actually catches the digits — without behaving like polished steel.
- **Ambient lifted slightly** to `0x0b1018`, enough that the wallpaper and the table edge read as
  shapes without competing with the display.

### The cell fit is a per-clip property

These two pulled in opposite directions and had to stop being one global rule:

- `digits` hides its glyphs inside a panel three times their width — 52x40 of artwork in a 125x64
  panel — so fitting the cell to the opaque extent leaves the digits at 41% of the display and
  pushed to one side.
- `delimiter` is a single dot fading out over six frames near the middle of a 17x65 black panel,
  and the colon's two dots come from the mesh showing that cell twice. Fitting to the dot alone
  makes the cell *become* the dot, and one of the two disappears.

Fixing either one globally broke the other. The fit is therefore stated per clip (`SwfSheetFit`):
`digits` measures its lit artwork, `delimiter` and `pulse` measure their full opaque extent, which
is what `SpriteSheetHelper` does. A ratio test would not do — it would pick the lit fit for the
delimiter too, where it is wrong — because which one a clip wants is a fact about how that clip
was authored, not something derivable from its pixels.

### Why the opaque fit alone is not enough

Fitting each cell to the **lit** artwork instead of the full opaque extent looked like an
improvement on the digits, and it was wrong. The `delimiter` clip is a single dot that fades out
over six frames, sitting near the middle of a 17x65 black panel, and the colon's two dots come
from the mesh showing that cell twice. Fit to the dot alone, the cell *became* the dot, and only
one of the two showed up. The backdrop is not padding — it is what positions the artwork inside
its cell, which is exactly why `SpriteSheetHelper` measures `sourceMC.width`/`height`, and in
Flash those include every child.

So the measurement is the opaque extent again. The digits are still large, because what actually
made them small was the cell geometry, not the backdrop: a cell carved as `sheetSize/rows` gave
tall cells that letterboxed wide digits, and the fit was uniform with a margin on top of that.
Sizing the cell to the content's aspect and filling it non-uniformly (as the helper does) is what
fixed that.

One further trap while fixing this. Measuring at 4x, to keep antialiased edges clear of a
brightness threshold, silently broke the measurement: these clips place their contents hundreds of
units from their own origin (`pulse` at y 169..233, `delimiter` at y 96..160), so at 4x they land
outside the measuring canvas — `pulse` rasterised empty and `delimiter` measured 31.5 tall instead
of 65, having been cut in half. Alpha needs no upscaling, since the interior of a filled shape is
fully opaque at any scale. The builder now also throws if a clip's bounds reach the canvas edge,
so that class of silent clipping cannot recur.

### The digits read aliased up close

A sprite-sheet cell is the entire resolution a frame ever has, and the sheet was sized like the
original's: 1024 over a 10x6 grid, so about 102x52 texels per digit pair. The camera pans right up
to the display, which magnifies that several times over and shows as stair-stepping on the segment
diagonals. Two changes:

- **Bigger cells.** 2048 across ten columns gives each digit pair 204 texels. The source is vector
  art, so it re-rasterises crisply at any size — this costs memory, not fidelity. 4096 was tried
  first and is indistinguishable at the closest camera position, so it was not worth four times
  the memory (a 4090x1890 sheet is ~31MB against ~7.7MB).
- **Trilinear plus 8x anisotropy** instead of plain bilinear. The display is usually seen at a
  slant, which is the case bilinear handles worst. Mipmapping a sprite sheet normally risks
  neighbouring cells bleeding together at the coarser levels, but each frame is inset to 84% of
  its cell (`CONTENT_FILL`), leaving an 8% gutter on every side to absorb it.

### What the original's lighting actually does

### The scene is lit blue, and that is correct

The port had invented light values: diffuse 0.9 and 0.5 where the original uses 0.3 and 0.1, radii
of 40000-60000, and no ambient at all. The three `PointLight`s are now verbatim, and the ambient
each of them carries is summed into one ambient light
(`0.3 x 0x18235B + 0.09 x 0xC2CDFF + 0.01 x 0xFFFFFF`, i.e. `0x1b1f35`).

That changes the look substantially, and the arithmetic says it should. Away3D attenuates to zero
past `fallOff`, and only one of the three lights reaches the clock at all:

| light | colour | distance to origin | fallOff | contribution |
| --- | --- | --- | --- | --- |
| plight1 | blue `0x2E71FF` | 16656 | 100000 (default) | 0.300 |
| plight2 | orange `0xFFA825` | 20760 | 6759 | **0.000** |
| plight3 | red `0xFF0500` | 11194 | 6759 | **0.000** |

The warm red glow the port used to show came entirely from stretching those two short-range
accent lights to 40000-60000 range. Faithfully, they are local lights that never touch the clock,
and the scene reads as a cool blue night-time bedside shot lit by one dim blue key.

## Shallow water demo

The port read as a different demo: a cyan tray of translucent water seen from above. Against the
built original, six things were wrong, and the poly readout now matches it exactly at 79250
(2 x 199^2 water triangles plus four pool cubes at 12 each).

- **Grid and plane size.** `ShallowFluid(200, 200, 2, ...)` means 199 segments of 2 units — a
  398-unit pool at 79202 triangles. The port used a 73x73 grid on a 900-unit plane: about an
  eighth of the resolution spread over more than twice the area, so ripples were coarse and the
  camera had to sit far back to frame it. Matching the dimensions also let the camera values
  transfer directly.
- **The water was tinted glass, not a mirror.** The original is `ColorMaterial(0xFFFFFF)` carrying
  `EnvMapMethod(cubeTexture, 1)` at full strength — a white surface mirroring the snow skybox,
  which is the stated point of the sample ("how to apply an environment map to a material"). The
  port had `baseColor 0x5cbde0c8`, `metallic 0.68`, alpha-blended: tinted glass reflecting almost
  nothing.
- **The pool was a paddling pool.** The original's four walls are 5 units thick and 500000 tall,
  sunk so only 5 units stand above the water — a thin dark rim and nothing else. The port built a
  floor slab and 115-unit walls in bright cyan. Their material is a perlin bitmap through a 0.1
  colour transform, generated here rather than faked flat, because the mottle is what stops the
  rim reading as a solid band.
- **That rim must be unlit.** `poolMaterial` never gets a `lightPicker`, which in Away3D means no
  diffuse lighting at all — it just shows its texture. Shaded as PBR, the blue headlight washed it
  bright blue and it read as a painted kerb.
- **The light is a blue headlight.** A single `PointLight` at `0x0000FF`, `diffuse 2`,
  `specular 0.5`, which the original re-seats on the camera every frame
  (`skyLight.transform = camera.transform.clone()`). That is what puts a bright specular wherever
  you are looking. The port had a fixed white directional light instead, losing it entirely.
- **Camera.** `HoverController(camera, null, 180, 20, 320, 5)` against the port's distance 1100 at
  pan 30 — the original sits low and close so the water fills the lower frame.

Two behavioural corrections. The original disturbs the fluid on `MOUSE_DOWN` over the plane and
again on every `MOUSE_MOVE` while held, so a drag draws a wake; the port disturbed once on
pointerup and felt unresponsive. And the port rained automatically every 350ms — the original's
rain sits behind a `toggleRain` GUI control, and the whole GUI is commented out, so it never runs.
The surface starts as a still mirror and only moves when you touch it, which is also what its
commented instructions describe ("Click on the fluid to disturb it").

`FogMethod(0, 2500, 0x000000)` is deliberately not reproduced: it is attached only to
`poolMaterial`, and a screen-space fog cannot be scoped to one material — applied globally it
would blacken the skybox, which is the backdrop the whole sample exists to reflect. The rim is
already near-black, so the fog's contribution there is negligible.

### The solver, the brush and the camera gate

Three follow-ups after watching it run, two of them regressions I introduced when I corrected the
grid.

**The solver was not the original's.** `ShallowFluid` precalculates

```
realWaveSpeed = speed * (spacing / (2 * dt)) * sqrt(viscosity * dt + 2)
f1 = realWaveSpeed^2 * dt^2 / spacing^2      f2 = 1 / (viscosity * dt + 2)
k1 = (4 - 8 * f1) * f2    k2 = (viscosity * dt - 2) * f2    k3 = 2 * f1 * f2
```

and steps `u_next = k1*u + k2*u_prev + k3*(four neighbours)` over two buffers. Substituting
`realWaveSpeed` collapses `f1` to `speed^2 * (viscosity*dt + 2) / 4` — **independent of spacing
and dt**, because the scheme is CFL-limited: a wave advances about one cell per step whatever the
grid. `speed` must stay below 1 or it diverges, which the original notes on the constant itself.

The port had a different solver whose wave speed went as `gravity * depth / spacing^2`. That made
it sensitive to the grid, so when I corrected the spacing from 12.5 to the original's 2, the
acceleration term grew about **39x**: the surface churned without ever calming, and the
high-frequency chop it produced is what read as pixelation, since a mirror amplifies every normal.
Ported properly, `k1 + k2 + 4*k3 = 1.00000` exactly, so a flat surface stays flat.

**The brush was five times too strong.** `mouseBrushStrength = 5`, applied as
`disturbBitmapInstant(..., -mouseBrushStrength, ...)`; the port pushed 24. The scheme is linear, so
settling time is unchanged either way — measured over simulated time, amplitude falls to 19% of
peak after 2s, under 10% by 8s and 1% by 20s — but five times the depth on a mirrored surface is
what made it look like it never settled. Note this cannot be judged from a headless capture: at 2
FPS the fixed-step accumulator only advances about 0.05s of simulation per frame, so nine seconds
of wall clock is about one second of water.

**The camera must not orbit while you disturb the water.** The original runs
`if (planeDisturb) { disturb } else if (move) { rotate camera }`, so a drag that starts on the
fluid draws a wake and leaves the camera still. The port bound orbit dragging to the canvas
independently and did both at once. `bindOrbitDrag` now takes an optional `shouldStart` predicate
for this; it defaults to allowing the drag, so the other samples are unaffected.

### Panning outside the water, and a finer grid

**The camera gate latched too early.** `disturbing` was set on every `pointerdown` before the pick
ran, and `pointerdown` fires before the `mousedown` that `bindOrbitDrag` listens for — so the gate
always saw it true and the camera could never pan, wherever you pressed. In the original,
`plane.addEventListener(MouseEvent3D.MOUSE_DOWN, ...)` only fires when the press lands on the
water, and that is what latches `planeDisturb`; a press anywhere else leaves it false and the
camera pans. The pick now decides the latch, so a press on the sky orbits and a press on the water
draws a wake without moving the camera. It stays latched for the whole drag, as the original's flag
does, but only disturbs where the ray still meets the surface.

**Normals now come from the height field, not the mesh.** This was the entire frame budget:
deriving them geometrically cost 10.6ms per frame at 200 cells and 42.8ms at 400, against
0.5-1.5ms for the fluid solve itself. `ShallowFluid` supplies normals and tangents directly, and
although the OpenFL port leaves its PixelBender normal shaders commented out — so upstream
actually shades the water with the constant normals it was initialised with — the shader it meant
to run scaled central differences by `-2 * spacing`, which is exactly the gradient used here.
Cost fell to 3.6ms at 200.

**The grid is 320, up from the original's 200** — 203522 triangles against 79202, 2.6x the detail
over the same 398-unit pool. Two things bound it. The per-vertex pass scales with cell count,
while the solver's step count scales with `1 / spacing`, so solver cost scales with the *cube* of
the grid: measured 3.6ms per frame at 200, 10.4ms at 320, and 400 could not hold a steady frame in
this harness at all. 320 leaves room inside a 60fps budget on modest hardware.

That step scaling is itself required, not a tuning choice: the scheme is CFL-limited, so a wave
crosses one cell per step and world wave speed is `spacing / step`. Refining the grid without
shortening the step would slow every ripple in proportion; the step therefore tracks the spacing,
holding wave speed at the original's 120 units per second whatever the grid.
