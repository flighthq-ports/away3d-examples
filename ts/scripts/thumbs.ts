/**
 * Capture a thumbnail per example for the gallery.
 *
 * These are for publishing, not for the repo. They are gitignored and the gallery renders fine
 * without them, so a normal clone and a normal `npm run build` never pay for this. Run it locally
 * if you want the cards populated, and run it in the deploy job before `npm run build`.
 *
 * Deliberately NOT baselines. Captures come from a software GL backend and animated examples differ
 * between runs, so these are illustrative only — nothing should ever diff them.
 *
 * Playwright is a devDependency (it adds ~18 MB and no longer downloads browsers on install), but
 * the browser itself is a separate ~380 MB step you only pay for if you want thumbnails:
 *
 *   npx playwright install chromium
 *   npm run thumbs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const tsDir = resolve(here, '..');
const srcDir = join(tsDir, 'src');
const outDir = join(srcDir, 'thumbs');

const PORT = Number(process.env.THUMB_PORT ?? 5399);
// Match the gallery card's 4:3 aspect ratio. The old 480x720 portrait capture was displayed with
// background-size: cover inside a 4:3 card, which discarded roughly half its height and routinely
// cut off heads, feet, wings, and tails.
const WIDTH = Number(process.env.THUMB_WIDTH ?? 640);
const HEIGHT = Number(process.env.THUMB_HEIGHT ?? 480);
/** Time to let a example load assets and reach a representative frame. */
const SETTLE = Number(process.env.THUMB_SETTLE ?? 700);
/** Heavy scenes under software GL can take a while to produce a stable frame to grab. */
const SHOT_TIMEOUT = Number(process.env.THUMB_TIMEOUT ?? 60_000);

/** Optional filter: `npm run thumbs -- particle-explosions` re-runs just that one. */
const only = process.argv.slice(2);


const examples = readdirSync(srcDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(srcDir, e.name, 'index.html')))
  .map((e) => e.name)
  .filter((name) => only.length === 0 || only.includes(name))
  .sort();

if (examples.length === 0) {
  console.error(`thumbs: nothing matched ${only.join(', ')}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const base = `http://localhost:${PORT}`;

// Refuse to share the port. --strictPort makes our own spawn fail if it is taken, and without this
// check waitForServer would then happily succeed against whatever else is listening and capture
// that app's pages instead — silently, as 26 blank thumbnails.
async function assertPortFree(): Promise<void> {
  try {
    await fetch(base, { signal: AbortSignal.timeout(1500) });
  } catch {
    return; // nothing listening, which is what we want
  }
  console.error(`thumbs: something is already listening on port ${PORT}.`);
  console.error('  Stop it, or set THUMB_PORT to a free port.\n');
  process.exit(1);
}

await assertPortFree();

// Serve the app rather than capturing from the filesystem, so examples load assets the same way a
// visitor would. Detached so the whole process group can be torn down -- npx spawns vite as a
// grandchild, and killing only the direct child leaves the server running.
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--logLevel', 'error'], {
  cwd: tsDir,
  stdio: 'ignore',
  detached: true,
  // BASE_PATH belongs to the deploy, not to a local capture: with it set the dev server serves
  // pages under /<repo>/ and every navigation below would 404.
  env: { ...process.env, BASE_PATH: '/' },
});

function stopServer(): void {
  if (server.pid === undefined) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}
process.on('exit', stopServer);
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('vite exited before serving (port in use?)');
    try {
      const res = await fetch(base);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite did not start');
}

try {
  await waitForServer();

  // Hardware GL fails to compile the sprite-batch shader headless; software GL is what works here.
  let browser;
  try {
    browser = await chromium.launch({
      args: [
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--ignore-gpu-blocklist',
      ],
    });
  } catch (err) {
    // The package is a devDependency, but the browser binary is downloaded separately.
    console.error(`thumbs: could not launch chromium — ${(err as Error).message.split('\n')[0]}\n`);
    console.error('  npx playwright install chromium\n');
    process.exit(1);
  }
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  let ok = 0;
  for (const id of examples) {
    try {
      await page.goto(`${base}/${id}/`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(SETTLE);

      // The browser only rasterizes what fits the viewport, so a stage wider than it captures with
      // a dead band. Fit the viewport to the canvas before shooting, since stage sizes differ.
      const size = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return c ? { w: c.clientWidth, h: c.clientHeight } : null;
      });
      if (size && size.w > 0) {
        await page.setViewportSize({ width: Math.ceil(size.w), height: Math.ceil(size.h) });
        await page.waitForTimeout(120);
      }

      // Some examples create scratch canvases for bitmap work; the first is the stage. A capability
      // report may intentionally have no canvas, in which case capture the page itself.
      const stage = page.locator('canvas').first();
      if (await stage.count()) {
        await stage.screenshot({ path: join(outDir, `${id}.png`), timeout: SHOT_TIMEOUT, animations: 'disabled' });
      } else {
        await page.screenshot({ path: join(outDir, `${id}.png`), timeout: SHOT_TIMEOUT, animations: 'disabled' });
      }
      ok++;
      process.stdout.write(`  ${id}\n`);
    } catch (err) {
      console.error(`  ${id} — failed: ${(err as Error).message.split('\n')[0]}`);
    }
  }

  await browser.close();
  console.log(`\nwrote ${ok}/${examples.length} thumbnails to src/thumbs/`);
} finally {
  server.kill();
}
