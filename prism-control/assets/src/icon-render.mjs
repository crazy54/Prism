// Rendering for the Prism Control icon family (used by build-icons.mjs; import it for previews and boards).
// Every SVG it returns follows the Stream Deck app's Qt rules: hex colors + opacity attributes, no clipPath, no <text>.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICONS, arc } from './icons.src.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ------------------------------------------------------------------------------------------- tokens

function palettes() {
  const cs = readFileSync(join(ROOT, 'src/PrismControl.Core/Render/Tokens/Refraction.g.cs'), 'utf8');
  const hex = (s) => '#' + [...s.matchAll(/0x([0-9a-f]{2})/gi)].map((m) => m[1].toLowerCase()).join('');
  const block = (name) => {
    const start = cs.indexOf(`public static RefractionPalette ${name} {`);
    const end = cs.indexOf('};', cs.indexOf('Spectrum =', start));
    return cs.slice(start, end);
  };
  const one = (b, key) => hex(new RegExp(`\\b${key} = new Color\\(([^)]*)\\)`).exec(b)[1]);
  const read = (name) => {
    const b = block(name);
    const material = [.../KeyMaterial = \[(.*)\]/.exec(b)[1].matchAll(/new GradientStop\(([0-9.]+), new Color\(([^)]*)\)\)/g)].map((m) => [+m[1], hex(m[2])]);
    const edge = /KeyEdge = Paint\.Solid\(new Color\(([^)]*)\)(?:, ([0-9.]+))?\)/.exec(b);
    const spectrum = [...b.matchAll(/new\("(\w+)", ([0-9.]+), "([^"]+)", new Color\(([^)]*)\), new Color\(([^)]*)\)/g)]
      .map((m) => ({ name: m[1], lambda: m[3], ink: hex(m[4]), vivid: hex(m[5]) }));
    return {
      name: name.toLowerCase(), dark: name === 'Night', material, edge: hex(edge[1]), edgeOpacity: edge[2] ? +edge[2] : 1,
      ink: one(b, 'KeyInk'), muted: one(b, 'KeyMuted'), faint: one(b, 'Faint'), panel2: one(b, 'Panel2'), spectrum,
    };
  };
  return { night: read('Night'), day: read('Day') };
}

function domainHues() {
  const cs = readFileSync(join(ROOT, 'src/PrismControl.Core/Art/Art.cs'), 'utf8');
  const body = /public static int\? Index\(string domain\) => domain switch\s*\{([\s\S]*?)\};/.exec(cs)[1];
  return Object.fromEntries([...body.matchAll(/"(\w+)" => (\d+)/g)].map((m) => [m[1], +m[2]]));
}

export const T = palettes();
export const HUES = domainHues();
// White light (Hues.White): unrefracted ink. Keep in sync with Art.cs.
export const WHITE = { night: { name: 'white', lambda: 'D65', ink: '#f0f0f5', vivid: '#f6f3ff' }, day: { name: 'white', lambda: 'D65', ink: '#20202e', vivid: '#55556a' } };
export const hueOf = (t, domain) => (domain in HUES ? t.spectrum[HUES[domain]] : WHITE[t.name]);

// ------------------------------------------------------------------------------------------- svg

const n = (v) => String(+(+v).toFixed(3));
const op = (v) => (v === undefined || v >= 1 ? '' : n(v));

/** The glyph's paths. paint: { ink, accent, facet, facetOpacity } — facet null = no facet fill (action list). */
export function glyphMarkup(id, paint) {
  const parts = ICONS[id];
  if (!parts) throw new Error(`no glyph "${id}"`);
  let out = '';
  const facets = parts.filter((p) => p[0] === 'f');
  if (paint.facet) for (const [, d, o] of facets) out += `<path d="${d}" fill="${paint.facet}" fill-opacity="${n((o ?? 1) * paint.facetOpacity)}" stroke="none"/>`;
  for (const [k, d, o] of parts) {
    if (k === 's' || k === 'a') out += `<path d="${d}" stroke="${k === 'a' ? paint.accent : paint.ink}"${op(o) ? ` stroke-opacity="${op(o)}"` : ''}/>`;
    else if (k === 'd' || k === 'ad') out += `<path d="${d}" fill="${k === 'ad' ? paint.accent : paint.ink}"${op(o) ? ` fill-opacity="${op(o)}"` : ''} stroke="none"/>`;
  }
  return out;
}

const STROKE_G = (extra = '') => `<g fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"${extra}>`;

