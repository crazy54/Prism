// Deck facet contract — what every catalog entry must declare.
//
//   {
//     id:          'span-waveform'          unique kebab-case id, starting with one of the gallery's prefixes
//     title:       'Waveform'               ≤ 40 chars
//     gallery:     'spans'                  a GALLERIES id (defaults to the facet's folder)
//     category:    'Waveforms & Audio'      one of that gallery's categories
//     description: '20–180 chars: what it shows and why you'd put it on a deck.'
//     tags:        ['audio', 'waveform']    lower-case search terms (≥ 1)
//     surface:     'key' | 'span' | 'strip' | 'screen' | 'deck'
//     span:        { cols: 'all', rows: 1 } span: the default block (numbers or 'all'); runtimes may pass another
//     segments:    1 | 'all'                strip: one dial's 200×100 segment, or the whole strip (default 'all')
//     screens:     ['galleon', 'infobar']   screen: targets it supports (context.js SCREEN_TARGETS)
//     devices:     ['plus', 'galleon']      optional: restrict to models (devices.js ids)
//     animated:    true                     false = a still (rendered on state change only)
//     fps:         12                       frame-rate hint (1–30); runtimes cap it (Elgato guidance ≈ 10 updates/s per key)
//     loop:        4                        seconds per visual cycle (thumbnails, recordings, seamless loops)
//     still:       5.6                      optional thumbnail instant (s) — default min(loop × 0.4, 6) (render.stillTime)
//     states:      ['live', 'muted']        named states; press advances per `press`
//     tones:       { muted: 'neg' }         state → tone (idle active ok info warn neg alert crit off)
//     press:       'toggle'                 'cycle' | 'toggle' | 'momentary' | 'none' (default: cycle with states, else momentary)
//     params:      { label: { type: 'text', default: 'Mic' } }   number | hue | text | select | bool | color | theme | glyph
//     data:        ['audio']                live inputs a runtime may feed into ctx.data (always simulate a fallback)
//     link:        { 'mic.muted': { live: false, muted: true } }   linked state (API 1.6, scene/link.js): states / dial value
//                  mirror a value shared by every slot on the device (or a function of params → that object)
//     glyph:       'mic'                    icons gallery: the glyph this facet presents
//     theme:       'prism'                  themes gallery: the theme this facet always renders in (others follow the deck theme)
//     game:        { init, reduce, tickHz?, ticking?, animate? }   stateful facets (API 1.5, scene/game.js):
//                  init({ seed, device, grid, params }) → JSON state; reduce(state, event) → state (pure);
//                  ticks ≤ 4 Hz only while ticking(state); render reads ctx.game / ctx.gamePrev / ctx.gameEvent
//     order, since, credits
//     render(ctx) → string                  SVG for this instant — pure, deterministic, every theme, every target
//   }
//
// Facets import only engine modules (src/scene/*, src/devices.js, glyph/theme
// contracts) — never node:*, process, timers, Date or Math.random.

import { GALLERIES, getGallery } from './galleries.js';
import { KEY_SIZES, FAMILY_DEVICES, getDevice } from '../devices.js';
import { validateLink } from '../scene/link.js';

export const SURFACES = ['key', 'span', 'strip', 'screen', 'deck'];
export const PRESS = ['cycle', 'toggle', 'momentary', 'none'];
export const PARAM_TYPES = ['number', 'hue', 'text', 'select', 'bool', 'color', 'theme', 'glyph'];
export const DATA_KEYS = ['audio', 'spectrum', 'cpu', 'mem', 'gpu', 'net', 'disk', 'temp', 'battery', 'uptime', 'clock', 'timer', 'weather', 'calendar', 'media', 'mic', 'camera', 'volume', 'stream', 'game'];
export const SCREENS = ['galleon', 'galleon-widget', 'infobar', 'monitor'];
export const TONES = ['idle', 'active', 'ok', 'info', 'warn', 'neg', 'alert', 'crit', 'busy', 'off'];

export const GAME_SURFACES = ['key', 'span', 'deck'];
export const GAME_TICK_MAX_HZ = 4; // = scene/game.js TICK_MAX_HZ
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_FPS = { key: 10, span: 12, strip: 12, screen: 10, deck: 10 };

