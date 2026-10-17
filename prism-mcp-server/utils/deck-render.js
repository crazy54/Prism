// Rendering through the prism-deck engine: one facet for a device + target, or a
// whole layout page composited onto the device panel (keys, spans, strip segments,
// Galleon screen widgets, Neo info bar) the way the Prism Deck plugin runtime slices
// it (prism-deck/src/plugin/runtime.js unit modes: key · span · deck · strip-1 ·
// strip-all · screen-galleon · screen-widget · screen-infobar · key-on-dial).
// PNG goes through prism-deck/src/raster (zero-dependency rasterizer).

import { liveValidate } from './deck-layouts.js';

export class RenderError extends Error {
  constructor(message, { code = 'render_failed', data = null } = {}) { super(message); this.name = 'RenderError'; this.code = code; this.data = data; }
}

const SCREEN_DEVICE = { galleon: 'galleon', 'galleon-widget': 'galleon', infobar: 'neo', monitor: 'xeneon-edge' };
const num = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

/** A sensible device for a facet when the caller names none (the owner's Galleon 100 SD / Stream Deck +). */
export function defaultDeviceFor(f) {
  if (f.devices && f.devices.length) return f.devices[0];
  if (f.surface === 'strip') return 'plus';
  if (f.surface === 'screen') return SCREEN_DEVICE[(f.screens || [])[0]] || 'galleon';
  return 'galleon';
}

/** Resolve a state given as an index or a state name. */
export function resolveState(f, state) {
  if (state == null || state === '') return 0;
  const n = f.states?.length || 0;
  if (Number.isInteger(state)) {
    if (state < 0 || (n && state >= n) || (!n && state !== 0)) throw new RenderError(`${f.id} has ${n ? `states 0–${n - 1} (${f.states.join(', ')})` : 'no states'}; got ${state}`, { code: 'invalid_state' });
    return state;
  }
  const i = (f.states || []).indexOf(String(state));
  if (i < 0) throw new RenderError(`${f.id} has no state "${state}"${n ? ` (states: ${f.states.join(', ')})` : ''}`, { code: 'invalid_state' });
  return i;
}

/** Re-root an SVG string as a nested viewport at (x, y, w, h) inside a larger SVG. */
export function nestSvg(svg, x, y, w, h) {
  const m = /^\s*<svg\b([^>]*)>/.exec(svg);
  if (!m) return '';
  let attrs = m[1];
  const get = (k) => { const r = new RegExp(`\\s${k}="([^"]*)"`).exec(attrs); return r ? r[1] : null; };
  const vb = get('viewBox') || `0 0 ${get('width') || w} ${get('height') || h}`;
  attrs = attrs.replace(/\s(x|y|width|height|viewBox|xmlns)="[^"]*"/g, '');
  return `<svg x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" viewBox="${vb}"${attrs}>${svg.slice(m[0].length)}`;
}

let RENDER_SEQ = 0;
const prefix = () => `r${(RENDER_SEQ = (RENDER_SEQ + 1) % 1e6).toString(36)}-`;

/**
 * Render one facet. → { facet, surface, device, theme, mode, t, state, stateName, w, h, svg, slices, warnings }
 * opts: { facet (id), device, theme, mode, state, params, t, pressed, value, values, seed, reduced, span, segments, screen }
 */
