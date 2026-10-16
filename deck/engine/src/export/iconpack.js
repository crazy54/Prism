// Elgato icon packs (.streamDeckIconPack), one per deck theme (formats.md §4):
//
//   <id>.sdIconPack/
//     manifest.json   { Name, Version (x.y.z), Author, Description, Icon, URL, License }
//     icons.json      [{ path, name, tags }]
//     icon.png/.svg   the pack icon
//     license.txt
//     icons/          every glyph × state × mode at 144×144:
//                       still glyphs, and states whose idle loop doesn't actually move → .svg (vector, listed)
//                       glyph states that move → .gif (listed, the idle loop, ≥ 2 distinct frames) + a .png still
//                       with the same basename (listed too, as "… · Still"; every GIF pack installed on the owner's
//                       machine ships that twin — formats.md §4.4)
//     license.txt     MIT (the art) + the SIL OFL 1.1 of Inter (the outlines labels are drawn from); OFL.txt too
//     previews/       1280×720 PNG sheets (Night / Day)
//
// GIF/PNG come from src/raster (rasterize / encodePNG / encodeGIF). Without it the
// pack is SVG-only (static) — pass { raster: null } to force that.

import fs from 'node:fs';
import { writeZip, readZip } from './plugin-zip.js';
import { render, stillTime } from '../render.js';
import { findFacet } from '../facets/index.js';
import { allGlyphs } from '../glyphs/_registry.js';
import { useTheme, themeRegistry } from '../themes/_registry.js';
import { normalizeFacet } from '../facets/schema.js';
import { surface } from '../scene/surface.js';
import { svgInner, suffixIds, n } from '../scene/svg.js';
import { validateSvg } from '../scene/validate.js';

export const PACK_PREFIX = 'com.jeremyfhall.prism.icons';
export const ICON_PX = 144;
export const GIF_FPS = 12;
export const GIF_MAX_FRAMES = 60;
const MODE_NAME = { dark: 'night', light: 'day' };
const MIT = (year, author) => `MIT License\n\nCopyright (c) ${year} ${author}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`;

/** The src/raster backend, or null when it isn't available. */
export async function loadRaster() {
  try {
    const r = await import('../raster/index.js');
    return typeof r.rasterize === 'function' && typeof r.encodePNG === 'function' && typeof r.encodeGIF === 'function' ? r : null;
  } catch { return null; }
}

// The pack icon: the theme's own key material with the Prism mark drawn in its ink and accent.
const MARK_FACET = normalizeFacet({
  id: 'app-pack-mark', title: 'Pack mark', category: 'Dashboards', tags: ['system'], description: 'Icon pack cover: the Prism mark on the theme material.', surface: 'key', animated: false,
  render(ctx) {
    const k = surface(ctx);
    k.background({ tone: 'active' });
    const s = ctx.w / 40, ink = k.color('ink'), acc = k.color('accent');
    const P = (d) => d.replace(/[\d.]+/g, (v) => n(Number(v) * s * 0.62 + ctx.w * 0.19));
    k.add(`<path d="${P('M20 4 36 33H25Z')}" fill="${acc}" fill-opacity="0.18"/>`);
    k.add(`<path d="${P('M20 4 36 33H4Z')}" fill="none" stroke="${ink}" stroke-width="${n(s * 1.15)}" stroke-linejoin="round"/>`);
    k.add(`<path d="${P('M20 4 25 33')}" fill="none" stroke="${ink}" stroke-opacity="0.7" stroke-width="${n(s * 0.8)}" stroke-linecap="round"/>`);
    k.add(`<path d="${P('M25.9 33H35.1')}" fill="none" stroke="${acc}" stroke-width="${n(s * 1.1)}" stroke-linecap="round"/>`);
    return k.svg();
  },
}, 'apps/app-pack-mark.js');

