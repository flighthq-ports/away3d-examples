/**
 * Copy one sample out of the repo as a standalone project.
 *
 * Each sample directory is already a valid Vite project root -- index.html and app.ts are siblings
 * and there are no path aliases. The few imports from shared/ are Away3D convention adapters rather
 * than application bootstrap; eject copies those beside the sample and adjusts only their path.
 *
 *   npx tsx scripts/eject.ts displaying-a-bitmap ./out
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');
const assetsDir = resolve(here, '../../assets');
const sharedDir = resolve(here, '../shared');
const repoDir = resolve(here, '../..');
const rootPkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));

const [name, outArg] = process.argv.slice(2);
if (!name) {
  console.error('usage: tsx scripts/eject.ts <sample> [outDir]');
  console.error(`samples: ${readdirSync(srcDir).join(', ')}`);
  process.exit(1);
}

const sampleDir = join(srcDir, name);
if (!existsSync(sampleDir)) {
  console.error(`no such sample: ${name}`);
  process.exit(1);
}

const out = resolve(outArg ?? join('out', name));
mkdirSync(out, { recursive: true });
cpSync(sampleDir, out, { recursive: true });

const sampleSources = readdirSync(sampleDir).filter((f) => f.endsWith('.ts'));
const sharedSources = new Set<string>();
for (const file of sampleSources) {
  const outputFile = join(out, file);
  const rewritten = readFileSync(outputFile, 'utf8').replace(
    /from (['"])\.\.\/\.\.\/shared\/([^'"]+)\1/g,
    (_match, quote: string, adapter: string) => {
      sharedSources.add(`${adapter}.ts`);
      return `from ${quote}./shared/${adapter}${quote}`;
    },
  );
  writeFileSync(outputFile, rewritten);
}
for (const file of sharedSources) {
  const from = join(sharedDir, file);
  if (!existsSync(from)) throw new Error(`missing shared Away3D adapter: ${file}`);
  const to = join(out, 'shared', file);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

// Only the packages this sample actually imports -- an ejected sample should not inherit the
// union of every dependency the gallery needs.
const sources = [
  ...sampleSources.map((f) => join(out, f)),
  ...[...sharedSources].map((f) => join(out, 'shared', f)),
];
const imports = new Set<string>();
for (const file of sources) {
  for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from ['"]([^'".][^'"]*)['"]/g)) {
    imports.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]);
  }
}
const deps = Object.fromEntries(
  Object.entries(rootPkg.dependencies as Record<string, string>).filter(([k]) => imports.has(k)),
);

writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    {
      name: `flight-sample-${name}`,
      private: true,
      type: 'module',
      license: 'MIT',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview', typecheck: 'tsc --noEmit', check: 'npm run typecheck && npm run build' },
      dependencies: deps,
      devDependencies: { typescript: rootPkg.devDependencies.typescript, vite: rootPkg.devDependencies.vite },
    },
    null,
    2,
  ) + '\n',
);

for (const legalFile of ['LICENSE', 'NOTICE.md']) {
  const from = join(repoDir, legalFile);
  if (existsSync(from)) cpSync(from, join(out, legalFile));
}

writeFileSync(
  join(out, 'vite.config.ts'),
  `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  build: { target: 'es2022' },\n});\n`,
);

writeFileSync(
  join(out, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        moduleResolution: 'bundler',
        types: ['vite/client'],
        strict: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['.'],
    },
    null,
    2,
  ) + '\n',
);

// Assets travel into public/ so the ejected project keeps the same URLs the source already uses.
const ASSET_RE = /['"`]([a-z0-9_][a-z0-9_/.-]*\.(?:png|jpg|jpeg|gif|webp|mp3|ogg|wav|m4a|mp4|webm|ogv|ttf|otf|woff2?|eot|svg|swf|utf8|json|xml|fnt|atlas|awd|obj|3ds|dae|md5mesh|md5anim|md2|atf|cube|mtl|bin|txt))['"`]/gi;
const ASSET_DIR_RE = /['"]([a-z0-9_][a-z0-9_/.-]*\/)['"]/gi;
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
const shipped = walk(assetsDir);
const byBasename = new Map<string, string[]>();
for (const path of shipped) {
  const name = basename(path);
  byBasename.set(name, [...(byBasename.get(name) ?? []), path]);
}
const copiedAssets = new Set<string>();
function copyAsset(from: string): void {
  if (copiedAssets.has(from)) return;
  const relativePath = from.slice(assetsDir.length + 1);
  const to = join(out, 'public', relativePath);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  copiedAssets.add(from);
}
for (const f of readdirSync(sampleDir)) {
  if (!/\.(ts|html|css)$/.test(f)) continue;
  const text = readFileSync(join(sampleDir, f), 'utf8');
  for (const [, assetDir] of text.matchAll(ASSET_DIR_RE)) {
    const absoluteDir = join(assetsDir, assetDir);
    if (existsSync(absoluteDir) && statSync(absoluteDir).isDirectory()) {
      for (const asset of walk(absoluteDir)) copyAsset(asset);
    }
  }
  for (const [, asset] of text.matchAll(ASSET_RE)) {
    const from = join(assetsDir, asset);
    if (existsSync(from) && statSync(from).isFile()) {
      copyAsset(from);
      continue;
    }
    for (const match of byBasename.get(basename(asset)) ?? []) copyAsset(match);
  }
}

console.log(`ejected ${name} -> ${out}`);
console.log(`  deps: ${Object.keys(deps).join(', ') || '(none)'}`);
console.log(`  assets: ${copiedAssets.size}`);
console.log(`\n  cd ${out} && npm install && npm run dev`);
