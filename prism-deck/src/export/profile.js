// .streamDeckProfile export — ProfilesV3 "FormatVersion 1" (formats.md §5.2–5.5).
//
// The structure mirrors the bundled profiles the hardware lab installed and switched
// on the owner's Galleon 100 SD and Stream Deck + (aaa-prism-ds/hardware-lab,
// tools/build.mjs; willAppear arrived for every key and widget) and the app's own
// default profiles (C:\Program Files\Elgato\StreamDeck\DefaultProfiles): package.json +
// Profiles/<UUID>.sdProfile/{manifest.json, Profiles/<PAGE>/manifest.json (+ Images/)},
// a "Default" page with null actions, coordinates "column,row", Galleon encoders
// "dial,layer" with Routers.
//
// Two kinds of action:
//   - Prism Display (com.jeremyfhall.prism.facet / .infobar): States: [{}] — no images, a profile
//     image would count as a user-set image and block the plugin's setImage.
//   - Stream Deck's OWN actions (BUILTINS: Multimedia, Hotkey, Open, Website, Go to Page, Brightness),
//     wearing Prism art: a 144 × 144 PNG (the icon-pack render, labeled) in the page's Images/.
//     These are the keys that DO something: the sample profiles' Home pages are built from them,
//     and the live Prism facets sit on separate "Showcase" pages.
//
//   buildProfile({ device, name, pages, pluginVersion }) → { zip, files, package, manifest, pages }
//   sampleProfiles() → the Prism sample profile for Galleon 100 SD, Stream Deck +, MK.2, XL, Mini, Neo, + XL
//   checkProfile(zip) → structural problems ([] = ok)
//   SAMPLE_LAYOUTS     the Prism-only showcase layouts (also the Linux exports' and the MCP server's samples)
//   HOME_LAYOUTS       the built-in Home page (and Galleon / + / + XL dials) of each sample profile

import crypto from 'node:crypto';
import { writeZip, readZip } from './plugin-zip.js';
import { getDevice } from '../devices.js';
import { findFacet } from '../facets/index.js';
import { facetMode } from '../plugin/settings.js';
import { render, stillTime } from '../render.js';
import { rasterize, encodePNG } from '../raster/index.js';

export const PLUGIN_UUID = 'com.jeremyfhall.prism';
export const PLUGIN_NAME = 'Prism Deck';
export const ACTION_FACET = `${PLUGIN_UUID}.facet`;
export const ACTION_INFOBAR = `${PLUGIN_UUID}.infobar`;
export const ACTION_FACET_NAME = 'Prism Display';
export const APP_VERSION = '7.6.0.23012';
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';
export const NEO_INFOBAR_COORD = '1,0'; // hardware.md §6: the Neo info bar's controller coordinate
export const ART_PX = 144;

