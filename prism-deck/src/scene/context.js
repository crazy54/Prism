// The render context a facet receives — everything it may depend on.
//
//   kind        the surface: 'key' | 'span' | 'strip' | 'screen' | 'deck'
//   w, h        canvas px. key: the device's native key px (72 … 160, Studio 144×112);
//               span: a block of keys incl. the physical gaps; strip: 200 × segments by 100;
//               screen: Galleon 720×384 / Neo info bar 232×50 / …; deck: the whole panel
//   size        min(w, h)
//   device      device model (devices.js); grid (span/deck: key cells incl. gaps); strip
//               ({ segments, of, segment }); screen ({ kind, w, h, widgets }); deck (panel layout)
//   theme       the active deck theme instance: colors, spectral(h), painters (themes/_theme.js)
//   colors      = theme.colors
//   glyphs      the glyph registry (Map id → glyph); draw them with surface(ctx).glyph(id)
//   t, frame    seconds since start / frame number
//   state, stateName, states, since   state index, its name, all names, seconds in this state
//   tone        the state's tone (facet.tones[stateName] || 'idle')
//   pressed, pressAge                 held now / seconds since the last press
//   pressedFor                        seconds the key has been held so far (0 when released)
//   heldFor                           seconds the last finished press lasted (after release; 0 before any) — hold-to-confirm
//   turnAge                           seconds since the last dial rotate (Infinity = never)
//   touch                             strip / dial on a touch device: { x, y (surface px), hold, age (s since the tap) }; undefined otherwise (Galleon has no touch)
//   pressKey                          span / deck: the device key index (grid cell .i) that was pressed, else null
//   value, ticks, values              0–1 control value (dials), accumulated dial ticks,
//                                     strip: one value per segment
//   params      resolved parameter values
//   hue, tint   the facet's Spectrum position (gallery hue unless params.hue) and its color in this theme
//   seed, rng(), noise                seeded randomness (rng() returns a fresh generator → pure)
//   now, clock  wall-clock ms supplied by the runtime (fixed in tests) and local time parts
//   data        live inputs a runtime feeds (audio, cpu, mem, net …); facets simulate fallbacks
//   idPrefix, id(name)                collision-free SVG ids
//   reduced     true under reduced motion: render a meaningful static frame
//   game        game facets (API 1.5): the current state (runtimes pass opts.game from scene/game.js's
//               host; without it the facet's game.init() state — what stills and thumbnails show)
//   gamePrev    the state before the last event (null at the start)
//   gameEvent   the last event + its age in seconds ({ type, key, cell, col, row, dial, ticks, t, n, seed, age }) or null
//   facet       the normalized facet (read-only)

import { getDevice, keySize, spanGrid, stripGrid, deckLayout, screenOf } from '../devices.js';
import { rng as makeRng, hash, noise1, noise2, fbm1, metric, series } from './noise.js';
import { getGallery } from '../facets/galleries.js';
import { useTheme } from '../themes/_registry.js';
import { glyphRegistry } from '../glyphs/_registry.js';

const DEFAULT_NOW = Date.UTC(2026, 3, 14, 9, 41, 0); // a fixed, fictional instant for tests and stills

