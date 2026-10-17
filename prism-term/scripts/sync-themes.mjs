// Regenerate src/themes.js from Prism's theme registry.
//
// The MCP server's utils/themes.js is the documented mirror of the THEMES
// object in Prism.html. prism-term only needs the color tokens, packed for the
// terminal, so this script distills that mirror into a dependency-free module
// that ships inside the npm package (the sibling directory won't exist there).
//
// It also bakes in the terminal side of the Refraction design tokens
// (Prism-ds/design/tokens.json → `terminal`, `spectrum`): the ANSI-16 color
// schemes for Prism Night / Prism Day terminals, the designed xterm-256 index of
// each token and ANSI slot, the 12-stop spectrum and the terminal gallery hues
// (galleries.terminal), each with its designed xterm-256 indexes. Designed indexes
// for text are contrast-aware (design/tools/color.mjs pick256: >= 4.5:1 on every
// 256-color surface, marks >= 3:1); src/palettes.js pins them in the quantizer.
// Without tokens.json the SNAPSHOT block (tokens 1.1.0) is used and the output
// says so; the spectrum and gallery blocks already in src/themes.js are kept.
//
// ROLES — which ANSI slot each token is drawn with at 16-color depth, for text and
// for fills — are the terminal palette's own mapping (from the tokens' x16
// guidance); tokens.json may override them with terminal.<night|day>.roles.
//
//   node scripts/sync-themes.mjs           write src/themes.js
//   node scripts/sync-themes.mjs --check   exit 1 if src/themes.js is out of date

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'prism-mcp-server', 'utils', 'themes.js');
const TOKENS = path.resolve(HERE, '..', '..', 'design', 'tokens.json');
const OUT = path.resolve(HERE, '..', 'src', 'themes.js');
const KEYS = ['bg', 'panel', 'panel2', 'card', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const SLOT_NAMES = [...ANSI_NAMES, ...ANSI_NAMES.map((n) => 'bright' + n[0].toUpperCase() + n.slice(1))];
const SCHEME_KEYS = ['background', 'foreground', 'cursor', 'cursorText', 'selectionBackground', 'selectionForeground'];
const SCHEME_IDS = [['prism-dark', ['prism-dark', 'night', 'dark']], ['prism-light', ['prism-light', 'day', 'light']]];

// ── snapshot of design/tokens.json 1.3.0 `terminal` (used when it is absent) ───
const SNAPSHOT = {
  'prism-dark': {
    background: '#0a0c12', foreground: '#e6e6ef', cursor: '#b8a2f2', cursorText: '#0a0c12',
    selectionBackground: '#2e2748', selectionForeground: '#f0f0f5',
    ansi: ['#1d202b', '#f28885', '#7ad59c', '#ecca76', '#81aaf7', '#b8a2f2', '#67cfe3', '#c6c7d3',
      '#76798e', '#ffaaa7', '#a5eac1', '#f7e59f', '#aac8ff', '#d9c6fe', '#9eeaf2', '#f6f6fb'],
    tokens256: { bg: 232, panel: 233, line: 235, ink: 255, muted: 248, dim: 245, accent: 147, info: 111, pos: 115, warn: 215, neg: 210, crit: 211 },
  },
  'prism-light': {
    background: '#f8f7fb', foreground: '#23222f', cursor: '#7353bb', cursorText: '#ffffff',
    selectionBackground: '#ddd5f3', selectionForeground: '#20202e',
    ansi: ['#23222f', '#b73232', '#007240', '#835c00', '#2a5ec5', '#7353bb', '#006d7d', '#e6e5ee',
      '#55546a', '#cf354b', '#00823a', '#8d6c00', '#006fd8', '#a04ac2', '#007c87', '#ffffff'],
    tokens256: { bg: 255, panel: 231, line: 253, ink: 235, muted: 240, dim: 242, accent: 61, info: 25, pos: 23, warn: 94, neg: 160, crit: 125 },
  },
};

// Token → ANSI-16 slot as [text, fill] (one number = both); -1 = the terminal's own
// default color (SGR 39/49), so the theme background and ink ARE the terminal's —
// seamless on any scheme. Night: surfaces sit on black (0), hairlines and dim text
// on bright black (8), muted text on white (7). Day: white / bright white (7 / 15)
// are light, as in Solarized / Tango light — fills, never text on the background
// (src/color.js ansi16Text) — so light surfaces are the default background,
// hairlines and dim text take bright black (8) and light-on-color text uses 15. Hues follow the x16
// guidance: accent → magenta, info → blue, pos → green, warn → yellow, neg → red,
// crit (the magenta beyond red) → bright magenta; accent2 takes the blue slot
// nearest its periwinkle.
const ROLES = {
  'prism-dark': { bg: [0, -1], panel: 0, panel2: 0, card: 0, line: [8, 0], ink: [-1, 15], muted: 7, dim: 8, accent: 5, accent2: 12, info: 4, pos: 2, warn: 3, neg: 1, crit: 13 },
  'prism-light': { bg: [15, -1], panel: [15, -1], panel2: [15, -1], card: [15, -1], line: [8, 7], ink: [-1, 0], muted: 8, dim: 8, accent: 5, accent2: 4, info: 4, pos: 2, warn: 3, neg: 1, crit: 13 },
};

const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());
const pick = (o, ...names) => { for (const n of names) if (o && o[n] !== undefined) return o[n]; return undefined; };
const valueOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? pick(v, '$value', 'value', 'hex') : v);
const is256 = (v) => Number.isInteger(v) && v >= 16 && v <= 255;
const slotOf = (v) => (v === 'default' || v === -1 ? -1 : typeof v === 'number' ? v : SLOT_NAMES.indexOf(String(v)));