export function renderFacet(engine, opts = {}) {
  const { core } = engine.mods;
  const f = engine.facet(opts.facet);
  if (!f) throw new RenderError(`No deck facet "${opts.facet}"`, { code: 'not_found' });
  const devName = opts.device || defaultDeviceFor(f);
  const device = engine.device(devName);
  if (!device) throw new RenderError(`unknown device "${devName}"`, { code: 'unknown_device' });
  const th = engine.theme(opts.theme, opts.mode);
  if (!th) throw new RenderError(`unknown deck theme "${opts.theme}"`, { code: 'unknown_theme', data: { themes: core.allThemes().map((t) => t.id) } });
  const warnings = [];
  const params = {};
  if (opts.params != null) {
    if (typeof opts.params !== 'object' || Array.isArray(opts.params)) throw new RenderError('params must be an object', { code: 'invalid_argument' });
    for (const [k, v] of Object.entries(opts.params)) {
      if (Object.hasOwn(f.params || {}, k)) params[k] = v;
      else warnings.push({ path: `$.params.${k}`, code: 'unknown_param', message: `${f.id} has no param "${k}" (params: ${Object.keys(f.params || {}).join(', ') || 'none'})` });
    }
  }
  const state = resolveState(f, opts.state);
  const t = typeof opts.t === 'number' && Number.isFinite(opts.t) ? Math.max(0, opts.t) : core.stillTime(f);
  const ro = {
    device, theme: th.theme, ...(th.mode ? { mode: th.mode } : {}), t, state, since: 10, params, idPrefix: prefix(), uniqueIds: true,
    ...(opts.pressed ? { pressed: true, pressAge: 0 } : {}),
    ...(typeof opts.value === 'number' ? { value: Math.min(1, Math.max(0, opts.value)) } : {}),
    ...(Array.isArray(opts.values) ? { values: opts.values } : {}),
    ...(opts.seed != null ? { seed: opts.seed } : {}),
    ...(opts.reduced ? { reduced: true } : {}),
    ...(opts.span ? { span: opts.span } : {}),
    ...(opts.segments != null ? { segments: opts.segments } : {}),
  };
  if (f.surface === 'screen') {
    const want = opts.screen || (f.screens || []).find((s) => (s === 'infobar' ? device.screen?.kind === 'infobar' : s === 'monitor' ? device.screen?.kind === 'monitor' : device.screen?.kind === 'galleon')) || (f.screens || [])[0];
    if (!(f.screens || []).includes(want)) throw new RenderError(`${f.id} renders on ${(f.screens || []).join(', ')}; not "${want}"`, { code: 'invalid_target' });
    ro.screen = want;
    if (SCREEN_DEVICE[want] && !opts.device) ro.device = engine.device(SCREEN_DEVICE[want]);
  }
  if (f.surface === 'strip' && !device.strip && f.segments !== 1) warnings.push({ path: '$.device', code: 'no_strip', message: `${device.name} has no touch strip; rendered at the Stream Deck + strip size` });
  let out;
  try { out = core.render(f, ro); } catch (err) { throw new RenderError(`render failed: ${err.message}`, { code: 'render_failed' }); }
  const slices = [];
  for (const k of out.keys || []) slices.push({ kind: 'key', col: k.col, row: k.row, svg: k.svg });
  (out.segments || []).forEach((s, i) => slices.push({ kind: 'segment', dial: i, svg: s }));
  for (const w of out.widgets || []) slices.push({ kind: 'widget', dial: w.dial, layer: w.layer, svg: w.svg });
  if (out.screen && typeof out.screen === 'string') slices.push({ kind: 'screen', svg: out.screen });
  return { facet: f.id, surface: out.surface, device: ro.device.id, theme: th.theme, mode: th.mode || null, t, state, stateName: f.states?.[state] ?? null, w: out.w, h: out.h, svg: out.svg, slices, warnings };
}

/** Panel geometry for any device: deckLayout() for LCD models, a synthetic grid for app-defined / software decks. */
function panelOf(core, model) {
  const L = core.deckLayout(model);
  if (L.w && L.keys.length) return L;
  const k = core.keySize(model), gap = 16, pad = 16;
  const cols = Math.max(1, model.cols || 1), rows = Math.max(1, model.rows || 1);
  const keys = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) keys.push({ i: r * cols + c, col: c, row: r, x: pad + c * (k.w + gap), y: pad + r * (k.h + gap), w: k.w, h: k.h });
  return { w: pad * 2 + cols * k.w + (cols - 1) * gap, h: pad * 2 + rows * k.h + (rows - 1) * gap, keys, synthetic: true };
}

