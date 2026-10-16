// Validation for the live control channel (DESIGN.md §6.3 / §8.0) — never trust
// the caller: every look, feedback, behavior, op batch and layout document is
// checked here against the real registries (facets, glyphs, themes) and the real
// device geometry before anything reaches a key.
//
// Behavior classes (DESIGN §7.4): SAFE (changes only what Prism draws) may go
// live; EXPORT_ONLY (keystrokes, apps, URLs, other plugins' actions …) exists only
// in exported profiles the user imports; FORBIDDEN (streamdeck:// deep links,
// unknown kinds) is refused everywhere.

import { findFacet } from '../facets/index.js';
import { getGlyph } from '../glyphs/_registry.js';
import { themeRegistry } from '../themes/_registry.js';
import { validateSvg } from '../scene/validate.js';
import { hexToOklch } from '../scene/color.js';
import { getDevice } from '../devices.js';
import { decodeSvgDataUrl } from './system-facets.js';

export const LAYOUT_SCHEMA = 'prism-deck-layout/0.1';
export const SAFE = 'safe';
export const EXPORT_ONLY = 'export-only';
export const FORBIDDEN = 'forbidden';

export const LIMITS = Object.freeze({ titleChars: 24, titleLines: 3, imageBytes: 256 * 1024, pages: 10, layoutItems: 12, zOrderMax: 700, opsPerRequest: 64 });

/** Prism live apps → the facets that implement them (first one present wins). */
export const PRISM_APPS = Object.freeze({
  clock: ['app-world-clock', 'app-clock', 'icon-clock'],
  timer: ['app-focus-timer', 'app-timer', 'icon-timer'],
  stopwatch: ['app-stopwatch', 'icon-stopwatch'],
  counter: ['app-counter', 'icon-target'],
  sysmon: ['app-cpu-ring', 'app-sysmon', 'icon-cpu'],
  spectrum: ['app-spectrum', 'span-spectrum', 'icon-equalizer'],
  waveform: ['span-waveform', 'app-waveform', 'icon-waveform'],
});

/** DESIGN §8.0 device-model names → prism-deck device ids. */
export const MODEL_ALIASES = Object.freeze({
  'streamdeck-mk2': 'mk2', 'streamdeck-mini': 'mini-2022', 'streamdeck-xl': 'xl-2022', 'streamdeck-plus': 'plus',
  'streamdeck-neo': 'neo', 'galleon-100-sd': 'galleon', 'streamdeck-plus-xl': 'plusxl', 'mcp-deck': 'mcp',
});

const NATIVE_SIDE_EFFECTS = Object.freeze({
  'com.elgato.streamdeck.system.hotkey': 'sends keystrokes to the focused app',
  'com.elgato.streamdeck.system.hotkeyswitch': 'sends keystrokes to the focused app',
  'com.elgato.streamdeck.system.text': 'types text (optionally presses Enter)',
  'com.elgato.streamdeck.system.open': 'opens a file or runs a program',
  'com.elgato.streamdeck.system.openapp': 'launches an application',
  'com.elgato.streamdeck.system.website': 'opens a URL in the browser',
  'com.elgato.streamdeck.system.close': 'closes an application window',
  'com.elgato.streamdeck.system.sleep': 'puts a device to sleep',
  'com.elgato.streamdeck.system.multimedia': 'controls media playback',
  'com.elgato.streamdeck.multiactions.routine': 'runs a chain of actions',
  'com.elgato.streamdeck.multiactions.routine2': 'runs a chain of actions',
  'com.elgato.streamdeck.multiactions.random': 'runs a random action',
  'com.elgato.streamdeck.soundboard.playaudio': 'plays audio',
  'com.elgato.streamdeck.profile.rotate': 'switches the profile on a device',
});
const DEEP_LINK = /streamdeck:\/\//i;
const HEX = /^#[0-9a-f]{6}$/i;
const DATA_URL = /^data:image\/(svg\+xml|png|jpeg|webp)(;charset=[^;,]+)?(;base64)?,/i;
const err = (list, path, code, message) => { list.push({ path, code, message }); };

export function appFacet(app) {
  for (const id of PRISM_APPS[app] || []) { const f = findFacet(id); if (f && f.id === id) return f; }
  return null;
}

