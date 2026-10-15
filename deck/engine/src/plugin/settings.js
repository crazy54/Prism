// Settings for the Prism Facet action (per instance, stored by the app and
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
//     state   state index (press advances it)          value  dial value 0–1
//     motion  'full' | 'calm' | 'still' | '' (default)
// Global settings:
//   { theme, mode, motion, limits: { imagesPerSec, feedbackPerSec, perKeyPerSec, bytesPerSec }, aiEditing,
//     format: 'svg' | 'png' (png = rasterized by src/raster, a fallback if a device mis-renders SVG) }

import { findFacet, allFacets } from '../facets/index.js';
import { normalizeLimits } from './budget.js';

export const ACTION_FACET = 'facet';
export const ACTION_INFOBAR = 'infobar';
export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const MOTION = ['full', 'calm', 'still'];
export const MODES = ['dark', 'light'];

export const FORMATS = ['svg', 'png'];
export const DEFAULT_GLOBALS = Object.freeze({ theme: 'prism', mode: 'dark', motion: 'full', limits: {}, aiEditing: false, format: 'svg' });

const str = (v, max = 64) => (typeof v === 'string' ? v.slice(0, max) : '');
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalize global settings. */
export function normalizeGlobals(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: ID.test(str(r.theme)) ? r.theme : DEFAULT_GLOBALS.theme,
    mode: MODES.includes(r.mode) ? r.mode : DEFAULT_GLOBALS.mode,
    motion: MOTION.includes(r.motion) ? r.motion : DEFAULT_GLOBALS.motion,
    limits: normalizeLimits(r.limits && typeof r.limits === 'object' ? r.limits : {}),
    aiEditing: r.aiEditing === true,
    format: FORMATS.includes(r.format) ? r.format : 'svg',
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
  return {
    facet: facet?.id || null,
    theme: ID.test(str(r.theme)) ? r.theme : '',
    mode: MODES.includes(r.mode) ? r.mode : '',
    params,
    group: GROUPS.includes(r.group) ? r.group : 'A',
    state,
    value,
    motion: MOTION.includes(r.motion) ? r.motion : '',
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
  return o;
}
