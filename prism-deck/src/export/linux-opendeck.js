// OpenDeck export — Prism Deck on Linux through OpenDeck (Rust/Tauri; Flathub
// me.amankhanna.opendeck, Arch extra/opendeck, .deb/.rpm/AppImage).
//
// OpenDeck runs stock Elgato Node plugins unchanged with the system `node` ≥ 20 (on the
// host, even from its Flatpak), so the Prism plugin `com.jeremyfhall.prism` is the same
// artifact as on Windows/macOS. OpenDeck reports platform "windows" in -info: detect Linux
// with process.platform (src/plugin/connection.js does). What OpenDeck does NOT do: import
// .streamDeckProfile files or honour the manifest's bundled Profiles — so this module
// writes OpenDeck's own profile JSON. Verified against upstream src-tauri/src
// (store/profiles.rs, store/simplified_profile.rs, shared.rs, plugins/mod.rs, plugins/manifest.rs; main, 2026-10-15):
//   <config>/profiles/<deviceId>/<Profile>.json = { keys: [instance|null] (rows×cols + touchpoints),
//                                                  sliders: [instance|null] (dials), infobars: [instance|null] }
//   instance = { action: <manifest action, snake_case>, context: "<Keypad|Encoder|Infobar>.<position>.<index>",
//                states: [ActionState], current_state, settings, children: null }
//   action.plugin MUST be the plugin folder name ("com.jeremyfhall.prism.sdPlugin") — instances whose
//   plugin folder doesn't exist are dropped on load; state images may be data: URLs (shown until setImage).
//   An optional manifest.<os>.json beside manifest.json is merged in as a JSON merge patch.
//
//   openDeckPaths({ home, flatpak })                     → { config, plugins, profiles, images, logs }
//   linuxManifestOverlay(manifest)                       → manifest.linux.json (OS: linux; info bar slot)
//   buildOpenDeckPlugin(streamDeckPluginZip)             → { zip, fileName, overlay } (the same plugin + overlay)
//   buildOpenDeckProfile(setup, { deviceId, profile, images, raster, manifest })
//                                                        → { json, path, files, dropped, warnings }

import { readZip, writeZip } from './plugin-zip.js';
import { PLUGIN_UUID, ACTION_FACET, ACTION_INFOBAR } from './profile.js';
import { normalizeSetup, renderPage, safeName, svgDataUrl } from './linux.js';
import { render, stillTime } from '../render.js';
import { findFacet } from '../facets/index.js';

export const OD_FLATPAK_ID = 'me.amankhanna.opendeck';
export const PLUGIN_DIR = `${PLUGIN_UUID}.sdPlugin`;
/** Models OpenDeck drives (elgato-streamdeck crate 0.13): no Studio, no Galleon 100 SD yet (crate PR #63). */
export const OD_DEVICES = ['original', 'original-v2', 'mini', 'mini-2022', 'mini-discord', 'xl', 'xl-2022', 'mk2', 'scissor', 'neo', 'pedal', 'plus', 'plusxl', 'module-6', 'module-15', 'module-15-scissor', 'module-32'];
/** Extra slots OpenDeck adds per model (DeviceInfo.touchpoints / infobars). */
const OD_EXTRA = { neo: { touchpoints: 2, infobars: 1 } };

/** XDG base dir: the variable when it is an absolute path (XDG spec: relative values are ignored), else the default. */
export const xdgDir = (value, fallback) => (typeof value === 'string' && value.startsWith('/') ? value.replace(/\/+$/, '') || '/' : fallback);

/**
 * Where OpenDeck keeps things (Tauri app_config_dir / app_log_dir; Flatpak under ~/.var/app).
 * Native installs follow XDG_CONFIG_HOME / XDG_DATA_HOME (pass `env`); the Flatpak sandbox sets its own.
 */
export function openDeckPaths({ home = '~', flatpak = false, env = {} } = {}) {
  const config = flatpak ? `${home}/.var/app/${OD_FLATPAK_ID}/config/opendeck` : `${xdgDir(env.XDG_CONFIG_HOME, `${home}/.config`)}/opendeck`;
  const logs = flatpak ? `${home}/.var/app/${OD_FLATPAK_ID}/data/opendeck/logs` : `${xdgDir(env.XDG_DATA_HOME, `${home}/.local/share`)}/opendeck/logs`;
  return { config, plugins: `${config}/plugins`, plugin: `${config}/plugins/${PLUGIN_DIR}`, profiles: `${config}/profiles`, images: `${config}/images`, logs, pluginLog: `${logs}/plugins/${PLUGIN_DIR}.log` };
}

