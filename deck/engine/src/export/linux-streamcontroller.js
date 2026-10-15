// StreamController export — a Prism Deck setup as a StreamController page bundle.
//
// StreamController (Python/GTK4, Linux; Flathub com.core447.StreamController) cannot run
// Elgato plugins, but it imports self-contained page bundles (File → Import):
//   <Name>.scpage   one page   = zip { manifest.json (format "streamcontroller-page", version 1), page.json, assets/<sha256>.<ext> }
//   <Name>.zip      several    = zip { manifest.json (format "streamcontroller-pages"), pages/<page>.json, assets/… }
// Verified against upstream src/backend/PageManagement/PageBundle.py, InputIdentifier.py,
// HeadlessPageOps.py and DeckManagement/DeckController.py (main, 2026-10-15):
//   page.keys["<col>x<row>"].states["0"].media = { path, size, valign, halign, "fill-mode" }   (keys default "cover")
//   page.dials["<n>"].states["0"].media = { … "fill-mode": "contain" }                         (drawn on the + strip segment)
//   media.loop / media.fps for animated GIF keys (dials don't play GIFs yet: upstream TODO). KeyGIF reads each
//   frame's GIF duration but multiplies delays under 50 ms by 10 ("centiseconds" heuristic), so GIF loops
//   are capped at 16 fps (≥ 62 ms a frame) — a 30 fps GIF would play ten times too slow there.
//   background.color = [r, g, b, a]; labels.{top|center|bottom}.{text, font-size, color, …}
// On import, every "assets/…" path is copied into StreamController's asset manager and the
// page paths are rewritten to the local copies. Key art is static (or a GIF loop); live
// Prism apps (waveform, spectrum) need the Prism plugin host — see docs/linux.md.
//
//   buildStreamControllerBundle(setup, { raster, format: 'svg' | 'png', animate, created }) →
//     { zip, fileName, manifest, pages: { name: pageJson }, assets: [{ name, bytes }], dropped, warnings }
//   streamControllerPaths({ home, flatpak }) → where the app keeps its data

import crypto from 'node:crypto';
import { writeZip } from './plugin-zip.js';
import { normalizeSetup, renderPage, safeName } from './linux.js';

export const SC_FORMAT_PAGE = 'streamcontroller-page';
export const SC_FORMAT_PAGES = 'streamcontroller-pages';
export const SC_BUNDLE_VERSION = 1;
export const SC_APP_VERSION = '1.5.0-beta.16';        // informational ("app-version"); the importer checks `version` only
export const SC_FLATPAK_ID = 'com.core447.StreamController';
/** Models StreamController drives (sc-python-elgato-streamdeck PIDs; no Galleon — upstream issue #562). */
export const SC_DEVICES = ['original', 'original-v2', 'mini', 'mini-2022', 'mini-discord', 'mk2', 'scissor', 'xl', 'xl-2022', 'neo', 'plus', 'plusxl', 'studio', 'pedal', 'module-6', 'module-15', 'module-15-scissor', 'module-32'];

