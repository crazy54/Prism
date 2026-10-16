// Linux app exports — shared core: a Prism Deck *setup* → rendered images per slot.
//
// A setup is the same page shape the Elgato profile exporter takes (src/export/profile.js
// SAMPLE_LAYOUTS / buildProfile), so one layout exports everywhere:
//   { device, name, theme?, mode?, pages: [{ name, keys: [{ col, row, settings }], dials: [{ dial, layer, settings }], infobar? }] }
//   settings = the Prism Display action settings (src/plugin/settings.js): { facet, theme, mode, params, group, state, value }
// MCP layout documents (schema "prism-deck-layout/0.1": look.facet / look.glyph / feedback.facet) are accepted too.
//
//   normalizeSetup(setup)                  → { device (model), name, theme, mode, pages }
//   pageUnits(model, page)                 → render units, grouped exactly like the plugin runtime (facet + span group)
//   renderPage(model, page, opts)          → { keys: Map('col,row' → slot), dials: Map(dial → slot), infobar?, dropped }
//        slot = { svg, w, h, png?, gif?, facet, animated }   (png/gif only when a raster backend is given)
//   loadRaster()                           → src/raster (rasterize + encodePNG + encodeGIF) or null
//
// Rendering is deterministic (stillTime of each facet, fixed seed): the same setup gives
// byte-identical exports.

import { getDevice } from '../devices.js';
import { findFacet } from '../facets/index.js';
import { render, stillTime } from '../render.js';
import { facetMode, GROUP_MODES } from '../plugin/settings.js';
import { svgDataUrl } from '../scene/svg.js';

export { svgDataUrl };

/** MCP DeviceModel names (elgato-mcp DESIGN §8.0) → prism-deck device ids. */
const MODEL_NAMES = { 'streamdeck-mk2': 'mk2', 'streamdeck-mini': 'mini-2022', 'streamdeck-xl': 'xl-2022', 'streamdeck-plus': 'plus', 'streamdeck-neo': 'neo', 'galleon-100-sd': 'galleon', 'streamdeck-plus-xl': 'plusxl' };

/** Resolve a device name strictly (getDevice falls back to mk2 on unknown names; exports must not). */
export function resolveDevice(q) {
  if (q && typeof q === 'object') return getDevice(q);
  const id = MODEL_NAMES[String(q || '').toLowerCase()] || String(q || '').toLowerCase();
  const d = getDevice(id);
  if (d.id !== id && !d.aliases?.includes(id)) throw new Error(`unknown device "${q}" (try: prism-deck devices)`);
  return d;
}

const exactFacet = (id) => { const f = id ? findFacet(id) : null; return f && f.id === id ? f : null; };

/** MCP look / feedback → Prism Display action settings. */
function lookToSettings(look = {}, fallbackTheme) {
  let facet = look.facet;
  if (!facet && look.glyph) facet = `icon-${String(look.glyph).split('/').pop()}`;
  if (!facet && look.app) facet = { clock: 'icon-clock', timer: 'app-focus-timer', sysmon: 'app-cpu-ring', waveform: 'span-waveform', spectrum: 'span-spectrum' }[look.app];
  if (!facet) return null;
  const s = { facet };
  if (look.theme || fallbackTheme) s.theme = String(look.theme || fallbackTheme).split(':')[0];
  if (look.params) s.params = look.params;
  if (Number.isInteger(look.state)) s.state = look.state;
  if (look.group) s.group = look.group;
  return s;
}

/** Accept the profile-exporter page shape or an MCP layout document. */
export function normalizeSetup(setup = {}) {
  const model = resolveDevice(setup.device);
  const theme = String(setup.theme || 'prism');
  const [themeId, themeMode] = theme.split(':');
  const mode = setup.mode || (themeMode === 'light' ? 'light' : 'dark');
  const pages = (setup.pages || []).map((p, i) => {
    const keys = (p.keys || []).map((k) => ({ col: k.col, row: k.row, settings: k.settings || lookToSettings(k.look || k, null) })).filter((k) => k.settings);
    const dials = (p.dials || []).map((d) => ({ dial: d.dial, layer: d.layer || 0, settings: d.settings || lookToSettings(d.feedback || d.look || d, null) })).filter((d) => d.settings);
    const infobar = p.infobar ? (p.infobar.facet ? p.infobar : lookToSettings(p.infobar)) : null;
    return { name: String(p.name || p.id || `Page ${i + 1}`), keys, dials, infobar };
  });
  if (!pages.length) throw new Error('setup has no pages');
  return { device: model, name: String(setup.name || 'Prism'), theme: themeId, mode, pages };
}

