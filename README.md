# Away3D Examples (Flight SDK)

The OpenFL [Away3D sample suite](https://github.com/openfl/away3d-samples), remastered for
[Flight](https://github.com/flighthq/flight). The examples preserve the behavior and teaching goal
of each original while using Flight's current rendering and material APIs, including PBR where it
makes the result clearer.

## Build and run

```bash
cd ts
npm install
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the gallery and examples locally |
| `npm run build` | Build the full gallery |
| `npm run check` | Type-check, validate assets, and build |
| `npm run eject <name>` | Copy one example into a standalone project |
| `npm run thumbs` | Capture gallery thumbnails with Playwright |
| `npm run sizes` | Regenerate `SIZES.md` and gallery size metadata |
| `npm run dist` | Generate publishing metadata and build the site |

Examples live in `ts/src/<name>/`, and runtime-loaded files live in `assets/`. Each example owns its
canvas, renderer registration, scene setup, controls, and animation loop. Duplication is deliberate:
you can read, debug, or eject one sample without learning a gallery framework. `ts/shared/` is limited
to translation of foreign Away3D conventions such as handedness, camera controls, light energy, and
legacy material parameters. All examples target WebGL because their 3D content has no Canvas or DOM
equivalent.

## Provenance

The mature Flight ports in
[flighthq-ports/awayjs-examples](https://github.com/flighthq-ports/awayjs-examples) are reused where
the AwayJS and Away3D sample lineages overlap. Remaining examples are based on the corresponding
OpenFL sample. See [NOTICE.md](NOTICE.md) for attribution.

[PORTING.md](PORTING.md) maps all 33 upstream examples to their Flight versions and records the
remaining SDK capability gaps.