function rolesFrom(src, base) {
  const out = {};
  for (const k of KEYS) { const v = base[k]; out[k] = Array.isArray(v) ? [...v] : [v, v]; }
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src)) {
      const key = k.replace(/^--/, '');
      const pair = (Array.isArray(v) ? v : [v, v]).map(slotOf);
      if (KEYS.includes(key) && pair.length === 2 && pair.every((n) => n >= -1 && n < 16)) out[key] = pair;
    }
  }
  return out;
}

/** Read one terminal scheme out of tokens.json, tolerating the usual shapes. */
function schemeFromTokens(src, id) {
  const fallback = SNAPSHOT[id];
  let ansi = pick(src, 'ansi16', 'ansi', 'palette');
  if (ansi && !Array.isArray(ansi) && typeof ansi === 'object') {
    if (Array.isArray(ansi.normal) && Array.isArray(ansi.bright)) ansi = [...ansi.normal, ...ansi.bright];
    else ansi = SLOT_NAMES.map((n, i) => valueOf(pick(ansi, n, String(i))));
  }
  if (!ansi && Array.isArray(src.normal) && Array.isArray(src.bright)) ansi = [...src.normal, ...src.bright];
  if (Array.isArray(ansi) && ansi.every((a) => a && typeof a === 'object' && Number.isInteger(a.index))) ansi = [...ansi].sort((a, b) => a.index - b.index);
  ansi = (ansi || []).map(valueOf).map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v));
  if (ansi.length !== 16 || !ansi.every(isHex)) throw new Error(`design/tokens.json terminal (${id}): expected 16 #rrggbb ANSI colors`);
  const names = {
    background: ['background', 'bg'], foreground: ['foreground', 'fg'], cursor: ['cursor', 'cursorColor'],
    cursorText: ['cursorText', 'cursorFg'], selectionBackground: ['selectionBackground', 'selectionBg', 'selection'],
    selectionForeground: ['selectionForeground', 'selectionFg'],
  };
  const out = {};
  for (const k of SCHEME_KEYS) { const v = valueOf(pick(src, ...names[k])); out[k] = isHex(v) ? v.trim().toLowerCase() : fallback[k]; }
  out.ansi = ansi;
  out.roles = rolesFrom(pick(src, 'roles', 'slots'), ROLES[id]);
  const t256 = pick(src, 'tokens256', 'xterm256');
  out.tokens256 = t256 && typeof t256 === 'object'
    ? Object.fromEntries(Object.entries(t256).filter(([k, v]) => KEYS.includes(k) && is256(v)))
    : { ...fallback.tokens256 };
  // designed xterm-256 index per ANSI slot (tokens.json ansi16[].xterm256), when every slot has one
  const a256 = Array.isArray(src.ansi16) ? [...src.ansi16].sort((a, b) => a.index - b.index).map((a) => a && a.xterm256) : null;
  if (a256 && a256.length === 16 && a256.every(is256)) out.ansi256 = a256;
  return out;
}