/** Deterministic v4-shaped UUID from a seed (reproducible builds). */
export function detUuid(seed) {
  const h = crypto.createHash('sha1').update(`prism-deck:${seed}`).digest();
  h[6] = (h[6] & 0x0f) | 0x40; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** A profile image name: 26 characters of the app's base32 alphabet (no U) + "Z" (formats.md §5.6), deterministic. */
export function imageName(seed) {
  const A = '0123456789ABCDEFGHIJKLMNOPQRSTVW';
  const h = crypto.createHash('sha1').update(`prism-deck:img:${seed}`).digest();
  let bits = 0n;
  for (const b of h.subarray(0, 17)) bits = (bits << 8n) | BigInt(b);
  let s = '';
  for (let i = 0; i < 26; i++) { s += A[Number(bits & 31n)]; bits >>= 5n; }
  return `${s}Z`;
}

function actionObject({ seed, settings, infobar = false, pluginVersion }) {
  return {
    ActionID: detUuid(seed),
    LinkedTitle: true,
    Name: infobar ? 'Prism Info Bar' : ACTION_FACET_NAME,
    Plugin: { Name: PLUGIN_NAME, UUID: PLUGIN_UUID, Version: pluginVersion },
    Resources: null,
    Settings: settings,
    State: 0,
    States: [{}],
    UUID: infobar ? ACTION_INFOBAR : ACTION_FACET,
  };
}

// ── Stream Deck's own actions (handoff research schemas/reference/builtin-actions.json) ──────────
// Multimedia actionIdx values were read off the app's own default profiles (Galleon PRO 80 SD /
// Galleon 100 SD / Stream Deck +): 0 previous · 1 play/pause · 2 next · 3 stop · 4 mute · 5 volume up ·
// 6 volume down · 13 fast forward · 14 rewind; on a dial, 18 = system volume. Brightness actionIdx 0 on a
// dial is the deck's own brightness. Go to Page counts pages from 1. Hotkeys are Windows shortcuts
// (KeyCmd = the Windows key; KeyModifiers: Shift 1, Ctrl 2, Alt 4, Win 8), padded to 4 entries like the app does.
const PLUGINS = {
  multimedia: { Name: 'Multimedia', UUID: 'com.elgato.streamdeck.system.multimedia', Version: '1.0' },
  hotkey: { Name: 'Activate a Key Command', UUID: 'com.elgato.streamdeck.system.hotkey', Version: '1.0' },
  open: { Name: 'Open', UUID: 'com.elgato.streamdeck.system.open', Version: '1.0' },
  website: { Name: 'Website', UUID: 'com.elgato.streamdeck.system.website', Version: '1.0' },
  pages: { Name: 'Pages', UUID: 'com.elgato.streamdeck.page', Version: '1.0' },
  brightness: { Name: 'Brightness', UUID: 'com.elgato.streamdeck.system.keybrightness', Version: '1.0' },
};
const HK_EMPTY = { KeyCmd: false, KeyCtrl: false, KeyModifiers: 0, KeyOption: false, KeyShift: false, NativeCode: 146, QTKeyCode: 33554431, VKeyCode: -1 };
const hotkey = (vk, qt, { win = false, ctrl = false, alt = false, shift = false } = {}) => ({
  Coalesce: true,
  Hotkeys: [{ KeyCmd: win, KeyCtrl: ctrl, KeyModifiers: (shift ? 1 : 0) | (ctrl ? 2 : 0) | (alt ? 4 : 0) | (win ? 8 : 0), KeyOption: alt, KeyShift: shift, NativeCode: vk, QTKeyCode: qt, VKeyCode: vk }, HK_EMPTY, HK_EMPTY, HK_EMPTY],
});
// a Hotkey on a dial: [turn left, turn right, push, touch] (the app's own "Zoom" / "Scroll" dials)
const HK_NONE = { ...HK_EMPTY, NativeCode: -1 };
const hk1 = (vk, qt, mods) => hotkey(vk, qt, mods).Hotkeys[0];
const dialKeys = (ccw, cw, a, what, title) => ({ uuid: PLUGINS.hotkey.UUID, name: 'Hotkey', plugin: PLUGINS.hotkey, settings: { Coalesce: true, Hotkeys: [ccw, cw, HK_NONE, HK_NONE] }, art: a, controllers: ['Encoder'], what, title });
const SITE = 'https://prism.jeremyfhall.com/deck/';
const art = (facet, label, o = {}) => ({ facet, label, ...o });
const media = (actionIdx, a) => ({ uuid: PLUGINS.multimedia.UUID, name: 'Multimedia', plugin: PLUGINS.multimedia, settings: { actionIdx }, art: a, controllers: ['Keypad', 'Encoder'] });
const keyCmd = (settings, a, what) => ({ uuid: PLUGINS.hotkey.UUID, name: 'Hotkey', plugin: PLUGINS.hotkey, settings, art: a, controllers: ['Keypad'], what });

/** The built-in keys and dials the sample profiles use: action + settings + the Prism art they wear. */
export const BUILTINS = Object.freeze({
  'media.prev': media(0, art('icon-skip-prev', 'Previous')),
  'media.play': media(1, art('icon-play-pause', 'Play')),
  'media.next': media(2, art('icon-skip-next', 'Next')),
  'media.stop': media(3, art('icon-stop', 'Stop')),
  'media.mute': media(4, art('icon-volume', 'Mute', { state: 1 })),
  'media.volup': media(5, art('icon-volume', 'Vol up', { params: { level: 1 } })),
  'media.voldown': media(6, art('icon-volume', 'Vol down', { params: { level: 0.3 } })),
  'dial.volume': { ...media(18, art('icon-volume', 'Volume')), controllers: ['Encoder'], title: 'System volume' },
  'dial.brightness': { uuid: PLUGINS.brightness.UUID, name: 'Brightness', plugin: PLUGINS.brightness, settings: { actionIdx: 0 }, art: art('icon-bulb', 'Brightness', { state: 1 }), controllers: ['Encoder'], title: 'Deck brightness' },
  'dial.zoom': dialKeys(hk1(189, 45, { ctrl: true }), hk1(187, 61, { ctrl: true }), art('icon-search', 'Zoom'), 'Ctrl+- / Ctrl+= (zoom out / in)', 'Zoom'),
  'dial.scroll': dialKeys(hk1(38, 16777235), hk1(40, 16777237), art('icon-pages', 'Scroll'), 'Up / Down arrows', 'Scroll'),
  'hotkey.snip': keyCmd(hotkey(83, 83, { win: true, shift: true }), art('icon-camera', 'Snip'), 'Win+Shift+S (screen snip)'),
  'hotkey.desktop': keyCmd(hotkey(68, 68, { win: true }), art('icon-home', 'Desktop'), 'Win+D (show the desktop)'),
  'hotkey.search': keyCmd(hotkey(83, 83, { win: true }), art('icon-search', 'Search'), 'Win+S (search)'),
  'hotkey.emoji': keyCmd(hotkey(190, 46, { win: true }), art('icon-chat', 'Emoji'), 'Win+. (emoji panel)'),
  'hotkey.tasks': keyCmd(hotkey(27, 16777216, { ctrl: true, shift: true }), art('icon-cpu', 'Tasks'), 'Ctrl+Shift+Esc (Task Manager)'),
  'hotkey.copy': keyCmd(hotkey(67, 67, { ctrl: true }), art('icon-pages', 'Copy'), 'Ctrl+C'),
  'hotkey.paste': keyCmd(hotkey(86, 86, { ctrl: true }), art('icon-note', 'Paste'), 'Ctrl+V'),
  'hotkey.undo': keyCmd(hotkey(90, 90, { ctrl: true }), art('icon-back', 'Undo'), 'Ctrl+Z'),
  'hotkey.redo': keyCmd(hotkey(89, 89, { ctrl: true }), art('icon-sync', 'Redo'), 'Ctrl+Y'),
  'open.files': { uuid: PLUGINS.open.UUID, name: 'Open', plugin: PLUGINS.open, settings: { path: '"C:\\Windows\\explorer.exe"' }, art: art('icon-folder', 'Files'), controllers: ['Keypad'], what: 'File Explorer' },
  'web.prism': { uuid: PLUGINS.website.UUID, name: 'Website', plugin: PLUGINS.website, settings: { browser: '', openInBrowser: true, path: SITE }, art: art('icon-info', 'Prism'), controllers: ['Keypad'], what: SITE },
  'page.home': { uuid: 'com.elgato.streamdeck.page.goto', name: 'Go to Page', plugin: PLUGINS.pages, settings: { PageIndex: 1 }, art: art('icon-back', 'Home'), controllers: ['Keypad'] },
});
/** A "Go to Page" key to a Showcase page (1-based page number). */
const goto = (page, label) => ({ uuid: 'com.elgato.streamdeck.page.goto', name: 'Go to Page', plugin: PLUGINS.pages, settings: { PageIndex: page }, art: art('icon-rocket', label), controllers: ['Keypad'] });

const artCache = new Map();
/** The PNG a built-in wears: the Prism icon-pack render of its glyph (theme prism, Night), labeled. */
export function builtinArt(a, { theme = 'prism', mode = 'dark', size = ART_PX, label = true } = {}) {
  const key = JSON.stringify([a, theme, mode, size, label]);
  if (artCache.has(key)) return artCache.get(key);
  const f = findFacet(a.facet);
  if (!f) throw new Error(`builtin art: unknown facet ${a.facet}`);
  const svg = render(f, { size, theme, mode, t: stillTime(f), state: a.state || 0, since: 10, params: { ...(a.params || {}), ...(label ? { label: a.label, showLabel: true } : { showLabel: false }) } }).svg;
  let png;
  try { const img = rasterize(svg, size, size); png = Buffer.from(encodePNG(img)); } catch (e) { throw new Error(`builtin art ${a.facet}: ${e.message}`); }
  artCache.set(key, png);
  return png;
}

function builtinObject({ seed, spec, controller, image }) {
  const o = {
    ActionID: detUuid(seed),
    LinkedTitle: true,
    Name: spec.name,
    Plugin: { ...spec.plugin },
    Resources: null,
    Settings: structuredClone(spec.settings),
    State: 0,
    States: [controller === 'Encoder' ? (spec.title ? { Title: spec.title } : {}) : { Image: `Images/${image}`, ShowTitle: false }],
    UUID: spec.uuid,
  };
  if (controller === 'Encoder') o.Encoder = { Icon: `Images/${image}`, IconVisible: true };
  return o;
}

/** Keep only settings that name a real facet that fits the slot (drops typos and facets that don't exist yet). */
function fitSettings(s, controller, model) {
  const f = findFacet(s?.facet || '');
  if (!f || f.id !== s.facet || !facetMode(f, controller, model) || facetMode(f, controller, model) === 'key-on-dial') return null;
  return s;
}

const specOf = (b) => (typeof b === 'string' ? BUILTINS[b] : b && typeof b === 'object' && b.uuid ? b : null);

/**
 * pages: [{ name, keys: [{ col, row, settings } | { col, row, builtin }], dials: [{ dial, layer, settings } | { dial, layer, builtin }], infobar: settings }]
 *   builtin = a BUILTINS id or a spec { uuid, name, plugin, settings, art, controllers }
 * → { zip, files, package, manifest, pages: [ids], dropped: [...], builtins: n }
 */
export function buildProfile({ device, name, pages, pluginVersion = '0.3.0.0', seed } = {}) {
  const model = getDevice(device);
  if (!model.model) throw new Error(`${model.id} has no profile Device.Model string`);
  const base = seed || `${model.id}:${name}`;
  const profileId = detUuid(`${base}:profile`).toUpperCase();
  const defaultId = detUuid(`${base}:default`);
  const pageIds = [];
  const dropped = [];
  const required = new Set([PLUGIN_UUID]);
  let builtins = 0;
  const root = `Profiles/${profileId}.sdProfile/`;
  const files = [];
  const encoderType = model.dials?.count ? 'Encoder' : null;
  pages.forEach((page, pi) => {
    const pageId = detUuid(`${base}:page:${pi}`);
    const dir = `${root}Profiles/${pageId.toUpperCase()}/`;
    pageIds.push(pageId);
    const images = new Map();   // png → file name (one file per distinct art on the page)
    const place = (spec, slotSeed) => {
      const png = builtinArt(spec.art);
      if (!images.has(png)) images.set(png, `${imageName(`${base}:${pi}:${slotSeed}`)}.png`);
      return images.get(png);
    };
    const builtin = (b, controller, slot) => {
      const spec = specOf(b);
      if (!spec) { dropped.push({ page: pi, slot, reason: `unknown built-in ${b}` }); return null; }
      if (!spec.controllers.includes(controller)) { dropped.push({ page: pi, slot, reason: `${spec.name} does not run on ${controller}` }); return null; }
      required.add(spec.plugin.UUID);
      builtins++;
      return builtinObject({ seed: `${base}:${pi}:${slot}`, spec, controller, image: place(spec, slot) });
    };
    const keypad = {};
    for (const k of page.keys || []) {
      if (k.col < 0 || k.row < 0 || k.col >= model.cols || k.row >= model.rows) { dropped.push({ page: pi, key: `${k.col},${k.row}`, reason: 'outside the grid' }); continue; }
      if (k.builtin) { const a = builtin(k.builtin, 'Keypad', `k:${k.col},${k.row}`); if (a) keypad[`${k.col},${k.row}`] = a; continue; }
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
        if (d.builtin) { const a = builtin(d.builtin, 'Encoder', `d:${d.dial},${layer}`); if (a) enc[`${d.dial},${layer}`] = a; continue; }
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
    files.push({ name: `${dir}manifest.json`, data: JSON.stringify(manifest) });
    files.push({ name: `${dir}Images/` });
    for (const [png, file] of images) files.push({ name: `${dir}Images/${file}`, data: png });
  });
  const defaultPage = { Controllers: [{ Actions: null, Type: 'Keypad' }, ...(encoderType ? [{ Actions: null, Type: 'Encoder' }] : [])], Icon: '', Name: '' };
  files.push({ name: `${root}Profiles/${defaultId.toUpperCase()}/manifest.json`, data: JSON.stringify(defaultPage) });
  files.push({ name: `${root}Profiles/${defaultId.toUpperCase()}/Images/` });
  const manifest = { Device: { Model: model.model, UUID: detUuid(`${base}:device`) }, Name: name, Pages: { Current: NIL_UUID, Default: defaultId, Pages: pageIds }, Version: '3.0' };
  const pkg = { AppVersion: APP_VERSION, DeviceModel: model.model, DeviceSettings: null, FormatVersion: 1, OSType: 'Windows', OSVersion: '10.0.26300', RequiredPlugins: [...required] };
  const all = [{ name: 'package.json', data: JSON.stringify(pkg) }, { name: `${root}manifest.json`, data: JSON.stringify(manifest) }, ...files];
  return { zip: writeZip(all), files: all, package: pkg, manifest, profileId, pages: pageIds, dropped, model, builtins };
}

const k = (col, row, facet, extra = {}) => ({ col, row, settings: { facet, ...extra } });
const row = (r, facets, extra) => facets.map((f, c) => k(c, r, f, extra));
const span = (r, cols, facet, group = 'A', c0 = 0) => Array.from({ length: cols }, (_, i) => k(c0 + i, r, facet, group === 'A' ? {} : { group }));
const block = (c0, r0, cols, rows, facet, group) => Array.from({ length: cols * rows }, (_, i) => k(c0 + (i % cols), r0 + Math.floor(i / cols), facet, group === 'A' ? {} : { group }));
const dial = (d, layer, facet, extra = {}) => ({ dial: d, layer, settings: { facet, ...extra } });

/**
 * The Prism showcase layouts (Prism Display only): the sample profiles' "Showcase" pages, and the samples the
 * Linux exports (src/export/linux*.js) and the MCP server (deck_layout_create template "sample") start from.
 */
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
  // Stream Deck + XL (DeviceType 13, model 20GBX9901): 9 × 4 keys, 6 dials over a 1200 × 100 strip.
  // Page 2 is a streamer layout: the linked keys (scene/link.js) agree with each other: mute the mic on any
  // key or on the mic dial and every mic key says MUTED; the On Air sign and key go live together.
  plusxl: {
    name: 'Prism · Stream Deck + XL', file: 'Prism - Stream Deck + XL', deviceType: 13,
    pages: [
      { name: 'Prism', keys: [
        ...row(0, ['icon-play-pause', 'icon-skip-prev', 'icon-skip-next', 'icon-shuffle', 'icon-mic', 'icon-camera', 'icon-record', 'icon-broadcast', 'icon-volume']),
        ...span(1, 9, 'span-spectrum'),
        ...block(0, 2, 4, 2, 'span-first-light', 'B'),
        ...row(2, ['app-cpu-ring', 'icon-memory', 'icon-gpu', 'icon-network', 'icon-clock']).map((x) => ({ ...x, col: x.col + 4 })),
        ...row(3, ['app-focus-timer', 'icon-bulb', 'icon-lock', 'icon-sync', 'icon-power']).map((x) => ({ ...x, col: x.col + 4 })),
      ],
      dials: [dial(0, 0, 'dial-volume'), dial(1, 0, 'dial-volume', { params: { controls: 'mic', label: 'Mic' } }), dial(2, 0, 'dial-volume-arc'), dial(3, 0, 'dial-gauge'), dial(4, 0, 'dial-color-wheel'), dial(5, 0, 'dial-light')] },
      { name: 'Studio', keys: [
        ...row(0, ['state-on-air', 'icon-mic', 'app-mic-meter', 'icon-camera', 'icon-record', 'icon-chat', 'icon-viewers', 'app-scene-countdown', 'icon-clock']),
        ...span(1, 5, 'app-scene-switcher'), ...row(1, ['app-meeting-mic', 'icon-broadcast', 'icon-headphones', 'app-stopwatch']).map((x) => ({ ...x, col: x.col + 5 })),
        ...span(2, 9, 'span-waveform', 'C'),
        ...span(3, 5, 'span-goal', 'D'), ...row(3, ['app-counter', 'icon-scene', 'icon-volume', 'icon-power']).map((x) => ({ ...x, col: x.col + 5 })),
      ],
      dials: [dial(0, 0, 'dial-volume'), dial(1, 0, 'dial-volume', { params: { controls: 'mic', label: 'Mic' } }), dial(2, 0, 'dial-volume-arc', { params: { label: 'Music' } }), dial(3, 0, 'dial-volume-arc', { params: { label: 'Game' } }), dial(4, 0, 'dial-selector'), dial(5, 0, 'dial-light', { params: { label: 'Key light' } })] },
      { name: 'Panorama', keys: block(0, 0, 9, 4, 'span-aurora', 'B'), dials: [0, 1, 2, 3, 4, 5].map((i) => dial(i, 0, 'strip-refraction')) },
    ],
  },
});