/** → { class: 'safe' | 'export-only' | 'forbidden', reason } */
export function classifyBehavior(b) {
  if (b == null) return { class: SAFE, reason: 'no behavior' };
  if (typeof b !== 'object' || Array.isArray(b)) return { class: FORBIDDEN, reason: 'behavior must be an object' };
  if (DEEP_LINK.test(JSON.stringify(b))) return { class: FORBIDDEN, reason: 'streamdeck:// deep links (plugin install/uninstall/restart) are never allowed' };
  switch (b.kind) {
    case 'none': case 'prism.toggle': return { class: SAFE, reason: 'changes only what Prism draws' };
    case 'prism.page': return typeof b.page === 'string' && b.page ? { class: SAFE, reason: 'switches a Prism page' } : { class: FORBIDDEN, reason: 'prism.page needs a page id' };
    case 'prism.app': return Object.hasOwn(PRISM_APPS, b.app) ? { class: SAFE, reason: `Prism live app "${b.app}" (display only)` } : { class: FORBIDDEN, reason: `unknown Prism app "${b.app}"; allowed: ${Object.keys(PRISM_APPS).join(', ')}` };
    case 'native': {
      const uuid = String(b.uuid || '');
      if (!uuid) return { class: FORBIDDEN, reason: 'native behavior needs an action uuid' };
      const effect = NATIVE_SIDE_EFFECTS[uuid];
      return { class: EXPORT_ONLY, reason: effect ? `${uuid} ${effect}; it can only be added through an exported profile the user imports` : `${uuid} is another plugin's action with unknown side effects; export-only` };
    }
    default: return { class: FORBIDDEN, reason: `unknown behavior kind "${b.kind}"` };
  }
}

export function checkBehavior(b, path, errors) {
  const c = classifyBehavior(b);
  if (c.class === FORBIDDEN) err(errors, path, 'forbidden_behavior', c.reason);
  else if (c.class === EXPORT_ONLY) err(errors, path, 'requires_export', c.reason);
  return c;
}

/** Theme spec → { theme, mode } or null. Accepts 'prism', 'prism:light', 'prism-night' / 'prism-day' (DESIGN names). */
export function resolveTheme(spec) {
  if (typeof spec !== 'string' || !spec) return null;
  const s = spec.toLowerCase();
  const special = { 'prism-night': ['prism', 'dark'], 'prism-dark': ['prism', 'dark'], 'prism-day': ['prism', 'light'], 'prism-light': ['prism', 'light'] }[s];
  const [id, mode] = special || s.split(':');
  if (!themeRegistry().themes.has(id)) return null;
  return { theme: id, mode: mode === 'light' || mode === 'day' ? 'light' : mode === 'dark' || mode === 'night' ? 'dark' : '' };
}

/** Validate an image data URL (SVG must be in the deck subset: no scripts, external refs, filters…). */
export function checkImage(url, path, errors) {
  if (typeof url !== 'string' || !DATA_URL.test(url)) return err(errors, path, 'invalid_image', 'image must be a data:image/(svg+xml|png|jpeg|webp) URL');
  if (url.length > LIMITS.imageBytes) return err(errors, path, 'image_too_large', `image is ${url.length} bytes; max ${LIMITS.imageBytes}`);
  if (/^data:image\/svg\+xml/i.test(url)) {
    const svg = decodeSvgDataUrl(url);
    const problems = svg ? validateSvg(svg, { maxBytes: LIMITS.imageBytes }) : ['undecodable'];
    if (problems.length) err(errors, path, 'invalid_svg', `SVG outside the deck subset: ${String(problems[0]?.message || problems[0])}`.slice(0, 200));
  }
}

const LOOK_FIELDS = new Set(['glyph', 'title', 'fg', 'bg', 'accent', 'image', 'state', 'theme', 'facet', 'params']);

/**
 * Validate a key look and resolve it to an overlay config:
 * → { facet?, sys?, params, theme, mode, state, image?, data } (or null when invalid; errors/warnings filled)
 */
