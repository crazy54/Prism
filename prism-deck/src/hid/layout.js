// Layouts — which facet drives which part of a physical deck.
//
//   {
//     "theme": "prism", "mode": "dark",
//     "deck":    "span-first-light",                       a deck-surface facet over everything (optional)
//     "spans":   [{ "facet": "span-waveform", "col": 0, "row": 0, "cols": 4, "rows": 1 }],
//     "keys":    ["icon-mic", null, { "facet": "icon-volume", "state": 1, "params": { … } }]   (or { "5": … })
//     "strip":   "strip-refraction",                       + / + XL: one facet across the whole strip
//     "dials":   ["dial-volume", …],                        + / + XL: one 200×100 segment facet per dial
//     "screen":  "screen-galleon-dashboard",               Galleon 720×384 (4 widgets) · Neo info bar
//     "widgets": { "0,0": "…", "1,1": "…" }                Galleon: per widget ("dial,layer"), galleon-widget facets
//   }
//
// Precedence: deck → spans → keys; strip | dials; screen | widgets. Conflicts are errors.
// resolveLayout(model, spec) → { slots, keyOwner, segOwner, widgetOwner, infobarOwner, problems }

import { findFacet, allFacets } from '../facets/index.js';
import { getDevice } from '../devices.js';
import { SCREEN_TARGETS } from '../scene/context.js';

// API 1.4: Galleon widget art is a 2:1 window (360×180) centred in its 360×192 quadrant (6 px gutters);
// the region write stays 360×192, the gutters are filled with the theme background.
const GW = SCREEN_TARGETS.galleon.widgets;
const widgetArt = (W) => ({ w: GW.w, h: GW.h, padTo: { w: W.w, h: W.h, x: Math.round((W.w - GW.w) / 2), y: GW.insetY ?? Math.round((W.h - GW.h) / 2), bg: 'theme' } });

const DEFAULT_KEYS = ['icon-mic', 'icon-volume', 'icon-play-pause', 'icon-camera', 'icon-broadcast', 'app-cpu-ring', 'icon-clock', 'app-focus-timer',
  'icon-bulb', 'icon-lock', 'icon-wifi', 'icon-battery', 'icon-sync', 'icon-record', 'icon-timer', 'icon-power'];

const entryOf = (e) => (e == null || e === '' ? null : typeof e === 'string' ? { facet: e } : { ...e });

/** The default layout for a model: icons on the keys, volume dials on a strip, the dashboard on a screen. */
export function defaultLayout(model, { find = findFacet, all = allFacets } = {}) {
  const have = (id) => !!find(id);
  const keys = DEFAULT_KEYS.filter(have);
  for (const f of all()) if (keys.length < model.keys && f.surface === 'key' && f.gallery === 'icons' && !keys.includes(f.id)) keys.push(f.id);
  const spec = { keys: keys.slice(0, model.keys) };
  if (model.lcd?.kind === 'strip') { if (have('dial-volume')) spec.dials = Array(model.lcd.segments).fill('dial-volume'); else if (have('strip-refraction')) spec.strip = 'strip-refraction'; }
  if (model.lcd?.kind === 'screen' && have('screen-galleon-dashboard')) spec.screen = 'screen-galleon-dashboard';
  if (model.lcd?.kind === 'infobar' && have('screen-neo-clock')) spec.screen = 'screen-neo-clock';
  return spec;
}

/** Parse "id@col,row,cols,rows" (CLI shorthand for spans). */
export function parseSpanArg(s) {
  const [facet, at] = String(s).split('@');
  if (!at) return { facet };
  const [col, row, cols, rows] = at.split(',').map(Number);
  return { facet, col: col || 0, row: row || 0, ...(cols ? { cols } : {}), ...(rows ? { rows } : {}) };
}

