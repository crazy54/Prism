// .streamDeckProfile export — ProfilesV3 "FormatVersion 1" (formats.md §5.2–5.5).
//
// The structure mirrors the bundled profiles the hardware lab installed and switched
// on the owner's Galleon 100 SD and Stream Deck + (aaa-prism-ds/hardware-lab,
// tools/build.mjs; willAppear arrived for every key and widget): package.json +
// Profiles/<UUID>.sdProfile/{manifest.json, Profiles/<PAGE>/manifest.json}, a
// "Default" page with null actions, coordinates "column,row", Galleon encoders
// "dial,layer" with Routers, States: [{}] (no images: a profile image would count as
// a user-set image and block the plugin's setImage).
//
//   buildProfile({ device, name, pages, pluginVersion }) → { zip, files, package, manifest, pages }
//   sampleProfiles() → the Prism sample profile for Galleon 100 SD, Stream Deck +, MK.2, XL, Mini, Neo
//   checkProfile(zip) → structural problems ([] = ok)

import crypto from 'node:crypto';
import { writeZip, readZip } from './plugin-zip.js';
import { getDevice } from '../devices.js';
import { findFacet } from '../facets/index.js';
import { facetMode } from '../plugin/settings.js';

export const PLUGIN_UUID = 'com.jeremyfhall.prism';
export const PLUGIN_NAME = 'Prism Deck';
export const ACTION_FACET = `${PLUGIN_UUID}.facet`;
export const ACTION_INFOBAR = `${PLUGIN_UUID}.infobar`;
export const APP_VERSION = '7.6.0.23012';
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const NEO_INFOBAR_COORD = '1,0'; // hardware.md §6: the Neo info bar's controller coordinate