/** The 12 spectrum stops (Night/Day ink + vivid tiers), their ANSI-16 slot and the ink's designed xterm-256 index. */
function spectrumFrom(json) {
  const stops = json?.spectrum?.stops;
  if (!Array.isArray(stops)) return null;
  const hue16 = json.terminal?.hueToAnsi16 || {};
  const x256 = (mode, name) => { const e = (json.terminal?.[mode]?.spectrum256 || []).find((x) => x.name === name); return e && is256(e.index) ? e.index : null; };
  return stops.map((st) => ({
    name: st.name, h: Math.round(st.h * 10) / 10, lambda: st.lambda,
    night: st.night.ink.hex, nightVivid: st.night.vivid.hex, day: st.day.ink.hex, dayVivid: st.day.vivid.hex,
    ansi16: Number.isInteger(hue16[st.name]) ? hue16[st.name] : null,
    night256: x256('night', st.name), day256: x256('day', st.name),
  }));
}

/** The terminal gallery hues (galleries.terminal) with their designed xterm-256 indexes (terminal.<mode>.galleries256). */
function galleriesFrom(json) {
  const list = json?.galleries?.terminal;
  if (!Array.isArray(list)) return null;
  const g256 = (mode, id) => json.terminal?.[mode]?.galleries256?.[id] || {};
  const ix = (v) => (is256(v) ? v : null);
  return list.map((g) => {
    const n = g256('night', g.id), d = g256('day', g.id);
    return {
      id: g.id, h: g.h, lambda: g.lambda,
      night: g.night.ink, nightVivid: g.night.vivid, day: g.day.ink, dayVivid: g.day.vivid,
      night256: ix(n.ink), nightVivid256: ix(n.vivid), day256: ix(d.ink), dayVivid256: ix(d.vivid),
    };
  });
}

function terminalSection() {
  const snapshot = () => Object.fromEntries(SCHEME_IDS.map(([id]) => [id, { ...SNAPSHOT[id], roles: rolesFrom(null, ROLES[id]) }]));
  const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (!fs.existsSync(TOKENS)) return { source: 'snapshot of design/tokens.json 1.1.0 (tokens.json not found)', schemes: snapshot(), spectrum: null, galleries: null, prev };
  const json = JSON.parse(fs.readFileSync(TOKENS, 'utf8'));
  const term = json.terminal;
  // (the tokens version is left out on purpose: src/themes.js only changes when data does)
  const version = '';
  if (!term) return { source: `snapshot (design/tokens.json${version} has no terminal section)`, schemes: snapshot(), spectrum: spectrumFrom(json), galleries: galleriesFrom(json), prev };
  const schemes = {};
  for (const [id, aliases] of SCHEME_IDS) {
    const src = pick(term, ...aliases);
    schemes[id] = src ? schemeFromTokens(src, id) : snapshot()[id];
  }
  return { source: `design/tokens.json${version}`, schemes, spectrum: spectrumFrom(json), galleries: galleriesFrom(json), prev };
}

const { THEMES, DEFAULT_THEME_ID } = await import(pathToFileURL(SRC).href);
let { source, schemes, spectrum, galleries, prev } = terminalSection();
// Without tokens.json, keep the spectrum and gallery blocks already baked into src/themes.js.
const prevBlock = (name) => {
  const m = (prev || '').replace(/\r\n/g, '\n').match(new RegExp(`\\nexport const ${name} = \\[\\n([\\s\\S]*?)\\n\\];`));
  return m ? { raw: m[1] } : null;
};
if (!spectrum) spectrum = prevBlock('SPECTRUM');
if (!galleries) galleries = prevBlock('TERMINAL_GALLERIES');

