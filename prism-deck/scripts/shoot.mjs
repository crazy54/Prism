// Visual check: render facets onto key tiles and virtual devices, write an HTML page,
// screenshot it with the team's headless-Chrome tool (aaa-prism-ds/tools/snap.mjs).
//
//   node scripts/shoot.mjs --sheet --gallery icons --out <dir>                 every facet × state × key size
//   node scripts/shoot.mjs --sheet --all --theme all --mode both --out <dir>   every facet in every theme, dark + light
//   node scripts/shoot.mjs --device galleon --facet theme-prism --out <dir>     one facet on one device (deck/span/strip/screen/key)
//   node scripts/shoot.mjs --device plus --keys icon-mic,icon-volume --strip dial-volume --out <dir>
//   node scripts/shoot.mjs --devices galleon,plus,mk2,xl,mini --facet theme-prism --out <dir>   contact sheet across devices
//   node scripts/shoot.mjs --hero --out <dir>                                  every family device dressed in the deck theme
//
// Options: --t (comma list of seconds; default each facet's still time), --theme <id>|all, --mode dark|light|both,
// --sizes 72,96,144 (sheet key sizes; default every native key size), --width <px> (device width), --seed, --html-only,
// --slices (device views: every key / dial segment / Galleon widget / info bar is its own culled slice, run through
// toDeviceSvg and placed as an independent image — exactly what the hardware receives, no whole-canvas AA seams).
// SNAP overrides the screenshot tool path.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allFacets, findFacet } from '../src/facets/index.js';
import { render, stillTime } from '../src/render.js';
import { deviceMarkup, DEVICE_CSS } from '../src/scene/device-view.js';
import { getDevice, KEY_SIZES, FAMILY_DEVICES, keySize } from '../src/devices.js';
import { allThemes, useTheme } from '../src/themes/_registry.js';
import { getGallery } from '../src/facets/galleries.js';
import { esc } from '../src/scene/svg.js';
import { toDeviceSvg } from '../src/scene/qt.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP = process.env.SNAP || path.resolve(HERE, '..', '..', '..', 'aaa-prism-ds', 'tools', 'snap.mjs');

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), v = argv[i + 1];
  args[k] = v !== undefined && !v.startsWith('--') ? (i++, v) : true;
}
if (!args.out) { console.error('--out <dir> is required'); process.exit(1); }
const out = path.resolve(args.out);
fs.mkdirSync(out, { recursive: true });
const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);
const themes = args.theme === 'all' ? allThemes().map((t) => t.id) : [args.theme || 'prism'];
const modes = args.mode === 'both' ? ['dark', 'light'] : [args.mode || 'dark'];
const times = args.t ? list(args.t).map(Number) : null;
const seed = args.seed ? Number(args.seed) : 7;
const need = (id) => findFacet(id) || (() => { throw new Error(`no facet ${id}`); })();
const sizes = args.sizes ? list(args.sizes).map((s) => { const [w, h] = s.split('x').map(Number); return { w, h: h || w }; }) : KEY_SIZES;
const DIAL_VALUES = [0.35, 0.8, 0.55, 0.2, 0.65, 0.45];