/** Action-list icon: 20×20, monochrome #FFFFFF on transparent (the app tints it). */
export function listIcon(id, size = 20) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${STROKE_G()}${glyphMarkup(id, { ink: '#ffffff', accent: '#ffffff', facet: null })}</g></svg>`;
}

/** The deck key body (KeyArt.Base): material radial lit from the top center + the 2 px lit top edge. */
function keyBody(t, uid) {
  const stops = t.material.map(([o, c]) => `<stop offset="${n(o)}" stop-color="${c}"/>`).join('');
  return {
    defs: `<radialGradient id="${uid}m" cx="72" cy="0" r="172.8" gradientUnits="userSpaceOnUse" gradientTransform="translate(72 0) scale(1 0.75) translate(-72 0)">${stops}</radialGradient>`,
    body: `<rect width="144" height="144" fill="url(#${uid}m)"/><rect width="144" height="2" fill="${t.edge}"${t.edgeOpacity < 1 ? ` fill-opacity="${n(t.edgeOpacity)}"` : ''}/>`,
  };
}

const keyPaint = (t, hue, on = false) => ({ ink: on ? hue.ink : t.ink, accent: hue.ink, facet: hue.vivid, facetOpacity: (t.dark ? 0.22 : 0.18) * (on ? 1.4 : 1) });

/**
 * Default key image (deck grammar, tokens.json deck.states): the glyph in a 72-unit box (stroke 4.5 @144 = 2.25 @72),
 * optically centered a little above the middle, over the hue index. Off = index at 45 %. On = index lit with a glow,
 * a 3 px inner ring in the hue and a 22 % hue wash rising from the bottom (the manifest ships "off").
 */
export function keyImage(id, t, hue, { on = false, uid = 'k' } = {}) {
  const { defs, body } = keyBody(t, uid);
  let extraDefs = '', light = '', index = `<rect x="56" y="130" width="32" height="4" rx="2" fill="${hue.vivid}" fill-opacity="0.45"/>`;
  if (on) {
    extraDefs = `<radialGradient id="${uid}w" cx="72" cy="144" r="100.8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${hue.vivid}" stop-opacity="0.22"/><stop offset="1" stop-color="${hue.vivid}" stop-opacity="0"/></radialGradient>` +
      `<filter id="${uid}g" x="-0.5" y="-2" width="2" height="5" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    light = `<rect width="144" height="144" fill="url(#${uid}w)"/><rect x="1.5" y="1.5" width="141" height="141" rx="6" fill="none" stroke="${hue.vivid}" stroke-width="3"/>`;
    index = `<rect x="56" y="130" width="32" height="4" rx="2" fill="${hue.vivid}" filter="url(#${uid}g)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><defs>${defs}${extraDefs}</defs>${body}${light}` +
    `${STROKE_G(' transform="translate(36 30) scale(3)"')}${glyphMarkup(id, keyPaint(t, hue, on))}</g>${index}</svg>`;
}

