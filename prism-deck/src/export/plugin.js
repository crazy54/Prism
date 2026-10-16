// The Prism Deck Stream Deck plugin package (formats.md §1):
//
//   com.jeremyfhall.prism.sdPlugin/
//     manifest.json               SDKVersion 3, Node 20, Software 7.6 (7.1 without the Neo action), SupportURL
//     LICENSE.txt                 MIT, then the SIL OFL 1.1 of Inter (ui/fonts/OFL.txt too)
//     bin/plugin.js               entry → bin/prism-deck/src/plugin/index.js (a copy of the engine; zero deps)
//     bin/package.json            { "type": "module" }
//     ui/pi.html|css|js           the property inspector + ui/catalog.js (generated) + ui/fonts/Inter
//     layouts/prism-canvas.json   one full-canvas pixmap per dial (and the Neo info bar)
//     imgs/…                      plugin icon (PNG 256/512), category + action icons (SVG), key / dial / strip defaults
//     profiles/*.streamDeckProfile  the sample profiles (installed, never switched to)
//
//   buildPluginFolder({ root, outDir, minSoftware }) → { dir, manifest, files }
//   validatePluginFolder(dir, schemas) → problems[]
//   packPlugin(dir) → .streamDeckPlugin bytes (a ZIP whose root is the .sdPlugin folder)

import fs from 'node:fs';
import path from 'node:path';
import { writeZip, readZip } from './plugin-zip.js';
import { decodePng, encodePng, downscale } from './plugin-png.js';
import { validate } from './plugin-schema.js';
import { sampleProfiles, checkProfile, PLUGIN_UUID, PLUGIN_NAME, ACTION_FACET, ACTION_INFOBAR } from './profile.js';
import { render } from '../render.js';
import { findFacet } from '../facets/index.js';
import { normalizeFacet } from '../facets/schema.js';
import { surface } from '../scene/surface.js';
import { validateSvg } from '../scene/validate.js';
import { CANVAS_LAYOUT, INFOBAR_LAYOUT, CANVAS_LAYOUT_PATH, INFOBAR_LAYOUT_PATH } from '../plugin/feedback.js';
import { PLUGIN_VERSION } from '../plugin/index.js';
import { bundledProfileFor } from '../plugin/settings.js';
import { piCatalogScript } from '../plugin/catalog.js';

export { PLUGIN_UUID, PLUGIN_NAME, PLUGIN_VERSION };
export const AUTHOR = 'Jeremy F Hall';
export const URL = 'https://prism.jeremyfhall.com/deck/';
export const SUPPORT_URL = 'https://github.com/crazy54/Prism/issues';
export const ACTION_DISPLAY_NAME = 'Prism Display';