export function resolveLook(look, path, errors, warnings, { controller = 'Keypad' } = {}) {
  if (look == null) return null;
  if (typeof look !== 'object' || Array.isArray(look)) { err(errors, path, 'invalid_type', 'look must be an object'); return null; }
  const before = errors.length;
  for (const k of Object.keys(look)) if (!LOOK_FIELDS.has(k)) err(errors, `${path}.${k}`, 'unknown_field', `unknown look field "${k}"`);
  const out = { params: {}, theme: '', mode: '', state: 0, data: {} };
  if (look.image != null) { checkImage(look.image, `${path}.image`, errors); out.image = look.image; }
  let facet = null;
  if (look.facet != null) {
    facet = typeof look.facet === 'string' ? findFacet(look.facet) : null;
    if (!facet || facet.id !== look.facet) err(errors, `${path}.facet`, 'unknown_facet', `no deck facet "${look.facet}"`);
  } else if (look.glyph != null) {
    const id = typeof look.glyph === 'string' ? look.glyph.split('/').pop() : '';
    const g = getGlyph(id);
    facet = g ? findFacet(`icon-${g.id}`) : null;
    if (!facet) err(errors, `${path}.glyph`, 'unknown_glyph', `no Prism glyph "${look.glyph}"`);
  }
  if (facet) out.facet = facet.id;
  if (look.params != null) {
    if (typeof look.params !== 'object' || Array.isArray(look.params)) err(errors, `${path}.params`, 'invalid_type', 'params must be an object');
    else if (facet) for (const [k, v] of Object.entries(look.params)) { if (Object.hasOwn(facet.params, k)) out.params[k] = v; else warnings.push({ path: `${path}.params.${k}`, code: 'unknown_param', message: `${facet.id} has no param "${k}"` }); }
  }
  if (look.title != null) {
    if (typeof look.title !== 'string') err(errors, `${path}.title`, 'invalid_type', 'title must be a string');
    else if (look.title.length > LIMITS.titleChars) err(errors, `${path}.title`, 'title_too_long', `title is ${look.title.length} chars; max ${LIMITS.titleChars}`);
    else if (look.title.split('\n').length > LIMITS.titleLines) err(errors, `${path}.title`, 'title_too_many_lines', `max ${LIMITS.titleLines} lines`);
    else {
      out.data.title = look.title;
      if (facet?.params?.label) { out.params.label = look.title.replace(/\n/g, ' '); out.params.showLabel = true; }
      else if (!facet && !out.image) out.sys = controller === 'Keypad' ? 'label' : 'value';
    }
  }
  for (const c of ['fg', 'bg', 'accent']) if (look[c] != null && (typeof look[c] !== 'string' || !HEX.test(look[c]))) err(errors, `${path}.${c}`, 'invalid_color', `${c} must be #rrggbb`);
  if (HEX.test(look.accent || '')) {
    if (facet?.params?.hue) out.params.hue = Math.round(hexToOklch(look.accent)[2]);
    else warnings.push({ path: `${path}.accent`, code: 'ignored_field', message: 'accent only tints facets with a hue param' });
  }
  for (const c of ['fg', 'bg']) if (look[c] != null) warnings.push({ path: `${path}.${c}`, code: 'ignored_field', message: `${c} is ignored: deck themes own the material; pick a theme instead` });
  if (look.state != null && (!Number.isInteger(look.state) || look.state < 0 || look.state > 7)) err(errors, `${path}.state`, 'invalid_state', 'state must be an integer 0–7');
  else if (look.state != null) out.state = look.state;
  if (look.theme != null) {
    const t = resolveTheme(look.theme);
    if (!t) warnings.push({ path: `${path}.theme`, code: 'unknown_theme', message: `unknown theme "${look.theme}"; using the plugin default` });
    else Object.assign(out, t);
  }
  if (!out.facet && !out.sys && !out.image) err(errors, path, 'empty_look', 'a look needs a facet, glyph, title or image');
  return errors.length > before ? null : out;
}

const BUILTIN_LAYOUTS = new Set(['$X1', '$A0', '$A1', '$B1', '$B2', '$C1']);

