// Rasterizes assets/src/plugin-icon.svg to assets/imgs/plugin/icon.png (256) and icon@2x.png (512) with headless Chrome,
// on a transparent background (the tile has rounded corners). One Chrome at a time; each run is killed after 60 s.
//
//   node assets/src/build-icons.mjs && node assets/src/raster-plugin-icon.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const svg = join(ROOT, 'assets/src/plugin-icon.svg');

for (const [size, name] of [[256, 'icon.png'], [512, 'icon@2x.png']]) {
  const work = mkdtempSync(join(tmpdir(), 'prism-icon-'));
  const page = join(work, 'page.html');
  writeFileSync(page, `<!doctype html><html><head><style>html,body{margin:0;background:transparent;overflow:hidden}img{display:block;width:${size}px;height:${size}px}</style></head>` +
    `<body><img src="${pathToFileURL(svg).href}"></body></html>`);
  const out = join(ROOT, 'assets/imgs/plugin', name);
  const run = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', `--user-data-dir=${join(work, 'profile')}`, `--window-size=${size},${size}`,
    '--force-device-scale-factor=1', '--default-background-color=00000000', '--virtual-time-budget=1500', `--screenshot=${out}`,
    pathToFileURL(page).href], { stdio: 'ignore', timeout: 60_000, killSignal: 'SIGKILL' });
  rmSync(work, { recursive: true, force: true });
  if (run.status !== 0 || !existsSync(out)) { console.error(`chrome failed for ${name}`); process.exit(1); }
  const png = readFileSync(out);
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20), colorType = png[25];
  if (w !== size || h !== size || colorType !== 6) { console.error(`${name}: ${w}x${h} color type ${colorType}, expected ${size}x${size} RGBA`); process.exit(1); }
  console.log(`${out} ${w}x${h} RGBA`);
}