// ── the sample profiles: a Home page of built-ins, then the Prism showcases ──────────────────────
const b = (col, row, id) => ({ col, row, builtin: id });
const brow = (r, ids, c0 = 0) => ids.map((id, i) => (id ? b(c0 + i, r, id) : null)).filter(Boolean);
const bdial = (d, layer, id) => ({ dial: d, layer, builtin: id });
const live = (col, row, facet, extra = {}) => ({ col, row, settings: { facet, ...extra } });

/**
 * Page 1 of every sample profile: keys that work on day one — media, volume, screen snip, desktop, files,
 * clipboard, the Prism site — as Stream Deck's own actions in Prism art, plus a "Go to Page" key per
 * Showcase page. Galleon / + / + XL dials: system volume and deck brightness (built-in), and live Prism
 * readouts (clock, CPU, network: real data, measured by the plugin).
 * showcase: which SAMPLE_LAYOUTS pages follow (as "Showcase …" pages), nav: where their Home key goes.
 */
export const HOME_LAYOUTS = Object.freeze({
  galleon: {
    keys: [...brow(0, ['media.prev', 'media.play', 'media.next']), ...brow(1, ['media.voldown', 'media.mute', 'media.volup']), ...brow(2, ['hotkey.snip', 'hotkey.desktop', 'open.files']), b(0, 3, 'web.prism'), b(1, 3, goto(2, 'Showcase')), b(2, 3, goto(3, 'Studio'))],
    dials: [bdial(0, 0, 'dial.volume'), { dial: 1, layer: 0, settings: { facet: 'app-widget-clock' } }, { dial: 0, layer: 1, settings: { facet: 'app-widget-cpu' } }, { dial: 1, layer: 1, settings: { facet: 'app-widget-network' } }],
    nav: [2, 3],
  },
  plus: {
    keys: [...brow(0, ['media.prev', 'media.play', 'media.next', 'media.mute']), ...brow(1, ['hotkey.snip', 'hotkey.desktop']), b(2, 1, goto(2, 'Showcase')), b(3, 1, goto(3, 'Panorama'))],
    dials: [bdial(0, 0, 'dial.volume'), bdial(1, 0, 'dial.zoom'), { dial: 2, layer: 0, settings: { facet: 'dial-gauge' } }, { dial: 3, layer: 0, settings: { facet: 'app-system-dial' } }],
    nav: [3, 0],
  },
  mk2: {
    keys: [...brow(0, ['media.prev', 'media.play', 'media.next', 'media.voldown', 'media.volup']), ...brow(1, ['media.mute', 'hotkey.snip', 'hotkey.desktop', 'open.files', 'hotkey.tasks']), ...brow(2, ['hotkey.copy', 'hotkey.paste', 'hotkey.undo', 'web.prism']), b(4, 2, goto(2, 'Showcase'))],
    nav: [4, 2],
  },
  'xl-2022': {
    keys: [
      ...brow(0, ['media.prev', 'media.play', 'media.next', 'media.stop', 'media.voldown', 'media.mute', 'media.volup', 'web.prism']),
      ...brow(1, ['hotkey.snip', 'hotkey.desktop', 'open.files', 'hotkey.tasks', 'hotkey.search', 'hotkey.emoji', 'hotkey.copy', 'hotkey.paste']),
      ...brow(2, ['hotkey.undo', 'hotkey.redo']), live(2, 2, 'app-cpu-ring'), live(3, 2, 'app-mem'), live(4, 2, 'app-net'), live(5, 2, 'app-disk'), live(6, 2, 'app-date'), live(7, 2, 'app-stopwatch'),
      live(0, 3, 'app-focus-timer'), live(1, 3, 'app-world-clock'), live(2, 3, 'app-countdown'), live(3, 3, 'app-pomodoro-set'), live(4, 3, 'app-counter'), live(5, 3, 'app-time-zones'), b(7, 3, goto(2, 'Showcase')),
    ],
    nav: [7, 3],
  },
  'mini-2022': { keys: [...brow(0, ['media.prev', 'media.play', 'media.next']), ...brow(1, ['media.voldown', 'media.volup']), b(2, 1, goto(2, 'Showcase'))], nav: [2, 1] },
  neo: { keys: [...brow(0, ['media.prev', 'media.play', 'media.next', 'media.mute']), ...brow(1, ['media.voldown', 'media.volup', 'hotkey.snip']), b(3, 1, goto(2, 'Showcase'))], infobar: { facet: 'screen-neo-clock' }, nav: [3, 1] },
  plusxl: {
    keys: [
      ...brow(0, ['media.prev', 'media.play', 'media.next', 'media.stop', 'media.voldown', 'media.mute', 'media.volup', 'hotkey.snip', 'hotkey.desktop']),
      ...brow(1, ['open.files', 'hotkey.tasks', 'hotkey.search', 'hotkey.emoji', 'hotkey.copy', 'hotkey.paste', 'hotkey.undo', 'hotkey.redo', 'web.prism']),
      live(0, 2, 'app-cpu-ring'), live(1, 2, 'app-mem'), live(2, 2, 'app-net'), live(3, 2, 'app-disk'), live(4, 2, 'app-gpu'), live(5, 2, 'app-date'), live(6, 2, 'app-world-clock'), live(7, 2, 'app-stopwatch'), live(8, 2, 'app-focus-timer'),
      live(0, 3, 'app-countdown'), live(1, 3, 'app-pomodoro-set'), live(2, 3, 'app-counter'), live(3, 3, 'app-time-zones'),
      b(6, 3, goto(2, 'Showcase')), b(7, 3, goto(3, 'Studio')), b(8, 3, goto(4, 'Panorama')),
    ],
    dials: [bdial(0, 0, 'dial.volume'), bdial(1, 0, 'dial.brightness'), bdial(2, 0, 'dial.zoom'), bdial(3, 0, 'dial.scroll'), { dial: 4, layer: 0, settings: { facet: 'dial-gauge' } }, { dial: 5, layer: 0, settings: { facet: 'app-system-dial' } }],
    nav: [8, 3],
  },
});