/** Defaults for every declared param, overlaid with `overrides` (unknown keys ignored, numbers clamped, options enforced). */
export function resolveParams(decl = {}, overrides = {}) {
  const out = {};
  for (const [k, p] of Object.entries(decl)) {
    let v = overrides && Object.hasOwn(overrides, k) ? overrides[k] : p.default;
    if (p.type === 'number' || p.type === 'hue') { v = Number(v); if (!Number.isFinite(v)) v = p.default; if (typeof p.min === 'number') v = Math.max(p.min, v); if (typeof p.max === 'number') v = Math.min(p.max, v); }
    else if (p.type === 'bool') v = v === true || v === 'true' || v === 1 || v === '1';
    else if (p.type === 'select') { const opts = (p.options || []).map((o) => (typeof o === 'object' ? o.value : o)); if (!opts.includes(v)) v = p.default; }
    else if (p.type === 'color') { if (!/^#[0-9a-f]{6}$/i.test(String(v))) v = p.default; }
    else v = String(v ?? '').slice(0, p.maxLength || 48);
    out[k] = v;
  }
  return out;
}

/** Broken-down local time for an epoch ms and a UTC offset in minutes. */
export function clockOf(now, tzOffset = 0) {
  const d = new Date(now + tzOffset * 60000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), ms: d.getUTCMilliseconds(), tzOffset };
}

/** Screen targets: 'galleon' (720×384, 4 widgets) | 'galleon-widget' (360×180) | 'infobar' (Neo, 232×50 SDK) | 'monitor' (2560×720).
 *  Galleon widgets are 2:1 (the app scales the whole 200×100 layout uniformly): 360×180 windows centered in the
 *  360×192 quadrants, i.e. 6 px gutters above and below each widget (assumed; hardware-lab RESULTS.md §3). */
export const SCREEN_TARGETS = {
  galleon: { kind: 'galleon', w: 720, h: 384, widgets: { cols: 2, rows: 2, w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 } },
  'galleon-widget': { kind: 'galleon-widget', w: 360, h: 180 },
  infobar: { kind: 'infobar', w: 232, h: 50, native: { w: 248, h: 58 } },
  monitor: { kind: 'monitor', w: 2560, h: 720 },
};
export function screenTarget(name, device) {
  if (SCREEN_TARGETS[name]) return SCREEN_TARGETS[name];
  const s = screenOf(device);
  if (s?.kind === 'infobar') return SCREEN_TARGETS.infobar;
  if (s?.kind === 'monitor') return SCREEN_TARGETS.monitor;
  return SCREEN_TARGETS.galleon;
}

export const DEFAULT_DEVICE = { key: 'mk2', span: 'mk2', strip: 'plus', screen: 'galleon', deck: 'mk2' };

export function createContext(facet, opts = {}) {
  const kind = facet.surface;
  const device = getDevice(opts.device || facet.devices?.[0] || DEFAULT_DEVICE[kind] || 'mk2');
  const theme = useTheme(facet.theme || opts.theme || 'prism', opts.mode);
  let w, h, grid = null, strip = null, screen = null, deck = null;
  if (kind === 'key') {
    const s = opts.size ? (typeof opts.size === 'number' ? { w: opts.size, h: opts.size } : opts.size) : keySize(device);
    ({ w, h } = s);
  } else if (kind === 'span') {
    const span = { ...(facet.span || {}), ...(opts.span || {}) };
    grid = opts.grid || spanGrid(device, { col: span.col || 0, row: span.row || 0, cols: span.cols === 'all' ? undefined : span.cols, rows: span.rows === 'all' ? undefined : span.rows });
    ({ w, h } = grid);
  } else if (kind === 'strip') {
    const sg = stripGrid(device.strip ? device : 'plus');
    const segs = facet.segments === 1 ? 1 : Math.max(1, Math.min(sg.segments.length, opts.segments || sg.segments.length));
    strip = { segments: segs, of: sg.segments.length, segment: opts.segment ?? null };
    w = 200 * segs; h = 100;
  } else if (kind === 'screen') {
    screen = screenTarget(opts.screen || facet.screens?.[0], device);
    ({ w, h } = screen);
  } else if (kind === 'deck') {
    deck = deckLayout(device, 1);
    grid = { key: keySize(device), cells: deck.keys };
    ({ w, h } = deck);
  } else throw new Error(`unknown surface "${kind}"`);
  const params = resolveParams(facet.params, opts.params);
  const states = facet.states || [];
  const state = states.length ? ((Math.trunc(opts.state || 0) % states.length) + states.length) % states.length : 0;
  const stateName = states[state] ?? null;
  const gallery = getGallery(facet.gallery);
  const hue = typeof params.hue === 'number' ? params.hue : (opts.hue ?? gallery?.hue ?? 296);
  const seed = (opts.seed ?? 7) >>> 0;
  const t = Math.max(0, +opts.t || 0);
  const now = opts.now ?? DEFAULT_NOW + t * 1000;
  const idPrefix = opts.idPrefix || `pd${(hash(seed, ...[...String(facet.id || '')].map((c) => c.charCodeAt(0))) * 2176782336 >>> 0).toString(36)}`;
  const segCount = strip ? strip.segments : 4;
  return {
    kind, facet, w, h, size: Math.min(w, h),
    device, grid, strip, screen, deck,
    theme, colors: theme.colors, glyphs: glyphRegistry().glyphs,
    t, frame: opts.frame ?? Math.round(t * 30), fps: opts.fps ?? facet.fps,
    state, stateName, states, since: opts.since ?? t, tone: (stateName && facet.tones?.[stateName]) || 'idle',
    pressed: !!opts.pressed, pressAge: opts.pressAge ?? Infinity, pressKey: Number.isInteger(opts.pressKey) ? opts.pressKey : null, pressedFor: opts.pressed && Number.isFinite(opts.pressedFor) ? Math.max(0, opts.pressedFor) : 0, heldFor: Number.isFinite(opts.heldFor) ? Math.max(0, opts.heldFor) : 0,
    value: typeof opts.value === 'number' ? Math.min(1, Math.max(0, opts.value)) : (typeof params.value === 'number' ? params.value : 0.5),
    ticks: opts.ticks || 0, turnAge: Number.isFinite(opts.turnAge) ? Math.max(0, opts.turnAge) : Infinity,
    touch: (kind === 'strip' || kind === 'screen') && device.dials?.touch !== false && opts.touch ? { x: +opts.touch.x || 0, y: +opts.touch.y || 0, hold: !!opts.touch.hold, age: Number.isFinite(opts.touch.age) ? Math.max(0, opts.touch.age) : 0 } : undefined,
    values: Array.isArray(opts.values) ? opts.values.map((x) => Math.min(1, Math.max(0, +x || 0))) : Array.from({ length: segCount }, (_, i) => [0.35, 0.8, 0.55, 0.2, 0.65, 0.45][i % 6]),
    params, hue, tint: theme.spectral(hue),
    seed, rng: () => makeRng(seed),
    noise: { n1: (x) => noise1(x, seed), n2: (x, y) => noise2(x, y, seed), fbm: (x) => fbm1(x, seed), metric: (tt, o) => metric(tt, seed, o), series: (tt, c, o) => series(tt, seed, c, o) },
    now, clock: clockOf(now, opts.tzOffset ?? 0),
    data: opts.data || {},
    idPrefix, id: (name) => `${idPrefix}-${name}`,
    reduced: !!opts.reduced,
    ...(facet.game ? gameFields(facet, opts, { kind, grid, device, seed, params }) : {}),
  };
}

/** The facet's key grid as a game sees it: { cols, rows, cells: [{ i (device key index), col, row (0-based within the facet) }] }. */
export function gameGrid({ kind, grid }) {
  if (kind === 'key' || !grid?.cells?.length) return { cols: 1, rows: 1, cells: [{ i: 0, col: 0, row: 0 }] };
  const cells = grid.cells;
  const c0 = Math.min(...cells.map((c) => c.col)), r0 = Math.min(...cells.map((c) => c.row));
  return { cols: Math.max(...cells.map((c) => c.col)) - c0 + 1, rows: Math.max(...cells.map((c) => c.row)) - r0 + 1, cells: cells.map((c) => ({ i: c.i, col: c.col - c0, row: c.row - r0 })) };
}

/** ctx.game / gamePrev / gameEvent. opts.game === null skips init (scene/game.js uses it to build init args). */
function gameFields(facet, opts, { kind, grid, device, seed, params }) {
  let game = opts.game;
  if (game === undefined) game = facet.game.init({ seed, device: device.id, grid: gameGrid({ kind, grid }), params });
  const ev = opts.gameEvent;
  return { game, gamePrev: opts.gamePrev ?? null, gameEvent: ev ? { ...ev, age: Number.isFinite(ev.age) ? Math.max(0, ev.age) : 0 } : null };
}