/** Dial slot rectangles in panel px: strip segments (+, + XL) or Galleon widgets (dial × layer). */
function dialRects(model, L) {
  const out = new Map();
  if (L.strip) {
    const n = L.strip.segments || model.dials?.count || 0, w = L.strip.w / Math.max(1, n);
    for (let d = 0; d < n; d++) out.set(`${d},0`, { x: L.strip.x + d * w, y: L.strip.y, w, h: L.strip.h });
  } else if (L.screen && model.screen?.kind === 'galleon') {
    const { cols = 2, rows = 2 } = model.screen.widgets || {};
    const w = L.screen.w / cols, h = L.screen.h / rows;
    for (let layer = 0; layer < rows; layer++) for (let d = 0; d < cols; d++) out.set(`${d},${layer}`, { x: L.screen.x + d * w, y: L.screen.y + layer * h, w, h });
  }
  return out;
}

/**
 * Composite one page of a layout onto its device panel. → { w, h, svg, page, device, slots, warnings }
 * target: { kind: 'device' } (default) | { kind: 'key', col, row } | { kind: 'dial', dial, layer }
 */
export function renderLayout(engine, layout, { page: pageId, target = { kind: 'device' }, t: tOpt } = {}) {
  const { core, settings: S, system } = engine.mods;
  const model = engine.device(layout.device);
  if (!model) throw new RenderError(`unknown device "${layout.device}"`, { code: 'unknown_device' });
  const v = liveValidate(engine, layout);
  const pid = pageId ?? v.order[0];
  const page = v.pages.get(pid);
  const doc = layout.pages.find((p) => p.id === pid);
  if (!page || !doc) throw new RenderError(`no page "${pageId}"`, { code: 'unknown_page', data: { pages: v.order } });
  const warnings = v.errors.map((e) => ({ ...e, code: `invalid:${e.code}` }));
  const L = panelOf(core, model);
  const rects = dialRects(model, L);
  const parts = [];
  const place = (svg, r) => { if (svg && r) parts.push(nestSvg(svg, r.x, r.y, r.w, r.h)); };
  const def = engine.theme(layout.theme) || { theme: 'prism', mode: '' };
  const optsFor = (ov, f) => ({
    device: model, theme: ov.theme || def.theme, ...((ov.mode || def.mode) ? { mode: ov.mode || def.mode } : {}),
    t: typeof tOpt === 'number' ? tOpt : core.stillTime(f), state: ov.state || 0, since: 10, params: ov.params || {}, idPrefix: prefix(), uniqueIds: true,
    ...(typeof ov.value === 'number' ? { value: ov.value } : {}), ...(ov.data && f.id.startsWith('app-sys-') ? { data: ov.data } : {}),
  });
  const safeRender = (f, o, where) => { try { return core.render(f, o); } catch (err) { warnings.push({ path: where, code: 'render_failed', message: `${f.id}: ${err.message}` }); return null; } };
  const keyGroups = new Map(), dialGroups = new Map();
  let slots = 0;
  // ---- keys
  for (const k of doc.keys) {
    const id = `${k.col},${k.row}`;
    const ov = page.keys.get(id);
    const r = L.keys.find((c) => c.col === k.col && c.row === k.row);
    if (!ov || !r) continue;
    if (target.kind === 'key' && (target.col !== k.col || target.row !== k.row)) continue;
    if (ov.image) {
      const svg = /^data:image\/svg\+xml/i.test(ov.image) && system ? system.decodeSvgDataUrl(ov.image) : null;
      if (svg) place(svg, r); else warnings.push({ path: `key ${id}`, code: 'image_not_previewed', message: 'raster images are shown on the device but not in previews' });
      slots++;
      continue;
    }
    const f = ov.facet ? engine.facet(ov.facet) : ov.sys === 'label' && system ? system.SYSTEM_FACETS.label : null;
    if (!f) continue;
    const mode = f.id.startsWith('app-sys-') ? 'key' : S ? S.facetMode(f, 'Keypad', model) : 'key';
    if (mode === 'span' || mode === 'deck') {
      const gid = `${f.id}|${k.group || 'A'}`;
      if (!keyGroups.has(gid)) keyGroups.set(gid, { f, ov, mode, members: [] });
      keyGroups.get(gid).members.push(k);
      continue;
    }
    if (mode !== 'key') { warnings.push({ path: `key ${id}`, code: 'facet_does_not_fit', message: `${f.id} cannot be drawn on a key` }); continue; }
    const out = safeRender(f, { ...optsFor(ov, f), ...(f.id.startsWith('app-sys-') ? { data: ov.data } : {}) }, `key ${id}`);
    if (out) { place(out.svg, r); slots++; }
  }
  for (const g of keyGroups.values()) {
    const cs = g.members.map((m) => m.col), rs = g.members.map((m) => m.row);
    const col = Math.min(...cs), row = Math.min(...rs);
    const o = optsFor(g.ov, g.f);
    const out = safeRender(g.f, g.mode === 'deck' ? o : { ...o, span: { col, row, cols: Math.max(...cs) - col + 1, rows: Math.max(...rs) - row + 1 } }, `span ${g.f.id}`);
    if (!out) continue;
    const want = new Set(g.members.map((m) => `${m.col},${m.row}`));
    for (const s of out.keys || []) if (want.has(`${s.col},${s.row}`)) { place(s.svg, L.keys.find((c) => c.col === s.col && c.row === s.row)); slots++; }
  }
  // ---- dials
  for (const d of doc.dials) {
    const id = `${d.dial},${d.layer ?? 0}`;
    const ov = page.dials.get(id);
    const r = rects.get(id);
    if (!ov) continue;
    if (target.kind === 'dial' && (target.dial !== d.dial || (target.layer ?? 0) !== (d.layer ?? 0))) continue;
    if (target.kind === 'key') continue;
    if (!r) { if (target.kind === 'device') warnings.push({ path: `dial ${id}`, code: 'no_dial_display', message: `${model.name} has no display for dial ${id}` }); continue; }
    const f = ov.facet ? engine.facet(ov.facet) : system ? system.SYSTEM_FACETS[ov.sys === 'layout' ? 'layout' : 'value'] : null;
    if (!f) continue;
    const mode = f.id.startsWith('app-sys-') ? 'strip-1' : S ? S.facetMode(f, 'Encoder', model) : 'strip-1';
    if (mode === 'strip-all' || mode === 'screen-galleon' || mode === 'deck') {
      const gid = `${f.id}|${d.group || 'A'}`;
      if (!dialGroups.has(gid)) dialGroups.set(gid, { f, ov, mode, members: [] });
      dialGroups.get(gid).members.push(d);
      continue;
    }
    const o = { ...optsFor(ov, f), ...(f.id.startsWith('app-sys-') ? { data: { title: ov.data?.title ?? '', value: ov.data?.value ?? 0, ...(ov.data?.items ? { items: ov.data.items } : {}) } } : {}) };
    let out = null, svg = null;
    if (mode === 'strip-1') { out = safeRender(f, { ...o, segments: 1 }, `dial ${id}`); svg = out && (out.segments?.[0] || out.svg); }
    else if (mode === 'screen-widget') { out = safeRender(f, { ...o, screen: 'galleon-widget' }, `dial ${id}`); svg = out && out.svg; }
    else if (mode === 'key-on-dial') { out = safeRender(f, { ...o, size: { w: 200, h: 100 } }, `dial ${id}`); svg = out && out.svg; }
    else { warnings.push({ path: `dial ${id}`, code: 'facet_does_not_fit', message: `${f.id} cannot be drawn on this dial` }); continue; }
    if (svg) { place(svg, r); slots++; }
  }
  for (const g of dialGroups.values()) {
    const o = optsFor(g.ov, g.f);
    if (g.mode === 'strip-all') {
      const segs = model.strip?.segments || model.dials?.count || 4;
      const out = safeRender(g.f, { ...o, segments: segs }, `strip ${g.f.id}`);
      if (out) for (const m of g.members) { place(out.segments?.[m.dial], rects.get(`${m.dial},0`)); slots++; }
    } else if (g.mode === 'screen-galleon') {
      const out = safeRender(g.f, { ...o, screen: 'galleon' }, `screen ${g.f.id}`);
      const want = new Set(g.members.map((m) => `${m.dial},${m.layer ?? 0}`));
      if (out) for (const w of out.widgets || []) if (want.has(`${w.dial},${w.layer}`)) { place(w.svg, rects.get(`${w.dial},${w.layer}`)); slots++; }
    } else warnings.push({ path: `dials ${g.f.id}`, code: 'not_previewed', message: 'whole-deck facets on dials are not previewed' });
  }
  // ---- Neo info bar
  if (doc.infobar && L.screen && model.screen?.kind === 'infobar' && target.kind === 'device') {
    const f = engine.facet(doc.infobar.facet);
    if (f) {
      const th = doc.infobar.theme ? engine.theme(doc.infobar.theme) : null;
      const out = safeRender(f, { ...optsFor({ params: doc.infobar.params || {}, ...(th || {}) }, f), screen: 'infobar' }, 'infobar');
      if (out) { place(out.svg, L.screen); slots++; }
    }
  }
  // ---- compose
  let W = L.w, H = L.h, x0 = 0, y0 = 0;
  if (target.kind === 'key') { const r = L.keys.find((c) => c.col === target.col && c.row === target.row); if (!r) throw new RenderError(`no key ${target.col},${target.row} on ${model.name}`, { code: 'out_of_range' }); ({ x: x0, y: y0, w: W, h: H } = r); }
  if (target.kind === 'dial') { const r = rects.get(`${target.dial},${target.layer ?? 0}`); if (!r) throw new RenderError(`no dial display ${target.dial},${target.layer ?? 0} on ${model.name}`, { code: 'out_of_range' }); ({ x: x0, y: y0, w: W, h: H } = r); }
  const colors = core.useTheme(def.theme, def.mode || undefined).colors;
  const empty = target.kind === 'device'
    ? L.keys.map((r) => `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" rx="${num(Math.min(r.w, r.h) * 0.12)}" fill="${colors.surface || '#111318'}" fill-opacity="0.35"/>`).join('')
      + [...rects.values()].map((r) => `<rect x="${num(r.x)}" y="${num(r.y)}" width="${num(r.w)}" height="${num(r.h)}" fill="${colors.surface || '#111318'}" fill-opacity="0.25"/>`).join('')
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${num(W)}" height="${num(H)}" viewBox="${num(x0)} ${num(y0)} ${num(W)} ${num(H)}"><rect x="${num(x0)}" y="${num(y0)}" width="${num(W)}" height="${num(H)}" fill="#050608"/>${empty}${parts.join('')}</svg>`;
  return { w: W, h: H, svg, page: pid, device: model.id, slots, warnings, ...(L.synthetic ? { note: `${model.name} has an app-defined grid; drawn as ${model.cols}×${model.rows} keys at ${core.keySize(model).w}px` } : {}) };
}

/** Rasterize an SVG string to PNG bytes at scale × (w, h). */
export function svgToPng(engine, svg, w, h, scale = 1) {
  const R = engine.mods.raster;
  if (!R) throw new RenderError('PNG needs prism-deck/src/raster, which is not available', { code: 'unavailable' });
  const s = Math.min(4, Math.max(0.25, Number(scale) || 1));
  const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
  if (W * H > 4096 * 4096) throw new RenderError(`PNG of ${W}×${H} is too large; lower the scale`, { code: 'too_large' });
  try { return Buffer.from(R.encodePNG(R.rasterize(svg, W, H))); } catch (err) { throw new RenderError(`rasterize failed: ${err.message}`, { code: 'render_failed' }); }
}