/** "Prism" → "Showcase", "Studio" → "Showcase · Studio", … */
const showcaseName = (n, i) => (i === 0 ? 'Showcase' : `Showcase · ${n}`);

/** The pages of a sample profile: Home, then every SAMPLE_LAYOUTS page as a Showcase page with a Home key. */
export function samplePages(device) {
  const home = HOME_LAYOUTS[device], show = SAMPLE_LAYOUTS[device];
  if (!home || !show) throw new Error(`no sample profile for ${device}`);
  const [nc, nr] = home.nav;
  const homePage = { name: 'Home', keys: home.keys, dials: home.dials || [], ...(home.infobar ? { infobar: home.infobar } : {}) };
  const showcases = show.pages.map((p, i) => ({
    ...p,
    name: showcaseName(p.name, i),
    keys: [...(p.keys || []).filter((k) => !(k.col === nc && k.row === nr)), b(nc, nr, 'page.home')],
  }));
  return [homePage, ...showcases];
}

export function sampleProfiles({ pluginVersion = '0.3.0.0' } = {}) {
  return Object.entries(SAMPLE_LAYOUTS).map(([device, l]) => ({ device, deviceType: l.deviceType, name: l.name, file: l.file, ...buildProfile({ device, name: l.name, pages: samplePages(device), pluginVersion, seed: `sample:${device}` }) }));
}