/** Validate dial feedback and resolve it to an overlay config (rendered into Prism's canvas). */
export function resolveFeedback(fb, path, errors, warnings, segment = { w: 200, h: 100 }) {
  if (fb == null) return null;
  if (typeof fb !== 'object' || Array.isArray(fb)) { err(errors, path, 'invalid_type', 'feedback must be an object'); return null; }
  const before = errors.length;
  const out = { params: {}, theme: '', mode: '', state: 0, data: {} };
  if (fb.facet != null) {
    const f = typeof fb.facet === 'string' ? findFacet(fb.facet) : null;
    if (!f || f.id !== fb.facet) err(errors, `${path}.facet`, 'unknown_facet', `no deck facet "${fb.facet}"`);
    else out.facet = f.id;
    if (f && fb.params && typeof fb.params === 'object') for (const [k, v] of Object.entries(fb.params)) if (Object.hasOwn(f.params, k)) out.params[k] = v;
  }
  if (fb.value != null) { if (typeof fb.value !== 'number' || fb.value < 0 || fb.value > 100) err(errors, `${path}.value`, 'invalid_value', 'value must be 0–100'); else { out.data.value = fb.value; out.value = fb.value / 100; } }
  if (fb.title != null) { if (typeof fb.title !== 'string' || fb.title.length > LIMITS.titleChars) err(errors, `${path}.title`, 'invalid_title', `title must be a string of at most ${LIMITS.titleChars} chars`); else { out.data.title = fb.title; if (out.facet && findFacet(out.facet)?.params?.label) out.params.label = fb.title; } }
  if (fb.theme != null) { const t = resolveTheme(fb.theme); if (t) Object.assign(out, t); else warnings.push({ path: `${path}.theme`, code: 'unknown_theme', message: `unknown theme "${fb.theme}"` }); }
  if (typeof fb.layout === 'string') {
    if (!BUILTIN_LAYOUTS.has(fb.layout)) err(errors, `${path}.layout`, 'unknown_layout', `layout must be one of ${[...BUILTIN_LAYOUTS].join(', ')} or an inline { items: [...] }`);
    else warnings.push({ path: `${path}.layout`, code: 'restyled', message: `${fb.layout} is drawn in Prism's style (title, value, bar) inside the canvas` });
  } else if (fb.layout && typeof fb.layout === 'object') {
    const items = Array.isArray(fb.layout.items) ? fb.layout.items : null;
    if (!items) err(errors, `${path}.layout.items`, 'invalid_type', 'items must be an array');
    else {
      if (items.length > LIMITS.layoutItems) err(errors, `${path}.layout.items`, 'too_many_items', `max ${LIMITS.layoutItems} items`);
      const byZ = new Map();
      items.forEach((it, i) => {
        const p = `${path}.layout.items[${i}]`;
        if (!it || typeof it !== 'object') return err(errors, p, 'invalid_type', 'item must be an object');
        if (!['text', 'pixmap', 'bar', 'gbar'].includes(it.type)) err(errors, `${p}.type`, 'invalid_type', 'type must be text, pixmap, bar or gbar');
        const [x, y, w, h] = Array.isArray(it.rect) ? it.rect : [];
        if (![x, y, w, h].every(Number.isInteger)) return err(errors, `${p}.rect`, 'invalid_rect', 'rect must be [x,y,w,h] integers');
        if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > segment.w || y + h > segment.h) err(errors, `${p}.rect`, 'rect_out_of_bounds', `rect must fit inside ${segment.w}x${segment.h}`);
        const z = it.zOrder ?? 0;
        if (!Number.isInteger(z) || z < 0 || z > LIMITS.zOrderMax) err(errors, `${p}.zOrder`, 'invalid_zorder', `zOrder must be 0–${LIMITS.zOrderMax}`);
        for (const o of byZ.get(z) || []) if (x < o.x + o.w && o.x < x + w && y < o.y + o.h && o.y < y + h) err(errors, p, 'overlap_same_zorder', `overlaps items[${o.i}] at zOrder ${z}`);
        byZ.set(z, [...(byZ.get(z) || []), { x, y, w, h, i }]);
        if (it.type === 'pixmap' && it.value != null) checkImage(it.value, `${p}.value`, errors);
        if (it.type === 'text' && it.value != null && String(it.value).length > 64) err(errors, `${p}.value`, 'invalid_title', 'text values are at most 64 chars');
      });
      if (errors.length === before) { out.sys = 'layout'; out.data = { items: items.map((it) => ({ ...it })) }; }
    }
  }
  if (!out.facet && !out.sys) out.sys = 'value';
  return errors.length > before ? null : out;
}

/** Geometry the live layer validates against: { cols, rows, dials, layers, segment }. */
export function geometryOf(device) {
  const d = device && typeof device.model === 'object' ? device.model : getDevice(device);
  return { name: d.name, cols: d.cols, rows: d.rows, dials: d.dials?.count || 0, layers: d.dials?.layers || (d.dials?.count ? 1 : 0), segment: { w: 200, h: 100 } };
}