/**
 * manifest.linux.json for OpenDeck (merged over manifest.json as a JSON merge patch on Linux only;
 * the Elgato app never reads it). OS → linux so OpenDeck runs CodePath natively with node (never via
 * Wine); the info-bar action also lists OpenDeck's "Infobar" controller [UNVERIFIED on hardware].
 * Arrays replace wholesale in a merge patch, so Actions is the full list with that one change.
 */
export function linuxManifestOverlay(manifest = {}) {
  const overlay = { OS: [{ Platform: 'linux', MinimumVersion: '0' }] };
  const actions = manifest.Actions || manifest.actions;
  if (Array.isArray(actions) && actions.some((a) => (a.Controllers || []).includes('Neo'))) {
    overlay.Actions = actions.map((a) => ((a.Controllers || []).includes('Neo') && !(a.Controllers || []).includes('Infobar') ? { ...a, Controllers: [...a.Controllers, 'Infobar'] } : a));
  }
  return overlay;
}

/** The Elgato .streamDeckPlugin plus manifest.linux.json — install it from OpenDeck's Plugins tab. */
export function buildOpenDeckPlugin(pluginZip) {
  const entries = readZip(Buffer.isBuffer(pluginZip) ? pluginZip : Buffer.from(pluginZip));
  const manifestEntry = entries.find((e) => e.name === `${PLUGIN_DIR}/manifest.json`);
  if (!manifestEntry) throw new Error(`not a Prism plugin bundle (no ${PLUGIN_DIR}/manifest.json)`);
  const manifest = JSON.parse(manifestEntry.data.toString('utf8'));
  const overlay = linuxManifestOverlay(manifest);
  const kept = entries.filter((e) => e.name !== `${PLUGIN_DIR}/manifest.linux.json`).map((e) => (e.dir ? { name: e.name } : { name: e.name, data: e.data }));
  kept.push({ name: `${PLUGIN_DIR}/manifest.linux.json`, data: `${JSON.stringify(overlay, null, '\t')}\n` });
  return { zip: writeZip(kept), fileName: `${PLUGIN_UUID}.opendeck.streamDeckPlugin`, overlay, manifest };
}

const STATE_DEFAULTS = { image: '', image_scale: 100, background_colour: '#000000', name: '', text: '', show: false, colour: '#FFFFFF', stroke_colour: '#000000', alignment: 'middle', family: 'Liberation Sans', style: 'Regular', size: 16, stroke_size: 3, underline: false };
const rel = (p) => (p ? `plugins/${PLUGIN_DIR}/${p}` : '');
/** The image file a manifest path points at (OpenDeck's convert_icon tries .svg, @2x.png, .png). */
const imageFile = (p, files) => { if (!p) return ''; for (const ext of ['.svg', '@2x.png', '.png']) if (!files || files.has(p + ext)) return p + ext; return `${p}.svg`; };

/** A manifest action → OpenDeck's stored Action (snake_case, paths relative to the config dir). */
function storedAction(m, files) {
  return {
    name: m.Name, uuid: m.UUID, plugin: PLUGIN_DIR, tooltip: m.Tooltip || '', icon: rel(imageFile(m.Icon, files)),
    disable_automatic_states: !!m.DisableAutomaticStates, visible_in_action_list: m.VisibleInActionsList !== false,
    supported_in_multi_actions: m.SupportedInMultiActions !== false, property_inspector: rel(m.PropertyInspectorPath || 'ui/pi.html'),
    controllers: m.Controllers || ['Keypad'], encoder: null,
    states: (m.States || [{}]).map((s) => ({ ...STATE_DEFAULTS, image: rel(imageFile(s.Image, files)), name: s.Name || '', show: false })),   // Prism draws its own type: titles off
  };
}