const UUIDU = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const UUIDL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Built-in action UUIDs a Prism profile may use (all from the app's own plugins, schemas/reference/builtin-actions.json). */
export const KNOWN_BUILTINS = new Set([...Object.values(BUILTINS).map((s) => s.uuid), 'com.elgato.streamdeck.page.goto', 'com.elgato.streamdeck.page.next', 'com.elgato.streamdeck.page.previous']);

/**
 * Structural check of a FormatVersion 1 export (there is no official schema — the
 * format is reverse-engineered, formats.md §5): package fields, one .sdProfile,
 * every page in Pages.Pages + Default present, coordinates inside the grid, action
 * objects complete, Prism settings naming real facets, built-ins known and their
 * images present, RequiredPlugins covering every plugin used. → problems[]
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
  const used = new Set();
  for (const id of [...(pages.Pages || []), pages.Default].filter(Boolean)) {
    if (!UUIDL.test(id)) { out.push(`page id ${id} is not a UUID`); continue; }
    const dir = `${root}Profiles/${id.toUpperCase()}/`;
    const page = json(`${dir}manifest.json`);
    if (!page) continue;
    if (!Array.isArray(page.Controllers)) { out.push(`page ${id}: Controllers must be an array`); continue; }
    const image = (coord, rel) => { if (!/^Images\/[0-9A-Z]{26}Z\.(png|gif|svg|jpe?g)$/.test(rel || '')) out.push(`page ${id} ${coord}: image name ${rel} must be Images/<26 chars>Z.<ext>`); else if (!file(`${dir}${rel}`)) out.push(`page ${id} ${coord}: ${rel} missing`); };
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
        if (a.Plugin?.UUID) used.add(a.Plugin.UUID);
        if (!Array.isArray(a.States) || !a.States.length) { out.push(`page ${id} ${coord}: States must be a non-empty array`); continue; }
        if (a.Plugin?.UUID === PLUGIN_UUID) {
          if (![ACTION_FACET, ACTION_INFOBAR].includes(a.UUID)) out.push(`page ${id} ${coord}: unknown Prism action ${a.UUID}`);
          const f = findFacet(a.Settings?.facet || '');
          if (!f || f.id !== a.Settings.facet) out.push(`page ${id} ${coord}: unknown facet ${a.Settings?.facet}`);
          if (a.States.some((s) => s.Image)) out.push(`page ${id} ${coord}: state images would block the plugin's setImage`);
        } else {
          if (!KNOWN_BUILTINS.has(a.UUID)) out.push(`page ${id} ${coord}: unknown action ${a.UUID}`);
          if (a.Plugin?.Version !== '1.0') out.push(`page ${id} ${coord}: built-in Plugin.Version must be "1.0"`);
          for (const s of a.States) if (s.Image) image(coord, s.Image);
          if (c.Type === 'Encoder' && a.Encoder?.Icon) image(coord, a.Encoder.Icon);
          if (c.Type === 'Keypad' && !a.States[0].Image) out.push(`page ${id} ${coord}: a built-in key needs its Prism art`);
          if (a.UUID === 'com.elgato.streamdeck.page.goto' && !(Number.isInteger(a.Settings?.PageIndex) && a.Settings.PageIndex >= 1 && a.Settings.PageIndex <= (pages.Pages || []).length)) out.push(`page ${id} ${coord}: Go to Page ${a.Settings?.PageIndex} is not a page of this profile (1-based)`);
        }
      }
      if (c.Type === 'Encoder' && dev?.dials?.layers > 1 && !c.Routers) out.push(`page ${id}: Galleon encoders need Routers`);
    }
  }
  if (pkg && Array.isArray(pkg.RequiredPlugins)) for (const u of used) if (!pkg.RequiredPlugins.includes(u)) out.push(`package.json: RequiredPlugins misses ${u}`);
  return out;
}