export function checkKeyCoord(geo, col, row, path, errors) {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return err(errors, path, 'invalid_coord', 'col and row must be integers');
  if (col < 0 || row < 0 || col >= geo.cols || row >= geo.rows) err(errors, path, 'out_of_range', `key (${col},${row}) is outside ${geo.name} (${geo.cols}x${geo.rows}, 0-based col,row)`);
}

export function checkDial(geo, dial, layer, path, errors) {
  if (!geo.dials) return err(errors, path, 'no_dials', `${geo.name} has no dials`);
  if (!Number.isInteger(dial) || dial < 0 || dial >= geo.dials) err(errors, path, 'out_of_range', `dial ${dial} is outside 0–${geo.dials - 1}`);
  const l = layer ?? 0;
  if (!Number.isInteger(l) || l < 0 || l >= Math.max(1, geo.layers)) err(errors, path, 'invalid_layer', `${geo.name} supports layer 0${geo.layers > 1 ? `–${geo.layers - 1}` : ' only'}`);
}

/**
 * Validate an op batch for a device → { errors, warnings, plan: [{ kind: 'key'|'dial', id: 'c,r', set: overlay|null, behavior }] }.
 * Ops: set_key {col,row,look,behavior} · clear_key {col,row} · set_dial {dial,layer,feedback,behavior} · clear_dial {dial,layer}
 */
export function planOps(device, ops) {
  const errors = [], warnings = [], plan = [];
  if (!Array.isArray(ops) || !ops.length) return { errors: [{ path: '$.ops', code: 'no_ops', message: 'ops must be a non-empty array' }], warnings, plan };
  if (ops.length > LIMITS.opsPerRequest) return { errors: [{ path: '$.ops', code: 'too_many_ops', message: `max ${LIMITS.opsPerRequest} ops per request` }], warnings, plan };
  const geo = geometryOf(device);
  ops.forEach((op, i) => {
    const p = `$.ops[${i}]`;
    if (!op || typeof op !== 'object') return err(errors, p, 'invalid_type', 'op must be an object');
    if (op.op === 'set_key' || op.op === 'clear_key') {
      checkKeyCoord(geo, op.col, op.row, p, errors);
      if (op.op === 'clear_key') return plan.push({ kind: 'key', id: `${op.col},${op.row}`, set: null });
      checkBehavior(op.behavior, `${p}.behavior`, errors);
      const look = op.look != null ? resolveLook(op.look, `${p}.look`, errors, warnings) : null;
      const ov = applyBehavior(look, op.behavior);
      if (!ov && !errors.length) err(errors, `${p}.look`, 'empty_look', 'set_key needs a look (or a prism.app behavior)');
      plan.push({ kind: 'key', id: `${op.col},${op.row}`, set: ov });
    } else if (op.op === 'set_dial' || op.op === 'clear_dial') {
      checkDial(geo, op.dial, op.layer, p, errors);
      const id = `${op.dial},${op.layer ?? 0}`;
      if (op.op === 'clear_dial') return plan.push({ kind: 'dial', id, set: null });
      checkBehavior(op.behavior, `${p}.behavior`, errors);
      const fb = resolveFeedback(op.feedback ?? {}, `${p}.feedback`, errors, warnings, geo.segment);
      plan.push({ kind: 'dial', id, set: applyBehavior(fb, op.behavior) });
    } else err(errors, `${p}.op`, 'unknown_op', `unknown op "${op?.op}"; use set_key, clear_key, set_dial, clear_dial`);
  });
  return { errors, warnings, plan };
}

/** Attach a (safe) behavior to an overlay; prism.app picks its facet. */
export function applyBehavior(ov, behavior) {
  if (!behavior || behavior.kind === 'none') return ov ? { ...ov, behavior: { kind: 'none' } } : ov;
  if (behavior.kind === 'prism.app') {
    const f = appFacet(behavior.app);
    const base = ov || { params: {}, theme: '', mode: '', state: 0, data: {} };
    return f ? { ...base, facet: base.facet || f.id, sys: base.facet ? base.sys : undefined, behavior: { kind: 'prism.app', app: behavior.app } } : base;
  }
  return ov ? { ...ov, behavior: { kind: behavior.kind, ...(behavior.page ? { page: String(behavior.page).slice(0, 64) } : {}) } } : ov;
}

