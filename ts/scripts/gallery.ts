/**
 * Regenerate src/index.html -- the landing page listing every sample.
 *
 * The list is read off the filesystem and the human name off each sample's own <title>, so adding
 * a sample means adding a directory and nothing else.
 *
 * Thumbnails are optional: generated for publishing, gitignored, and a missing one just leaves a
 * flat tint. Bundle sizes are not printed on the cards -- they ride along as tooltips on the
 * backend links, and SIZES.md carries the full table.
 *
 *   npm run gallery
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');

/**
 * Capability gradient rather than alphabetical: DOM and Canvas are fallbacks, WebGL is the default,
 * WebGPU is what comes next. The coverage counts follow the same axis -- DOM reaches 9 samples,
 * Canvas 19, WebGL all samples -- so top-to-bottom is also least-to-most expressive.
 */
const BACKEND_ORDER = ['dom', 'canvas', 'webgl', 'webgpu'];

function orderBackends(list: readonly string[]): string[] {
  return [...list].sort((a, b) => {
    const ia = BACKEND_ORDER.indexOf(a);
    const ib = BACKEND_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

const samples = readdirSync(srcDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(srcDir, e.name, 'index.html')))
  .map((e) => {
    const html = readFileSync(join(srcDir, e.name, 'index.html'), 'utf8');
    const title = /<title>([^<]*?)(?:\s+—[^<]*)?<\/title>/.exec(html)?.[1]?.trim() ?? e.name;
    const renderers = orderBackends(
      readdirSync(join(srcDir, e.name))
        .map((f) => /^render\.([a-z0-9]+)\.ts$/.exec(f)?.[1])
        .filter((r): r is string => Boolean(r)),
    );
    // The backend the plain /<id>/ URL runs; the others publish under /<id>/<backend>/.
    const entry = join(srcDir, e.name, 'render.ts');
    const primary = existsSync(entry)
      ? (/render\.([a-z0-9]+)'/.exec(readFileSync(entry, 'utf8'))?.[1] ?? null)
      : null;
    return { id: e.name, title, renderers, primary };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const items = samples
  .map((s) => {
    // A row per backend: the name links to that build, the size sits in a right-aligned column so
    // the numbers line up down the card and across the grid.
    const backends = s.renderers
      .map((r) => {
        const href = r === s.primary ? `${s.id}/` : `${s.id}/${r}/`;
        return `<a href="${href}" data-id="${s.id}" data-backend="${r}">${r}</a>`;
      })
      .join('<span class="sep">·</span>');

    return `      <div class="item">
        <a class="frame" href="${s.id}/">
          <span class="shot" style="background-image:url('thumbs/${s.id}.png')"></span>
        </a>
        <a class="cap" href="${s.id}/" data-id="${s.id}">${s.title}</a>
        ${backends ? `<div class="det">${backends}</div>` : ''}
      </div>`;
  })
  .join('\n');

writeFileSync(
  resolve(srcDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Away3D Examples (Flight SDK)</title>
    <style>
      :root { color-scheme: light dark; --fg: #16181d; --dim: #6b7280; --bg: #fbfbfc; --card: #fff;
              --line: #e5e7eb; --shot: #eef0f3; }
      @media (prefers-color-scheme: dark) {
        :root { --fg: #e8eaed; --dim: #9aa0aa; --bg: #131417; --card: #1b1d22; --line: #2a2d34;
                --shot: #23262c; }
      }
      body { margin: 0; padding: 3rem 1.5rem; background: var(--bg); color: var(--fg);
             font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
      main { max-width: 62rem; margin: 0 auto; }
      h1 { font-size: 1.5rem; margin: 0 0 .35rem; letter-spacing: -.01em; }
      p.lede { color: var(--dim); margin: 0 0 2.5rem; max-width: 46rem; }
      /* Row gap is deliberately larger than the space between a picture and its own caption, so
         each block reads as one item rather than the text floating between two rows. */
      .grid { display: grid; column-gap: .9rem; row-gap: 1.8rem;
              grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
      .item { display: flex; flex-direction: column; }
      /* The border frames the picture and nothing else — caption and detail sit on the page, so
         the eye lands on the thumbnails rather than on a grid of boxed text. */
      .frame { display: block; background: var(--card); border: 1px solid var(--line);
               border-radius: .5rem; overflow: hidden; transition: border-color .12s; }
      .frame:hover { border-color: var(--dim); }
      .shot { display: block; aspect-ratio: 4 / 3; background: var(--shot) center/cover no-repeat; }
      /* The frame's corner radius pulls its visible edge inward, so text set at x=0 optically
         hangs left of the picture. A few pixels puts the two back in line. */
      .cap, .det { padding-left: 3px; }
      .cap { display: block; margin-top: .65rem; font-weight: 600; color: var(--fg);
             text-decoration: none; }
      .cap:hover { text-decoration: underline; }
      .det { margin-top: .2rem; font-size: .7rem; font-family: ui-monospace, monospace; }
      .det a { color: var(--dim); text-decoration: none; }
      .det a:hover { color: var(--fg); }
      .sep { color: var(--dim); opacity: .4; margin: 0 .12rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Away3D Examples (Flight SDK)</h1>
      <p class="lede">${samples.length} examples remastered from openfl/away3d-samples. Each is
        self-contained and registers only the renderer pieces it uses, which is what keeps the
        bundles small. These are WebGL only — 3D content has no Canvas or DOM equivalent. Hover a name
        for its bundle size, or see SIZES.md for the full table.</p>
      <div class="grid">
${items}
      </div>
    </main>
    <script>
      // Sizes are deliberately not printed on the cards -- they would crowd out the pictures. They
      // ride along as tooltips instead, filled from the optional sizes.json that npm run sizes
      // writes. Absent in a plain clone, in which case the links simply have no tooltip.
      fetch('sizes.json')
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          // No renderer split here, so the size hangs off the name rather than a backend link.
          document.querySelectorAll('.cap').forEach(function (a) {
            var entry = data.samples && data.samples[a.dataset.id];
            var bytes = entry && entry.renderers && Object.values(entry.renderers)[0];
            if (typeof bytes === 'number') a.title = (bytes / 1024).toFixed(1) + ' KB';
          });
        })
        .catch(function () {});
    </script>
  </body>
</html>
`,
);

console.log(`wrote index.html (${samples.length} examples)`);