/** Fallback action definitions when no built manifest is given (mirror plugin/com.jeremyfhall.prism.sdPlugin/manifest.json). */
const DEFAULT_ACTIONS = [
  { UUID: ACTION_FACET, Name: 'Prism Display', Icon: 'imgs/actions/facet/icon', Controllers: ['Keypad', 'Encoder'], DisableAutomaticStates: true, SupportedInMultiActions: false, PropertyInspectorPath: 'ui/pi.html', States: [{ Name: 'Prism', Image: 'imgs/actions/facet/key', ShowTitle: false }] },
  { UUID: ACTION_INFOBAR, Name: 'Prism Info Bar', Icon: 'imgs/actions/infobar/icon', Controllers: ['Neo', 'Infobar'], SupportedInMultiActions: false, PropertyInspectorPath: 'ui/pi.html', States: [{ Name: 'Prism', Image: 'imgs/actions/infobar/key', ShowTitle: false }] },
];

/**
 * OpenDeck profile for a setup page. opts: { deviceId ('sd-<SERIAL>'; ls <config>/profiles to find yours),
 * profile (name; default: setup name), page (index, default 0 — one OpenDeck profile per page),
 * images: 'svg' (default) | 'png' | 'none' (still art shown until the plugin draws), raster, manifest (built plugin manifest.json),
 * files (Set of plugin-relative files, to resolve image extensions), force }
 */
export function buildOpenDeckProfile(rawSetup, opts = {}) {
  const setup = normalizeSetup(rawSetup);
  const model = setup.device;
  const warnings = [];
  if (!OD_DEVICES.includes(model.id) && !OD_DEVICES.includes(model.gridOf)) {
    const msg = `OpenDeck does not drive the ${model.name} yet${model.id === 'galleon' ? ' (OpenActionAPI/rust-elgato-streamdeck PR #63)' : ''}`;
    if (!opts.force) throw new Error(msg);
    warnings.push(msg);
  }
  const images = ['svg', 'png', 'none'].includes(opts.images) ? opts.images : 'svg';
  if (images === 'png' && !opts.raster) throw new Error('png images need the raster backend (src/raster)');
  const actions = (opts.manifest?.Actions || DEFAULT_ACTIONS);
  const facetAction = actions.find((a) => a.UUID === ACTION_FACET) || DEFAULT_ACTIONS[0];
  const infobarAction = actions.find((a) => a.UUID === ACTION_INFOBAR) || DEFAULT_ACTIONS[1];
  const pageIndex = opts.page || 0;
  const page = setup.pages[pageIndex];
  if (!page) throw new Error(`setup has no page ${pageIndex}`);
  const r = renderPage(model, page, setup, { raster: opts.raster, png: images === 'png' });
  const dropped = r.dropped.map((d) => ({ page: page.name, ...d }));
  const extra = OD_EXTRA[model.id] || { touchpoints: 0, infobars: 0 };
  const keys = new Array(model.cols * model.rows + extra.touchpoints).fill(null);
  const sliders = new Array(model.dials?.count || 0).fill(null);
  const infobars = new Array(extra.infobars).fill(null);
  const imageOf = (slot) => (images === 'none' || !slot ? '' : images === 'png' && slot.png ? `data:image/png;base64,${Buffer.from(slot.png).toString('base64')}` : svgDataUrl(slot.svg));
  const instance = (a, controller, position, settings, slot) => {
    const act = storedAction(a, opts.files);
    const img = imageOf(slot);
    return { action: act, context: `${controller}.${position}.0`, states: act.states.map((s) => ({ ...s, image: img || s.image })), current_state: 0, settings, children: null };
  };
  const clean = (s) => { const o = { facet: s.facet }; for (const k of ['theme', 'mode', 'params', 'group', 'state', 'value', 'motion']) if (s[k] !== undefined) o[k] = s[k]; return o; };
  for (const k of page.keys) {
    const slot = r.keys.get(`${k.col},${k.row}`);
    if (!slot) continue;                               // dropped (reported)
    keys[k.row * model.cols + k.col] = instance(facetAction, 'Keypad', k.row * model.cols + k.col, clean(k.settings), slot);
  }
  for (const d of page.dials) {
    const slot = r.dials.get(d.dial);
    if (!slot || d.layer) continue;
    sliders[d.dial] = instance(facetAction, 'Encoder', d.dial, clean(d.settings), slot);
  }
  if (page.infobar && infobars.length) {
    const f = findFacet(page.infobar.facet);
    let slot = null;
    if (f && f.id === page.infobar.facet && f.surface === 'screen' && f.screens.includes('infobar')) {
      const t = stillTime(f);
      slot = { svg: render(f, { device: model.id, theme: page.infobar.theme || setup.theme, mode: setup.mode, t, since: t, screen: 'infobar', now: Date.UTC(2026, 9, 15, 10, 9, 0) }).svg };
      infobars[0] = instance(infobarAction, 'Infobar', 0, clean(page.infobar), slot);
    } else dropped.push({ page: page.name, slot: 'infobar', reason: `facet "${page.infobar.facet}" can't draw the Neo info bar` });
  } else if (page.infobar) dropped.push({ page: page.name, slot: 'infobar', reason: `${model.name} has no info bar` });

  const json = { keys, sliders, infobars };
  const deviceId = String(opts.deviceId || 'sd-YOUR-SERIAL').replace(/[\\/]/g, '');
  const profile = safeName(opts.profile || (setup.pages.length > 1 ? `${setup.name} - ${page.name}` : setup.name));
  const path = `profiles/${deviceId}/${profile}.json`;
  return { json, text: `${JSON.stringify(json, null, 2)}\n`, path, profile, deviceId, dropped, warnings, device: model.id };
}

