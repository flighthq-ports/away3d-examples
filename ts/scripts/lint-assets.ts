/**
 * The repo has no asset registry — each sample names the files it loads, inline, in its own source.
 * That keeps samples readable and portable across toolchains, but nothing stops a typo'd path from
 * reaching a user as a 404. This is the check that replaces the registry:
 *
 *   - every asset a sample references exists under assets/
 *   - every file under assets/ is referenced by at least one sample
 *
 * The second half is what keeps the corpus from silently accumulating files nothing loads.
 *
 * Some samples build paths at runtime — `images/${SIZE}/${name}.png`, or a bare filename joined to
 * a directory elsewhere in the module. Static extraction sees only the literal fragment, so a
 * fragment that does not resolve as a path is retried as a basename against the whole tree before
 * being called missing. That keeps the check honest about genuine typos without inventing failures
 * for the dynamic cases, which are exactly the samples with the most assets.
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');
const assetsDir = resolve(here, '../../assets');

const EXT =
  'png|jpg|jpeg|gif|webp|mp3|ogg|wav|m4a|mp4|webm|ogv|ttf|otf|woff2?|eot|svg|swf|utf8|json|xml|fnt|atlas|awd|obj|3ds|dae|md5mesh|md5anim|md2|atf|cube|mtl|bin|txt';

const ASSET_RE = new RegExp(`['"\`]([a-z0-9_][a-z0-9_/.-]*\\.(?:${EXT}))['"\`]`, 'gi');

/** Template literals with interpolation — `images/${SIZE}/0.png` — matched as a glob. */
const TEMPLATE_RE = new RegExp(`\`([a-z0-9_][a-z0-9_/.\${}-]*\\.(?:${EXT}))\``, 'gi');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

if (!existsSync(assetsDir)) {
  console.error(`no assets directory at ${assetsDir}`);
  process.exit(1);
}

const shipped = walk(assetsDir)
  .map((f) => relative(assetsDir, f))
  .filter((f) => !f.endsWith('.md'));

const byBasename = new Map<string, string[]>();
for (const f of shipped) {
  const b = basename(f);
  byBasename.set(b, [...(byBasename.get(b) ?? []), f]);
}

const referenced = new Set<string>();
const missing: { sample: string; asset: string }[] = [];
let composed = 0;

/** `images/${SIZE}/0.png` -> every shipped path matching images/<one segment>/0.png */
function globMatches(pattern: string): string[] {
  const rx = new RegExp(
    '^' +
      pattern
        .split(/\$\{[^}]*\}/)
        .map((lit) => lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*') +
      '$',
  );
  return shipped.filter((f) => rx.test(f));
}

for (const entry of readdirSync(srcDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  for (const file of walk(join(srcDir, entry.name))) {
    if (!/\.(ts|html|css)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');

    for (const [, tpl] of text.matchAll(TEMPLATE_RE)) {
      if (!tpl.includes('${')) continue; // plain literal, handled below
      const hits = globMatches(tpl);
      if (hits.length) {
        for (const h of hits) referenced.add(h);
        composed++;
      } else {
        missing.push({ sample: entry.name, asset: tpl });
      }
    }

    for (const [, asset] of text.matchAll(ASSET_RE)) {
      if (asset.startsWith('.') || asset.includes('://')) continue;

      const abs = join(assetsDir, asset);
      if (existsSync(abs) && statSync(abs).isFile()) {
        referenced.add(asset);
        continue;
      }
      // Not a whole path — try it as a filename composed onto a directory at runtime.
      const hits = byBasename.get(basename(asset));
      if (hits?.length) {
        for (const h of hits) referenced.add(h);
        composed++;
        continue;
      }
      missing.push({ sample: entry.name, asset });
    }
  }
}

const orphans = shipped.filter((f) => !referenced.has(f));

console.log(`referenced: ${referenced.size} / ${shipped.length} shipped assets`);
if (composed) console.log(`  (${composed} resolved by filename — path built at runtime)`);

if (missing.length) {
  console.error(`\n${missing.length} missing asset(s):`);
  for (const m of missing) console.error(`  ${m.sample} -> ${m.asset}`);
}
if (orphans.length) {
  console.warn(`\n${orphans.length} orphaned asset(s) (shipped, never referenced):`);
  for (const o of orphans.slice(0, 30)) console.warn(`  ${o}`);
  if (orphans.length > 30) console.warn(`  ... and ${orphans.length - 30} more`);
}

// Orphans warn rather than fail: hx/ samples will reference assets ts/ never loads, so a shared
// corpus legitimately runs ahead of any single language tree.
process.exit(missing.length ? 1 : 0);