/** Resolve a DESIGN layout device name / prism-deck id → devices.js model. */
export function layoutModel(name) { const id = MODEL_ALIASES[name] || name; const d = getDevice(id); return d.id === id || d.aliases?.includes(id) ? d : null; }

/** Does a layout's device fit a live device? (same family geometry: cols × rows and dial count) */
export function layoutFits(model, device) {
  const g = geometryOf(device);
  return !!model && model.cols === g.cols && model.rows === g.rows && (model.dials?.count || 0) === g.dials;
}

/**
 * Validate a full layout document (prism-deck-layout/0.1) for a live device.
 * → { ok, errors, warnings, pages: Map(id → { keys: Map, dials: Map }) }
 */
export function validateLayout(layout, device) {
  const errors = [], warnings = [], pages = new Map();
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) { err(errors, '$', 'invalid_type', 'layout must be an object'); return { ok: false, errors, warnings, pages }; }
  if (layout.schema !== LAYOUT_SCHEMA) err(errors, '$.schema', 'invalid_schema', `schema must be "${LAYOUT_SCHEMA}"`);
  const model = layoutModel(layout.device);
  if (!model) { err(errors, '$.device', 'unknown_device', `unknown device "${layout.device}"`); return { ok: false, errors, warnings, pages }; }
  if (device && !layoutFits(model, device)) err(errors, '$.device', 'device_mismatch', `layout is for ${model.name} (${model.cols}x${model.rows}) but the device is ${geometryOf(device).name}`);
  const theme = layout.theme != null ? resolveTheme(layout.theme) : null;
  if (layout.theme != null && !theme) warnings.push({ path: '$.theme', code: 'unknown_theme', message: `unknown theme "${layout.theme}"` });
  const list = Array.isArray(layout.pages) ? layout.pages : null;
  if (!list || !list.length) err(errors, '$.pages', 'no_pages', 'layout needs at least one page');
  else if (list.length > LIMITS.pages) err(errors, '$.pages', 'too_many_pages', `max ${LIMITS.pages} pages`);
  const ids = new Set((list || []).map((p) => p?.id));
  const geo = device ? geometryOf(device) : geometryOf(model);
  (list || []).forEach((page, pi) => {
    const pp = `$.pages[${pi}]`;
    if (!page || typeof page.id !== 'string' || !page.id) return err(errors, `${pp}.id`, 'invalid_page', 'page needs an id');
    const keys = new Map(), dials = new Map();
    (page.keys || []).forEach((k, ki) => {
      const kp = `${pp}.keys[${ki}]`;
      checkKeyCoord(geo, k?.col, k?.row, kp, errors);
      const id = `${k?.col},${k?.row}`;
      if (keys.has(id)) err(errors, kp, 'duplicate_key', `key ${id} appears twice on page "${page.id}"`);
      checkBehavior(k?.behavior, `${kp}.behavior`, errors);
      if (k?.behavior?.kind === 'prism.page' && !ids.has(k.behavior.page)) err(errors, `${kp}.behavior.page`, 'unknown_page', `no page with id "${k.behavior.page}"`);
      let ov = resolveLook(k?.look ?? (k?.behavior?.kind === 'prism.app' ? undefined : null), `${kp}.look`, errors, warnings);
      ov = applyBehavior(ov, k?.behavior);
      if (ov && theme && !ov.theme) Object.assign(ov, theme);
      if (ov) keys.set(id, ov);
    });
    (page.dials || []).forEach((d, di) => {
      const dp = `${pp}.dials[${di}]`;
      checkDial(geo, d?.dial, d?.layer, dp, errors);
      const id = `${d?.dial},${d?.layer ?? 0}`;
      if (dials.has(id)) err(errors, dp, 'duplicate_dial', `dial ${id} appears twice on page "${page.id}"`);
      checkBehavior(d?.behavior, `${dp}.behavior`, errors);
      let ov = resolveFeedback(d?.feedback ?? {}, `${dp}.feedback`, errors, warnings, geo.segment);
      ov = applyBehavior(ov, d?.behavior);
      if (ov && theme && !ov.theme) Object.assign(ov, theme);
      if (ov) dials.set(id, ov);
    });
    pages.set(page.id, { keys, dials, name: typeof page.name === 'string' ? page.name.slice(0, 40) : page.id });
  });
  return { ok: errors.length === 0, errors, warnings, pages, order: (list || []).map((p) => p?.id).filter(Boolean) };
}