const PAGE_CSS = (T) => `html,body{margin:0;background:${T.colors.bg};color:${T.colors.ink};font:13px/1.4 Inter,'Segoe UI',system-ui,sans-serif}
body{padding:28px 32px}
h1{font:650 22px/1.1 Inter,'Segoe UI',sans-serif;letter-spacing:-.5px;margin:2px 0 0}
.eyebrow{font:600 10px/1 'Cascadia Mono',Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:${T.colors.muted}}
.eyebrow .l{text-transform:none}
.grid{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start;margin-top:20px}
.tile{background:${T.colors.surface};border:1px solid ${T.colors.line};border-radius:12px;padding:12px 14px 14px}
.tile .cap{display:flex;justify-content:space-between;gap:16px;margin-bottom:10px}
.row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap}
.k{display:flex;flex-direction:column;align-items:center;gap:6px}
.lcd{position:relative;overflow:hidden;background:#000;border-radius:14%;box-shadow:0 0 0 3px #00000080,inset 0 0 0 1px #ffffff14}
.lcd::after{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(162deg,#ffffff1c,#ffffff08 28%,transparent 46%);pointer-events:none}
.lcd svg{display:block;width:100%;height:100%}
.wide{border-radius:8px}
.devices{display:flex;flex-wrap:wrap;gap:36px 44px;align-items:flex-end;margin-top:24px}
.dev{display:flex;flex-direction:column;gap:12px}
${DEVICE_CSS}`;
const doc = (T, title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS(T)}</style></head><body>${body}</body></html>`;
const lambda = (T, hue) => `<span class="l">λ</span>${T.lambda(hue)}`;

function snap(htmlFile, png, w) {
  if (args['html-only']) return console.log(htmlFile);
  const r = execFileSync(process.execPath, [SNAP, htmlFile, png, `--w=${w}`, '--h=600', '--wait=700', '--full'], { encoding: 'utf8' });
  if (/page errors/.test(r)) console.warn(r.trim());
  console.log(png);
}
function write(name, html, w) {
  const file = path.join(out, `${name}.html`);
  fs.writeFileSync(file, html);
  snap(file, path.join(out, `${name}.png`), w);
}

/** A device dressed with render outputs. spec: { facet (deck/span/strip/screen/key), keys: [facet], strip: facet, screen: facet } */
function deviceHtml(model, theme, mode, spec, t) {
  const d = getDevice(model);
  const ro = (f, extra = {}) => render(f, { device: d.id, theme, mode, t: t ?? stillTime(f), since: t ?? stillTime(f), seed, uniqueIds: true, idPrefix: `${d.id}-${f.id}`, ...extra });
  const parts = { keys: [], segments: null, strip: null, stripSegments: null, screen: null, widgets: null };
  const main = spec.facet;
  if (main?.surface === 'deck') { const r = ro(main); parts.keys = r.keys.map((k) => k.svg); parts.segments = r.segments; parts.screen = r.screen; parts.widgets = r.widgets?.map((w) => w.svg) || null; }
  else if (main?.surface === 'span') { const r = ro(main); for (const k of r.keys) parts.keys[k.i] = k.svg; }
  const keyFacets = spec.keys?.length ? spec.keys : main?.surface === 'key' ? [main] : [];
  if (keyFacets.length && d.display === 'lcd') {
    for (let i = 0; i < d.cols * d.rows; i++) {
      if (parts.keys[i]) continue;
      const f = keyFacets[i % keyFacets.length];
      const state = f.states.length ? Math.floor(i / keyFacets.length) % f.states.length : 0;
      const at = (t ?? stillTime(f)) + i * 0.37;
      parts.keys[i] = ro(f, { state, t: at, since: at, seed: seed + i, idPrefix: `${d.id}-k${i}` }).svg;
    }
  }
  const stripF = spec.strip || (main?.surface === 'strip' ? main : null);
  if (d.strip && stripF) {
    if (stripF.segments === 1) parts.segments = Array.from({ length: d.strip.segments }, (_, i) => ro(stripF, { segment: i, value: DIAL_VALUES[i], state: i === d.strip.segments - 1 ? 1 : 0, idPrefix: `${d.id}-d${i}` }).svg);
    else { const r = ro(stripF); parts.strip = r.svg; parts.stripSegments = r.segments; }
  }
  const screenF = spec.screen || (main?.surface === 'screen' ? main : null);
  if (d.screen && screenF && (d.screen.kind !== 'infobar' || screenF.screens.includes('infobar'))) { const r = ro(screenF, { screen: d.screen.kind === 'infobar' ? 'infobar' : 'galleon' }); parts.screen = r.svg; parts.widgets = r.widgets?.map((w) => w.svg) || null; }
  if (args.slices) {
    // what the hardware gets: each slice on its own, device-ready, rasterized independently by the browser
    const img = (svg) => (svg ? `<img alt="" style="display:block;width:100%;height:100%" src="data:image/svg+xml;base64,${Buffer.from(toDeviceSvg(svg)).toString('base64')}">` : svg);
    parts.keys = parts.keys.map(img);
    if (parts.stripSegments) { parts.segments = parts.stripSegments; parts.strip = null; }
    if (parts.segments) parts.segments = parts.segments.map(img);
    if (d.screen?.kind === 'galleon' && parts.widgets) { parts.widgets = parts.widgets.map(img); parts.screen = null; }
    else if (parts.screen) parts.screen = img(parts.screen);
  }
  const T = useTheme(theme, mode);
  return deviceMarkup(d.id, { theme, mode, width: Number(args.width) || Math.min(760, d.body?.w || 600), keys: parts.keys, strip: parts.strip, segments: parts.segments,
    screen: d.screen?.kind === 'galleon' ? parts.screen || undefined : undefined, widgets: args.slices && d.screen?.kind === 'galleon' ? parts.widgets || undefined : undefined, infobar: d.screen?.kind === 'infobar' ? parts.screen || undefined : undefined,
    dials: d.dials?.count ? Array.from({ length: d.dials.count }, (_, i) => -135 + DIAL_VALUES[i % 6] * 270) : undefined, label: `${d.name} · ${T.title}` });
}

/** One facet tile for the sheet. */
function tile(f, theme, mode, t) {
  const T = useTheme(f.theme || theme, mode);
  const g = getGallery(f.gallery);
  const at = +(t ?? stillTime(f)).toFixed(2);
  const states = f.states.length ? f.states : [null];
  const lbl = (s) => `<span class="eyebrow">${esc(s ?? (f.animated ? `t ${at}s` : 'still'))}</span>`;
  const ro = (extra) => render(f, { t: at, since: at, theme, mode, seed, ...extra });
  let body = '';
  if (f.surface === 'key') {
    const big = sizes.reduce((a, b) => (b.w > a.w ? b : a));
    body = `<div class="row">${states.map((s, i) => `<div class="k"><div class="lcd" style="width:${big.w}px;height:${big.h}px">${ro({ size: big, state: i, idPrefix: `${f.id}-${i}` }).svg}</div>${lbl(s)}</div>`).join('')}</div>`;
    const small = sizes.filter((s) => s !== big);
    if (small.length) body += `<div class="row" style="margin-top:10px">${small.map((sz) => `<div class="k"><div class="lcd" style="width:${sz.w}px;height:${sz.h}px">${ro({ size: sz, state: Math.min(1, states.length - 1), idPrefix: `${f.id}-${sz.w}x${sz.h}` }).svg}</div><span class="eyebrow">${sz.w}${sz.h !== sz.w ? `×${sz.h}` : ''}</span></div>`).join('')}</div>`;
  } else if (f.surface === 'strip' && f.segments === 1) {
    body = `<div class="row">${states.map((s, i) => `<div class="k" style="align-items:flex-start"><div class="lcd wide" style="width:200px;height:100px">${ro({ state: i, idPrefix: `${f.id}-${i}` }).svg}</div>${lbl(s)}</div>`).join('')}</div>`;
  } else if (f.surface === 'strip') {
    body = ['plus', 'plusxl'].map((dv) => { const r = ro({ device: dv, idPrefix: `${f.id}-${dv}` }); return `<div class="k" style="align-items:flex-start;margin-bottom:8px"><div class="lcd wide" style="width:${r.w * 0.8}px;height:${r.h * 0.8}px">${r.svg}</div><span class="eyebrow">${dv} · ${r.w}×${r.h}</span></div>`; }).join('');
  } else if (f.surface === 'screen') {
    body = `<div class="row">${f.screens.map((sc) => { const r = ro({ screen: sc, idPrefix: `${f.id}-${sc}` }); const s = Math.min(1, 560 / r.w); return `<div class="k" style="align-items:flex-start"><div class="lcd wide" style="width:${r.w * s}px;height:${r.h * s}px">${r.svg}</div><span class="eyebrow">${sc} · ${r.w}×${r.h}</span></div>`; }).join('')}</div>`;
  } else {
    body = `<div class="row">${(args.devices ? list(args.devices) : ['mk2']).map((dv) => `<div class="dev">${deviceHtml(dv, theme, mode, { facet: f }, t)}</div>`).join('')}</div>`;
  }
  return `<div class="tile"><div class="cap"><span><b>${esc(f.title)}</b> <span class="eyebrow">· ${esc(f.id)}</span></span><span class="eyebrow">${esc(g.title)} / ${esc(f.category)} · ${f.surface} · ${lambda(T, g.hue)}</span></div>${body}</div>`;
}

let facets = allFacets();
if (args.ids) facets = list(args.ids).map(need);
else if (args.gallery) facets = facets.filter((f) => f.gallery === args.gallery);

for (const theme of themes) for (const mode of modes) {
  const T = useTheme(theme, mode);
  const suffix = `${themes.length > 1 || args.theme ? `-${theme}` : ''}${modes.length > 1 || args.mode ? `-${mode}` : ''}`;
  if (args.sheet) {
    if (!args.ids && !args.gallery && !args.all) { console.error('give --ids, --gallery or --all'); process.exit(1); }
    for (const t of times || [null]) {
      const head = `<div class="eyebrow">Prism Deck · ${facets.length} facets · ${esc(T.title)} ${mode}</div><h1>${esc(args.gallery ? getGallery(args.gallery).title : 'Deck facets')}</h1>`;
      write(`sheet-${args.gallery || (args.ids ? 'ids' : 'all')}${t !== null ? `-t${t}` : ''}${suffix}`, doc(T, 'sheet', `${head}<div class="grid">${facets.map((f) => tile(f, theme, mode, t)).join('')}</div>`), 1680);
    }
  } else if (args.device || args.devices) {
    const devs = args.devices ? list(args.devices) : [args.device];
    const spec = { facet: args.facet ? need(args.facet) : null, keys: args.keys ? list(args.keys).map(need) : [], strip: args.strip ? need(args.strip) : null, screen: args.screen ? need(args.screen) : null };
    for (const t of times || [null]) {
      const blocks = devs.map((dv) => { const d = getDevice(dv); return `<div class="dev"><span class="eyebrow">${esc(d.name)} · key ${keySize(d).w}px${t !== null ? ` · t ${t}s` : ''}</span>${deviceHtml(d.id, theme, mode, spec, t)}</div>`; }).join('');
      write(`device-${devs.join('-')}${spec.facet ? `-${spec.facet.id}` : ''}${t !== null ? `-t${t}` : ''}${suffix}`, doc(T, 'devices', `<div class="eyebrow">Prism Deck · ${esc(T.title)} ${mode}</div><h1>${esc(spec.facet?.title || 'Devices')}</h1><div class="devices">${blocks}</div>`), 1900);
    }
  } else if (args.hero) {
    const deck = findFacet(`theme-${theme}`) || findFacet('theme-prism');
    const strip = findFacet('dial-volume'), screen = findFacet('screen-galleon-dashboard'), neo = findFacet('screen-neo-clock');
    const blocks = FAMILY_DEVICES.map((dv) => { const d = getDevice(dv); return `<div class="dev"><span class="eyebrow">${esc(d.name)}</span>${deviceHtml(dv, theme, mode, { facet: deck, strip, screen: d.screen?.kind === 'infobar' ? neo : screen }, times?.[0])}</div>`; }).join('');
    write(`hero${suffix}`, doc(T, 'hero', `<div class="eyebrow">Prism Deck · ${esc(T.title)} ${mode}</div><h1>Every device</h1><div class="devices">${blocks}</div>`), 1900);
  } else { console.error('give --sheet, --device(s) or --hero'); process.exit(1); }
}