/** Deterministic v4-shaped UUID from a seed (reproducible builds). */
export function detUuid(seed) {
  const h = crypto.createHash('sha1').update(`prism-deck:${seed}`).digest();
  h[6] = (h[6] & 0x0f) | 0x40; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

function actionObject({ seed, settings, infobar = false, pluginVersion }) {
  return {
    ActionID: detUuid(seed),
    LinkedTitle: true,
    Name: infobar ? 'Prism Info Bar' : 'Prism Facet',
    Plugin: { Name: PLUGIN_NAME, UUID: PLUGIN_UUID, Version: pluginVersion },
    Resources: null,
    Settings: settings,
    State: 0,
    States: [{}],
    UUID: infobar ? ACTION_INFOBAR : ACTION_FACET,
  };
}

/** Keep only settings that name a real facet that fits the slot (drops typos and facets that don't exist yet). */
function fitSettings(s, controller, model) {
  const f = findFacet(s?.facet || '');
  if (!f || f.id !== s.facet || !facetMode(f, controller, model) || facetMode(f, controller, model) === 'key-on-dial') return null;
  return s;
}

/**
 * pages: [{ name, keys: [{ col, row, settings }], dials: [{ dial, layer, settings }], infobar: settings }]
 * → { zip, files, package, manifest, pages: [ids], dropped: [...] }
 */
export function buildProfile({ device, name, pages, pluginVersion = '0.3.0.0', seed } = {}) {
  const model = getDevice(device);
  if (!model.model) throw new Error(`${model.id} has no profile Device.Model string`);
  const base = seed || `${model.id}:${name}`;
  const profileId = detUuid(`${base}:profile`).toUpperCase();
  const defaultId = detUuid(`${base}:default`);
  const pageIds = [];
  const dropped = [];
  const root = `Profiles/${profileId}.sdProfile/`;
  const files = [];
  const encoderType = model.dials?.count ? 'Encoder' : null;
  pages.forEach((page, pi) => {
    const pageId = detUuid(`${base}:page:${pi}`);
    pageIds.push(pageId);
    const keypad = {};
    for (const k of page.keys || []) {
      if (k.col < 0 || k.row < 0 || k.col >= model.cols || k.row >= model.rows) { dropped.push({ page: pi, key: `${k.col},${k.row}`, reason: 'outside the grid' }); continue; }
      const s = fitSettings(k.settings, 'Keypad', model);
      if (!s) { dropped.push({ page: pi, key: `${k.col},${k.row}`, reason: `facet ${k.settings?.facet} unavailable` }); continue; }
      keypad[`${k.col},${k.row}`] = actionObject({ seed: `${base}:${pi}:k:${k.col},${k.row}`, settings: s, pluginVersion });
    }
    const controllers = [{ Actions: keypad, Type: 'Keypad' }];
    if (encoderType) {
      const enc = {};
      const layers = model.dials.layers || 1;
      for (const d of page.dials || []) {
        const layer = d.layer || 0;
        if (d.dial < 0 || d.dial >= model.dials.count || layer < 0 || layer >= layers) { dropped.push({ page: pi, dial: `${d.dial},${layer}`, reason: 'no such dial' }); continue; }
        const s = fitSettings(d.settings, 'Encoder', model);
        if (!s) { dropped.push({ page: pi, dial: `${d.dial},${layer}`, reason: `facet ${d.settings?.facet} unavailable` }); continue; }
        enc[`${d.dial},${layer}`] = actionObject({ seed: `${base}:${pi}:d:${d.dial},${layer}`, settings: s, pluginVersion });
      }
      const ctl = { Actions: enc, Type: 'Encoder' };
      if (layers > 1) ctl.Routers = Object.fromEntries(Array.from({ length: model.dials.count }, (_, i) => [`${i},0`, `${i},0`]));
      controllers.push(ctl);
    }
    if (model.screen?.kind === 'infobar' && page.infobar) {
      const s = fitSettings(page.infobar, 'Neo', model);
      if (s) controllers.push({ Actions: { [NEO_INFOBAR_COORD]: actionObject({ seed: `${base}:${pi}:neo`, settings: s, infobar: true, pluginVersion }) }, Type: 'Neo' });
      else dropped.push({ page: pi, infobar: page.infobar?.facet, reason: 'facet unavailable' });
    }
    const manifest = { Controllers: controllers, Icon: '', Name: String(page.name || '').slice(0, 40) };
    files.push({ name: `${root}Profiles/${pageId.toUpperCase()}/manifest.json`, data: JSON.stringify(manifest) });
    files.push({ name: `${root}Profiles/${pageId.toUpperCase()}/Images/` });
  });
  const defaultPage = { Controllers: [{ Actions: null, Type: 'Keypad' }, ...(encoderType ? [{ Actions: null, Type: 'Encoder' }] : [])], Icon: '', Name: '' };
  files.push({ name: `${root}Profiles/${defaultId.toUpperCase()}/manifest.json`, data: JSON.stringify(defaultPage) });
  files.push({ name: `${root}Profiles/${defaultId.toUpperCase()}/Images/` });
  const manifest = { Device: { Model: model.model, UUID: detUuid(`${base}:device`) }, Name: name, Pages: { Current: NIL_UUID, Default: defaultId, Pages: pageIds }, Version: '3.0' };
  const pkg = { AppVersion: APP_VERSION, DeviceModel: model.model, DeviceSettings: null, FormatVersion: 1, OSType: 'Windows', OSVersion: '10.0.26300', RequiredPlugins: [PLUGIN_UUID] };
  const all = [{ name: 'package.json', data: JSON.stringify(pkg) }, { name: `${root}manifest.json`, data: JSON.stringify(manifest) }, ...files];
  return { zip: writeZip(all), files: all, package: pkg, manifest, profileId, pages: pageIds, dropped, model };
}

const k = (col, row, facet, extra = {}) => ({ col, row, settings: { facet, ...extra } });
const row = (r, facets, extra) => facets.map((f, c) => k(c, r, f, extra));
const span = (r, cols, facet, group = 'A', c0 = 0) => Array.from({ length: cols }, (_, i) => k(c0 + i, r, facet, group === 'A' ? {} : { group }));
const block = (c0, r0, cols, rows, facet, group) => Array.from({ length: cols * rows }, (_, i) => k(c0 + (i % cols), r0 + Math.floor(i / cols), facet, group === 'A' ? {} : { group }));
const dial = (d, layer, facet, extra = {}) => ({ dial: d, layer, settings: { facet, ...extra } });

/** The sample profiles: what Prism Deck looks like on each device, out of the box. */
export const SAMPLE_LAYOUTS = Object.freeze({
  galleon: {
    name: 'Prism · Galleon 100 SD', file: 'Prism - Galleon 100 SD', deviceType: 12,
    pages: [
      { name: 'Prism', keys: [...row(0, ['icon-play-pause', 'icon-mic', 'icon-camera']), ...span(1, 3, 'span-waveform'), ...row(2, ['app-cpu-ring', 'app-focus-timer', 'icon-clock']), ...row(3, ['icon-bulb', 'icon-sync', 'icon-lock'])],
        dials: [dial(0, 0, 'screen-galleon-dashboard'), dial(1, 0, 'screen-galleon-dashboard'), dial(0, 1, 'screen-galleon-dashboard'), dial(1, 1, 'screen-galleon-dashboard')] },
      { name: 'Studio', keys: [...block(0, 0, 3, 2, 'span-first-light', 'B'), ...row(2, ['icon-record', 'icon-broadcast', 'icon-scene']), ...row(3, ['icon-volume', 'icon-headphones', 'icon-power'])],
        dials: [dial(0, 0, 'screen-galleon-media'), dial(1, 0, 'screen-galleon-media'), dial(0, 1, 'screen-galleon-media'), dial(1, 1, 'screen-galleon-media')] },
    ],
  },
  plus: {
    name: 'Prism · Stream Deck +', file: 'Prism - Stream Deck +', deviceType: 7,
    pages: [
      { name: 'Prism', keys: [...row(0, ['icon-play-pause', 'icon-skip-next', 'icon-mic', 'icon-camera']), ...span(1, 4, 'span-spectrum')],
        dials: [dial(0, 0, 'dial-volume'), dial(1, 0, 'dial-volume-arc'), dial(2, 0, 'dial-gauge'), dial(3, 0, 'dial-color-wheel')] },
      { name: 'Panorama', keys: block(0, 0, 4, 2, 'span-aurora', 'B'), dials: [0, 1, 2, 3].map((i) => dial(i, 0, 'strip-refraction')) },
    ],
  },
  mk2: {
    name: 'Prism · Stream Deck MK.2', file: 'Prism - Stream Deck MK.2', deviceType: 0,
    pages: [{ name: 'Prism', keys: [...row(0, ['icon-play-pause', 'icon-skip-next', 'icon-mic', 'icon-camera', 'icon-record']), ...span(1, 5, 'span-waveform'), ...row(2, ['app-cpu-ring', 'app-focus-timer', 'icon-clock', 'icon-bulb', 'icon-power'])] }],
  },
  'xl-2022': {
    name: 'Prism · Stream Deck XL', file: 'Prism - Stream Deck XL', deviceType: 2,
    pages: [{ name: 'Prism', keys: [
      ...row(0, ['icon-play-pause', 'icon-skip-prev', 'icon-skip-next', 'icon-shuffle', 'icon-mic', 'icon-camera', 'icon-record', 'icon-broadcast']),
      ...span(1, 8, 'span-spectrum'),
      ...block(0, 2, 4, 2, 'span-first-light', 'B'),
      ...row(2, ['app-cpu-ring', 'icon-memory', 'icon-gpu', 'icon-network']).map((x) => ({ ...x, col: x.col + 4 })),
      ...row(3, ['app-focus-timer', 'icon-clock', 'icon-bulb', 'icon-power']).map((x) => ({ ...x, col: x.col + 4 })),
    ] }],
  },
  'mini-2022': {
    name: 'Prism · Stream Deck Mini', file: 'Prism - Stream Deck Mini', deviceType: 1,
    pages: [{ name: 'Prism', keys: [...row(0, ['icon-play-pause', 'icon-mic', 'icon-camera']), ...span(1, 3, 'span-waveform')] }],
  },
  neo: {
    name: 'Prism · Stream Deck Neo', file: 'Prism - Stream Deck Neo', deviceType: 9,
    pages: [{ name: 'Prism', keys: [...row(0, ['icon-play-pause', 'icon-skip-next', 'icon-mic', 'icon-camera']), ...span(1, 4, 'span-spectrum')], infobar: { facet: 'screen-neo-clock' } }],
  },
});

export function sampleProfiles({ pluginVersion = '0.3.0.0' } = {}) {
  return Object.entries(SAMPLE_LAYOUTS).map(([device, l]) => ({ device, deviceType: l.deviceType, name: l.name, file: l.file, ...buildProfile({ device, name: l.name, pages: l.pages, pluginVersion, seed: `sample:${device}` }) }));
}

const UUIDU = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const UUIDL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Structural check of a FormatVersion 1 export (there is no official schema — the
 * format is reverse-engineered, formats.md §5): package fields, one .sdProfile,
 * every page in Pages.Pages + Default present, coordinates inside the grid, action
 * objects complete, Prism settings naming real facets. → problems[]
 */
export function checkProfile(buf) {
  const out = [];
  let entries;
  try { entries = readZip(buf); } catch (e) { return [`zip: ${e.message}`]; }
  const file = (n) => entries.find((e) => e.name === n);
  const json = (n) => { const e = file(n); if (!e) { out.push(`missing ${n}`); return null; } try { return JSON.parse(e.data.toString('utf8')); } catch { out.push(`${n}: invalid JSON`); return null; } };
  const pkg = json('package.json');
  if (pkg) {
    if (pkg.FormatVersion !== 1) out.push('package.json: FormatVersion must be 1');
    for (const f of ['AppVersion', 'DeviceModel', 'OSType', 'OSVersion']) if (typeof pkg[f] !== 'string' || !pkg[f]) out.push(`package.json: ${f} must be a string`);
    if (!Array.isArray(pkg.RequiredPlugins) || !pkg.RequiredPlugins.includes(PLUGIN_UUID)) out.push('package.json: RequiredPlugins must list the Prism plugin');
  }
  const roots = [...new Set(entries.map((e) => /^Profiles\/([^/]+)\.sdProfile\//.exec(e.name)?.[1]).filter(Boolean))];
  if (roots.length !== 1) { out.push(`expected exactly one Profiles/<UUID>.sdProfile, found ${roots.length}`); return out; }
  if (!UUIDU.test(roots[0])) out.push('profile folder name must be an uppercase UUID');
  const root = `Profiles/${roots[0]}.sdProfile/`;
  const top = json(`${root}manifest.json`);
  if (!top) return out;
  if (top.Version !== '3.0') out.push('manifest: Version must be "3.0"');
  if (!top.Device || top.Device.Model !== pkg?.DeviceModel) out.push('manifest: Device.Model must equal package DeviceModel');
  if (typeof top.Name !== 'string' || !top.Name) out.push('manifest: Name required');
  const dev = ['galleon', 'plus', 'plusxl', 'mk2', 'xl-2022', 'mini-2022', 'neo', 'xl', 'mini', 'original-v2', 'scissor'].map((id) => getDevice(id)).find((d) => d.model === top.Device?.Model);
  const pages = top.Pages || {};
  if (!Array.isArray(pages.Pages) || !pages.Pages.length) out.push('manifest: Pages.Pages must list pages');
  for (const id of [...(pages.Pages || []), pages.Default].filter(Boolean)) {
    if (!UUIDL.test(id)) { out.push(`page id ${id} is not a UUID`); continue; }
    const page = json(`${root}Profiles/${id.toUpperCase()}/manifest.json`);
    if (!page) continue;
    if (!Array.isArray(page.Controllers)) { out.push(`page ${id}: Controllers must be an array`); continue; }
    for (const c of page.Controllers) {
      if (!['Keypad', 'Encoder', 'Neo'].includes(c.Type)) out.push(`page ${id}: unknown controller ${c.Type}`);
      if (c.Actions === null) continue;
      for (const [coord, a] of Object.entries(c.Actions || {})) {
        const [x, y] = coord.split(',').map(Number);
        if (!Number.isInteger(x) || !Number.isInteger(y)) out.push(`page ${id} ${c.Type} ${coord}: bad coordinate`);
        if (dev && c.Type === 'Keypad' && (x >= dev.cols || y >= dev.rows)) out.push(`page ${id} key ${coord} outside ${dev.cols}x${dev.rows}`);
        if (dev && c.Type === 'Encoder' && (x >= (dev.dials?.count || 0) || y >= (dev.dials?.layers || 1))) out.push(`page ${id} dial ${coord} outside the device`);
        for (const f of ['ActionID', 'Name', 'Plugin', 'Settings', 'States', 'UUID']) if (a[f] === undefined) out.push(`page ${id} ${coord}: missing ${f}`);
        if (!UUIDL.test(a.ActionID || '')) out.push(`page ${id} ${coord}: ActionID must be a UUID`);
        if (a.Plugin?.UUID === PLUGIN_UUID) {
          if (![ACTION_FACET, ACTION_INFOBAR].includes(a.UUID)) out.push(`page ${id} ${coord}: unknown Prism action ${a.UUID}`);
          const f = findFacet(a.Settings?.facet || '');
          if (!f || f.id !== a.Settings.facet) out.push(`page ${id} ${coord}: unknown facet ${a.Settings?.facet}`);
        }
        if (!Array.isArray(a.States) || !a.States.length) out.push(`page ${id} ${coord}: States must be a non-empty array`);
        else if (a.States.some((s) => s.Image)) out.push(`page ${id} ${coord}: state images would block the plugin's setImage`);
      }
      if (c.Type === 'Encoder' && dev?.dials?.layers > 1 && !c.Routers) out.push(`page ${id}: Galleon encoders need Routers`);
    }
  }
  return out;
}
