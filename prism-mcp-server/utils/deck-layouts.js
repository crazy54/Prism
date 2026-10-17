// Prism Deck layout documents: which facet (with theme, params, state and a Prism
// behavior) sits on which key, span, dial and screen of one device.
//
// Schema "prism-deck-layout/0.1" — the document the Prism Deck plugin's live control
// channel accepts on POST /v1/apply (elgato-mcp DESIGN.md §8.0; validated there by
// prism-deck/src/plugin/live-validate.js) plus a few export-only fields it ignores:
//
//   { schema, name, device: '<prism-deck id>' (DESIGN names like "galleon-100-sd" are
//     accepted on input and stored as the prism-deck id), theme?: 'prism' | 'prism:light' | …,
//     pages: [{ id, name?,
//       keys:  [{ col, row, look: { facet | glyph, params?, theme?, state?, title?, accent?, image? }, behavior?, group? }],
//       dials: [{ dial, layer?, feedback: { facet?, params?, theme?, title?, value? (0–100), layout? }, behavior?, group? }],
//       infobar?: { facet, params?, theme? } }] }        // Stream Deck Neo info bar (export only)
//
// Behavior kinds: none · prism.toggle · prism.page {page} · prism.app {app} (safe, can go
// live) · native {uuid, settings} (keystrokes, apps, URLs, other plugins: export-only,
// listed for the user's review). On a dial, `behavior` is what a PRESS (and a tap on a
// touch strip) does; ROTATE changes the facet's value by its `step` param per tick (×5
// while pressed); a long touch resets the value. `group` (A–H) joins keys/dials that
// share a multi-key facet into one block in exported profiles (live, one block per facet).
//
// DeckLayoutStore persists documents like CollectionStore (one JSON file, atomic
// rename) with a revision per document for optimistic concurrency.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const LAYOUT_SCHEMA = 'prism-deck-layout/0.1';
export const LAYOUT_LIMITS = Object.freeze({ layouts: 200, pages: 10, opsPerUpdate: 200, nameChars: 60, pageIdChars: 40 });
export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const BEHAVIOR_KINDS = ['none', 'prism.page', 'prism.toggle', 'prism.app', 'native'];
export const PRISM_APP_NAMES = ['clock', 'timer', 'stopwatch', 'counter', 'sysmon', 'spectrum', 'waveform'];
export const OPS = ['set_key', 'clear_key', 'move_key', 'set_dial', 'clear_dial', 'place_span', 'place_screen', 'add_page', 'remove_page', 'rename_page', 'set_theme', 'set_name', 'retarget'];

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.resolve(HERE, '..', 'deck-layouts.json');

export class LayoutError extends Error {
  constructor(message, { code = 'layout_error', data = null } = {}) { super(message); this.name = 'LayoutError'; this.code = code; this.data = data; }
}

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nowIso = () => new Date().toISOString();
const keyId = (c, r) => `${c},${r}`;

// ---------------------------------------------------------------- normalization

/** Shallow-validate + normalize an incoming document (structure only; validateLayoutDoc checks meaning). */
export function normalizeLayout(raw, engine) {
  if (!isObj(raw)) throw new LayoutError('layout must be an object', { code: 'invalid_layout' });
  const model = engine.device(raw.device);
  if (!model) throw new LayoutError(`unknown device "${raw.device}"`, { code: 'unknown_device', data: { hint: 'Use deck_list_devices for ids (DESIGN names like "galleon-100-sd" or "streamdeck-plus" work too).' } });
  const pages = Array.isArray(raw.pages) && raw.pages.length ? raw.pages : [{ id: 'home', keys: [], dials: [] }];
  if (pages.length > LAYOUT_LIMITS.pages) throw new LayoutError(`at most ${LAYOUT_LIMITS.pages} pages`, { code: 'too_many_pages' });
  const ids = new Set();
  const out = {
    schema: LAYOUT_SCHEMA,
    name: String(raw.name || `${model.name} layout`).slice(0, LAYOUT_LIMITS.nameChars),
    device: model.id,
    ...(raw.theme != null && raw.theme !== '' ? { theme: String(raw.theme) } : {}),
    pages: pages.map((p, i) => {
      if (!isObj(p)) throw new LayoutError(`pages[${i}] must be an object`, { code: 'invalid_layout' });
      const id = String(p.id || `page-${i + 1}`).slice(0, LAYOUT_LIMITS.pageIdChars);
      if (ids.has(id)) throw new LayoutError(`duplicate page id "${id}"`, { code: 'duplicate_page' });
      ids.add(id);
      return {
        id,
        ...(p.name ? { name: String(p.name).slice(0, 40) } : {}),
        keys: Array.isArray(p.keys) ? clone(p.keys) : [],
        dials: Array.isArray(p.dials) ? clone(p.dials) : [],
        ...(isObj(p.infobar) ? { infobar: clone(p.infobar) } : {}),
      };
    }),
  };
  return out;
}

