/**
 * Copy one sample out of the repo as a standalone project.
 *
 * Because each sample directory is already a valid Vite project root -- index.html and app.ts as
 * siblings, no shared imports, no path aliases -- ejecting is a plain directory copy plus the three
 * config files and whichever assets that sample actually loads. Nothing is rewritten, which is the
 * point: the code someone downloads is byte-for-byte the code they read here.
 *
 *   npx tsx scripts/eject.ts displaying-a-bitmap ./out
 */
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '../src');
const assetsDir = resolve(here, '../../assets');
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

// Only the packages this sample actually imports -- an ejected sample should not inherit the
// union of every dependency the gallery needs.
const sources = readdirSync(sampleDir).filter((f) => f.endsWith('.ts'));
const imports = new Set<string>();
for (const f of sources) {
  for (const [, spec] of readFileSync(join(sampleDir, f), 'utf8').matchAll(/from ['"]([^'".][^'"]*)['"]/g)) {
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
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
      dependencies: deps,
      devDependencies: { typescript: rootPkg.devDependencies.typescript, vite: rootPkg.devDependencies.vite },
    },
    null,
    2,
  ) + '\n',
);

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
const ASSET_RE = /['"`]([a-z0-9_][a-z0-9_/.-]*\.(?:png|jpg|jpeg|gif|webp|mp3|ogg|wav|m4a|mp4|webm|ogv|ttf|otf|woff2?|eot|svg|swf|utf8|json|xml|fnt|atlas|awd|obj|3ds|dae|md5mesh|md5anim|bin|txt))['"`]/gi;
let copied = 0;
for (const f of readdirSync(sampleDir)) {
  if (!/\.(ts|html|css)$/.test(f)) continue;
  for (const [, asset] of readFileSync(join(sampleDir, f), 'utf8').matchAll(ASSET_RE)) {
    const from = join(assetsDir, asset);
    if (!existsSync(from)) continue;
    const to = join(out, 'public', asset);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    copied++;
  }
}

console.log(`ejected ${name} -> ${out}`);
console.log(`  deps: ${Object.keys(deps).join(', ') || '(none)'}`);
console.log(`  assets: ${copied}`);
console.log(`\n  cd ${out} && npm install && npm run dev`);
