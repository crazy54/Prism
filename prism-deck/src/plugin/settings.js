// Settings for the Prism Display action (manifest UUID com.jeremyfhall.prism.facet; per instance, stored by the app and
// exported with profiles) and the plugin (global settings). Everything coming
// from the app, the property inspector, a profile or the live channel is
// untrusted: normalize() clamps it to known shapes.
//
// Instance settings:
//   { facet, theme, mode, params, group, state, value, motion }
//     facet   facet id ('icon-mic', 'span-waveform', …); default depends on controller + device
//     theme   theme id, '' = the plugin default        mode  'dark' | 'light' | '' (default)
//     params  the facet's params (resolved + clamped by the engine)
//     group   span group 'A'–'H': keys/dials with the same multi-key facet + group render as one block
//     state   state index (press advances it)          value  dial value 0–1      ticks  accumulated dial detents
//     motion  'full' | 'calm' | 'still' | '' (default)
//     game, gameSeed   game facets (API 1.5): the host's snapshot() and the seed of the first deal — plugin-owned
//     press   an optional REAL behavior on key press / dial push (Prism Display is visual by default):
//             { kind: 'url', url: 'https://…' }        open a web page (http/https only) — openUrl
//             { kind: 'profile', page? }               switch this device to its Prism sample profile (page 1-based) — switchToProfile
//             { kind: 'back' }                         switch back to the previous profile — switchToProfile
//             Set only from the property inspector (the user); the AI live channel never writes it.
// Global settings:
//   { theme, mode, motion, limits: { updatesPerSec (≤ MAX_UPDATES_PER_SEC), perKeyPerSec, … }, aiEditing,
//     format: 'svg' | 'png' (png = rasterized by src/raster, a fallback if a device mis-renders SVG),
//     boot (false by default: the power-on sequence plays only when switched on),
//     calendarFile (a local .ics file the calendar facets read; '' = demo calendar) }

import { findFacet, allFacets } from '../facets/index.js';
import { normalizeLimits } from './budget.js';

export const ACTION_FACET = 'facet';
export const ACTION_INFOBAR = 'infobar';
export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const MOTION = ['full', 'calm', 'still'];
export const MODES = ['dark', 'light'];
export const GAME_SNAPSHOT_MAX = 4096 + 1024; // GAME_STATE_MAX of state + the snapshot envelope

export const FORMATS = ['svg', 'png'];
export const DEFAULT_GLOBALS = Object.freeze({ theme: 'prism', mode: 'dark', motion: 'full', limits: {}, aiEditing: false, format: 'svg', boot: false, calendarFile: '' });
/** The update budget's ceiling: the hardware lab saw the app queue (and its watchdog kill the plugin) above ~230–300 updates/s. */
export const MAX_UPDATES_PER_SEC = 250;
export const MIN_UPDATES_PER_SEC = 60;