/** EncoderIcon: the glyph inside a knob scale (gap at the bottom), the lit arc and its dot in the hue. */
export function dialIcon(id, t, hue, uid = 'd') {
  const { defs, body } = keyBody(t, uid);
  const R = 57, track = arc(72, 72, R, 135, 405), lit = arc(72, 72, R, 135, 300);
  const [kx, ky] = [72 + R * Math.cos((300 * Math.PI) / 180), 72 + R * Math.sin((300 * Math.PI) / 180)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><defs>${defs}</defs>${body}` +
    `<path d="${track}" fill="none" stroke="${t.muted}" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="${lit}" fill="none" stroke="${hue.vivid}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="${n(kx)}" cy="${n(ky)}" r="6" fill="${hue.ink}"/>` +
    `${STROKE_G(' transform="translate(42 42) scale(2.5)"')}${glyphMarkup(id, keyPaint(t, hue))}</g></svg>`;
}

/** Category icon: the mark, 28×28 white. */
export function categoryIcon(size = 28) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${STROKE_G()}${glyphMarkup('prism-control', { ink: '#ffffff', accent: '#ffffff', facet: null })}</g></svg>`;
}

/**
 * The plugin icon master (rasterized to imgs/plugin/icon.png 256 and icon@2x.png 512 by raster-plugin-icon.mjs).
 * Prism Deck's tile (ink-navy glass, lit top edge, violet pool) with Prism's glass mark, set inside a control dial whose
 * lit arc carries the spectrum; the knob dot is the point of light at the arc's end. Family with Prism Deck, but its own.
 */
export function pluginIconSvg(size = 512) {
  const cx = 32, cy = 34.5, R = 21.5, a0 = 135, a1 = 330, a2 = 405;
  const k = [cx + R * Math.cos((a1 * Math.PI) / 180), cy + R * Math.sin((a1 * Math.PI) / 180)];
  // Prism mark geometry (Prism-ds brand): apex 20,4 · base 4..36 @ 33 · front edge to 25; placed at scale 0.78.
  const s = 0.78, tx = cx - 20 * s, ty = cy - 18.5 * s - 1.2;
  const M = (x, y) => `${n(tx + x * s)} ${n(ty + y * s)}`;
  const G = (x1, y1, x2, y2) => `x1="${n(tx + x1 * s)}" y1="${n(ty + y1 * s)}" x2="${n(tx + x2 * s)}" y2="${n(ty + y2 * s)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<defs>
<linearGradient id="tb" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#171a27"/><stop offset="1" stop-color="#0a0c12"/></linearGradient>
<linearGradient id="te" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<radialGradient id="th" cx=".5" cy=".6" r=".5"><stop stop-color="#9177f2" stop-opacity=".3"/><stop offset="1" stop-color="#9177f2" stop-opacity="0"/></radialGradient>
<linearGradient id="arc" x1="${n(cx - R)}" y1="${n(cy + R)}" x2="${n(cx + R)}" y2="${n(cy - R * 0.4)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ab91eb"/><stop offset=".3" stop-color="#52acee"/><stop offset=".55" stop-color="#52cea0"/><stop offset=".8" stop-color="#ebc059"/><stop offset="1" stop-color="#ec8398"/></linearGradient>
<linearGradient id="e" ${G(6, 4, 36, 33)} gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ece6ff"/><stop offset=".5" stop-color="#b8a2f2"/><stop offset="1" stop-color="#64ceea"/></linearGradient>
<linearGradient id="l" ${G(11, 5, 17, 33)} gradientUnits="userSpaceOnUse"><stop stop-color="#e2d9ff" stop-opacity=".46"/><stop offset=".55" stop-color="#ab91eb" stop-opacity=".14"/><stop offset="1" stop-color="#839ef4" stop-opacity=".04"/></linearGradient>
<linearGradient id="r" ${G(22, 5, 33, 33)} gradientUnits="userSpaceOnUse"><stop stop-color="#839ef4" stop-opacity=".07"/><stop offset="1" stop-color="#52cea0" stop-opacity=".17"/></linearGradient>
<linearGradient id="f" ${G(20, 4, 25, 33)} gradientUnits="userSpaceOnUse"><stop stop-color="#ffffff"/><stop offset=".62" stop-color="#ffffff" stop-opacity=".38"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>
<radialGradient id="a"><stop stop-color="#ffffff"/><stop offset=".35" stop-color="#ffffff" stop-opacity=".7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-1" y="-1" width="3" height="3" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="64" height="64" rx="14" fill="url(#tb)"/>
<rect width="64" height="64" rx="14" fill="url(#th)"/>
<path d="M14 .6h36" stroke="url(#te)" stroke-width="1.2"/>
<path d="${arc(cx, cy, R, a1, a2)}" fill="none" stroke="#ffffff" stroke-opacity=".13" stroke-width="2.2" stroke-linecap="round"/>
<path d="${arc(cx, cy, R, a0, a1)}" fill="none" stroke="url(#arc)" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
<g filter="url(#glow)"><circle cx="${n(k[0])}" cy="${n(k[1])}" r="2.1" fill="#ffffff"/></g>
<path d="M${M(20, 4)} ${M(25, 33)}L${M(4, 33)}Z" fill="url(#l)"/>
<path d="M${M(20, 4)} ${M(36, 33)}L${M(25, 33)}Z" fill="url(#r)"/>
<path d="M${M(20, 4)} ${M(36, 33)}L${M(4, 33)}Z" fill="none" stroke="url(#e)" stroke-width="1.7" stroke-linejoin="round"/>
<path d="M${M(20, 4)} ${M(25, 33)}" fill="none" stroke="url(#f)" stroke-width="1.25" stroke-linecap="round"/>
<circle cx="${n(tx + 20 * s)}" cy="${n(ty + 4 * s)}" r="1.7" fill="url(#a)"/>
</svg>
`;
}

// ------------------------------------------------------------------------------------------- C# glyph table

export function iconsCs() {
  const kind = { s: 'Stroke', a: 'Accent', f: 'Facet', d: 'Solid', ad: 'AccentSolid' };
  const lines = Object.entries(ICONS).map(([id, parts]) =>
    `        new("${id}", [${parts.map(([k, d, o]) => `new(IconInk.${kind[k]}, "${d}"${o !== undefined && o < 1 ? `, ${n(o)}` : ''})`).join(', ')}]),`);
  return `// <auto-generated>
// Generated by assets/src/build-icons.mjs from assets/src/icons.src.mjs. Do not edit: change the source and rebuild.
// </auto-generated>

namespace PrismControl.Core.Art;

public static partial class Icons
{
    private static readonly IconGlyph[] Generated =
    [
${lines.join('\n')}
    ];
}
`;
}