const fileSafe = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Every icon a pack contains (no rendering yet): [{ glyph, facet, state, stateName, mode, base, animated, name, tags }] */
export function packPlan(themeId, { glyphs } = {}) {
  const theme = themeRegistry().themes.get(themeId);
  if (!theme) throw new Error(`unknown theme "${themeId}"`);
  const list = [];
  for (const g of allGlyphs()) {
    if (glyphs && !glyphs.includes(g.id)) continue;
    const facet = findFacet(`icon-${g.id}`);
    if (!facet) continue;
    const states = facet.states.length ? facet.states : [null];
    for (const mode of theme.modes) {
      states.forEach((stateName, state) => {
        const base = [g.id, stateName, MODE_NAME[mode] || mode].filter(Boolean).map(fileSafe).join('-');
        list.push({
          glyph: g.id, facet, state, stateName, mode, base, animated: g.loop > 0,
          name: `${g.title}${stateName ? ` · ${titleCase(stateName)}` : ''} · ${mode === 'light' ? 'Day' : 'Night'}`,
          tags: [...new Set([...(g.tags || []), g.category, stateName, MODE_NAME[mode], theme.id, 'prism'].filter(Boolean).map((t) => String(t).toLowerCase()))],
        });
      });
    }
  }
  return { theme, list };
}

function frames(item, themeSpec, count, fps) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(render(item.facet, { size: ICON_PX, theme: themeSpec, mode: item.mode, t: i / fps, state: item.state, since: 10, params: { showLabel: false } }).svg);
  return out;
}