/** All pages of a setup as OpenDeck profiles (one profile per page). → [{ path, text, … }] */
export function buildOpenDeckProfiles(rawSetup, opts = {}) {
  const setup = normalizeSetup(rawSetup);
  return setup.pages.map((_, i) => buildOpenDeckProfile(rawSetup, { ...opts, page: i }));
}

/**
 * Structural check of an OpenDeck profile JSON against what the loader requires. → problems[]
 */
export function checkOpenDeckProfile(json, device) {
  const out = [];
  const model = typeof device === 'object' ? device : null;
  if (!json || !Array.isArray(json.keys) || !Array.isArray(json.sliders)) return ['keys / sliders must be arrays'];
  if (model) {
    const extra = OD_EXTRA[model.id] || { touchpoints: 0 };
    if (json.keys.length !== model.cols * model.rows + extra.touchpoints) out.push(`keys has ${json.keys.length} slots, expected ${model.cols * model.rows + extra.touchpoints}`);
    if (json.sliders.length !== (model.dials?.count || 0)) out.push(`sliders has ${json.sliders.length} slots, expected ${model.dials?.count || 0}`);
  }
  const check = (inst, i, ctl) => {
    if (inst === null) return;
    const where = `${ctl}[${i}]`;
    for (const k of ['action', 'context', 'states', 'current_state', 'settings']) if (!(k in inst)) out.push(`${where}: missing ${k}`);
    if (!inst.action?.name || !inst.action?.uuid || !Array.isArray(inst.action?.states)) out.push(`${where}: action needs name, uuid, states`);
    if (inst.action?.plugin !== PLUGIN_DIR) out.push(`${where}: action.plugin must be "${PLUGIN_DIR}" (the plugin folder name)`);
    const m = /^(Keypad|Encoder|Infobar)\.(\d+)\.(\d+)$/.exec(inst.context || '');
    if (!m) out.push(`${where}: bad context "${inst.context}"`);
    else if (Number(m[2]) !== i) out.push(`${where}: context position ${m[2]} ≠ slot ${i}`);
    if (!Array.isArray(inst.states) || !inst.states.length) out.push(`${where}: states must be a non-empty array`);
    for (const s of inst.states || []) if (s.image && !/^data:image\/(svg\+xml|png);base64,/.test(s.image) && !s.image.startsWith(`plugins/${PLUGIN_DIR}/`)) out.push(`${where}: unexpected image ${String(s.image).slice(0, 40)}`);
    if (inst.action?.uuid === ACTION_FACET && !findFacet(inst.settings?.facet || '')) out.push(`${where}: settings.facet "${inst.settings?.facet}" is not a Prism facet`);
  };
  json.keys.forEach((x, i) => check(x, i, 'keys'));
  json.sliders.forEach((x, i) => check(x, i, 'sliders'));
  (json.infobars || []).forEach((x, i) => check(x, i, 'infobars'));
  return out;
}
