// Regenerate the DATA block of src/devices.js from the hardware research.
//
//   node scripts/gen-devices.mjs                    research/devices.json → src/devices.js
//   node scripts/gen-devices.mjs --check            exit 1 if src/devices.js is out of date
//   node scripts/gen-devices.mjs --research <file>  another devices.json (or env DECK_RESEARCH)
//
// The research file carries confidence + sources; runtime keeps only what
// rendering needs. Drawing geometry the research doesn't state (grid origins
// from Elgato's pixel layouts, strip/screen rects, body sizes, dial placement)
// lives in GEOMETRY below. docs/devices.md is written alongside (the human view,
// with confidence notes).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'src', 'devices.js');
const DOC = path.join(ROOT, 'docs', 'devices.md');

const CLASSIC = { origin: [11, 5], body: { w: 602, h: 428, r: 36 } };
const CLASSIC_MODULE = { origin: [11, 5], body: { w: 540, h: 330, r: 12 } };
const MINI = { origin: [14, 26], gapX: 27.5, body: { w: 478, h: 340, r: 34 } };
const MINI_MODULE = { origin: [14, 26], gapX: 27.5, body: { w: 420, h: 330, r: 12 } };
const XL = { origin: [14, 47], gapX: 32.29, body: { w: 1176, h: 730, r: 50 } };
const XL_MODULE = { origin: [14, 47], gapX: 32.29, body: { w: 1100, h: 680, r: 14 } };