/** What of prism-deck/ is copied into bin/prism-deck (the runtime needs the engine + src/audio + src/raster, not the tools). */
export const ENGINE_EXCLUDE = [/^src\/export\//, /^src\/web\//, /^src\/plugin\/dev\//, /^src\/plugin\/ui\//, /^src\/hid\//, /\.test\.js$/, /(^|\/)\./];

const MONO_DECK = '<g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2.5"/><rect x="6" y="8" width="3.5" height="3.5" rx=".8"/><rect x="10.25" y="8" width="3.5" height="3.5" rx=".8"/><rect x="14.5" y="8" width="3.5" height="3.5" rx=".8"/><path d="M6.5 15.5h11"/></g>';
const MONO_PRISM = '<g fill="none" stroke="#FFFFFF" stroke-linejoin="round" stroke-linecap="round"><path d="M14 2.8 25.2 23.1H2.8Z" stroke-width="1.6"/><path d="M14 2.8 17.5 23.1" stroke-width="1.2" stroke-opacity=".65"/></g>';
const MONO_BAR = '<g fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><rect x="2.5" y="8" width="19" height="8" rx="2"/><path d="M6 12h6"/><circle cx="17" cy="12" r="1.2" fill="#FFFFFF"/></g>';
const svgIcon = (size, view, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${view} ${view}">${body}</svg>`;

// Default images the app shows before the plugin draws (and in its action list).
const KEY_DEFAULT = normalizeFacet({
  id: 'app-plugin-key', title: 'Plugin key', category: 'Dashboards', tags: ['system'], description: 'The Prism Display action image shown before the plugin draws.', surface: 'key', animated: false,
  render(ctx) {
    const k = surface(ctx);
    k.background({ tone: 'active' });
    const s = ctx.w / 40, ink = k.color('ink'), acc = k.color('accent');
    const P = (d) => d.replace(/[\d.]+/g, (v) => (Number(v) * s * 0.6 + ctx.w * 0.2).toFixed(2));
    k.add(`<path d="${P('M20 4 36 33H25Z')}" fill="${acc}" fill-opacity="0.2"/><path d="${P('M20 4 36 33H4Z')}" fill="none" stroke="${ink}" stroke-width="${(s * 1.2).toFixed(2)}" stroke-linejoin="round"/><path d="${P('M20 4 25 33')}" fill="none" stroke="${ink}" stroke-opacity="0.7" stroke-width="${(s * 0.85).toFixed(2)}" stroke-linecap="round"/><path d="${P('M25.9 33H35.1')}" fill="none" stroke="${acc}" stroke-width="${(s * 1.2).toFixed(2)}" stroke-linecap="round"/>`);
    return k.svg();
  },
}, 'apps/app-plugin-key.js');

/** The manifest. minSoftware '7.6' adds the Neo info bar action (Neo needs app 7.6); '7.1' leaves it out. */
export function pluginManifest({ version = PLUGIN_VERSION, minSoftware = '7.6', profiles = [] } = {}) {
  const neo = Number(minSoftware) >= 7.6;
  const facetAction = {
    UUID: ACTION_FACET,
    Name: ACTION_DISPLAY_NAME,
    Tooltip: 'Shows a Prism facet (art, motion, live readouts) on a key, a dial, the touch strip or the Galleon screen. Visual only, unless you give it an On press behavior: open a web page or switch profile.',
    Icon: 'imgs/actions/facet/icon',
    Controllers: ['Keypad', 'Encoder'],
    DisableAutomaticStates: true,
    SupportedInMultiActions: false,
    UserTitleEnabled: false,
    Encoder: {
      layout: CANVAS_LAYOUT_PATH,
      Icon: 'imgs/actions/facet/dial',
      background: 'imgs/actions/facet/strip',
      StackColor: '#b8a2f2',
      TriggerDescription: { Rotate: 'Adjust value', Push: 'Press / next state', Touch: 'Press', LongTouch: 'Reset value' },
    },
    States: [{ Name: 'Prism', Image: 'imgs/actions/facet/key', ShowTitle: false }],
  };
  const actions = [facetAction];
  if (neo) actions.push({
    UUID: ACTION_INFOBAR,
    Name: 'Prism Info Bar',
    Tooltip: 'A Prism Deck screen facet on the Stream Deck Neo info bar (clock and more).',
    Icon: 'imgs/actions/infobar/icon',
    Controllers: ['Neo'],
    SupportedInMultiActions: false,
    States: [{ Name: 'Prism', Image: 'imgs/actions/infobar/key', ShowTitle: false }],
  });
  return {
    $schema: 'https://schemas.elgato.com/streamdeck/plugins/manifest.json',
    UUID: PLUGIN_UUID,
    Name: PLUGIN_NAME,
    Version: version,
    Author: AUTHOR,
    Description: 'Prism Deck: animated, themed key art, spans across keys, touch-strip panoramas and Galleon 100 SD screen widgets from the Prism catalog. Prism Display is visual (it can also open a web page or switch profile on press); the sample profiles pair Stream Deck’s own actions with Prism art. Simulated data is tagged DEMO. Optional AI live editing (off by default).',
    Icon: 'imgs/plugin/icon',
    Category: PLUGIN_NAME,
    CategoryIcon: 'imgs/plugin/category',
    CodePath: 'bin/plugin.js',
    PropertyInspectorPath: 'ui/pi.html',
    SDKVersion: 3,
    Software: { MinimumVersion: minSoftware },
    Nodejs: { Version: '20' },
    OS: [{ Platform: 'windows', MinimumVersion: '10' }, { Platform: 'mac', MinimumVersion: '13' }],
    URL,
    SupportURL: SUPPORT_URL,
    Actions: actions,
    ...(profiles.length ? { Profiles: profiles.map((p) => ({ Name: p.name, DeviceType: p.deviceType, AutoInstall: true, DontAutoSwitchWhenInstalled: true, Readonly: false })) } : {}),
  };
}

/** Generated images: [{ path, data }]. brandPng = design/brand/prism-icon-512.png bytes. */
export function pluginImages({ brandPng } = {}) {
  const out = [];
  const add = (p, d) => out.push({ path: p, data: Buffer.isBuffer(d) ? d : Buffer.from(d) });
  if (brandPng) {
    const big = decodePng(brandPng);
    const at2 = big.width === 512 ? big : downscale(big, Math.max(1, Math.round(big.width / 512)));
    add('imgs/plugin/icon@2x.png', encodePng(at2));
    add('imgs/plugin/icon.png', encodePng(downscale(at2, 2)));
  }
  add('imgs/plugin/category.svg', svgIcon(28, 28, MONO_PRISM));
  add('imgs/actions/facet/icon.svg', svgIcon(20, 24, MONO_DECK));
  add('imgs/actions/infobar/icon.svg', svgIcon(20, 24, MONO_BAR));
  const key = (px) => render(KEY_DEFAULT, { size: px, theme: 'prism', mode: 'dark' }).svg;
  add('imgs/actions/facet/key.svg', key(72));
  add('imgs/actions/infobar/key.svg', key(72));
  add('imgs/actions/facet/dial.svg', key(72));
  const strip = findFacet('strip-refraction') || findFacet('dial-volume');
  const seg = strip ? render(strip, { device: 'plus', theme: 'prism', mode: 'dark', t: 2 }).segments?.[0] : null;
  add('imgs/actions/facet/strip.svg', seg || '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#10131c"/></svg>');
  return out;
}

/** LICENSE.txt of the plugin: the repo's MIT license, then Inter's OFL. */
export function licenseText({ root, ofl }) {
  const mit = [path.join(root, 'LICENSE'), path.join(root, '..', 'LICENSE')].find((p) => fs.existsSync(p));
  const head = mit ? fs.readFileSync(mit, 'utf8').trim() : 'MIT License\n\nCopyright (c) 2026 Jeremy Hall';
  return `Prism Deck plugin
=================

${head}


Third-party: Inter typeface
---------------------------
Key and dial text is drawn from Inter outlines; the property inspector embeds Inter WOFF2 subsets.
Inter is licensed under the SIL Open Font License 1.1 (also in ui/fonts/OFL.txt):

${String(ofl).trim()}
`;
}

const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => { const p = path.join(dir, e.name); return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')]; });

/**
 * Build the .sdPlugin folder. root = the prism-deck package dir; design = the repo's design/ dir.
 * → { dir, manifest, files: [rel paths], profiles }
 */
export function buildPluginFolder({ root, design = path.resolve(root, '..', 'design'), outDir = path.join(root, 'plugin', `${PLUGIN_UUID}.sdPlugin`), minSoftware = '7.6', version = PLUGIN_VERSION } = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  const put = (rel, data) => { const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); files.push(rel); };
  // engine
  put('bin/package.json', '{ "type": "module" }\n');
  put('bin/plugin.js', '// Prism Deck plugin entry (generated by scripts/build-plugin.mjs). Runs on the Stream Deck app\'s Node 20.\nimport { main } from \'./prism-deck/src/plugin/index.js\';\n\nmain().catch((e) => { process.stderr.write(`[prism-deck] fatal: ${e && (e.stack || e.message)}\\n`); process.exit(1); });\n');
  const engine = ['index.js', 'package.json', 'README.md', ...walk(path.join(root, 'src')).map((p) => `src/${p}`)].filter((p) => fs.existsSync(path.join(root, p)) && !ENGINE_EXCLUDE.some((re) => re.test(p)));
  for (const p of engine) put(`bin/prism-deck/${p}`, fs.readFileSync(path.join(root, p)));
  // property inspector
  for (const f of ['pi.html', 'pi.css', 'pi.js']) put(`ui/${f}`, fs.readFileSync(path.join(root, 'src', 'plugin', 'ui', f)));
  put('ui/catalog.js', piCatalogScript());
  for (const w of [400, 600, 700]) { const src = path.join(design, 'fonts', `inter-${w}-latin.woff2`); if (fs.existsSync(src)) put(`ui/fonts/inter-${w}-latin.woff2`, fs.readFileSync(src)); }
  // licenses: the plugin (MIT) and Inter (SIL OFL 1.1: the PI fonts and the outlines every key's text is drawn from)
  const ofl = fs.readFileSync(path.join(root, 'src', 'scene', 'fonts', 'OFL.txt'));
  put('ui/fonts/OFL.txt', ofl);
  put('LICENSE.txt', licenseText({ root, ofl }));
  // layouts + images
  put(CANVAS_LAYOUT_PATH, `${JSON.stringify(CANVAS_LAYOUT, null, '\t')}\n`);
  put(INFOBAR_LAYOUT_PATH, `${JSON.stringify(INFOBAR_LAYOUT, null, '\t')}\n`);
  const brand = path.join(design, 'brand', 'prism-icon-512.png');
  for (const im of pluginImages({ brandPng: fs.existsSync(brand) ? fs.readFileSync(brand) : null })) put(im.path, im.data);
  // profiles
  // bundled profile names come from settings.js BUNDLED_PROFILES (by DeviceType), the names switchToProfile uses
  const profiles = sampleProfiles({ pluginVersion: version }).filter((p) => minSoftware >= '7.6' || p.device !== 'neo').map((p) => ({ ...p, name: bundledProfileFor(p.deviceType) || `profiles/prism-${p.device.replace(/-2022$/, '')}` }));
  for (const p of profiles) put(`${p.name}.streamDeckProfile`, p.zip);
  const manifest = pluginManifest({ version, minSoftware, profiles });
  put('manifest.json', `${JSON.stringify(manifest, null, '\t')}\n`);
  return { dir: outDir, manifest, files, profiles };
}

/**
 * Validate a built folder: manifest + layouts against the official schemas (with the
 * filePath / imageDimensions checks), every SVG image in the deck subset, profiles
 * structurally, the entry present, nothing reads manifest.json at runtime (DRM).
 */
export function validatePluginFolder(dir, schemas) {
  const problems = [];
  const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (path.basename(dir) !== `${man.UUID}.sdPlugin`) problems.push(`folder must be named ${man.UUID}.sdPlugin`);
  if (schemas) {
    for (const e of validate(schemas.manifest, man, { baseDir: dir })) problems.push(`manifest ${e.path}: ${e.message}`);
    for (const a of man.Actions) {
      const lay = a.Encoder?.layout;
      if (lay && lay.endsWith('.json')) for (const e of validate(schemas.layout, JSON.parse(fs.readFileSync(path.join(dir, lay), 'utf8')))) problems.push(`${lay} ${e.path}: ${e.message}`);
    }
    for (const lay of [INFOBAR_LAYOUT_PATH]) if (fs.existsSync(path.join(dir, lay))) for (const e of validate(schemas.layout, JSON.parse(fs.readFileSync(path.join(dir, lay), 'utf8')))) problems.push(`${lay} ${e.path}: ${e.message}`);
  } else problems.push('official schemas not found (set PRISM_SD_SCHEMAS): manifest/layout schema validation skipped');
  for (const rel of walk(path.join(dir, 'imgs'))) if (rel.endsWith('.svg')) { const p = validateSvg(fs.readFileSync(path.join(dir, 'imgs', rel), 'utf8'), { maxBytes: 65536 }); if (p.length) problems.push(`imgs/${rel}: ${p[0]}`); }
  for (const p of man.Profiles || []) { const f = path.join(dir, `${p.Name}.streamDeckProfile`); if (!fs.existsSync(f)) problems.push(`profile ${p.Name} missing`); else for (const x of checkProfile(fs.readFileSync(f))) problems.push(`${p.Name}: ${x}`); }
  if (!fs.existsSync(path.join(dir, man.CodePath))) problems.push(`CodePath ${man.CodePath} missing`);
  for (const rel of walk(path.join(dir, 'bin')).filter((p) => p.endsWith('.js') && p.includes('/plugin/'))) if (/manifest\.json/.test(fs.readFileSync(path.join(dir, 'bin', rel), 'utf8'))) problems.push(`bin/${rel} mentions manifest.json (DRM: never read it at runtime)`);
  return problems;
}

/** Zip the folder (root entry = the .sdPlugin folder name). Logs and dotfiles are excluded like `streamdeck pack`. */
export function packPlugin(dir) {
  const name = path.basename(dir);
  const entries = walk(dir).filter((p) => !/(^|\/)\.|\.log$|\.js\.map$/.test(p)).sort().map((p) => ({ name: `${name}/${p}`, data: fs.readFileSync(path.join(dir, p)) }));
  return writeZip(entries);
}

/** Read back a .streamDeckPlugin and check it has exactly one <uuid>.sdPlugin root with a manifest. */
export function checkPluginPackage(buf) {
  const entries = readZip(buf);
  const roots = [...new Set(entries.map((e) => e.name.split('/')[0]))];
  const out = [];
  if (roots.length !== 1 || !roots[0].endsWith('.sdPlugin')) out.push(`root must be one <uuid>.sdPlugin folder, got ${roots.join(', ')}`);
  const man = entries.find((e) => e.name === `${roots[0]}/manifest.json`);
  if (!man) out.push('manifest.json missing');
  else if (`${JSON.parse(man.data.toString('utf8')).UUID}.sdPlugin` !== roots[0]) out.push('root folder must equal <manifest UUID>.sdPlugin');
  return { problems: out, entries: entries.length };
}
