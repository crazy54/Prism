// Bring the Refraction design language into the website.
//
//   node website/scripts/sync-refraction.mjs           write
//   node website/scripts/sync-refraction.mjs --check   exit 1 if anything is out of date (for CI / build.mjs)
//
// The website can only ship what website/build.mjs copies (index.html, styles.css, app.js,
// assets/, terminal/ …), so the design files are vendored under website/assets/:
//
//   design/prism.css                    → assets/rf/prism.css         tokens (Night/Day), hue setters, .rf-* primitives
//   design/brand/prism-mark.css         → assets/rf/prism-mark.css    the animated glass mark
//   design/first-light/first-light.*   → assets/rf/first-light.*     First Light + the Day/Night relight
//   design/fonts/inter-*-latin.woff2    → assets/fonts/               Inter 400/600/700, the faces Prism.html bundles
//   design/brand/favicon.svg            → assets/prism.svg            favicon
//   design/tokens.json                  → assets/rf/positions.mjs     λ labels + hues for every gallery and surface (JS)
//                                       → assets/rf/positions.css     hue setters for terminal-only galleries
//
// In the HTML pages it also fills two kinds of markers from the same sources:
//   <!--rf:icons [extra names]-->…<!--/rf:icons-->   an inline sprite with exactly the icons the page uses
//                                                    (every <use href="#i-NAME">, plus the extra names that
//                                                    scripts render) — inline, so it works from file:// too
//   <… data-rf-lambda="<id>">λ 436</…>              the λ / illuminant label of a gallery, app page or surface
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(site);
const design = path.join(repo, 'design');
const check = process.argv.includes('--check');
const stale = [];