/** Where StreamController keeps its data. It uses the Flatpak path even for native installs (globals.py). */
export function streamControllerPaths({ home = '~' } = {}) {
  const data = `${home}/.var/app/${SC_FLATPAK_ID}/data`;
  return { data, pages: `${data}/pages`, icons: `${data}/icons`, customIcons: `${data}/custom_icons`, wallpapers: `${data}/wallpapers`, plusBarWallpapers: `${data}/sd_plus_bar_wallpapers`, plugins: `${data}/plugins` };
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const enc = (s) => Buffer.from(s, 'utf8');

/**
 * opts: { raster (src/raster, needed for png / animate), format: 'svg' (default) | 'png',
 *         animate: false (GIF loops for animated key facets; needs raster), fps: 12 (≤ 16), created (ISO string),
 *         force (export for unsupported devices) }
 */
export function buildStreamControllerBundle(rawSetup, opts = {}) {
  const setup = normalizeSetup(rawSetup);
  const model = setup.device;
  const warnings = [];
  if (!SC_DEVICES.includes(model.id) && !SC_DEVICES.includes(model.gridOf)) {
    const msg = `StreamController does not drive the ${model.name}${model.id === 'galleon' ? ' (upstream issue #562); use the Prism plugin under Companion or Prism Deck Direct' : ''}`;
    if (!opts.force) throw new Error(msg);
    warnings.push(msg);
  }
  const format = opts.format === 'png' ? 'png' : 'svg';
  const fps = Math.max(1, Math.min(16, opts.fps || 12));     // see the KeyGIF note above
  const raster = opts.raster || null;
  if ((format === 'png' || opts.animate) && !raster) throw new Error('png / animated export needs the raster backend (src/raster)');

  const assets = new Map();                         // archive name → { name, bytes }
  const addAsset = (bytes, ext, niceName) => {
    const name = `assets/${sha256(bytes)}.${ext}`;
    if (!assets.has(name)) assets.set(name, { name, bytes, original: niceName });
    return name;
  };
  const media = (slot, kind, niceName) => {
    let path, extra = {};
    if (slot.gif) { path = addAsset(slot.gif, 'gif', `${niceName}.gif`); extra = { loop: true, fps }; }
    else if (format === 'png' && slot.png) path = addAsset(slot.png, 'png', `${niceName}.png`);
    else path = addAsset(enc(slot.svg), 'svg', `${niceName}.svg`);
    return { path, size: 1, valign: 0, halign: 0, 'fill-mode': kind === 'key' ? 'cover' : 'contain', ...extra };
  };

  const pages = {}, dropped = [];
  const used = new Set();
  setup.pages.forEach((page, pi) => {
    let pname = safeName(setup.pages.length > 1 ? `${setup.name} - ${page.name}` : setup.name);
    while (used.has(pname)) pname = `${pname} ${pi + 1}`;
    used.add(pname);
    const r = renderPage(model, page, setup, { raster, png: format === 'png', animate: !!opts.animate, fps, noDialGif: true });
    for (const d of r.dropped) dropped.push({ page: page.name, ...d });
    if (page.infobar) dropped.push({ page: page.name, slot: 'infobar', reason: 'StreamController has no Neo info-bar slot' });
    const json = { keys: {}, dials: {}, settings: {} };
    for (const [coord, slot] of r.keys) {
      const [c, rr] = coord.split(',');
      json.keys[`${c}x${rr}`] = { states: { 0: { media: media(slot, 'key', `${slot.facet}-${c}x${rr}`), background: { color: [0, 0, 0, 255] } } } };
    }
    for (const [dial, slot] of r.dials) json.dials[String(dial)] = { states: { 0: { media: media(slot, 'dial', `${slot.facet}-dial${dial}`) } } };
    if (!Object.keys(json.dials).length) delete json.dials;
    pages[pname] = json;
  });

  const names = Object.keys(pages);
  const single = names.length === 1;
  const manifest = {
    format: single ? SC_FORMAT_PAGE : SC_FORMAT_PAGES,
    version: SC_BUNDLE_VERSION,
    'app-version': SC_APP_VERSION,
    created: opts.created || '2026-10-15T12:00:00',
    pages: names,
    plugins: {},
    assets: Object.fromEntries([...assets.values()].map((a) => [a.name, { name: a.original, sha256: a.name.slice(7, 71), origin: null }])),
    'custom-packs': {},
  };
  const files = [{ name: 'manifest.json', data: JSON.stringify(manifest, null, 4) }];
  if (single) files.push({ name: 'page.json', data: JSON.stringify(pages[names[0]], null, 4) });
  else for (const n of names) files.push({ name: `pages/${n}.json`, data: JSON.stringify(pages[n], null, 4) });
  for (const a of assets.values()) files.push({ name: a.name, data: Buffer.from(a.bytes) });
  const zip = writeZip(files);
  return { zip, fileName: `${safeName(rawSetup.file || setup.name)}${single ? '.scpage' : '.zip'}`, manifest, pages, assets: [...assets.values()], dropped, warnings, device: model.id };
}

/**
 * Structural check of a bundle we (or anyone) produced: the things StreamController's
 * importer (PageBundle.load_bundle) relies on. → problems[] ([] = ok)
 */
export function checkStreamControllerBundle(entries) {
  const out = [];
  const byName = new Map(entries.map((e) => [e.name, e]));
  const read = (n) => { const e = byName.get(n); return e ? JSON.parse(Buffer.from(e.data).toString('utf8')) : null; };
  let manifest;
  try { manifest = read('manifest.json'); } catch { return ['manifest.json is not JSON']; }
  if (!manifest) return ['missing manifest.json'];
  if (![SC_FORMAT_PAGE, SC_FORMAT_PAGES].includes(manifest.format)) out.push(`bad format ${manifest.format}`);
  if (!(manifest.version <= SC_BUNDLE_VERSION)) out.push('version newer than the importer');
  const pageFiles = manifest.format === SC_FORMAT_PAGE ? ['page.json'] : entries.filter((e) => /^pages\/[^/]+\.json$/.test(e.name)).map((e) => e.name);
  if (!pageFiles.length) out.push('no pages');
  for (const pf of pageFiles) {
    let page;
    try { page = read(pf); } catch { out.push(`${pf} is not JSON`); continue; }
    if (!page) { out.push(`missing ${pf}`); continue; }
    for (const [type, re] of [['keys', /^\d+x\d+$/], ['dials', /^\d+$/]]) {
      for (const [id, input] of Object.entries(page[type] || {})) {
        if (!re.test(id)) out.push(`${pf}: bad ${type} identifier "${id}"`);
        for (const [st, state] of Object.entries(input.states || {})) {
          const p = state.media?.path;
          if (!p) continue;
          if (!/^assets\/[0-9a-f]{64}\.(svg|png|gif)$/.test(p) || p.split('/').includes('..')) out.push(`${pf}: ${type} ${id}/${st}: unsafe asset path ${p}`);
          else if (!byName.has(p)) out.push(`${pf}: ${type} ${id}/${st}: missing ${p}`);
          else if (!manifest.assets?.[p]) out.push(`${pf}: ${p} not listed in manifest.assets`);
        }
      }
    }
  }
  for (const [name, a] of Object.entries(manifest.assets || {})) {
    const e = byName.get(name);
    if (!e) { out.push(`manifest lists missing ${name}`); continue; }
    if (sha256(Buffer.from(e.data)) !== a.sha256) out.push(`${name}: sha256 mismatch`);
  }
  return out;
}