/**
 * Group a page's slots into render units the way the plugin runtime does:
 * span / strip-all / deck facets with the same facet + group render as one block.
 * → { units: [{ facet, mode, settings, controller, members: [{ col, row }] }], dropped: [{ slot, reason }] }
 */
export function pageUnits(model, page) {
  const units = new Map(), dropped = [];
  const add = (controller, col, row, settings, slot) => {
    const facet = exactFacet(settings?.facet);
    if (!facet) return dropped.push({ slot, reason: `facet "${settings?.facet}" not found` });
    const mode = facetMode(facet, controller, model);
    if (!mode) return dropped.push({ slot, reason: `${facet.id} (${facet.surface}) can't be drawn on a ${controller === 'Encoder' ? 'dial' : 'key'} of ${model.name}` });
    const key = GROUP_MODES.has(mode) ? `grp|${controller}|${facet.id}|${settings.group || 'A'}` : `one|${controller}|${col},${row}`;
    if (!units.has(key)) units.set(key, { facet, mode, settings, controller, members: [] });
    units.get(key).members.push({ col, row });
  };
  for (const k of page.keys || []) {
    const slot = `key ${k.col},${k.row}`;
    if (!(k.col >= 0 && k.row >= 0 && k.col < model.cols && k.row < model.rows)) { dropped.push({ slot, reason: 'outside the grid' }); continue; }
    add('Keypad', k.col, k.row, k.settings, slot);
  }
  for (const d of page.dials || []) {
    const slot = `dial ${d.dial}${d.layer ? `/${d.layer}` : ''}`;
    if (!(d.dial >= 0 && d.dial < (model.dials?.count || 0))) { dropped.push({ slot, reason: 'no such dial' }); continue; }
    add('Encoder', d.dial, d.layer || 0, d.settings, slot);
  }
  return { units: [...units.values()], dropped };
}

/** The src/raster backend, or null when it isn't available. */
export async function loadRaster() {
  try {
    const r = await import('../raster/index.js');
    return typeof r.rasterize === 'function' && typeof r.encodePNG === 'function' ? r : null;
  } catch { return null; }
}

/** Render options for a unit at time t. */
function frameOpts(model, unit, setup, t) {
  const s = unit.settings || {};
  const f = unit.facet;
  return {
    device: model.id,
    theme: s.theme || setup.theme || 'prism',
    mode: s.mode || setup.mode || 'dark',
    t, since: t,
    state: Number.isInteger(s.state) ? s.state : 0,
    value: typeof s.value === 'number' ? s.value : 0.62,
    params: s.params || {},
    seed: 7,
    now: Date.UTC(2026, 9, 15, 10, 9, 0),
    reduced: !f.animated,
  };
}

/** One instant of a unit, sliced per member. → [{ controller, col, row, svg, w, h }] */
export function renderUnit(model, unit, setup, t) {
  const o = frameOpts(model, unit, setup, t);
  const f = unit.facet;
  const at = (col, row) => unit.members.some((m) => m.col === col && m.row === row);
  const out = [];
  switch (unit.mode) {
    case 'key': { const r = render(f, o); const m = unit.members[0]; out.push({ controller: 'Keypad', ...m, svg: r.svg, w: r.w, h: r.h }); break; }
    case 'span': {
      const cs = unit.members.map((m) => m.col), rs = unit.members.map((m) => m.row);
      const col = Math.min(...cs), row = Math.min(...rs);
      const r = render(f, { ...o, span: { col, row, cols: Math.max(...cs) - col + 1, rows: Math.max(...rs) - row + 1 } });
      for (const k of r.keys || []) if (at(k.col, k.row)) out.push({ controller: 'Keypad', col: k.col, row: k.row, svg: k.svg });
      break;
    }
    case 'deck': {
      const r = render(f, o);
      if (unit.controller === 'Keypad') { for (const k of r.keys || []) if (at(k.col, k.row)) out.push({ controller: 'Keypad', col: k.col, row: k.row, svg: k.svg }); }
      else for (const m of unit.members) if (r.segments?.[m.col]) out.push({ controller: 'Encoder', ...m, svg: r.segments[m.col], w: 200, h: 100 });
      break;
    }
    case 'strip-1': { const r = render(f, { ...o, segments: 1 }); out.push({ controller: 'Encoder', ...unit.members[0], svg: r.segments?.[0] || r.svg, w: 200, h: 100 }); break; }
    case 'strip-all': {
      const segs = model.strip?.segments || model.dials?.count || 4;
      const r = render(f, { ...o, segments: segs, values: Array.from({ length: segs }, () => o.value) });
      for (const m of unit.members) if (r.segments?.[m.col]) out.push({ controller: 'Encoder', ...m, svg: r.segments[m.col], w: 200, h: 100 });
      break;
    }
    case 'key-on-dial': { const r = render(f, { ...o, size: { w: 200, h: 100 } }); out.push({ controller: 'Encoder', ...unit.members[0], svg: r.svg, w: 200, h: 100 }); break; }
    default: return null;   // Galleon screen widgets / Neo info bar: no Linux app draws them
  }
  const key = model.keyPx || { w: 144, h: 144 };
  for (const s of out) if (s.controller === 'Keypad') { s.w = key.w; s.h = key.h; }
  return out;
}