/** A 1280×720 preview sheet (SVG) of the first icons of a mode. */
export function previewSheet(svgs, bg) {
  const W = 1280, H = 720, cell = 128, gap = 16, cols = 8, rows = 4;
  const x0 = (W - (cols * cell + (cols - 1) * gap)) / 2, y0 = (H - (rows * cell + (rows - 1) * gap)) / 2;
  let body = '';
  svgs.slice(0, cols * rows).forEach((svg, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    body += `<g transform="translate(${n(x0 + c * (cell + gap))} ${n(y0 + r * (cell + gap))}) scale(${n(cell / ICON_PX, 4)})">${suffixIds(svgInner(svg), `p${i}`)}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`;
}

/**
 * Build one theme's icon pack.
 * opts: { theme, version ('0.3.0'), author, url, raster (module | null | undefined = load), glyphs (subset), year }
 * → { id, folder, zip, entries, icons (icons.json), manifest, stats }
 */
export async function buildIconPack({ theme: themeId, version = '0.3.0', author = 'Jeremy F Hall', url = 'https://prism.jeremyfhall.com', raster, glyphs, year = 2026 } = {}) {
  const R = raster === undefined ? await loadRaster() : raster;
  const { theme, list } = packPlan(themeId, { glyphs });
  const id = `${PACK_PREFIX}.${themeId}`;
  const folder = `${id}.sdIconPack`;
  const entries = [], icons = [];
  const stats = { svg: 0, gif: 0, png: 0, stillLoops: 0, bytes: 0, invalid: [] };
  const add = (name, data) => { entries.push({ name: `${folder}/${name}`, data }); stats.bytes += data.length; };
  const previews = { dark: [], light: [] };
  for (const it of list) {
    const still = render(it.facet, { size: ICON_PX, theme: themeId, mode: it.mode, t: stillTime(it.facet), state: it.state, since: 10, params: { showLabel: false } }).svg;
    const problems = validateSvg(still, { maxBytes: 32768 });
    if (problems.length) stats.invalid.push(`${it.base}: ${problems[0]}`);
    previews[it.mode]?.push(still);
    let imgs = null;
    if (it.animated && R) {
      const loop = it.facet.loop || 2;
      const fps = Math.min(GIF_FPS, GIF_MAX_FRAMES / loop);
      const count = Math.max(2, Math.round(loop * fps));
      imgs = frames(it, themeId, count, fps).map((svg) => ({ ...R.rasterize(svg, ICON_PX, ICON_PX), delay: 1000 / fps }));
      // a state whose idle loop doesn't move (every frame identical) is a still, not a one-frame "animation"
      const px = (im) => Buffer.from(im.data.buffer, im.data.byteOffset, im.data.byteLength);
      const first = px(imgs[0]);
      if (!imgs.some((im) => !px(im).equals(first))) { imgs = null; stats.stillLoops++; }
    }
    if (imgs) {
      add(`icons/${it.base}.gif`, Buffer.from(R.encodeGIF(imgs, { loop: 0 })));
      add(`icons/${it.base}.png`, Buffer.from(R.encodePNG(R.rasterize(still, ICON_PX, ICON_PX))));
      icons.push({ path: `${it.base}.gif`, name: it.name, tags: [...it.tags, 'animated'] });
      icons.push({ path: `${it.base}.png`, name: `${it.name} · Still`, tags: [...it.tags, 'still'] });
      stats.gif++; stats.png++;
    } else {
      add(`icons/${it.base}.svg`, Buffer.from(still));
      icons.push({ path: `${it.base}.svg`, name: it.name, tags: it.tags });
      stats.svg++;
    }
  }
  const mark = render(MARK_FACET, { size: 256, theme: themeId, mode: theme.modes[0] }).svg;
  add('icon.svg', Buffer.from(mark));
  if (R) add('icon.png', Buffer.from(R.encodePNG(R.rasterize(mark, 256, 256))));
  if (R) for (const mode of theme.modes) {
    const t = useTheme(themeId, mode);
    if (previews[mode].length) add(`previews/${MODE_NAME[mode] || mode}.png`, Buffer.from(R.encodePNG(R.rasterize(previewSheet(previews[mode], t.colors.bg), 1280, 720))));
  }
  const ofl = interOfl();
  add('license.txt', Buffer.from(`${MIT(year, author)}\n\nThird-party: Inter typeface\n---------------------------\nThe icon labels and numerals are drawn from Inter outlines, licensed under the SIL Open Font License 1.1 (also in OFL.txt):\n\n${ofl}`));
  add('OFL.txt', Buffer.from(ofl));
  const glyphCount = new Set(list.map((x) => x.glyph)).size;
  const manifest = {
    Name: `Prism Deck · ${theme.title}`,
    Version: version,
    Author: author,
    Description: `${icons.length} icons: ${glyphCount} Prism glyphs × their states × ${theme.modes.map((m) => (m === 'light' ? 'Day' : 'Night')).join(' / ')}, in the ${theme.title} material. ${R ? `${stats.gif} animated GIF loops, each with its still PNG; ${stats.svg} static SVGs` : `${stats.svg} static SVGs`}; 144 × 144.`.slice(0, 400),
    Icon: R ? 'icon.png' : 'icon.svg',
    URL: url,
    License: 'license.txt',
  };
  add('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  add('icons.json', Buffer.from(JSON.stringify(icons, null, 2)));
  return { id, folder, manifest, icons, entries, stats, zip: writeZip(entries) };
}

/** Inter's SIL OFL 1.1 (src/scene/fonts/OFL.txt). */
export function interOfl() {
  try { return fs.readFileSync(new URL('../scene/fonts/OFL.txt', import.meta.url), 'utf8'); } catch { return 'Inter: Copyright (c) 2016 The Inter Project Authors (https://github.com/rsms/inter). SIL Open Font License 1.1: https://openfontlicense.org\n'; }
}

/** Frames in a GIF (image descriptors), or -1 when it doesn't parse. */
export function gifFrameCount(d) {
  try {
    if (d.toString('latin1', 0, 3) !== 'GIF') return -1;
    let p = 13;
    if (d[10] & 0x80) p += 3 * (1 << ((d[10] & 7) + 1));
    let n = 0;
    const skipBlocks = () => { while (d[p]) p += d[p] + 1; p++; };
    while (p < d.length) {
      const b = d[p++];
      if (b === 0x3b) return n;
      if (b === 0x21) { p++; skipBlocks(); continue; }
      if (b !== 0x2c) return -1;
      n++;
      const flags = d[p + 8]; p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      p++; skipBlocks();
    }
    return n;
  } catch { return -1; }
}

/** Structural check of a .streamDeckIconPack (formats.md §4.2–4.5). → problems[] */
export function checkIconPack(buf) {
  const out = [];
  let entries;
  try { entries = readZip(buf); } catch (e) { return [`zip: ${e.message}`]; }
  const roots = [...new Set(entries.map((e) => e.name.split('/')[0]))];
  if (roots.length !== 1 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+\.sdIconPack$/.test(roots[0])) return [`zip root must be one <reverse-dns>.sdIconPack folder, got ${roots.join(', ')}`];
  const root = roots[0];
  const get = (n) => entries.find((e) => e.name === `${root}/${n}`);
  let man, icons;
  try { man = JSON.parse(get('manifest.json').data.toString('utf8').replace(/^﻿/, '')); } catch { return ['manifest.json missing or invalid']; }
  try { icons = JSON.parse(get('icons.json').data.toString('utf8').replace(/^﻿/, '')); } catch { return ['icons.json missing or invalid']; }
  for (const f of ['Name', 'Author', 'Version', 'Icon']) if (typeof man[f] !== 'string' || !man[f]) out.push(`manifest: ${f} required`);
  if (!/^\d+\.\d+\.\d+$/.test(man.Version || '')) out.push('manifest: Version must be x.y.z');
  if (man.Icon && !get(man.Icon)) out.push(`manifest: Icon ${man.Icon} missing`);
  if (man.License && !get(man.License)) out.push(`manifest: License ${man.License} missing`);
  if (!Array.isArray(icons) || !icons.length) out.push('icons.json must be a non-empty array');
  const seen = new Set();
  for (const ic of icons || []) {
    const keys = Object.keys(ic).sort().join(',');
    if (keys !== 'name,path,tags') out.push(`icons.json entry keys must be path, name, tags (got ${keys})`);
    if (!Array.isArray(ic.tags)) out.push(`${ic.path}: tags must be an array`);
    if (seen.has(ic.path)) out.push(`${ic.path}: listed twice`);
    seen.add(ic.path);
    if (String(ic.path).length > 80) out.push(`${ic.path}: file name longer than 80 chars`);
    if (!/\.(svg|png|jpe?g|gif|webp)$/i.test(ic.path)) out.push(`${ic.path}: unsupported format`);
    const e = get(`icons/${ic.path}`);
    if (!e) { out.push(`${ic.path}: listed but missing`); continue; }
    if (/\.gif$/i.test(ic.path) && !get(`icons/${ic.path.replace(/\.gif$/i, '.png')}`)) out.push(`${ic.path}: no PNG twin`);
    if (/\.gif$/i.test(ic.path) && gifFrameCount(e.data) < 2) out.push(`${ic.path}: an "animated" GIF needs at least 2 frames (${gifFrameCount(e.data)}): make it a still`);
    if (/\.gif$/i.test(ic.path) && !ic.tags?.includes('animated')) out.push(`${ic.path}: GIFs are tagged animated`);
    if (!/\.gif$/i.test(ic.path) && ic.tags?.includes('animated')) out.push(`${ic.path}: only GIFs are tagged animated`);
    if (/\.svg$/i.test(ic.path)) { const s = e.data.toString('utf8'); if (!/width="144"/.test(s) || !/height="144"/.test(s)) out.push(`${ic.path}: must be 144×144`); }
    if (/\.png$/i.test(ic.path) || /\.gif$/i.test(ic.path)) {
      const d = e.data;
      const w = /\.png$/i.test(ic.path) ? d.readUInt32BE(16) : d.readUInt16LE(6), h = /\.png$/i.test(ic.path) ? d.readUInt32BE(20) : d.readUInt16LE(8);
      if (w !== 144 || h !== 144) out.push(`${ic.path}: must be 144×144 (is ${w}×${h})`);
      if (d.length > 1024 * 1024) out.push(`${ic.path}: larger than 1 MB`);
    }
  }
  // nothing ships unlisted (the PNG stills of the GIFs are listed too)
  for (const e of entries) { const m = e.name.startsWith(`${root}/icons/`) && !e.name.endsWith('/') ? e.name.slice(root.length + 7) : null; if (m && !seen.has(m)) out.push(`icons/${m}: shipped but not listed in icons.json`); }
  // the description's counts match the files
  const nGif = (icons || []).filter((x) => /\.gif$/i.test(x.path)).length, nSvg = (icons || []).filter((x) => /\.svg$/i.test(x.path)).length;
  if (typeof man.Description === 'string' && /^\d+ icons/.test(man.Description)) {
    if (!man.Description.startsWith(`${(icons || []).length} icons`)) out.push('manifest: Description icon count does not match icons.json');
    if (nGif && !man.Description.includes(`${nGif} animated`)) out.push('manifest: Description animated count does not match');
    if (!man.Description.includes(`${nSvg} static`)) out.push('manifest: Description static count does not match');
  }
  return out;
}
