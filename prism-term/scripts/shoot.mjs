// Visual check for terminal facets: render to HTML and screenshot with headless Chrome.
//
//   node scripts/shoot.mjs --ids plasma,fire --t 2 --out <dir>                 one PNG per facet
//   node scripts/shoot.mjs --gallery loaders --sheet --t 1.5 --out <dir>       one contact sheet PNG
//   node scripts/shoot.mjs --ids donut --t 1,3,5 --mode braille --size 80x24 --theme primer-dark --out <dir>
//
// Options: --ids a,b | --gallery g | --all, --t (comma list, seconds), --mode, --size WxH (default: each
// facet's preferred size), --theme, --sheet (grid of every facet at the first --t), --cols N (sheet columns),
// --out dir (required), --font N (px, default 13), --ascii (render as a no-Unicode terminal would:
// caps.unicode=false, so facets take their 7-bit paths — not just the ascii canvas mode).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { allFacets } from '../src/facets/index.js';
import { renderScene } from '../src/render.js';
import { frameHtml } from '../src/export.js';
import { getTheme } from '../src/palettes.js';
import { toHex } from '../src/color.js';

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.out) { console.error('--out <dir> is required'); process.exit(1); }
const out = path.resolve(args.out);
fs.mkdirSync(out, { recursive: true });

let facets = allFacets();
if (args.ids) { const ids = String(args.ids).split(','); facets = ids.map((id) => facets.find((f) => f.id === id) || (() => { throw new Error(`no facet ${id}`); })()); }
else if (args.gallery) facets = facets.filter((f) => f.gallery === args.gallery);
else if (!args.all) { console.error('give --ids, --gallery or --all'); process.exit(1); }
const times = String(args.t ?? 2).split(',').map(Number);
const theme = getTheme(args.theme);
const font = Number(args.font || 13);
const sizeOf = (f) => (args.size ? (() => { const [w, h] = String(args.size).split('x').map(Number); return { width: w, height: h }; })() : { width: f.size.w, height: f.size.h });

const CSS = `html,body{margin:0;background:${toHex(theme.bg)}}body{padding:14px;font:${font}px/1 "Cascadia Mono","Cascadia Code",Consolas,monospace;color:${toHex(theme.ink)}}
pre{margin:0;white-space:pre;letter-spacing:0;font-variant-ligatures:none;font:inherit;line-height:1}
.cap{font:12px system-ui,sans-serif;color:${toHex(theme.muted)};margin:0 0 6px}.cap b{color:${toHex(theme.ink)}}
.grid{display:grid;gap:18px;align-items:start}.cell{border:1px solid ${toHex(theme.line)};border-radius:6px;padding:8px;background:${toHex(theme.bg)}}`;

function render(f, t) {
  const { width, height } = sizeOf(f);
  const caps = args.ascii ? { unicode: false, braille: false, sextant: false } : undefined;
  return renderScene(f, { width, height, t: f.animated ? t : 0, mode: args.mode || (args.ascii ? 'ascii' : null), theme: args.theme, fps: 20, caps });
}

function shot(html, file, w, h) {
  const htmlFile = file.replace(/\.png$/, '.html');
  fs.writeFileSync(htmlFile, html);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--screenshot=${file}`, 'file:///' + htmlFile.replace(/\\/g, '/').replace(/ /g, '%20')], { stdio: 'ignore' });
  return file;
}

const doc = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;
const cellW = font * 0.6, cellH = font;

if (args.sheet) {
  const cols = Number(args.cols || 3);
  const t = times[0];
  const cells = facets.map((f) => {
    const b = render(f, t);
    return `<div class="cell"><div class="cap"><b>${f.id}</b> · ${f.gallery} / ${f.category} · ${b.width}×${b.height}</div><pre>${frameHtml(b, theme)}</pre></div>`;
  });
  const maxW = Math.max(...facets.map((f) => sizeOf(f).width));
  const colPx = Math.ceil(maxW * cellW + 30);
  const rows = Math.ceil(facets.length / cols);
  const maxH = Math.max(...facets.map((f) => sizeOf(f).height));
  const file = path.join(out, `sheet-${args.gallery || 'facets'}-t${t}${args.ascii ? '-ascii' : ''}.png`);
  shot(doc(`<div class="grid" style="grid-template-columns:repeat(${cols},${colPx}px)">${cells.join('')}</div>`), file, cols * (colPx + 18) + 30, rows * Math.ceil(maxH * cellH + 60) + 40);
  console.log(file);
} else {
  for (const f of facets) for (const t of times) {
    const b = render(f, t);
    const file = path.join(out, `${f.id}-t${t}${args.mode ? `-${args.mode}` : ''}${args.ascii ? '-ascii' : ''}.png`);
    shot(doc(`<div class="cap"><b>${f.title}</b> · ${f.gallery} / ${f.category} · ${b.width}×${b.height} · t=${t}s</div><pre>${frameHtml(b, theme)}</pre>`), file, Math.ceil(b.width * cellW + 40), Math.ceil(b.height * cellH + 60));
    console.log(file);
  }
}