/** Fill defaults. `file` is the path relative to src/facets (e.g. 'spans/waveform.js'). */
export function normalizeFacet(raw, file, index = 0, count = 1) {
  const [dir, name] = file.split('/');
  const base = name.replace(/\.js$/, '');
  const f = {
    id: count === 1 ? base : undefined,
    gallery: dir,
    tags: [],
    surface: 'key',
    animated: true,
    loop: 4,
    order: 50 + index,
    since: '0.1.0',
    params: {},
    states: [],
    ...raw,
  };
  f.file = file;
  f.tags = [...new Set((f.tags || []).map((t) => String(t).toLowerCase()))];
  if (f.fps === undefined) f.fps = f.animated ? DEFAULT_FPS[f.surface] ?? 10 : 0;
  if (f.press === undefined) f.press = f.states?.length > 1 ? 'cycle' : 'momentary';
  if (f.surface === 'strip' && f.segments === undefined) f.segments = 'all';
  if (f.surface === 'span' && !f.span) f.span = { cols: 'all', rows: 'all' };
  const params = {};
  for (const [k, p] of Object.entries(f.params || {})) {
    const type = p.type || (typeof p.default === 'number' ? 'number' : typeof p.default === 'boolean' ? 'bool' : p.options ? 'select' : 'text');
    params[k] = { label: k[0].toUpperCase() + k.slice(1).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`), ...p, type };
  }
  f.params = params;
  return f;
}

/** Returns a list of problems (empty when the facet is valid). */
export function validateFacet(f) {
  const errs = [];
  const at = `${f.file || '?'}${f.id ? ` (${f.id})` : ''}`;
  const need = (cond, msg) => { if (!cond) errs.push(`${at}: ${msg}`); };
  need(typeof f.id === 'string' && KEBAB.test(f.id), 'id must be kebab-case (set `id` when a file exports several facets)');
  const g = getGallery(f.gallery);
  need(!!g, `gallery "${f.gallery}" is not one of ${GALLERIES.map((x) => x.id).join(', ')}`);
  if (g) {
    need(g.categories.includes(f.category), `category "${f.category}" is not in ${g.id}: ${g.categories.join(' | ')}`);
    need(g.surfaces.includes(f.surface), `surface "${f.surface}" does not belong in ${g.id} (allowed: ${g.surfaces.join(', ')})`);
    if (typeof f.id === 'string') need(g.prefix.some((p) => f.id.startsWith(`${p}-`)), `id must start with ${g.prefix.map((p) => `"${p}-"`).join(' or ')}`);
  }
  if (f.file) need(f.file.startsWith(`${f.gallery}/`), `lives in ${f.file.split('/')[0]}/ but declares gallery "${f.gallery}"`);
  need(typeof f.title === 'string' && f.title.trim().length > 0 && f.title.length <= 40, 'title is required (≤ 40 chars)');
  need(typeof f.description === 'string' && f.description.length >= 20 && f.description.length <= 180, 'description must be 20–180 characters');
  need(Array.isArray(f.tags) && f.tags.length >= 1, 'tags must be a non-empty array');
  need(SURFACES.includes(f.surface), `surface must be one of ${SURFACES.join(', ')}`);
  if (f.surface === 'span') need(f.span && ['cols', 'rows'].every((k) => f.span[k] === 'all' || (Number.isInteger(f.span[k]) && f.span[k] >= 1)), "span must be { cols, rows } with whole numbers or 'all'");
  if (f.surface === 'strip') need(f.segments === 1 || f.segments === 'all', "segments must be 1 or 'all'");
  if (f.surface === 'screen') need(Array.isArray(f.screens) && f.screens.length && f.screens.every((s) => SCREENS.includes(s)), `screens must list targets from ${SCREENS.join(', ')}`);
  if (f.devices) need(Array.isArray(f.devices) && f.devices.every((d) => getDevice(d).id === d), 'devices must list devices.js ids');
  need(typeof f.animated === 'boolean', 'animated must be true or false');
  need(typeof f.loop === 'number' && f.loop > 0 && f.loop <= 600, 'loop must be 0–600 seconds');
  if (f.still !== undefined) need(typeof f.still === 'number' && f.still >= 0 && f.still <= 600, 'still must be a time in seconds (0–600)');
  need(typeof f.fps === 'number' && f.fps >= 0 && f.fps <= 30 && (f.animated ? f.fps >= 1 : true), 'fps must be 1–30 for animated facets (0 for stills)');
  need(Array.isArray(f.states) && f.states.every((s) => typeof s === 'string' && KEBAB.test(s)) && new Set(f.states).size === f.states.length && f.states.length <= 8, 'states must be ≤ 8 unique kebab-case names');
  need(PRESS.includes(f.press), `press must be one of ${PRESS.join(', ')}`);
  if (f.press === 'toggle') need(f.states.length === 2, 'press: "toggle" needs exactly two states');
  if (f.tones) need(Object.entries(f.tones).every(([k, v]) => f.states.includes(k) && TONES.includes(v)), `tones must map state names to ${TONES.join(' | ')}`);
  need(f.params && typeof f.params === 'object', 'params must be an object');
  for (const [k, p] of Object.entries(f.params || {})) {
    need(/^[a-z][a-zA-Z0-9]*$/.test(k), `param "${k}" must be camelCase`);
    need(PARAM_TYPES.includes(p.type), `param "${k}" type must be one of ${PARAM_TYPES.join(', ')}`);
    need('default' in p, `param "${k}" needs a default`);
    if (p.type === 'number' || p.type === 'hue') need(typeof p.default === 'number' && (p.min === undefined || p.default >= p.min) && (p.max === undefined || p.default <= p.max), `param "${k}" default must be a number within min/max`);
    if (p.type === 'select') need(Array.isArray(p.options) && p.options.length > 0 && p.options.some((o) => (typeof o === 'object' ? o.value : o) === p.default), `param "${k}" needs options that include its default`);
    if (p.type === 'color') need(/^#[0-9a-f]{6}$/i.test(String(p.default)), `param "${k}" default must be #rrggbb`);
  }
  if (f.data) need(Array.isArray(f.data) && f.data.every((d) => DATA_KEYS.includes(d)), `data must list keys from ${DATA_KEYS.join(', ')}`);
  for (const e of validateLink(f)) need(false, e);
  if (f.gallery === 'icons') need(typeof f.glyph === 'string', 'icons facets name their `glyph`');
  if (f.gallery === 'games') need(f.game !== undefined, 'games facets declare a `game` (scene/game.js)');
  if (f.game !== undefined) {
    const G = f.game || {};
    need(typeof G.init === 'function' && typeof G.reduce === 'function', 'game needs init({ seed, device, grid, params }) and reduce(state, event)');
    need(G.tickHz === undefined || (typeof G.tickHz === 'number' && G.tickHz >= 0 && G.tickHz <= GAME_TICK_MAX_HZ), `game.tickHz must be 0–${GAME_TICK_MAX_HZ}`);
    if (G.tickHz > 0) need(typeof G.ticking === 'function', 'game.ticking(state) must say when the game needs ticks');
    need(G.animate === undefined || (typeof G.animate === 'number' && G.animate >= 0 && G.animate <= 3), 'game.animate must be 0–3 seconds');
    need(GAME_SURFACES.includes(f.surface), `games live on ${GAME_SURFACES.join(', ')} surfaces`);
  }
  if (f.gallery === 'themes') need(typeof f.theme === 'string', 'themes facets name their `theme`');
  need(typeof f.render === 'function', 'render(ctx) must be a function returning an SVG string');
  return errs;
}

/** The conformance matrix: every target a facet must render at (sizes / devices / screens). */
export function renderTargets(f) {
  const devs = (list) => (f.devices ? list.filter((d) => f.devices.includes(d)) : list);
  switch (f.surface) {
    case 'key': return (f.devices ? f.devices.map((d) => ({ device: d })) : KEY_SIZES.map((size) => ({ size })));
    case 'span': return devs(FAMILY_DEVICES).map((device) => ({ device }));
    case 'strip': return f.segments === 1 ? [{ device: 'plus', segments: 1 }] : devs(['plus', 'plusxl']).map((device) => ({ device }));
    case 'screen': return f.screens.map((screen) => ({ screen, device: screen === 'infobar' ? 'neo' : 'galleon' }));
    case 'deck': return devs(FAMILY_DEVICES).map((device) => ({ device }));
    default: return [];
  }
}