const str = (v, max = 64) => (typeof v === 'string' ? v.slice(0, max) : '');
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A local .ics path ('' when not one): absolute, ~/…, or a Windows drive / UNC path; never a URL. */
export function normalizeIcsPath(v) {
  const s = typeof v === 'string' ? v.trim().replace(/^"(.*)"$/, '$1') : '';
  if (!s || s.length > 1024 || /[\u0000-\u001f]/.test(s) || /^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return '';
  if (!/\.ics$/i.test(s)) return '';
  return /^(~[\\/]|\/|[a-zA-Z]:[\\/]|\\\\)/.test(s) ? s : '';
}

/** An http(s) URL for the "open URL" behavior, or '' (no other schemes, no credentials, ≤ 2048 chars). */
export function safeUrl(v) {
  if (typeof v !== 'string' || v.length > 2048) return '';
  let u;
  try { u = new URL(v.trim()); } catch { return ''; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname) return '';
  return u.href;
}

/** The press behavior of an instance (see the header), or null for none. */
export function normalizePress(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (p.kind === 'url') { const url = safeUrl(p.url); return url ? { kind: 'url', url } : null; }
  if (p.kind === 'profile') { const page = Math.trunc(Number(p.page)); return page >= 1 && page <= 99 ? { kind: 'profile', page } : { kind: 'profile' }; }
  if (p.kind === 'back') return { kind: 'back' };
  return null;
}

/**
 * The plugin's bundled sample profile for a device (manifest Profiles[].Name), by the app's DeviceType —
 * the only profiles switchToProfile can reach (plugins can't switch to user-made profiles).
 */
export const BUNDLED_PROFILES = Object.freeze({ 12: 'profiles/prism-galleon', 7: 'profiles/prism-plus', 0: 'profiles/prism-mk2', 2: 'profiles/prism-xl', 1: 'profiles/prism-mini', 9: 'profiles/prism-neo', 13: 'profiles/prism-plusxl' });
export const bundledProfileFor = (deviceType) => BUNDLED_PROFILES[deviceType] || null;

/** Normalize global settings. */
export function normalizeGlobals(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const limits = normalizeLimits(r.limits && typeof r.limits === 'object' ? r.limits : {});
  limits.updatesPerSec = Math.min(MAX_UPDATES_PER_SEC, Math.max(MIN_UPDATES_PER_SEC, limits.updatesPerSec));
  return {
    theme: ID.test(str(r.theme)) ? r.theme : DEFAULT_GLOBALS.theme,
    mode: MODES.includes(r.mode) ? r.mode : DEFAULT_GLOBALS.mode,
    motion: MOTION.includes(r.motion) ? r.motion : DEFAULT_GLOBALS.motion,
    limits,
    aiEditing: r.aiEditing === true,
    format: FORMATS.includes(r.format) ? r.format : 'svg',
    boot: r.boot === true,    // off by default; when on, span-power-on plays once at plugin start on physical decks
    calendarFile: normalizeIcsPath(r.calendarFile),
  };
}

/**
 * How a facet is drawn for a controller on a device, or null if it can't be:
 *   'key' | 'span' | 'deck' (Keypad) · 'strip-1' | 'strip-all' | 'screen-galleon' | 'screen-widget' | 'deck' | 'key-on-dial' (Encoder) · 'screen-infobar' (Neo)
 */
export function facetMode(facet, controller, device) {
  if (!facet || !device) return null;
  if (facet.devices && !facet.devices.includes(device.id) && !facet.devices.includes(device.gridOf)) return null;
  const galleon = device.screen?.kind === 'galleon';
  if (controller === 'Keypad') {
    if (facet.surface === 'key') return 'key';
    if (facet.surface === 'span') return 'span';
    if (facet.surface === 'deck') return device.panel ? 'deck' : null;
    return null;
  }
  if (controller === 'Encoder') {
    if (facet.surface === 'strip') return facet.segments === 1 ? 'strip-1' : 'strip-all';
    if (facet.surface === 'screen') {
      if (galleon && facet.screens.includes('galleon')) return 'screen-galleon';
      if (facet.screens.includes('galleon-widget')) return 'screen-widget';
      return null;
    }
    if (facet.surface === 'deck') return device.panel && (device.strip || galleon) ? 'deck' : null;
    if (facet.surface === 'key') return 'key-on-dial';
    return null;
  }
  if (controller === 'Neo') return facet.surface === 'screen' && facet.screens.includes('infobar') ? 'screen-infobar' : null;
  return null;
}

/** Modes that render several instances as one block (members share a span group). */
export const GROUP_MODES = new Set(['span', 'strip-all', 'screen-galleon', 'deck']);

/** Facets offered for a controller + device (the property inspector's list; key-on-dial is live-only). */
export function facetsFor(controller, device) {
  return allFacets().filter((f) => { const m = facetMode(f, controller, device); return m && m !== 'key-on-dial'; });
}

const PREFERRED = {
  Keypad: ['icon-play-pause', 'icon-power', 'icon-mic'],
  Encoder: ['dial-volume', 'strip-refraction'],
  EncoderGalleon: ['screen-galleon-dashboard', 'dial-volume'],
  Neo: ['screen-neo-clock'],
};

/** The facet a fresh instance shows. */
export function defaultFacetId(controller, device) {
  const key = controller === 'Encoder' && device?.screen?.kind === 'galleon' ? 'EncoderGalleon' : controller;
  for (const id of PREFERRED[key] || []) { const f = findFacet(id); if (f && facetMode(f, controller, device)) return f.id; }
  const any = facetsFor(controller, device)[0];
  return any ? any.id : null;
}

/** Normalize instance settings for a controller + device. Unknown/unfit facets fall back to the default. */
export function normalizeSettings(raw, { controller = 'Keypad', device } = {}) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let facet = typeof r.facet === 'string' ? findFacet(r.facet) : null;
  if (facet && facet.id !== r.facet) facet = null; // exact ids only (findFacet also matches titles/prefixes)
  const mode = facet && facetMode(facet, controller, device);
  if (!mode || mode === 'key-on-dial') facet = findFacet(defaultFacetId(controller, device) || '') || null; // key art on a dial is for live looks only
  const params = {};
  if (facet && r.params && typeof r.params === 'object' && !Array.isArray(r.params)) {
    for (const k of Object.keys(facet.params)) if (Object.hasOwn(r.params, k)) params[k] = r.params[k];
  }
  const nStates = facet?.states?.length || 0;
  const state = nStates ? ((Math.trunc(Number(r.state) || 0) % nStates) + nStates) % nStates : 0;
  const value = Number.isFinite(Number(r.value)) ? Math.min(1, Math.max(0, Number(r.value))) : null;
  // A game snapshot is kept only for the facet it belongs to (a facet change drops it) and only if it's small.
  const game = facet?.game && r.game && typeof r.game === 'object' && !Array.isArray(r.game) && r.game.facet === facet.id && JSON.stringify(r.game).length <= GAME_SNAPSHOT_MAX ? r.game : null;
  const gameSeed = facet?.game && Number.isInteger(r.gameSeed) && r.gameSeed >= 0 && r.gameSeed <= 0xffffffff ? r.gameSeed : null;
  return {
    facet: facet?.id || null,
    theme: ID.test(str(r.theme)) ? r.theme : '',
    mode: MODES.includes(r.mode) ? r.mode : '',
    params,
    group: GROUPS.includes(r.group) ? r.group : 'A',
    state,
    value,
    motion: MOTION.includes(r.motion) ? r.motion : '',
    game,
    gameSeed,
    ticks: Number.isInteger(r.ticks) ? Math.max(-1e6, Math.min(1e6, r.ticks)) : 0,
    press: facet?.game ? null : normalizePress(r.press),   // games: every press is a move
  };
}

/** What a settings object looks like on disk (drops defaults so profiles stay small). */
export function compactSettings(s) {
  const o = { facet: s.facet };
  if (s.theme) o.theme = s.theme;
  if (s.mode) o.mode = s.mode;
  if (s.params && Object.keys(s.params).length) o.params = s.params;
  if (s.group && s.group !== 'A') o.group = s.group;
  if (s.state) o.state = s.state;
  if (s.value !== null && s.value !== undefined) o.value = s.value;
  if (s.motion) o.motion = s.motion;
  if (s.ticks) o.ticks = s.ticks;
  if (s.gameSeed !== null && s.gameSeed !== undefined) o.gameSeed = s.gameSeed;
  if (s.game) o.game = s.game;
  if (s.press) o.press = s.press;
  return o;
}