const rows = THEMES.map((t) => {
  const colors = KEYS.map((k) => `${k}: '${t.tokens['--' + k]}'`).join(', ');
  return `  { id: '${t.id}', name: ${JSON.stringify(t.name)}, ds: '${t.ds}', mode: '${t.mode}', ${colors} },`;
});

const schemeRows = Object.entries(schemes).map(([id, s]) => {
  const head = SCHEME_KEYS.map((k) => `${k}: '${s[k]}'`).join(', ');
  const ansi = s.ansi.map((c) => `'${c}'`);
  const roles = KEYS.map((k) => `${k}: [${s.roles[k].join(', ')}]`).join(', ');
  const t256 = Object.entries(s.tokens256 || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
  const a256 = s.ansi256 ? `\n    ansi256: [${s.ansi256.join(', ')}],` : '';
  return `  '${id}': {\n    ${head},\n    ansi: [${ansi.slice(0, 8).join(', ')},\n      ${ansi.slice(8).join(', ')}],${a256}\n    roles: { ${roles} },\n    tokens256: { ${t256} },\n  },`;
});
const spectrumBody = !spectrum ? '' : spectrum.raw ?? spectrum.map((st) =>
  `  { name: '${st.name}', h: ${st.h}, lambda: '${st.lambda}', night: '${st.night}', nightVivid: '${st.nightVivid}', day: '${st.day}', dayVivid: '${st.dayVivid}', ansi16: ${st.ansi16}, night256: ${st.night256}, day256: ${st.day256} },`).join('\n');
const galleryBody = !galleries ? '' : galleries.raw ?? galleries.map((g) =>
  `  { id: '${g.id}', h: ${g.h}, lambda: '${g.lambda}', night: '${g.night}', nightVivid: '${g.nightVivid}', day: '${g.day}', dayVivid: '${g.dayVivid}', night256: ${g.night256}, nightVivid256: ${g.nightVivid256}, day256: ${g.day256}, dayVivid256: ${g.dayVivid256} },`).join('\n');

const body = `// GENERATED by scripts/sync-themes.mjs from prism-mcp-server/utils/themes.js — do not edit.
// Prism's design-system themes, reduced to the color tokens a terminal can use.

export const DEFAULT_THEME_ID = '${DEFAULT_THEME_ID}';

export const THEME_DATA = [
${rows.join('\n')}
];

// Terminal color schemes for the Prism themes — source: ${source}.
// ansi: the 16 ANSI slots (0–7 normal, 8–15 bright) a terminal set to this scheme
// shows; roles: the [text, fill] slot each theme token is drawn with at 16-color
// depth (-1 = the terminal's default color); tokens256 / ansi256: designed xterm-256
// indexes (text and ANSI text slots: >= 4.5:1 on every 256-color surface).
export const TERMINAL_SCHEMES = {
${schemeRows.join('\n')}
};

// Refraction's spectrum: 12 OKLCH stops, violet → rose (decreasing hue), each with
// Night/Day ink (text-safe) and vivid (fill) tiers, its ANSI-16 slot, and the ink's
// designed xterm-256 index (night256 / day256).
export const SPECTRUM = [
${spectrumBody}
];

// The terminal catalog's gallery hues (galleries.terminal: one λ per gallery across surfaces —
// a gallery with a web twin takes the web hue, terminal-only ones take free half-steps): ink (text) and vivid (marks) per
// mode, with designed xterm-256 indexes (ink >= 4.5:1, vivid >= 3:1 on every
// 256-color surface). src/refraction.js reads these.
export const TERMINAL_GALLERIES = [
${galleryBody}
];
`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (cur !== body) { console.error('src/themes.js is out of date — run `npm run sync-themes`'); process.exit(1); }
  console.log(`src/themes.js up to date (${THEMES.length} themes; terminal: ${source})`);
} else {
  fs.writeFileSync(OUT, body);
  console.log(`wrote ${THEMES.length} themes → ${path.relative(process.cwd(), OUT)} (terminal: ${source})`);
}
