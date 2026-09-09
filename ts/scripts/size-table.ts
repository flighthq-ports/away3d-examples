/**
 * Build every sample against every renderer it declares and record the gzipped bundle size.
 *
 * This is the evidence for the thing the samples are shaped around. Each sample hard-codes its
 * renderer and registers only the pieces it uses, so Rollup can drop the rest; a table showing
 * displaying-a-bitmap at a few KB next to pirate-pig an order of magnitude larger is a more honest
 * claim than a README paragraph. It also doubles as a regression alarm -- if a routine SDK change
 * makes the smallest sample balloon, a tree-shaking break shows up in a diff instead of months later.
 *
 *   npx tsx scripts/size-table.ts            # all samples, all renderers
 *   npx tsx scripts/size-table.ts --renderer webgl
 */
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');
const tsDir = resolve(here, '..');

const only = process.argv.includes('--renderer')
  ? process.argv[process.argv.indexOf('--renderer') + 1]
  : undefined;

const samples = readdirSync(srcDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(srcDir, e.name, 'index.html')))
  .map((e) => e.name)
  .sort();

/** Renderers are not declared anywhere -- a sample supports a backend iff the file exists. */
function renderersFor(sample: string): string[] {
  const split = readdirSync(join(srcDir, sample))
    .map((f) => /^render\.([a-z0-9]+)\.ts$/.exec(f)?.[1])
    .filter((r): r is string => Boolean(r) && (!only || r === only))
    .sort();
  // These examples set their renderer up inline rather than splitting it across
  // render.<backend>.ts, so there is one build per example and no renderer axis to sweep.
  return split.length ? split : only ? [] : ['default'];
}

type Row = { sample: string; renderer: string; raw: number; gzip: number };
const rows: Row[] = [];

for (const sample of samples) {
  for (const renderer of renderersFor(sample)) {
    const outDir = resolve(tsDir, '.sizes', sample, renderer);
    rmSync(outDir, { recursive: true, force: true });
    try {
      execFileSync(
        'npx',
        ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
        { cwd: tsDir, env: { ...process.env, RENDERER: renderer, SAMPLE: sample, BASE_PATH: '/' }, stdio: 'pipe' },
      );
    } catch (err) {
      console.error(`build failed: ${sample} [${renderer}]`);
      continue;
    }

    // SAMPLE restricts the build to this one entry, so every chunk emitted belongs to it —
    // without that, Rollup shares chunks across every entry and each row would report the
    // size of the whole gallery instead.
    let raw = 0;
    let gzip = 0;
    const assetsOut = join(outDir, 'assets');
    if (existsSync(assetsOut)) {
      for (const f of readdirSync(assetsOut).filter((f) => f.endsWith('.js'))) {
        const buf = readFileSync(join(assetsOut, f));
        raw += buf.byteLength;
        gzip += gzipSync(buf).byteLength;
      }
    }
    rows.push({ sample, renderer, raw, gzip });
    console.log(`${sample} [${renderer}] ${(gzip / 1024).toFixed(1)} KB gz`);
  }
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const renderers = [...new Set(rows.map((r) => r.renderer))].sort();

/** Which backend `render.ts` actually re-exports — that is what the plain /<sample>/ URL runs. */
function defaultRendererFor(sample: string): string | null {
  const entry = join(srcDir, sample, 'render.ts');
  if (!existsSync(entry)) return null;
  return /render\.([a-z0-9]+)'/.exec(readFileSync(entry, 'utf8'))?.[1] ?? null;
}

/** The version these numbers describe. Unstamped sizes are misleading within weeks. */
function sdkVersion(): string {
  try {
    const pkg = resolve(tsDir, 'node_modules/@flighthq/sdk/package.json');
    return (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
}

const sdk = sdkVersion();
const generated = new Date().toISOString().slice(0, 10);

// Machine-readable companion for the gallery. Gitignored and optional: the cards fetch it at view
// time and simply omit the size when it is absent, exactly like thumbnails.
const bySample: Record<string, { default: string | null; renderers: Record<string, number> }> = {};
for (const r of rows) {
  bySample[r.sample] ??= { default: defaultRendererFor(r.sample), renderers: {} };
  bySample[r.sample].renderers[r.renderer] = r.gzip;
}
writeFileSync(
  resolve(srcDir, 'sizes.json'),
  JSON.stringify({ sdk, generated, samples: bySample }, null, 2) + '\n',
);

let md = '# Bundle sizes\n\n';
md += `Gzipped JS per sample, one build per renderer — each measured from a build containing only\n`;
md += `that sample, so the number is the program rather than a share of the gallery.\n\n`;
md += `Measured against \`@flighthq/sdk\` **${sdk}** on ${generated}. Regenerate with \`npm run sizes\`.\n\n`;
md += `| Sample | ${renderers.join(' | ')} |\n|${'---|'.repeat(renderers.length + 1)}\n`;
for (const sample of samples) {
  const cells = renderers.map((r) => {
    const hit = rows.find((x) => x.sample === sample && x.renderer === r);
    return hit ? kb(hit.gzip) : '—';
  });
  md += `| \`${sample}\` | ${cells.join(' | ')} |\n`;
}

writeFileSync(resolve(tsDir, '../SIZES.md'), md);
rmSync(resolve(tsDir, '.sizes'), { recursive: true, force: true });
console.log(`\nwrote SIZES.md and src/sizes.json (${rows.length} builds, sdk ${sdk})`);