/**
 * Render a page. opts: { raster (from loadRaster()), png: false, animate: false, fps: 12, maxFrames: 48, scale: 1 }
 * → { keys: Map('col,row' → slot), dials: Map(dial → slot), dropped }
 */
export function renderPage(model, page, setup, opts = {}) {
  const { units, dropped } = pageUnits(model, page);
  const keys = new Map(), dials = new Map();
  const raster = opts.raster || null;
  const scale = opts.scale || 1;
  for (const u of units) {
    const t0 = stillTime(u.facet);
    const slots = renderUnit(model, u, setup, t0);
    if (!slots) { for (const m of u.members) dropped.push({ slot: `${u.controller === 'Encoder' ? 'dial' : 'key'} ${m.col},${m.row}`, reason: `${u.facet.id}: ${u.mode} is not drawn by Linux apps` }); continue; }
    let frames = null;
    if (opts.animate && raster?.encodeGIF && u.facet.animated && !opts.noAnimate?.(u)) {
      const fps = Math.max(1, Math.min(opts.fps || 12, u.facet.fps || 12));
      const loop = u.facet.loop || 4;
      const n = Math.max(2, Math.min(opts.maxFrames || 48, Math.round(loop * fps)));
      frames = Array.from({ length: n }, (_, i) => renderUnit(model, u, setup, (i / n) * loop));
      frames.delay = (loop * 1000) / n;
    }
    slots.forEach((s, si) => {
      const slot = { ...s, facet: u.facet.id, animated: !!u.facet.animated, settings: u.settings };
      if (raster && (opts.png || frames)) {
        const W = Math.round(s.w * scale), H = Math.round(s.h * scale);
        slot.png = raster.encodePNG(raster.rasterize(s.svg, W, H));
        if (frames && !(s.controller === 'Encoder' && opts.noDialGif)) {
          slot.gif = raster.encodeGIF(frames.map((fr) => ({ ...raster.rasterize(fr[si].svg, W, H), delay: frames.delay })), { loop: 0 });
        }
      }
      if (s.controller === 'Keypad') keys.set(`${s.col},${s.row}`, slot); else dials.set(s.col, slot);
    });
  }
  return { keys, dials, dropped };
}

// Common typographic characters → ASCII; anything else outside 7-bit ASCII is dropped (accents are
// stripped first via NFKD), so exported names survive any locale, shell, zip tool and file system.
const ASCII_FOLD = { '·': '-', '•': '-', '‧': '-', '–': '-', '—': '-', '−': '-', '×': 'x', '→': '-', '←': '-', '‘': "'", '’': "'", '“': '', '”': '', '…': '...', 'λ': 'L', 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'ø': 'o', 'Ø': 'O' };

/** File-system-safe, ASCII-only name (pages, profiles, bundles). */
export const safeName = (s, fallback = 'Prism') => String(s || fallback).normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\x20-\x7e]/g, (c) => ASCII_FOLD[c] ?? ' ')
  .replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.]+$/g, '').slice(0, 64).trim() || fallback;