// research id → runtime id + drawing geometry (native panel px)
export const GEOMETRY = {
  'sd-original-v1': { id: 'original', family: 'classic', aliases: ['original-v1', 'gen1'], ...CLASSIC },
  'sd-original-v2': { id: 'original-v2', family: 'classic', aliases: ['2019'], ...CLASSIC },
  'sd-mk2': { id: 'mk2', family: 'classic', aliases: ['standard', '15-key'], ...CLASSIC },
  'sd-scissor': { id: 'scissor', family: 'classic', aliases: ['scissor-keys'], ...CLASSIC },
  'sd-module-15': { id: 'module-15', family: 'classic', ...CLASSIC_MODULE },
  'sd-module-15-scissor': { id: 'module-15-scissor', family: 'classic', ...CLASSIC_MODULE },
  'sd-mini': { id: 'mini', family: 'mini', ...MINI },
  'sd-mini-2022': { id: 'mini-2022', family: 'mini', aliases: ['mini-mk2'], ...MINI },
  'sd-mini-discord': { id: 'mini-discord', family: 'mini', ...MINI },
  'sd-module-6': { id: 'module-6', family: 'mini', ...MINI_MODULE },
  'sd-xl-v1': { id: 'xl', family: 'xl', aliases: ['xl-v1'], ...XL },
  'sd-xl-2022': { id: 'xl-2022', family: 'xl', ...XL },
  'sd-module-32': { id: 'module-32', family: 'xl', ...XL_MODULE },
  'sd-neo': { id: 'neo', family: 'neo', origin: [3, 9], body: { w: 620, h: 452, r: 40 },
    screen: { kind: 'infobar', rect: [116, 262, 248, 58], layout: { w: 232, h: 50 } },
    draw: { touch: [[3, 283, 96, 16, 'left'], [381, 283, 96, 16, 'right']] } },
  'sd-plus': { id: 'plus', family: 'plus', aliases: ['sd+', 'stream-deck-plus'], origin: [13, 12], body: { w: 1036, h: 1010, r: 70 },
    draw: { panelY: 118, dials: { d: 156, y: 760, under: 'columns' } } },
  'sd-plus-xl': { id: 'plusxl', family: 'plus', aliases: ['plus-xl', 'sd+xl'], origin: [11, 32], body: { w: 1480, h: 1290, r: 76 },
    draw: { panelY: 100, dials: { d: 150, y: 1060, pitch: 216 } } },
  'sd-studio': { id: 'studio', family: 'studio', origin: [20, 20], panel: { w: 2584, h: 280 }, body: { w: 3110, h: 430, r: 26 },
    draw: { dials: { d: 180, y: 215, xs: [130, 2980], ring: true } } },
  'sd-pedal': { id: 'pedal', family: 'pedal', body: { w: 980, h: 520, r: 60 }, draw: { capW: 253, capH: 340, capGap: 30, capR: 44 } },
  'sd-network-dock': { id: 'network-dock', family: 'accessory', body: { w: 600, h: 200, r: 30 } },
  'sd-mobile': { id: 'mobile', family: 'virtual', generic: [5, 3] },
  'virtual-stream-deck': { id: 'virtual', family: 'virtual', aliases: ['vsd'], generic: [8, 4] },
  'mcp-deck': { id: 'mcp', family: 'virtual', aliases: ['mcp-deck', 'ai-stream-deck'], generic: [8, 4], type: 14 },
  'corsair-galleon-100-sd': { id: 'galleon', name: 'Corsair Galleon 100 SD', family: 'galleon', aliases: ['galleon-100-sd', 'gretsch'], origin: [56, 443], body: { w: 880, h: 1660, r: 44 },
    screen: { kind: 'galleon', rect: [0, 0, 720, 384], layout: { w: 200, h: 100 }, widgets: { cols: 2, rows: 2, w: 360, h: 180, pitchX: 360, pitchY: 192, insetX: 0, insetY: 6 } },
    draw: { panelY: 300, dials: { d: 150, y: 150, xs: [240, 640] } } },
  'corsair-galleon-pro-80-sd': { id: 'galleon-pro-80', name: 'Corsair Galleon PRO 80 SD', family: 'galleon', aliases: ['marshall'], software: true },
  'corsair-g-keys': { id: 'g-keys', name: 'Corsair G-Keys', model: null, family: 'corsair', software: true, generic: [6, 1] },
  'corsair-voyager': { id: 'voyager', name: 'Corsair Voyager', family: 'corsair', software: true },
  'scuf-envision': { id: 'scuf', name: 'SCUF Envision', family: 'corsair', software: true, grid: [5, 1] },
  'corsair-xeneon-edge': { id: 'xeneon-edge', name: 'Corsair Xeneon Edge', family: 'corsair', generic: [8, 2], type: 11, screen: { kind: 'monitor', w: 2560, h: 720 } },
  'corsair-nightsword-v2-sd': { id: 'nightsword', name: 'Corsair Nightsword v2 Wireless SD', family: 'corsair', software: true, grid: [4, 2] },
  'corsair-vanguard': { id: 'vanguard', name: 'Corsair Vanguard 96 / 99', family: 'corsair', software: true, grid: [7, 1] },
  'sd-plus-lever': { id: 'plus-lever', name: 'Stream Deck + Lever', family: 'fictional', hidden: true },
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function deviceRecords(research) {
  const out = [];
  for (const r of research) {
    const G = GEOMETRY[r.id];
    if (!G) throw new Error(`devices.json has "${r.id}", which gen-devices.mjs has no GEOMETRY entry for — add one`);
    const k = r.keys || {};
    const native = k.nativePx ? { w: k.nativePx.w, h: k.nativePx.h } : null;
    const cols = num(k.cols) ?? G.grid?.[0] ?? G.generic?.[0] ?? 0, rows = num(k.rows) ?? G.grid?.[1] ?? G.generic?.[1] ?? 0;
    const display = G.hidden ? 'none' : native ? 'lcd' : (G.software || G.generic) && cols ? 'software' : k.px ? 'software' : 'none';
    const type = G.type ?? r.sdkDeviceType?.value ?? null;
    const d = {
      id: G.id, name: G.name ?? r.name.replace(/\s*\(.*?\)\s*$/, '').replace(/^CORSAIR /, 'Corsair ').replace(/ - .*$/, '').trim(), vendor: r.vendor, type, model: G.model !== undefined ? G.model : typeof r.profileModel === 'string' ? r.profileModel.split(/ \(| string |;/)[0].trim() : null,
      status: r.status, released: r.released, family: G.family, aliases: G.aliases || [],
      cols, rows, keyPx: display === 'lcd' ? native : display === 'software' ? { w: 144, h: 144 } : null, display,
      sdk: !G.hidden && G.id !== 'studio' && G.id !== 'network-dock' && G.id !== 'xeneon-edge-panel', generic: !!G.generic,
    };
    if (G.hidden) d.hidden = true;
    if (display === 'lcd') {
      const gx = G.gapX ?? r.keyGapPx?.x ?? 25, gy = r.keyGapPx?.y ?? gx;
      const pw = r.panelPx?.w ?? G.panel?.w, ph = r.panelPx?.h ?? G.panel?.h;
      d.panel = { w: pw, h: ph, x0: G.origin[0], y0: G.origin[1], gapX: gx, gapY: gy };
    }
    const dl = r.dials || {};
    d.dials = { count: dl.count || 0, press: !!dl.press, touch: !!dl.touch, rotate: !!dl.rotate, ...(dl.layers ? { layers: dl.layers } : {}) };
    const ts = r.touchStrip;
    d.strip = ts ? { w: ts.w, h: ts.h, segments: ts.segments, rect: ts.panelRect } : null;
    d.screen = G.screen ? { kind: G.screen.kind, w: G.screen.w ?? G.screen.rect[2], h: G.screen.h ?? G.screen.rect[3], rect: G.screen.rect || null, layout: G.screen.layout || null, ...(G.screen.widgets ? { widgets: G.screen.widgets } : {}) } : null;
    if (G.body) d.body = G.body;
    if (G.draw) d.draw = G.draw;
    out.push(d);
  }
  return out;
}

function fmt(obj) {
  // one device per line-ish, compact but diff-friendly
  return `[\n${obj.map((d) => `  ${JSON.stringify(d)}`).join(',\n')},\n]`;
}

function devicesDoc(research, records) {
  const rows = research.filter((r) => !GEOMETRY[r.id].hidden).map((r) => {
    const d = records.find((x) => x.id === GEOMETRY[r.id].id);
    const k = d.keyPx ? `${d.keyPx.w}×${d.keyPx.h}` : '—';
    const extras = [d.dials.count ? `${d.dials.count} dials${d.dials.touch ? ' + touch' : ''}${d.dials.layers ? ` × ${d.dials.layers} layers` : ''}` : '', d.strip ? `strip ${d.strip.w}×${d.strip.h} (${d.strip.segments} seg)` : '', d.screen ? `${d.screen.kind} ${d.screen.w}×${d.screen.h}` : ''].filter(Boolean).join(' · ');
    return `| \`${d.id}\` | ${d.name} | ${d.type ?? '—'} | ${d.cols && d.rows ? `${d.cols}×${d.rows}` : 'app-defined'} | ${k} | ${d.display}${d.generic ? ' (grid from app)' : ''} | ${extras || '—'} | ${String(r.confidence || '').split(/[;(]/)[0].trim()} |`;
  });
  return `# Devices

GENERATED by \`scripts/gen-devices.mjs\` from the hardware research (\`research/devices.json\`, \`research/hardware.md\`). Edit the generator, not this file.

Every model below is in \`src/devices.js\` (\`getDevice(id | alias | DeviceType)\`). Units are **native panel px**: keys are windows onto one LCD; gaps between them are hidden pixels, which is what makes \`span\` surfaces line up across the bezel.

| id | device | SDK type | grid | native key px | display | controls | confidence |
|---|---|---|---|---|---|---|---|
${rows.join('\n')}

Not modeled as a renderable device: *Stream Deck + Lever* (an April Fools 2026 joke — kept in the data as \`hidden\`).

## Surfaces per device

- **key** — one key at its native px (\`keySize(device)\`): 72 (classic 15-key, modules), 80 (Mini), 96 (XL, Neo), 112 (+ XL), 120 (+), 144×112 (Studio — not square), 160 (Galleon 100 SD). Software-only keys (Corsair G-keys, Voyager, SCUF, Nightsword, Vanguard, Mobile, Virtual Stream Deck, MCP Deck) use the SDK's 144.
- **span** — \`spanGrid(device, { col, row, cols, rows })\`: a block of keys including the physical gaps (gap/key ratios from Elgato's pixel layouts: classic 25/72, Mini 27.5/80 × 28/80, XL 32.29/96 × 39/96, Neo 30/96, + 99/120 × 40/120 — the + has very wide column gaps — + XL 31.5/112, Galleon 64/160, Studio 16/144 estimated).
- **strip** — Stream Deck + 800×100 (4 segments), + XL 1200×100 (6). Each dial owns one 200×100 segment; a plugin can't draw across the strip in one call, so strip art is sliced per dial.
- **screen** — Galleon 100 SD 720×384 (top of a 720×1280 portrait LCD; 2 dials × 2 layers = 4 widgets shown at once, 2×2. Each scales the full 200×100 layout **uniformly** into a 2:1 window — the hardware lab saw 2:1 in the app preview, so we assume **360×180 centered in each 360×192 quadrant (a 6 px gutter above and below each widget; the app draws its active-layer highlight there)** until a device photo confirms it), Neo info bar 248×58 native / **232×50** SDK layout (display-only, app 7.6+), Xeneon Edge 2560×720 (a monitor hosting Virtual Stream Decks).
- **deck** — \`deckLayout(device)\`: the whole panel (keys + strip + screen) as one canvas.

## Gotchas worth knowing

- **Galleon 100 SD**: dial long-press (~3 s) switches widget layers — never bind long-press; no touch; coordinates \`"dial,layer"\`; the user owns one, so it is a first-class target.
- **+ XL**: 6 dials across 9 key columns — dials do not line up with key columns.
- **Studio**: 144×112 keys, 2 LED-ring dials, runs Bitfocus Companion (no Stream Deck app profiles); reachable through hidraw/Companion, not the plugin.
- **setImage** takes SVG / PNG / JPEG / WEBP data URLs and never animates GIFs: animation = streaming frames (Elgato guidance: ≤ 10 updates/s; benchmark aggregate throughput).
- Marketplace plugin manifests are encrypted on disk (\`ELGATO\\x01\\x00\`); never read your own manifest at runtime (DRM).
- App 7.4+ has an "MCP Deck" virtual device (type 14, not in the published enum).
- OpenDeck on Linux runs Elgato Node \`.sdPlugin\` plugins unchanged but reports platform "windows" — detect the OS with \`process.platform\`.
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--research');
  const candidates = [i >= 0 ? path.resolve(args[i + 1]) : null, process.env.DECK_RESEARCH,
    path.resolve(ROOT, '..', '..', 'aaa-prism-deck-team', 'research', 'devices.json'),
    path.resolve(ROOT, '..', '..', 'aaa-prism-ds', 'handoff-from-prism-e0', 'research', 'devices.json')].filter(Boolean);
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) { console.error(`devices.json not found (tried ${candidates.join(', ')})`); process.exit(1); }
  const research = JSON.parse(fs.readFileSync(src, 'utf8'));
  const records = deviceRecords(research);
  const cur = fs.readFileSync(OUT, 'utf8');
  const a = cur.indexOf('// <generated by scripts/gen-devices.mjs>'), b = cur.indexOf('// </generated>');
  if (a < 0 || b < 0) { console.error('src/devices.js lacks the generated markers'); process.exit(1); }
  const next = `${cur.slice(0, a)}// <generated by scripts/gen-devices.mjs>\nexport const DATA = ${fmt(records)};\n${cur.slice(b)}`;
  const doc = devicesDoc(research, records);
  if (args.includes('--check')) {
    const stale = [];
    if (next !== cur) stale.push('src/devices.js');
    if (!fs.existsSync(DOC) || fs.readFileSync(DOC, 'utf8') !== doc) stale.push('docs/devices.md');
    if (stale.length) { console.error(`${stale.join(' and ')} out of date — run \`node scripts/gen-devices.mjs\``); process.exit(1); }
    console.log(`devices up to date (${records.length} models)`);
  } else {
    fs.writeFileSync(OUT, next);
    fs.mkdirSync(path.dirname(DOC), { recursive: true });
    fs.writeFileSync(DOC, doc);
    console.log(`wrote src/devices.js (${records.length} models from ${path.relative(ROOT, src)}) and docs/devices.md`);
  }
}