export function resolveLayout(model, spec = {}, { find = findFacet } = {}) {
  const device = getDevice(model.id);
  const problems = [];
  const slots = [];
  const keyOwner = new Map(), segOwner = new Map(), widgetOwner = new Map();
  let infobarOwner = null;
  const L = model.lcd;

  const facetFor = (entry, where, ok) => {
    const f = find(entry.facet);
    if (!f) { problems.push(`${where}: no facet "${entry.facet}" (try: prism-deck list)`); return null; }
    if (f.devices && !f.devices.includes(model.id)) { problems.push(`${where}: ${f.id} only supports ${f.devices.join(', ')}`); return null; }
    const why = ok(f);
    if (why) { problems.push(`${where}: ${f.id} (${f.surface}) ${why}`); return null; }
    return f;
  };
  const slot = (facet, entry, extra) => {
    const s = {
      id: `${extra.kind}:${slots.length}`, facet, state: Math.max(0, Math.trunc(entry.state || 0)), params: entry.params || {},
      value: typeof entry.value === 'number' ? entry.value : undefined, values: null, ticks: 0, targets: [], renderOpts: {}, dials: [], ...extra,
    };
    slots.push(s);
    return s;
  };
  const claimKey = (k, s, where) => {
    if (keyOwner.has(k)) { problems.push(`${where}: key ${k} is already used by ${keyOwner.get(k).facet.id}`); return false; }
    keyOwner.set(k, s); return true;
  };
  const keyPx = model.key;

  // deck: the whole panel
  const deckEntry = entryOf(spec.deck);
  if (deckEntry && model.key) {
    const f = facetFor(deckEntry, 'deck', (x) => (x.surface === 'deck' ? null : 'is not a deck-surface facet'));
    if (f) {
      const s = slot(f, deckEntry, { kind: 'deck' });
      for (let k = 0; k < model.keys; k++) if (claimKey(k, s, 'deck')) s.targets.push({ id: `key:${k}`, type: 'key', key: k, w: keyPx.w, h: keyPx.h });
      if (L?.kind === 'strip') for (let i = 0; i < L.segments; i++) { segOwner.set(i, s); s.dials.push(i); s.targets.push({ id: `seg:${i}`, type: 'lcd', piece: 'segment', index: i, rect: { x: i * 200, y: 0, w: 200, h: 100 }, w: 200, h: 100 }); }
      if (L?.kind === 'screen') { for (let d = 0; d < 2; d++) for (let l = 0; l < 2; l++) widgetOwner.set(`${d},${l}`, s); s.dials = [0, 1]; s.targets.push({ id: 'screen', type: 'lcd', piece: 'screen', rect: { x: 0, y: 0, w: L.w, h: L.h }, w: L.w, h: L.h }); }
      if (L?.kind === 'infobar') { infobarOwner = s; s.targets.push({ id: 'infobar', type: 'lcd', piece: 'screen', rect: { x: 0, y: 0, w: L.w, h: L.h }, w: L.w, h: L.h }); }
    }
  }

  // spans
  for (const [n, raw] of (spec.spans || []).entries()) {
    const e = entryOf(raw);
    if (!e || !model.key) continue;
    const f = facetFor(e, `spans[${n}]`, (x) => (x.surface === 'span' ? null : 'is not a span facet'));
    if (!f) continue;
    const span = { col: e.col || 0, row: e.row || 0, ...(e.cols ? { cols: e.cols } : {}), ...(e.rows ? { rows: e.rows } : {}) };
    const want = { cols: e.cols ?? (f.span.cols === 'all' ? model.cols - span.col : f.span.cols), rows: e.rows ?? (f.span.rows === 'all' ? model.rows - span.row : f.span.rows) };
    if (span.col + want.cols > model.cols || span.row + want.rows > model.rows) { problems.push(`spans[${n}]: ${f.id} ${want.cols}×${want.rows} at ${span.col},${span.row} does not fit the ${model.cols}×${model.rows} grid`); continue; }
    const s = slot(f, e, { kind: 'span', renderOpts: { span: { ...span, cols: want.cols, rows: want.rows } } });
    for (let r = 0; r < want.rows; r++) for (let c = 0; c < want.cols; c++) {
      const k = (span.row + r) * model.cols + span.col + c;
      if (claimKey(k, s, `spans[${n}]`)) s.targets.push({ id: `key:${k}`, type: 'key', key: k, w: keyPx.w, h: keyPx.h });
    }
  }

  // keys
  const keys = Array.isArray(spec.keys) ? spec.keys.map((e, i) => [i, e]) : Object.entries(spec.keys || {}).map(([i, e]) => [Number(i), e]);
  for (const [k, raw] of keys) {
    const e = entryOf(raw);
    if (!e || !model.key) continue;
    if (!(k >= 0 && k < model.keys)) { problems.push(`keys[${k}]: ${model.name} has keys 0–${model.keys - 1}`); continue; }
    if (keyOwner.has(k)) continue; // spans / deck win silently over a default key list
    const f = facetFor(e, `keys[${k}]`, (x) => (x.surface === 'key' ? null : 'is not a key facet (use spans / strip / screen)'));
    if (!f) continue;
    const s = slot(f, e, { kind: 'key' });
    claimKey(k, s, `keys[${k}]`);
    s.targets.push({ id: `key:${k}`, type: 'key', key: k, w: keyPx.w, h: keyPx.h });
  }

  // strip / dials (+, + XL)
  const stripEntry = entryOf(spec.strip);
  if ((stripEntry || spec.dials) && L?.kind !== 'strip') problems.push(`strip/dials: ${model.name} has no touch strip`);
  else if (L?.kind === 'strip') {
    if (stripEntry && !segOwner.size) {
      const f = facetFor(stripEntry, 'strip', (x) => (x.surface === 'strip' && x.segments === 'all' ? null : 'is not a whole-strip facet (segments: all)'));
      if (f) {
        const s = slot(f, stripEntry, { kind: 'strip', renderOpts: { segments: L.segments } });
        for (let i = 0; i < L.segments; i++) { segOwner.set(i, s); s.dials.push(i); s.targets.push({ id: `seg:${i}`, type: 'lcd', piece: 'segment', index: i, rect: { x: i * 200, y: 0, w: 200, h: 100 }, w: 200, h: 100 }); }
      }
    }
    const dials = Array.isArray(spec.dials) ? spec.dials.map((e, i) => [i, e]) : Object.entries(spec.dials || {}).map(([i, e]) => [Number(i), e]);
    for (const [d, raw] of dials) {
      const e = entryOf(raw);
      if (!e) continue;
      if (!(d >= 0 && d < L.segments)) { problems.push(`dials[${d}]: ${model.name} has dials 0–${L.segments - 1}`); continue; }
      if (segOwner.has(d)) { problems.push(`dials[${d}]: segment ${d} is already used by ${segOwner.get(d).facet.id}`); continue; }
      const f = facetFor(e, `dials[${d}]`, (x) => (x.surface === 'strip' && x.segments === 1 ? null : 'is not a one-segment dial facet (segments: 1)'));
      if (!f) continue;
      const s = slot(f, e, { kind: 'segment', renderOpts: { segments: 1, segment: d } });
      segOwner.set(d, s); s.dials.push(d);
      s.targets.push({ id: `seg:${d}`, type: 'lcd', piece: 'segment', index: 0, rect: { x: d * 200, y: 0, w: 200, h: 100 }, w: 200, h: 100 });
    }
  }

  // screen / widgets (Galleon), info bar (Neo)
  const screenEntry = entryOf(spec.screen || spec.infobar);
  if ((screenEntry || spec.widgets) && !(L?.kind === 'screen' || L?.kind === 'infobar')) problems.push(`screen: ${model.name} has no screen`);
  else if (L?.kind === 'infobar' && screenEntry && !infobarOwner) {
    const f = facetFor(screenEntry, 'screen', (x) => (x.surface === 'screen' && x.screens.includes('infobar') ? null : 'does not support the Neo info bar'));
    if (f) {
      const lay = device.screen?.layout || { w: 232, h: 50 };
      const s = slot(f, screenEntry, { kind: 'infobar', renderOpts: { screen: 'infobar' } });
      infobarOwner = s;
      // rendered at the SDK layout (232×50), centred in the 248×58 window the way the Stream Deck app does
      s.targets.push({ id: 'infobar', type: 'lcd', piece: 'screen', rect: { x: 0, y: 0, w: L.w, h: L.h }, w: lay.w, h: lay.h, padTo: { w: L.w, h: L.h } });
    }
  } else if (L?.kind === 'screen') {
    const W = L.widgets;
    if (screenEntry && !widgetOwner.size) {
      const f = facetFor(screenEntry, 'screen', (x) => (x.surface === 'screen' && x.screens.includes('galleon') ? null : 'does not support the Galleon screen'));
      if (f) {
        const s = slot(f, screenEntry, { kind: 'screen', renderOpts: { screen: 'galleon' }, dials: [0, 1] });
        for (let l = 0; l < W.rows; l++) for (let d = 0; d < W.cols; d++) {
          widgetOwner.set(`${d},${l}`, s);
          s.targets.push({ id: `widget:${d},${l}`, type: 'lcd', piece: 'widget', dial: d, layer: l, rect: { x: d * W.w, y: l * W.h, w: W.w, h: W.h }, ...widgetArt(W) });
        }
      }
    }
    const widgets = Array.isArray(spec.widgets) ? spec.widgets.map((e, i) => [`${i % 2},${Math.floor(i / 2)}`, e]) : Object.entries(spec.widgets || {});
    for (const [at, raw] of widgets) {
      const e = entryOf(raw);
      if (!e) continue;
      const [d, l] = String(at).split(',').map(Number);
      if (!(d >= 0 && d < W.cols && l >= 0 && l < W.rows)) { problems.push(`widgets["${at}"]: use "dial,layer" with dial 0–1, layer 0–1`); continue; }
      if (widgetOwner.has(`${d},${l}`)) { problems.push(`widgets["${at}"]: already used by ${widgetOwner.get(`${d},${l}`).facet.id}`); continue; }
      const f = facetFor(e, `widgets["${at}"]`, (x) => (x.surface === 'screen' && x.screens.includes('galleon-widget') ? null : 'does not support a Galleon widget (galleon-widget)'));
      if (!f) continue;
      const s = slot(f, e, { kind: 'widget', renderOpts: { screen: 'galleon-widget' }, dials: [d], layer: l });
      widgetOwner.set(`${d},${l}`, s);
      s.targets.push({ id: `widget:${d},${l}`, type: 'lcd', piece: 'screen', dial: d, layer: l, rect: { x: d * W.w, y: l * W.h, w: W.w, h: W.h }, ...widgetArt(W) });
    }
  }

  return { slots, keyOwner, segOwner, widgetOwner, infobarOwner, problems, theme: spec.theme, mode: spec.mode };
}