/** A clean document for the plugin's /v1/apply (drops export-only fields). */
export function liveDocument(layout) {
  return {
    schema: LAYOUT_SCHEMA, device: layout.device, ...(layout.theme ? { theme: layout.theme } : {}), name: layout.name,
    pages: layout.pages.map((p) => ({ id: p.id, ...(p.name ? { name: p.name } : {}), keys: p.keys.map(({ col, row, look, behavior }) => ({ col, row, ...(look ? { look } : {}), ...(behavior ? { behavior } : {}) })), dials: p.dials.map(({ dial, layer, feedback, behavior }) => ({ dial, layer: layer ?? 0, ...(feedback ? { feedback } : {}), ...(behavior ? { behavior } : {}) })) })),
  };
}

// ---------------------------------------------------------------- templates

/** A new document: blank, the device's Prism sample profile, or an imported one. */
export function createLayout(engine, { device, name, theme, template = 'blank', layout } = {}) {
  if (layout) return normalizeLayout({ ...layout, ...(name ? { name } : {}), ...(theme ? { theme } : {}), ...(device ? { device } : {}) }, engine);
  const model = engine.device(device);
  if (!model) throw new LayoutError(`unknown device "${device}"`, { code: 'unknown_device', data: { hint: 'Use deck_list_devices for ids.' } });
  let pages = [{ id: 'home', name: 'Home', keys: [], dials: [] }];
  let sampleOf = null;
  if (template === 'sample') {
    const samples = engine.mods.profile && engine.mods.profile.SAMPLE_LAYOUTS;
    if (!samples) throw new LayoutError('prism-deck/src/export/profile.js (sample layouts) is not available', { code: 'unavailable' });
    sampleOf = samples[model.id] ? model.id : Object.keys(samples).find((id) => { const d = engine.device(id); return d && d.cols === model.cols && d.rows === model.rows && (d.dials?.count || 0) === (model.dials?.count || 0); });
    if (!sampleOf) throw new LayoutError(`no Prism sample layout for ${model.name}`, { code: 'no_sample', data: { samples: Object.keys(samples) } });
    const toLook = (s) => ({ facet: s.facet, ...(s.params && Object.keys(s.params).length ? { params: s.params } : {}), ...(s.theme ? { theme: s.mode ? `${s.theme}:${s.mode}` : s.theme } : {}), ...(s.state ? { state: s.state } : {}) });
    pages = samples[sampleOf].pages.map((p, i) => ({
      id: i === 0 ? 'home' : String(p.name || `page-${i + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `page-${i + 1}`,
      name: p.name,
      keys: (p.keys || []).map((k) => ({ col: k.col, row: k.row, look: toLook(k.settings), ...(k.settings.group && k.settings.group !== 'A' ? { group: k.settings.group } : {}) })),
      dials: (p.dials || []).map((d) => ({ dial: d.dial, layer: d.layer || 0, feedback: toLook(d.settings), ...(d.settings.group && d.settings.group !== 'A' ? { group: d.settings.group } : {}) })),
      ...(p.infobar ? { infobar: { facet: p.infobar.facet } } : {}),
    }));
  } else if (template !== 'blank') throw new LayoutError(`unknown template "${template}" (blank | sample)`, { code: 'invalid_argument' });
  return normalizeLayout({ name: name || (sampleOf ? `Prism · ${model.name}` : `${model.name} layout`), device: model.id, theme, pages }, engine);
}

// ---------------------------------------------------------------- ops

function pageOf(layout, id, op) {
  const p = id == null ? layout.pages[0] : layout.pages.find((x) => x.id === id);
  if (!p) throw new LayoutError(`${op}: no page "${id}"`, { code: 'unknown_page', data: { pages: layout.pages.map((x) => x.id) } });
  return p;
}
const intOr = (v, d) => (Number.isInteger(v) ? v : d);
function mergeLook(prev, next, replace) {
  if (replace || !prev) return clone(next);
  const out = { ...prev, ...next };
  if (isObj(prev.params) || isObj(next.params)) out.params = { ...(prev.params || {}), ...(next.params || {}) };
  // a new facet/glyph replaces the other one
  if (next.facet != null) delete out.glyph;
  if (next.glyph != null) delete out.facet;
  return out;
}
function setGroup(entry, group, warnings, where) {
  if (group == null) return;
  if (!GROUPS.includes(group)) { warnings.push({ path: where, code: 'invalid_group', message: `group must be one of ${GROUPS.join('')}; ignored` }); return; }
  if (group === 'A') delete entry.group; else entry.group = group;
}

/**
 * Apply edit ops to a COPY of the document. → { layout, applied, warnings, dropped }.
 * Throws LayoutError for malformed ops (nothing is applied: the store saves all or nothing).
 */
export function applyOps(engine, layout0, ops) {
  if (!Array.isArray(ops) || !ops.length) throw new LayoutError('ops must be a non-empty array', { code: 'invalid_ops' });
  if (ops.length > LAYOUT_LIMITS.opsPerUpdate) throw new LayoutError(`at most ${LAYOUT_LIMITS.opsPerUpdate} ops per update`, { code: 'too_many_ops' });
  let layout = clone(layout0);
  const warnings = [], dropped = [];
  let model = engine.device(layout.device);
  ops.forEach((op, i) => {
    const where = `$.ops[${i}]`;
    if (!isObj(op) || !OPS.includes(op.op)) throw new LayoutError(`${where}: unknown op "${op && op.op}"`, { code: 'invalid_ops', data: { ops: OPS } });
    switch (op.op) {
      case 'set_key': {
        const p = pageOf(layout, op.page, op.op);
        if (!Number.isInteger(op.col) || !Number.isInteger(op.row)) throw new LayoutError(`${where}: col and row must be integers`, { code: 'invalid_ops' });
        const at = p.keys.findIndex((k) => k.col === op.col && k.row === op.row);
        const prev = at >= 0 ? p.keys[at] : null;
        if (!op.look && !op.behavior && op.group == null) throw new LayoutError(`${where}: set_key needs look, behavior or group`, { code: 'invalid_ops' });
        const entry = op.replace || !prev ? { col: op.col, row: op.row } : clone(prev);
        if (op.look) entry.look = mergeLook(prev && !op.replace ? prev.look : null, op.look, op.replace);
        if (op.behavior !== undefined) { if (op.behavior === null) delete entry.behavior; else entry.behavior = clone(op.behavior); }
        setGroup(entry, op.group, warnings, `${where}.group`);
        if (at >= 0) p.keys[at] = entry; else p.keys.push(entry);
        break;
      }
      case 'clear_key': {
        const p = pageOf(layout, op.page, op.op);
        const n = p.keys.length;
        p.keys = p.keys.filter((k) => !(k.col === op.col && k.row === op.row));
        if (p.keys.length === n) warnings.push({ path: where, code: 'nothing_there', message: `no key at ${keyId(op.col, op.row)}` });
        break;
      }
      case 'move_key': {
        const p = pageOf(layout, op.page, op.op);
        const f = op.from || {}, t = op.to || {};
        if (![f.col, f.row, t.col, t.row].every(Number.isInteger)) throw new LayoutError(`${where}: from/to need integer col,row`, { code: 'invalid_ops' });
        const a = p.keys.find((k) => k.col === f.col && k.row === f.row);
        if (!a) throw new LayoutError(`${where}: no key at ${keyId(f.col, f.row)}`, { code: 'invalid_ops' });
        const b = p.keys.find((k) => k.col === t.col && k.row === t.row);
        if (b && !op.swap) throw new LayoutError(`${where}: ${keyId(t.col, t.row)} is taken; pass swap:true to swap`, { code: 'invalid_ops' });
        if (b) { b.col = f.col; b.row = f.row; }
        a.col = t.col; a.row = t.row;
        break;
      }
      case 'set_dial': {
        const p = pageOf(layout, op.page, op.op);
        if (!Number.isInteger(op.dial)) throw new LayoutError(`${where}: dial must be an integer`, { code: 'invalid_ops' });
        const layer = intOr(op.layer, 0);
        const at = p.dials.findIndex((d) => d.dial === op.dial && (d.layer ?? 0) === layer);
        const prev = at >= 0 ? p.dials[at] : null;
        const behavior = op.press !== undefined ? op.press : op.behavior;
        if (!op.feedback && behavior === undefined && !op.rotate && op.group == null) throw new LayoutError(`${where}: set_dial needs feedback, press/behavior, rotate or group`, { code: 'invalid_ops' });
        const entry = op.replace || !prev ? { dial: op.dial, layer } : clone(prev);
        if (op.feedback) entry.feedback = mergeLook(prev && !op.replace ? prev.feedback : null, op.feedback, op.replace);
        if (behavior !== undefined) { if (behavior === null) delete entry.behavior; else entry.behavior = clone(behavior); }
        if (op.rotate) {
          const fb = entry.feedback || (entry.feedback = {});
          const r = op.rotate;
          if (r.step != null) {
            if (typeof r.step !== 'number' || r.step <= 0 || r.step > 0.25) throw new LayoutError(`${where}.rotate.step must be a number in (0, 0.25] (value change per tick, 0–1 scale)`, { code: 'invalid_ops' });
            fb.params = { ...(fb.params || {}), step: r.step };
          }
          if (r.value != null) {
            if (typeof r.value !== 'number' || r.value < 0 || r.value > 1) throw new LayoutError(`${where}.rotate.value must be 0–1`, { code: 'invalid_ops' });
            fb.value = Math.round(r.value * 100);
          }
        }
        if (op.touch != null && op.touch !== 'press') warnings.push({ path: `${where}.touch`, code: 'touch_follows_press', message: 'on Prism dials a tap on the touch strip acts as a press and a long touch resets the value; touch has no separate binding' });
        setGroup(entry, op.group, warnings, `${where}.group`);
        if (at >= 0) p.dials[at] = entry; else p.dials.push(entry);
        break;
      }
      case 'clear_dial': {
        const p = pageOf(layout, op.page, op.op);
        const layer = intOr(op.layer, 0);
        const n = p.dials.length;
        p.dials = p.dials.filter((d) => !(d.dial === op.dial && (d.layer ?? 0) === layer));
        if (p.dials.length === n) warnings.push({ path: where, code: 'nothing_there', message: `no dial at ${keyId(op.dial, layer)}` });
        break;
      }
      case 'place_span': {
        const p = pageOf(layout, op.page, op.op);
        const f = engine.facet(op.facet);
        if (!f) throw new LayoutError(`${where}: no deck facet "${op.facet}"`, { code: 'unknown_facet' });
        if (f.surface !== 'span' && f.surface !== 'deck') throw new LayoutError(`${where}: ${f.id} is a ${f.surface} facet; place_span takes span or deck facets`, { code: 'facet_does_not_fit' });
        const at = op.at || { col: 0, row: 0 };
        const cols = f.surface === 'deck' ? model.cols : intOr(op.cols, f.span?.cols === 'all' || f.span?.cols == null ? model.cols - (at.col || 0) : f.span.cols);
        const rows = f.surface === 'deck' ? model.rows : intOr(op.rows, f.span?.rows === 'all' || f.span?.rows == null ? model.rows - (at.row || 0) : f.span.rows);
        const c0 = f.surface === 'deck' ? 0 : intOr(at.col, 0), r0 = f.surface === 'deck' ? 0 : intOr(at.row, 0);
        if (cols < 1 || rows < 1) throw new LayoutError(`${where}: the span is empty`, { code: 'invalid_ops' });
        const look = { facet: f.id, ...(isObj(op.params) ? { params: clone(op.params) } : {}), ...(op.theme ? { theme: op.theme } : {}), ...(Number.isInteger(op.state) ? { state: op.state } : {}) };
        for (let r = r0; r < r0 + rows; r++) for (let c = c0; c < c0 + cols; c++) {
          const entry = { col: c, row: r, look: clone(look) };
          setGroup(entry, op.group, warnings, `${where}.group`);
          const k = p.keys.findIndex((x) => x.col === c && x.row === r);
          if (k >= 0) p.keys[k] = entry; else p.keys.push(entry);
        }
        break;
      }
      case 'place_screen': {
        const p = pageOf(layout, op.page, op.op);
        const f = engine.facet(op.facet);
        if (!f) throw new LayoutError(`${where}: no deck facet "${op.facet}"`, { code: 'unknown_facet' });
        const fb = { facet: f.id, ...(isObj(op.params) ? { params: clone(op.params) } : {}), ...(op.theme ? { theme: op.theme } : {}) };
        const screens = f.screens || [];
        if (f.surface === 'screen' && screens.includes('infobar') && model.screen?.kind === 'infobar') { p.infobar = fb; break; }
        const galleon = model.screen?.kind === 'galleon';
        const fits = (f.surface === 'screen' && galleon && screens.includes('galleon')) || (f.surface === 'strip' && f.segments !== 1 && model.strip) || (f.surface === 'deck' && (model.strip || galleon));
        if (!fits) throw new LayoutError(`${where}: ${f.id} (${f.surface}${screens.length ? ` ${screens.join('/')}` : ''}) does not fill the dials/screen of ${model.name}`, { code: 'facet_does_not_fit' });
        const layers = model.dials?.layers || 1;
        for (let d = 0; d < (model.dials?.count || 0); d++) for (let l = 0; l < layers; l++) {
          const entry = { dial: d, layer: l, feedback: clone(fb) };
          setGroup(entry, op.group, warnings, `${where}.group`);
          const k = p.dials.findIndex((x) => x.dial === d && (x.layer ?? 0) === l);
          if (k >= 0) p.dials[k] = { ...p.dials[k], ...entry }; else p.dials.push(entry);
        }
        break;
      }
      case 'add_page': {
        const id = String(op.id || '').slice(0, LAYOUT_LIMITS.pageIdChars);
        if (!id) throw new LayoutError(`${where}: add_page needs an id`, { code: 'invalid_ops' });
        if (layout.pages.some((x) => x.id === id)) throw new LayoutError(`${where}: page "${id}" exists`, { code: 'duplicate_page' });
        if (layout.pages.length >= LAYOUT_LIMITS.pages) throw new LayoutError(`at most ${LAYOUT_LIMITS.pages} pages`, { code: 'too_many_pages' });
        const page = { id, ...(op.name ? { name: String(op.name).slice(0, 40) } : {}), keys: [], dials: [] };
        const after = op.after != null ? layout.pages.findIndex((x) => x.id === op.after) : -1;
        if (after >= 0) layout.pages.splice(after + 1, 0, page); else layout.pages.push(page);
        break;
      }
      case 'remove_page': {
        if (layout.pages.length === 1) throw new LayoutError(`${where}: a layout keeps at least one page`, { code: 'invalid_ops' });
        pageOf(layout, op.id, op.op);
        layout.pages = layout.pages.filter((x) => x.id !== op.id);
        for (const p of layout.pages) for (const k of [...p.keys, ...p.dials]) if (k.behavior?.kind === 'prism.page' && k.behavior.page === op.id) warnings.push({ path: where, code: 'dangling_page_link', message: `page "${p.id}" still links to removed page "${op.id}"` });
        break;
      }
      case 'rename_page': { const p = pageOf(layout, op.id, op.op); p.name = String(op.name || '').slice(0, 40); break; }
      case 'set_theme': { if (op.theme == null || op.theme === '') delete layout.theme; else layout.theme = String(op.theme); break; }
      case 'set_name': { layout.name = String(op.name || '').slice(0, LAYOUT_LIMITS.nameChars) || layout.name; break; }
      case 'retarget': {
        const next = engine.device(op.device);
        if (!next) throw new LayoutError(`${where}: unknown device "${op.device}"`, { code: 'unknown_device' });
        const dials = next.dials?.count || 0, layers = next.dials?.layers || (dials ? 1 : 0);
        const S = engine.mods.settings;
        // a facet that can't be drawn on the new device's keys / dials is dropped too
        const fits = (facetId, controller) => { if (!facetId || !S) return true; const f = engine.facet(facetId); return !f || !!S.facetMode(f, controller, next); };
        for (const p of layout.pages) {
          p.keys = p.keys.filter((k) => {
            const inGrid = k.col < next.cols && k.row < next.rows;
            const ok = inGrid && fits(k.look?.facet, 'Keypad');
            if (!ok) dropped.push({ page: p.id, key: keyId(k.col, k.row), reason: inGrid ? `${k.look.facet} does not fit ${next.name}` : 'outside the grid' });
            return ok;
          });
          p.dials = p.dials.filter((d) => {
            const inRange = dials > 0 && d.dial < dials && (d.layer ?? 0) < Math.max(1, layers);
            const ok = inRange && fits(d.feedback?.facet, 'Encoder');
            if (!ok) dropped.push({ page: p.id, dial: keyId(d.dial, d.layer ?? 0), reason: inRange ? `${d.feedback.facet} does not fit ${next.name}` : 'no such dial' });
            return ok;
          });
          if (p.infobar && next.screen?.kind !== 'infobar') { dropped.push({ page: p.id, infobar: p.infobar.facet, reason: 'no info bar' }); delete p.infobar; }
        }
        layout.device = next.id;
        model = next;
        break;
      }
      default: break;
    }
  });
  return { layout, applied: ops.length, warnings, dropped };
}

// ---------------------------------------------------------------- validation

/**
 * live-validate.validateLayout() for a document without a live device. It reads the
 * geometry from `device.model`, which for a bare devices.js model is the profile
 * Device.Model STRING — so pass the model wrapped like the runtime's device record.
 */
export function liveValidate(engine, layout) {
  const model = engine.device(layout.device);
  return engine.mods.live.validateLayout(layout, model ? { id: model.id, model } : null);
}

/**
 * Validate a document against the device geometry and the real registries.
 * live=false (default): export-only (native) behaviors are reported in `review`, not as
 * errors. live=true: they are errors (requires_export), exactly as the plugin refuses them.
 * → { ok, live, errors, warnings, review, stats }
 */
export function validateLayoutDoc(engine, raw, { live = false } = {}) {
  const { live: L, settings: S } = engine.mods;
  const errors = [], warnings = [], review = [];
  let layout;
  try { layout = normalizeLayout(raw, engine); } catch (e) {
    if (e instanceof LayoutError) return { ok: false, live, errors: [{ path: '$', code: e.code, message: e.message }], warnings, review, stats: null };
    throw e;
  }
  const model = engine.device(layout.device);
  const v = liveValidate(engine, layout);
  for (const e of v.errors) {
    if (e.code === 'requires_export' && !live) review.push({ path: e.path, reason: e.message, export: 'native actions are not written by the current exporter: add them in the Stream Deck app after importing' });
    else errors.push(e);
  }
  warnings.push(...v.warnings);
  // where a look or feedback can be drawn (prism-deck/src/plugin/settings.js facetMode)
  const stats = { pages: layout.pages.length, keys: 0, dials: 0, facets: new Set(), device: { id: model.id, name: model.name, cols: model.cols, rows: model.rows, dials: model.dials?.count || 0, layers: model.dials?.layers || (model.dials?.count ? 1 : 0) } };
  layout.pages.forEach((page, pi) => {
    const pp = `$.pages[${pi}]`;
    const blocks = new Map(); // span/screen facet|group → coords
    page.keys.forEach((k, ki) => {
      stats.keys++;
      const p = `${pp}.keys[${ki}]`;
      const ov = v.pages.get(page.id)?.keys.get(keyId(k.col, k.row));
      if (k.look && (k.look.fg != null || k.look.bg != null) && !warnings.some((w) => w.path.startsWith(`${p}.look.`) && w.code === 'ignored_field')) warnings.push({ path: `${p}.look`, code: 'ignored_field', message: 'fg/bg are ignored: deck themes own the material; pick a theme instead' });
      if (!ov) return;
      if (ov.facet) {
        stats.facets.add(ov.facet);
        const f = engine.facet(ov.facet);
        const mode = S && f ? S.facetMode(f, 'Keypad', model) : 'key';
        if (!mode) errors.push({ path: `${p}.look.facet`, code: 'facet_does_not_fit', message: `${ov.facet} is a ${f?.surface} facet; it cannot be drawn on a key of ${model.name}` });
        else if (S && S.GROUP_MODES.has(mode)) {
          const id = `${ov.facet}|${k.group || 'A'}`;
          if (!blocks.has(id)) blocks.set(id, { facet: ov.facet, group: k.group || 'A', cells: [] });
          blocks.get(id).cells.push([k.col, k.row]);
        }
      } else if (ov.image) review.push({ path: `${p}.look.image`, reason: 'custom image', export: 'live only: exported profiles carry Prism facets, not images' });
      else if (ov.sys) review.push({ path: `${p}.look`, reason: 'title-only look', export: 'live only: give it a facet or glyph to export it' });
      const b = k.behavior;
      if (b && (b.kind === 'prism.page' || b.kind === 'prism.toggle')) review.push({ path: `${p}.behavior`, reason: `${b.kind} behavior`, export: 'live only: exported Prism Facet keys advance their facet state on press; add page actions in the Stream Deck app' });
    });
    for (const blk of blocks.values()) {
      const cs = blk.cells.map((c) => c[0]), rs = blk.cells.map((c) => c[1]);
      const w = Math.max(...cs) - Math.min(...cs) + 1, h = Math.max(...rs) - Math.min(...rs) + 1;
      if (w * h !== blk.cells.length) warnings.push({ path: pp, code: 'span_incomplete', message: `${blk.facet} (group ${blk.group}) covers ${blk.cells.length} of the ${w}×${h} keys of its bounding box; the empty keys show nothing of it` });
    }
    const groupsPerFacet = new Map();
    for (const blk of blocks.values()) groupsPerFacet.set(blk.facet, (groupsPerFacet.get(blk.facet) || 0) + 1);
    for (const [f, n] of groupsPerFacet) if (n > 1) warnings.push({ path: pp, code: 'live_merges_groups', message: `${f} appears in ${n} span groups; live, all keys with the same span facet on a device render as one block` });
    const screens = new Map();
    page.dials.forEach((d, di) => {
      stats.dials++;
      const p = `${pp}.dials[${di}]`;
      const ov = v.pages.get(page.id)?.dials.get(keyId(d.dial, d.layer ?? 0));
      if (!ov) return;
      if (ov.facet) {
        stats.facets.add(ov.facet);
        const f = engine.facet(ov.facet);
        const mode = S && f ? S.facetMode(f, 'Encoder', model) : 'strip-1';
        if (!mode) errors.push({ path: `${p}.feedback.facet`, code: 'facet_does_not_fit', message: `${ov.facet} (${f?.surface}) cannot be drawn on a dial of ${model.name}` });
        else if (mode === 'key-on-dial') review.push({ path: `${p}.feedback.facet`, reason: 'key art on a dial', export: 'live only: exported profiles need a dial, strip or screen facet here' });
        else if (mode === 'screen-galleon' || mode === 'strip-all') {
          const id = `${ov.facet}|${d.group || 'A'}`;
          screens.set(id, (screens.get(id) || 0) + 1);
        }
      }
      const b = d.behavior;
      if (b && (b.kind === 'prism.page' || b.kind === 'prism.toggle')) review.push({ path: `${p}.behavior`, reason: `${b.kind} on press`, export: 'live only' });
    });
    const slots = (model.dials?.count || 0) * (model.dials?.layers || 1);
    for (const [id, n] of screens) if (n < slots) warnings.push({ path: pp, code: 'screen_incomplete', message: `${id.split('|')[0]} fills ${n} of ${slots} dial slots; put it on every dial${model.dials?.layers > 1 ? ' and layer' : ''} (same group) to fill the ${model.screen?.kind === 'galleon' ? 'screen' : 'strip'}` });
    if (page.infobar) {
      const f = engine.facet(page.infobar.facet);
      if (model.screen?.kind !== 'infobar') errors.push({ path: `${pp}.infobar`, code: 'no_infobar', message: `${model.name} has no info bar (Stream Deck Neo only)` });
      else if (!f || f.surface !== 'screen' || !(f.screens || []).includes('infobar')) errors.push({ path: `${pp}.infobar.facet`, code: 'facet_does_not_fit', message: `${page.infobar.facet} is not an info-bar facet` });
      else { stats.facets.add(f.id); review.push({ path: `${pp}.infobar`, reason: 'Neo info bar', export: 'export only: the live channel does not drive the info bar' }); }
    }
  });
  if (model.display === 'none') warnings.push({ path: '$.device', code: 'no_display', message: `${model.name} has no display; looks are not visible` });
  if (model.dials?.layers > 1 && layout.pages.some((p) => p.dials.length)) warnings.push({ path: '$.device', code: 'galleon_layers', message: 'Galleon 100 SD: holding a dial ~3 s switches its layer (0/1); a press is a short push' });
  return { ok: errors.length === 0, live, errors, warnings, review, stats: { ...stats, facets: [...stats.facets] } };
}

/** Document → buildProfile() pages ([{ name, keys: [{col,row,settings}], dials, infobar }]) + what was left out. */
export function profilePages(engine, layout, { pages: only } = {}) {
  const v = liveValidate(engine, layout);
  const out = [], skipped = [];
  const settingsOf = (ov, group) => {
    const s = { facet: ov.facet };
    if (ov.theme) s.theme = ov.theme;
    if (ov.mode) s.mode = ov.mode;
    if (ov.params && Object.keys(ov.params).length) s.params = ov.params;
    if (group && group !== 'A') s.group = group;
    if (ov.state) s.state = ov.state;
    if (typeof ov.value === 'number') s.value = ov.value;
    return s;
  };
  for (const page of layout.pages) {
    if (only && only.length && !only.includes(page.id)) continue;
    const resolved = v.pages.get(page.id);
    const p = { name: page.name || page.id, keys: [], dials: [] };
    for (const k of page.keys) {
      const ov = resolved?.keys.get(keyId(k.col, k.row));
      if (ov && ov.facet) p.keys.push({ col: k.col, row: k.row, settings: settingsOf(ov, k.group) });
      else skipped.push({ page: page.id, key: keyId(k.col, k.row), reason: ov ? 'no facet (title/image looks are live only)' : 'invalid look' });
    }
    for (const d of page.dials) {
      const ov = resolved?.dials.get(keyId(d.dial, d.layer ?? 0));
      if (ov && ov.facet) p.dials.push({ dial: d.dial, layer: d.layer ?? 0, settings: settingsOf(ov, d.group) });
      else skipped.push({ page: page.id, dial: keyId(d.dial, d.layer ?? 0), reason: ov ? 'no facet (feedback without a facet is live only)' : 'invalid feedback' });
    }
    if (page.infobar && page.infobar.facet) {
      const t = page.infobar.theme ? engine.theme(page.infobar.theme) : null;
      p.infobar = { facet: page.infobar.facet, ...(t ? { theme: t.theme, ...(t.mode ? { mode: t.mode } : {}) } : {}), ...(isObj(page.infobar.params) ? { params: page.infobar.params } : {}) };
    }
    out.push(p);
  }
  return { pages: out, skipped };
}

// ---------------------------------------------------------------- store

function summarize(r) {
  const l = r.layout;
  return { layoutId: r.layoutId, name: l.name, device: l.device, theme: l.theme || null, pages: l.pages.map((p) => p.id), keys: l.pages.reduce((s, p) => s + p.keys.length, 0), dials: l.pages.reduce((s, p) => s + p.dials.length, 0), revision: r.revision, updatedAt: r.updatedAt };
}

export class DeckLayoutStore {
  /** @param {{ filePath?, inMemory?, logger? }} opts */
  constructor({ filePath = DEFAULT_PATH, inMemory = false, logger = null } = {}) {
    this.inMemory = !!inMemory;
    this.filePath = this.inMemory ? null : path.resolve(filePath);
    this.logger = logger;
    this.layouts = new Map();
    if (!this.inMemory) this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      for (const r of Array.isArray(raw.layouts) ? raw.layouts : []) if (r && r.layoutId && r.layout) this.layouts.set(r.layoutId, r);
      this._log('info', `Loaded ${this.layouts.size} deck layout(s) from ${this.filePath}`);
    } catch (err) { this._log('warn', `Could not read deck layouts (starting empty): ${err.message}`); }
  }

  _persist() {
    if (this.inMemory) return;
    try {
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: '1.0', schema: LAYOUT_SCHEMA, layouts: [...this.layouts.values()], lastSynced: nowIso() }, null, 2));
      fs.renameSync(tmp, this.filePath);
    } catch (err) { throw new LayoutError(`Failed to persist deck layouts: ${err.message}`, { code: 'persist_failed' }); }
  }

  _log(level, msg) { if (this.logger) (this.logger[level] || this.logger.info).call(this.logger, msg); }

  list({ device } = {}) {
    return [...this.layouts.values()].filter((r) => !device || r.layout.device === device).map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id) {
    const r = this.layouts.get(String(id));
    if (!r) throw new LayoutError(`No deck layout "${id}"`, { code: 'not_found', data: { layouts: [...this.layouts.keys()].slice(0, 20) } });
    return clone(r);
  }

  create(layout) {
    if (this.layouts.size >= LAYOUT_LIMITS.layouts) throw new LayoutError(`at most ${LAYOUT_LIMITS.layouts} layouts; delete some first`, { code: 'limit_reached' });
    let id;
    do { id = `lay_${randomBytes(4).toString('hex')}`; } while (this.layouts.has(id));
    const t = nowIso();
    const r = { layoutId: id, revision: 1, createdAt: t, updatedAt: t, layout: clone(layout) };
    this.layouts.set(id, r);
    try { this._persist(); } catch (e) { this.layouts.delete(id); throw e; }
    return clone(r);
  }

  update(id, layout, baseRevision) {
    const cur = this.layouts.get(String(id));
    if (!cur) throw new LayoutError(`No deck layout "${id}"`, { code: 'not_found' });
    if (baseRevision != null && baseRevision !== cur.revision) throw new LayoutError(`revision conflict: the layout is at revision ${cur.revision}, not ${baseRevision}; re-read it with deck_layout_get`, { code: 'revision_conflict', data: { revision: cur.revision } });
    const next = { ...cur, revision: cur.revision + 1, updatedAt: nowIso(), layout: clone(layout) };
    this.layouts.set(cur.layoutId, next);
    try { this._persist(); } catch (e) { this.layouts.set(cur.layoutId, cur); throw e; }
    return clone(next);
  }

  delete(id) {
    const cur = this.layouts.get(String(id));
    if (!cur) throw new LayoutError(`No deck layout "${id}"`, { code: 'not_found' });
    this.layouts.delete(cur.layoutId);
    try { this._persist(); } catch (e) { this.layouts.set(cur.layoutId, cur); throw e; }
    return { deleted: true, layoutId: cur.layoutId };
  }
}