const lf = (s) => s.replace(/\r\n/g, '\n');
async function put(rel, content) {
  const file = path.join(site, rel);
  const binary = Buffer.isBuffer(content);
  if (existsSync(file)) {
    const cur = await readFile(file);
    if (binary ? cur.equals(content) : lf(cur.toString('utf8')) === lf(content)) return;
    if (!binary && cur.toString('utf8').includes('\r\n')) content = lf(content).replace(/\n/g, '\r\n');
  }
  stale.push(rel);
  if (check) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

// ── vendored files ──────────────────────────────────────────────────────────
const copies = [
  ['prism.css', 'assets/rf/prism.css'],
  ['brand/prism-mark.css', 'assets/rf/prism-mark.css'],
  ['first-light/first-light.css', 'assets/rf/first-light.css'],
  ['first-light/first-light.js', 'assets/rf/first-light.js'],
  ['brand/favicon.svg', 'assets/prism.svg'],
  ['brand/favicon-16.png', 'assets/favicon-16.png'],
  ['brand/favicon-32.png', 'assets/favicon-32.png'],
  ['brand/apple-touch-icon.png', 'assets/apple-touch-icon.png'],
  ['brand/prism-icon-512.png', 'assets/prism-icon-512.png'],
  ['brand/prism-lockup.svg', 'assets/brand/prism-lockup.svg'],
  ['brand/prism-lockup-day.svg', 'assets/brand/prism-lockup-day.svg'],
  ['brand/prism-mark.svg', 'assets/brand/prism-mark.svg'],
  ['brand/prism-mark-day.svg', 'assets/brand/prism-mark-day.svg'],
];
for (const [from, to] of copies) {
  const src = path.join(design, from);
  if (!existsSync(src)) { console.warn(`skip: design/${from} is missing`); continue; }
  if (/\.png$/.test(to)) { await put(to, await readFile(src)); continue; }
  const banner = /\.(css|js)$/.test(to) ? `/* Vendored from design/${from} by website/scripts/sync-refraction.mjs — edit the source, then re-run. */\n` : '';
  await put(to, banner + (await readFile(src, 'utf8')));
}
for (const w of [400, 600, 700]) {
  const src = path.join(design, 'fonts', `inter-${w}-latin.woff2`);
  if (existsSync(src)) await put(`assets/fonts/inter-${w}-latin.woff2`, await readFile(src));
  else console.warn(`skip: design/fonts/inter-${w}-latin.woff2 is missing`);
}

// ── positions (λ + hue) ─────────────────────────────────────────────────────
const tokens = JSON.parse(await readFile(path.join(design, 'tokens.json'), 'utf8'));
const G = tokens.galleries;
const positions = {};
const pick = (g, kind) => ({ kind, label: g.label, lambda: g.lambda, h: g.h ?? null,
  night: g.night ? { ink: g.night.ink, vivid: g.night.vivid, rgb: g.night.rgb } : null,
  day: g.day ? { ink: g.day.ink, vivid: g.day.vivid, rgb: g.day.rgb } : null });
for (const g of G.web) positions[g.id] = pick(g, 'gallery');
for (const g of G.app) positions[g.id] = pick(g, 'app');
const surfaces = {};
for (const s of G.surfaces) surfaces[s.id] = pick(s, 'surface');
// Terminal galleries: same id → same hue as the web gallery it shares (sameAs), else the proposed hue.
const terminal = {};
for (const g of G.terminal) {
  const same = g.sameAs && G.web.find((w) => w.id === g.sameAs);
  terminal[g.id] = same ? { ...pick(same, 'gallery'), sameAs: g.sameAs } : pick(g, 'gallery');
}
const mod = `// GENERATED by website/scripts/sync-refraction.mjs from design/tokens.json ${tokens.version} — do not edit.\n`
  + `export const VERSION = ${JSON.stringify(tokens.version)};\n`
  + `export const GALLERIES = ${JSON.stringify(positions)};\n`
  + `export const SURFACES = ${JSON.stringify(surfaces)};\n`
  + `export const TERMINAL = ${JSON.stringify(terminal)};\n`;
await put('assets/rf/positions.mjs', mod);

// Hue setters for terminal galleries that have no web twin (the web ones are in prism.css §3).
const own = Object.entries(terminal).filter(([, g]) => !g.sameAs && g.night && g.day);
const hueCss = `/* GENERATED by website/scripts/sync-refraction.mjs from design/tokens.json ${tokens.version} — terminal-only gallery hues. */\n`
  + own.map(([id, g]) => `[data-rf-gallery="${id}"]{--rf-hue:${g.night.ink};--rf-hue-v:${g.night.vivid};--rf-hue-rgb:${g.night.rgb}}`).join('\n') + '\n'
  + own.map(([id, g]) => `:root[data-theme="prism-light"] [data-rf-gallery="${id}"]{--rf-hue:${g.day.ink};--rf-hue-v:${g.day.vivid};--rf-hue-rgb:${g.day.rgb}}`).join('\n') + '\n';
await put('assets/rf/positions.css', hueCss);

// ── HTML markers ────────────────────────────────────────────────────────────
const icons = JSON.parse(await readFile(path.join(design, 'icons', 'icons.json'), 'utf8'));
const lambdaOf = (id) => (positions[id] || surfaces[id] || terminal[id])?.lambda;
const pages = ['index.html', 'terminal/index.html', 'terminal/tty.html', 'deck/index.html'];
for (const rel of pages) {
  const file = path.join(site, rel);
  if (!existsSync(file)) continue;
  let html = await readFile(file, 'utf8');
  const before = html;
  html = html.replace(/(<!--rf:icons([^>]*?)-->)[\s\S]*?(<!--\/rf:icons-->)/, (all, open, extra, close) => {
    const names = new Set([...html.matchAll(/href="#i-([a-z0-9-]+)"/g)].map((m) => m[1]));
    for (const n of extra.trim().split(/\s+/).filter(Boolean)) names.add(n);
    const missing = [...names].filter((n) => !icons[n]);
    if (missing.length) throw new Error(`${rel}: unknown icon(s) ${missing.join(', ')} (design/icons/icons.json)`);
    const symbols = [...names].sort().map((n) => `<symbol id="i-${n}" viewBox="${icons[n].viewBox}">${icons[n].body}</symbol>`).join('');
    return `${open}<svg class="rf-sprite" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden"><defs><linearGradient id="i-spectrum" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c1a8f8"/><stop offset=".3" stop-color="#8fb0ff"/><stop offset=".55" stop-color="#7fd6e6"/><stop offset=".78" stop-color="#a0decf"/><stop offset="1" stop-color="#f1c79a"/></linearGradient></defs>${symbols}</svg>${close}`;
  });
  html = html.replace(/(<[a-z][a-z0-9-]*\b[^>]*\sdata-rf-lambda="([^"]+)"[^>]*>)([^<]*)(?=<)/g, (all, open, id, text) => {
    const l = lambdaOf(id);
    if (!l) throw new Error(`${rel}: data-rf-lambda="${id}" is not a gallery, app page or surface in design/tokens.json`);
    return open + l;
  });
  if (html !== before) await put(rel, html);
}

if (check) {
  if (stale.length) { console.error(`Refraction assets out of date (run node website/scripts/sync-refraction.mjs):\n  ${stale.join('\n  ')}`); process.exit(1); }
  console.log(`Refraction assets up to date (tokens ${tokens.version}).`);
} else console.log(stale.length ? `Updated ${stale.length} file(s):\n  ${stale.join('\n  ')}` : `Refraction assets already up to date (tokens ${tokens.version}).`);
