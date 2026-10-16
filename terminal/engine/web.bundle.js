// prism-term browser engine, bundled by website/build.mjs (the modules are in the repository under prism-term/src).
const __d = [], __c = [];
function __m(id) {
  let ns = __c[id];
  if (ns) return ns;
  ns = __c[id] = Object.create(null);
  Object.defineProperty(ns, Symbol.toStringTag, { value: 'Module' });
  __d[id](ns);
  return ns;
}
function __e(ns, own, stars, keep) {
  const get = Object.assign(Object.create(null), own);
  for (const id of stars) { const from = __m(id); for (const k of Object.keys(from)) if (!(k in get)) get[k] = () => from[k]; }
  for (const k of keep) Object.defineProperty(ns, k, { enumerable: true, get: get[k] });
  Object.preventExtensions(ns);
}
__d[0] = function (__ns) {

__e(__ns, { "NONE": () => NONE, "rgb": () => rgb, "red": () => red, "green": () => green, "blue": () => blue, "toRgb": () => toRgb, "toHex": () => toHex, "hex": () => hex, "hsl": () => hsl, "hsv": () => hsv, "parse": () => parse, "mix": () => mix, "scale": () => scale, "add": () => add, "luminance": () => luminance, "distance2": () => distance2, "toOklab": () => toOklab, "fromOklab": () => fromOklab, "mixOklab": () => mixOklab, "gradient": () => gradient, "ANSI16": () => ANSI16, "nearest256": () => nearest256, "exact256": () => exact256, "pin256": () => pin256, "pinned256": () => pinned256, "to256": () => to256, "to16": () => to16, "setAnsi16Role": () => setAnsi16Role, "ansi16Fg": () => ansi16Fg, "ansi16Bg": () => ansi16Bg, "normalizeDepth": () => normalizeDepth, "ansi16Text": () => ansi16Text, "fgParam": () => fgParam, "bgParam": () => bgParam }, [], ["ANSI16","NONE","add","ansi16Bg","ansi16Fg","ansi16Text","bgParam","blue","distance2","exact256","fgParam","fromOklab","gradient","green","hex","hsl","hsv","luminance","mix","mixOklab","nearest256","normalizeDepth","parse","pin256","pinned256","red","rgb","scale","setAnsi16Role","to16","to256","toHex","toOklab","toRgb"]);
const NONE = -1;
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rgb = (r, g, b) => (clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b);
const red = (c) => (c >> 16) & 255;
const green = (c) => (c >> 8) & 255;
const blue = (c) => c & 255;
const toRgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
function toHex(c) {
if (c === NONE) return 'none';
return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}
function hex(str) {
let s = String(str).trim().replace(/^#/, '');
if (s.length === 3 || s.length === 4) s = s.slice(0, 3).split('').map((ch) => ch + ch).join('');
if (!/^[0-9a-f]{6}/i.test(s)) throw new Error(`invalid hex color: ${str}`);
return parseInt(s.slice(0, 6), 16);
}
function hsl(h, s, l) {
h = ((h % 360) + 360) % 360 / 360;
const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
const p = 2 * l - q;
const f = (t) => {
if (t < 0) t += 1;
if (t > 1) t -= 1;
if (t < 1 / 6) return p + (q - p) * 6 * t;
if (t < 1 / 2) return q;
if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
return p;
};
return rgb(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}
function hsv(h, s, v) {
h = ((h % 360) + 360) % 360 / 60;
const i = Math.floor(h), f = h - i;
const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
return rgb(r * 255, g * 255, b * 255);
}
const NAMED = {
black: 0x000000, white: 0xffffff, red: 0xff0000, green: 0x00ff00, blue: 0x0000ff,
yellow: 0xffff00, cyan: 0x00ffff, magenta: 0xff00ff, orange: 0xffa500, purple: 0x800080,
pink: 0xffc0cb, gray: 0x808080, grey: 0x808080, transparent: NONE, none: NONE, default: NONE,
};
function parse(v) {
if (v == null) return NONE;
if (typeof v === 'number') return v;
if (Array.isArray(v)) return rgb(v[0], v[1], v[2]);
const s = String(v).trim().toLowerCase();
if (s in NAMED) return NAMED[s];
if (s.startsWith('#') || /^[0-9a-f]{6}$/.test(s)) return hex(s);
const m = s.match(/^(?:rgba?\()?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
if (m) return rgb(+m[1], +m[2], +m[3]);
throw new Error(`unrecognized color: ${v}`);
}
function mix(a, b, t) {
if (a === NONE) return b;
if (b === NONE) return a;
return rgb(
((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t),
((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t),
(a & 255) + (((b & 255) - (a & 255)) * t),
);
}
function scale(c, k) {
if (c === NONE) return NONE;
return rgb(((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k);
}
function add(a, b) {
if (a === NONE) return b;
if (b === NONE) return a;
return rgb(((a >> 16) & 255) + ((b >> 16) & 255), ((a >> 8) & 255) + ((b >> 8) & 255), (a & 255) + (b & 255));
}
function luminance(c) {
if (c === NONE) return 0;
return (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;
}
function distance2(a, b) {
const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
const db = (a & 255) - (b & 255);
return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}
const toLin = (u) => (u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
const toGam = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055);
function toOklab(c) {
const r = toLin(((c >> 16) & 255) / 255), g = toLin(((c >> 8) & 255) / 255), b = toLin((c & 255) / 255);
const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
return [
0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
];
}
function fromOklab([L, A, B]) {
const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
return rgb(
toGam(clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)) * 255,
toGam(clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)) * 255,
toGam(clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)) * 255,
);
}
function mixOklab(a, b, t) {
if (a === NONE) return b;
if (b === NONE) return a;
const x = toOklab(a), y = toOklab(b);
return fromOklab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}
function gradient(stops, { cyclic = false, space = 'oklab', size = 256 } = {}) {
let pts = stops.map((s, i) =>
Array.isArray(s) && s.length === 2 && typeof s[0] === 'number' && s[0] <= 1
? [s[0], parse(s[1])]
: [stops.length === 1 ? 0 : i / (stops.length - 1), parse(s)]);
if (cyclic) pts = [...pts.map(([p, c]) => [p * (pts.length - 1) / pts.length, c]), [1, pts[0][1]]];
const lerp = space === 'rgb' ? mix : mixOklab;
const lut = new Int32Array(size);
for (let i = 0; i < size; i++) {
const t = i / (size - 1);
let k = 0;
while (k < pts.length - 2 && t > pts[k + 1][0]) k++;
const [p0, c0] = pts[k], [p1, c1] = pts[Math.min(k + 1, pts.length - 1)];
lut[i] = p1 === p0 ? c0 : lerp(c0, c1, clamp01((t - p0) / (p1 - p0)));
}
const last = size - 1;
const fn = cyclic
? (t) => lut[((Math.floor(t * size) % size) + size) % size]
: (t) => lut[t <= 0 ? 0 : t >= 1 ? last : (t * last) | 0];
fn.lut = lut;
fn.at = (i) => lut[i < 0 ? 0 : i > last ? last : i | 0];
return fn;
}
const ANSI16 = [
0x000000, 0xcd0000, 0x00cd00, 0xcdcd00, 0x0000ee, 0xcd00cd, 0x00cdcd, 0xe5e5e5,
0x7f7f7f, 0xff0000, 0x00ff00, 0xffff00, 0x5c5cff, 0xff00ff, 0x00ffff, 0xffffff,
];
const CUBE = [0, 95, 135, 175, 215, 255];
const FAMILY16 = [[18, 5], [50, 1], [116, 3], [178, 2], [232, 6], [283, 4], [360, 5]];
let BRIGHT_AT = null; 
function classify16(L, a, b) {
const C = Math.sqrt(a * a + b * b);
if (L < 0.3 && C < 0.11) return 0;
if (C < 0.045) return L < 0.3 ? 0 : L < 0.76 ? 8 : L < 0.96 ? 7 : 15;
let h = Math.atan2(b, a) * 57.29577951308232;
if (h < 0) h += 360;
let fam = 5;
for (const [end, slot] of FAMILY16) if (h < end) { fam = slot; break; }
BRIGHT_AT ||= ANSI16.slice(0, 8).map((c, i) => (toOklab(c)[0] + toOklab(ANSI16[i + 8])[0]) / 2);
return L > BRIGHT_AT[fam] ? fam + 8 : fam;
}
function compute16(c) {
const [L, a, b] = toOklab(c);
return classify16(L, a, b);
}
let LUT256 = null, LUT16 = null;
const key18 = (c) => (((c >> 18) & 63) << 12) | (((c >> 10) & 63) << 6) | ((c >> 2) & 63);
function buildLut(fn) {
const lut = new Uint8Array(1 << 18);
for (let k = 0; k < lut.length; k++) {
const r = ((k >> 12) & 63) * 4 + 2, g = ((k >> 6) & 63) * 4 + 2, b = (k & 63) * 4 + 2;
lut[k] = fn((r << 16) | (g << 8) | b);
}
return lut;
}
const labInto = (R, G, B, out, o) => {
const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
};
const lin255 = (v) => toLin(v / 255);
let PAL256 = null; 
function pal256() {
if (PAL256) return PAL256;
PAL256 = new Float64Array(240 * 3);
for (let k = 0; k < 240; k++) {
const r = k < 216 ? CUBE[(k / 36) | 0] : 8 + (k - 216) * 10;
const g = k < 216 ? CUBE[((k / 6) | 0) % 6] : r;
const b = k < 216 ? CUBE[k % 6] : r;
labInto(lin255(r), lin255(g), lin255(b), PAL256, k * 3);
}
return PAL256;
}
function nearest256(c) {
const pal = pal256(), p = new Float64Array(3);
labInto(lin255((c >> 16) & 255), lin255((c >> 8) & 255), lin255(c & 255), p, 0);
let best = 0, bd = Infinity;
for (let k = 0, o = 0; k < 240; k++, o += 3) {
const dl = p[0] - pal[o], da = p[1] - pal[o + 1], db = p[2] - pal[o + 2];
const d = dl * dl + da * da + db * db;
if (d < bd) { bd = d; best = k; }
}
return 16 + best;
}
function buildLut256() {
const pal = pal256();
const L6 = new Float64Array(64), LV = new Uint8Array(64);
for (let i = 0; i < 64; i++) {
const v = Math.round(i * 255 / 63); 
L6[i] = lin255(v);
let j = 0;
while (j < 5 && CUBE[j + 1] <= v) j++;
LV[i] = j;
}
const lut = new Uint8Array(1 << 18), p = new Float64Array(3);
for (let key = 0; key < lut.length; key++) {
const ri = key >> 12, gi = (key >> 6) & 63, bi = key & 63;
labInto(L6[ri], L6[gi], L6[bi], p, 0);
const P0 = p[0], P1 = p[1], P2 = p[2];
let best = 0, bd = Infinity;
const r1 = LV[ri] < 5 ? LV[ri] + 1 : 5, g1 = LV[gi] < 5 ? LV[gi] + 1 : 5, b1 = LV[bi] < 5 ? LV[bi] + 1 : 5;
for (let x = LV[ri] > 0 ? LV[ri] - 1 : 0; x <= r1; x++) {
for (let y = LV[gi] > 0 ? LV[gi] - 1 : 0; y <= g1; y++) {
for (let z = LV[bi] > 0 ? LV[bi] - 1 : 0; z <= b1; z++) {
const k = 36 * x + 6 * y + z, o = k * 3;
const dl = P0 - pal[o], da = P1 - pal[o + 1], db = P2 - pal[o + 2];
const d = dl * dl + da * da + db * db;
if (d < bd) { bd = d; best = k; }
}
}
}
const gc = Math.max(0, Math.min(23, Math.round(((ri + gi + bi) * 255 / 189 - 8) / 10)));
for (let j = gc > 3 ? gc - 3 : 0, je = gc < 20 ? gc + 3 : 23; j <= je; j++) {
const o = (216 + j) * 3;
const dl = P0 - pal[o], da = P1 - pal[o + 1], db = P2 - pal[o + 2];
const d = dl * dl + da * da + db * db;
if (d < bd) { bd = d; best = 216 + j; }
}
lut[key] = 16 + best;
}
for (const c of EXACT256) lut[key18(c)] = nearest256(c);
for (const [k, i] of PIN256) lut[k] = i;
return lut;
}
const EXACT256 = new Set();
function exact256(...colors) {
for (const c of colors) {
if (c === NONE) continue;
EXACT256.add(c & 0xffffff);
if (LUT256 && !PIN256.has(key18(c))) LUT256[key18(c)] = nearest256(c & 0xffffff);
}
}
const PIN256 = new Map(); 
function pin256(c, index) {
if (c === NONE || !Number.isInteger(index) || index < 16 || index > 255) return;
const k = key18(c & 0xffffff);
PIN256.set(k, index);
if (LUT256) LUT256[k] = index;
}
function pinned256(c) { return PIN256.get(key18(c & 0xffffff)); }
function to256(c) { return (LUT256 ||= buildLut256())[key18(c)]; }
function buildLut16() {
const L6 = new Float64Array(64);
for (let i = 0; i < 64; i++) L6[i] = lin255(Math.round(i * 255 / 63));
const lut = new Uint8Array(1 << 18), p = new Float64Array(3);
for (let key = 0; key < lut.length; key++) {
labInto(L6[key >> 12], L6[(key >> 6) & 63], L6[key & 63], p, 0);
lut[key] = classify16(p[0], p[1], p[2]);
}
return lut;
}
function to16(c) { return (LUT16 ||= buildLut16())[key18(c)]; }
const ROLE16 = new Map();
function setAnsi16Role(c, fg, bg = fg) { ROLE16.set(c & 0xffffff, [fg, bg]); }
function ansi16Fg(c) { const r = ROLE16.get(c); return r ? r[0] : to16(c); }
function ansi16Bg(c) { const r = ROLE16.get(c); return r ? r[1] : to16(c); }
function normalizeDepth(d) {
if (d === 24 || d === '24' || d === 'truecolor' || d === '24bit' || d === 3 || d === '3') return 'truecolor';
if (d === 8 || d === '8' || d === '256' || d === 256 || d === 2 || d === '2') return '256';
if (d === 4 || d === '4' || d === '16' || d === 16 || d === 1 || d === '1') return '16';
return 'mono';
}
function ansi16Text(c, onBg, light = false) {
const n = c === NONE ? -1 : ansi16Fg(c);
if (!light) return n;
const b = onBg === undefined || onBg === NONE ? -1 : ansi16Bg(onBg);
const lightFill = b < 0 || b === 7 || b === 15;
if (n === 7 || n === 15) return lightFill ? 8 : n;
if (n === -1 || n === 0 || n === 8) return lightFill ? n : 15;
return n;
}
function fgParam(c, depth, onBg, light = false) {
if (depth === 'mono' || (c === NONE && !(light && depth === '16'))) return '39';
if (depth === 'truecolor') return `38;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
if (depth === '256') return `38;5;${to256(c)}`;
const n = ansi16Text(c, onBg, light);
return n < 0 ? '39' : String(n < 8 ? 30 + n : 82 + n);
}
function bgParam(c, depth) {
if (c === NONE || depth === 'mono') return '49';
if (depth === 'truecolor') return `48;2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
if (depth === '256') return `48;5;${to256(c)}`;
const n = ansi16Bg(c);
return n < 0 ? '49' : String(n < 8 ? 40 + n : 92 + n);
}
};
__d[1] = function (__ns) {

__e(__ns, { "DEFAULT_THEME_ID": () => DEFAULT_THEME_ID, "THEME_DATA": () => THEME_DATA, "TERMINAL_SCHEMES": () => TERMINAL_SCHEMES, "SPECTRUM": () => SPECTRUM, "TERMINAL_GALLERIES": () => TERMINAL_GALLERIES }, [], ["DEFAULT_THEME_ID","SPECTRUM","TERMINAL_GALLERIES","TERMINAL_SCHEMES","THEME_DATA"]);
const DEFAULT_THEME_ID = 'prism-dark';
const THEME_DATA = [
{ id: 'prism-dark', name: "Prism Night", ds: 'prism', mode: 'dark', bg: '#0a0c12', panel: '#10131c', panel2: '#171a25', card: '#12151f', line: '#252834', ink: '#f0f0f5', muted: '#a2a4b4', dim: '#8a8c9d', accent: '#b8a2f2', accent2: '#a8b9fc', info: '#86bdf9', pos: '#8bd8ba', warn: '#eec36f', neg: '#f5877f', crit: '#f07fb3' },
{ id: 'prism-light', name: "Prism Day", ds: 'prism', mode: 'light', bg: '#f6f5f9', panel: '#ffffff', panel2: '#f0eff6', card: '#fdfcff', line: '#dedce9', ink: '#20202e', muted: '#55556a', dim: '#68687c', accent: '#7353bb', accent2: '#4a62c6', info: '#2461bf', pos: '#1f6b4f', warn: '#8a5a00', neg: '#bf3434', crit: '#b0256f' },
{ id: 'cloudscape-dark', name: "Cloudscape Dark", ds: 'cloudscape', mode: 'dark', bg: '#0f1621', panel: '#192534', panel2: '#232f3e', card: '#1a2633', line: '#354150', ink: '#e9ebed', muted: '#a4b0c0', dim: '#6b7887', accent: '#539fe5', accent2: '#539fe5', info: '#539fe5', pos: '#37c26b', warn: '#f5b74e', neg: '#eb6f6f', crit: '#c471ff' },
{ id: 'cloudscape-light', name: "Cloudscape Light", ds: 'cloudscape', mode: 'light', bg: '#f2f3f3', panel: '#ffffff', panel2: '#fafafa', card: '#ffffff', line: '#d5dbdb', ink: '#16191f', muted: '#5f6b7a', dim: '#8d99a8', accent: '#0972d3', accent2: '#0972d3', info: '#0972d3', pos: '#037f0c', warn: '#e07400', neg: '#d91515', crit: '#8b5cf6' },
{ id: 'duolingo-dark', name: "Duolingo Dark", ds: 'duolingo', mode: 'dark', bg: '#131f24', panel: '#202f36', panel2: '#1b2a30', card: '#202f36', line: '#37464f', ink: '#f1f7fb', muted: '#a5b4bd', dim: '#6b7c85', accent: '#58cc02', accent2: '#58cc02', info: '#1cb0f6', pos: '#89e219', warn: '#ff9600', neg: '#ff4b4b', crit: '#ce82ff' },
{ id: 'duolingo-light', name: "Duolingo Light", ds: 'duolingo', mode: 'light', bg: '#f7f7f7', panel: '#ffffff', panel2: '#fbfbfb', card: '#ffffff', line: '#e5e5e5', ink: '#3c3c3c', muted: '#777777', dim: '#afafaf', accent: '#58cc02', accent2: '#58cc02', info: '#1cb0f6', pos: '#89e219', warn: '#ff9600', neg: '#ff4b4b', crit: '#ce82ff' },
{ id: 'mailchimp-dark', name: "Mailchimp Dark", ds: 'mailchimp', mode: 'dark', bg: '#241c15', panel: '#302720', panel2: '#2a221b', card: '#302720', line: '#463b30', ink: '#f7f3ea', muted: '#c2b6a4', dim: '#8a7d6c', accent: '#ffe01b', accent2: '#ffe01b', info: '#3fb6c3', pos: '#5cc95c', warn: '#ffab3f', neg: '#f0685a', crit: '#e069a0' },
{ id: 'mailchimp-light', name: "Mailchimp Light", ds: 'mailchimp', mode: 'light', bg: '#fbf9f4', panel: '#ffffff', panel2: '#f6f2e9', card: '#ffffff', line: '#e6e0d3', ink: '#241c15', muted: '#6b6357', dim: '#a89f90', accent: '#ffe01b', accent2: '#ffe01b', info: '#007c89', pos: '#3caa3c', warn: '#ff9d1c', neg: '#e0503f', crit: '#c8467c' },
{ id: 'stackoverflow-dark', name: "Stack Overflow Dark", ds: 'stackoverflow', mode: 'dark', bg: '#1e1e1e', panel: '#2d2d2d', panel2: '#262626', card: '#2d2d2d', line: '#3d3d3d', ink: '#e7e8eb', muted: '#9fa6ad', dim: '#6e767d', accent: '#f48024', accent2: '#f48024', info: '#4aa3ff', pos: '#5eba7d', warn: '#e3b341', neg: '#f4676c', crit: '#c264d6' },
{ id: 'stackoverflow-light', name: "Stack Overflow Light", ds: 'stackoverflow', mode: 'light', bg: '#f8f9f9', panel: '#ffffff', panel2: '#f1f2f3', card: '#ffffff', line: '#d6d9dc', ink: '#232629', muted: '#6a737c', dim: '#9fa6ad', accent: '#f48024', accent2: '#f48024', info: '#0074cc', pos: '#2f6f44', warn: '#b8860b', neg: '#d1383d', crit: '#9c2bad' },
{ id: 'monzo-dark', name: "Monzo Dark", ds: 'monzo', mode: 'dark', bg: '#06060a', panel: '#14161c', panel2: '#1c1f27', card: '#14161c', line: '#2a2e38', ink: '#f4f5f7', muted: '#a2a7b3', dim: '#6b7280', accent: '#ff4f40', accent2: '#ff4f40', info: '#1fc7d6', pos: '#6cc551', warn: '#ffc266', neg: '#f2555a', crit: '#b46ce6' },
{ id: 'monzo-light', name: "Monzo Light", ds: 'monzo', mode: 'light', bg: '#fafbfc', panel: '#ffffff', panel2: '#f2f4f8', card: '#ffffff', line: '#e6e9ef', ink: '#14233c', muted: '#6b7385', dim: '#9aa2b1', accent: '#ff4f40', accent2: '#ff4f40', info: '#00a4b3', pos: '#52b03a', warn: '#ffb74a', neg: '#e5484d', crit: '#9d4edd' },
{ id: 'heroku-dark', name: "Heroku Dark", ds: 'heroku', mode: 'dark', bg: '#1a1523', panel: '#2a2338', panel2: '#201a2b', card: '#2a2338', line: '#3a3350', ink: '#f2eef8', muted: '#b0a6c2', dim: '#7a7090', accent: '#79589f', accent2: '#79589f', info: '#8b96e2', pos: '#56c483', warn: '#edb455', neg: '#e26075', crit: '#cc63b3' },
{ id: 'heroku-light', name: "Heroku Light", ds: 'heroku', mode: 'light', bg: '#faf9fc', panel: '#ffffff', panel2: '#f4f1f9', card: '#ffffff', line: '#e4e0ec', ink: '#2a2734', muted: '#6f6a7d', dim: '#a49db3', accent: '#79589f', accent2: '#79589f', info: '#6f7bd6', pos: '#3fae6b', warn: '#e0a13a', neg: '#d0455f', crit: '#b5479f' },
{ id: 'polaris-dark', name: "Shopify Polaris Dark", ds: 'polaris', mode: 'dark', bg: '#0b0c0d', panel: '#202223', panel2: '#1a1c1d', card: '#202223', line: '#3f4246', ink: '#e3e5e7', muted: '#999fa4', dim: '#71767a', accent: '#008060', accent2: '#008060', info: '#4b9bff', pos: '#4ade80', warn: '#e6b800', neg: '#ff6b52', crit: '#ff5470' },
{ id: 'polaris-light', name: "Shopify Polaris Light", ds: 'polaris', mode: 'light', bg: '#f6f6f7', panel: '#ffffff', panel2: '#fafbfb', card: '#ffffff', line: '#e1e3e5', ink: '#202223', muted: '#6d7175', dim: '#8c9196', accent: '#008060', accent2: '#008060', info: '#2c6ecb', pos: '#007f5f', warn: '#b98900', neg: '#d72c0d', crit: '#bf0711' },
{ id: 'primer-dark', name: "GitHub Primer Dark", ds: 'primer', mode: 'dark', bg: '#0d1117', panel: '#161b22', panel2: '#161b22', card: '#161b22', line: '#30363d', ink: '#e6edf3', muted: '#7d8590', dim: '#6e7681', accent: '#2f81f7', accent2: '#2f81f7', info: '#2f81f7', pos: '#3fb950', warn: '#d29922', neg: '#f85149', crit: '#a371f7' },
{ id: 'primer-light', name: "GitHub Primer Light", ds: 'primer', mode: 'light', bg: '#ffffff', panel: '#f6f8fa', panel2: '#f6f8fa', card: '#ffffff', line: '#d1d9e0', ink: '#1f2328', muted: '#59636e', dim: '#6e7781', accent: '#0969da', accent2: '#0969da', info: '#0969da', pos: '#1a7f37', warn: '#9a6700', neg: '#cf222e', crit: '#8250df' },
{ id: 'antd-dark', name: "Ant Design Dark", ds: 'antd', mode: 'dark', bg: '#141414', panel: '#1f1f1f', panel2: '#262626', card: '#1f1f1f', line: '#424242', ink: '#e6e6e6', muted: '#a6a6a6', dim: '#737373', accent: '#1668dc', accent2: '#1668dc', info: '#1668dc', pos: '#49aa19', warn: '#d89614', neg: '#dc4446', crit: '#cb2b83' },
{ id: 'antd-light', name: "Ant Design Light", ds: 'antd', mode: 'light', bg: '#f5f5f5', panel: '#ffffff', panel2: '#fafafa', card: '#ffffff', line: '#d9d9d9', ink: '#141414', muted: '#595959', dim: '#8c8c8c', accent: '#1677ff', accent2: '#1677ff', info: '#1677ff', pos: '#52c41a', warn: '#faad14', neg: '#ff4d4f', crit: '#eb2f96' },
{ id: 'acorn-dark', name: "Firefox Acorn Dark", ds: 'acorn', mode: 'dark', bg: '#1c1b22', panel: '#2b2a33', panel2: '#42414d', card: '#2b2a33', line: '#52525e', ink: '#fbfbfe', muted: '#bfbfc9', dim: '#8f8f9d', accent: '#ff7139', accent2: '#ff7139', info: '#0a84ff', pos: '#2ac3a2', warn: '#ffbd4f', neg: '#ff6a75', crit: '#c069ff' },
{ id: 'acorn-light', name: "Firefox Acorn Light", ds: 'acorn', mode: 'light', bg: '#f9f9fb', panel: '#ffffff', panel2: '#f0f0f4', card: '#ffffff', line: '#cfcfd8', ink: '#15141a', muted: '#5b5b66', dim: '#8f8f9d', accent: '#ff7139', accent2: '#ff7139', info: '#0060df', pos: '#017a5a', warn: '#a47f00', neg: '#d70022', crit: '#8000d7' },
{ id: 'material3-dark', name: "Material Design 3 Dark", ds: 'material3', mode: 'dark', bg: '#1c1b1f', panel: '#1d1b20', panel2: '#2b2930', card: '#211f26', line: '#49454f', ink: '#e6e1e5', muted: '#cac4d0', dim: '#938f99', accent: '#d0bcff', accent2: '#efb8c8', info: '#9fcaff', pos: '#6edd8a', warn: '#f5bd3f', neg: '#f2b8b5', crit: '#efb8c8' },
{ id: 'material3-light', name: "Material Design 3 Light", ds: 'material3', mode: 'light', bg: '#fffbfe', panel: '#f7f2fa', panel2: '#ece6f0', card: '#f3edf7', line: '#cac4d0', ink: '#1c1b1f', muted: '#49454f', dim: '#79747e', accent: '#6750a4', accent2: '#7d5260', info: '#35618e', pos: '#146c2e', warn: '#7d5700', neg: '#b3261e', crit: '#7d5260' },
];
const TERMINAL_SCHEMES = {
'prism-dark': {
background: '#0a0c12', foreground: '#e6e6ef', cursor: '#b8a2f2', cursorText: '#0a0c12', selectionBackground: '#2e2748', selectionForeground: '#f0f0f5',
ansi: ['#1d202b', '#f28885', '#7ad59c', '#ecca76', '#81aaf7', '#b8a2f2', '#67cfe3', '#c6c7d3',
'#76798e', '#ffaaa7', '#a5eac1', '#f7e59f', '#aac8ff', '#d9c6fe', '#9eeaf2', '#f6f6fb'],
ansi256: [234, 210, 79, 186, 111, 147, 80, 251, 102, 217, 151, 222, 153, 189, 152, 231],
roles: { bg: [0, -1], panel: [0, 0], panel2: [0, 0], card: [0, 0], line: [8, 0], ink: [-1, 15], muted: [7, 7], dim: [8, 8], accent: [5, 5], accent2: [12, 12], info: [4, 4], pos: [2, 2], warn: [3, 3], neg: [1, 1], crit: [13, 13] },
tokens256: { bg: 232, panel: 233, panel2: 234, card: 233, line: 235, ink: 255, muted: 248, dim: 245, accent: 147, accent2: 147, info: 111, pos: 115, warn: 215, neg: 210, crit: 211 },
},
'prism-light': {
background: '#f8f7fb', foreground: '#23222f', cursor: '#7353bb', cursorText: '#ffffff', selectionBackground: '#ddd5f3', selectionForeground: '#20202e',
ansi: ['#23222f', '#b73232', '#007240', '#835c00', '#2a5ec5', '#7353bb', '#006d7d', '#e6e5ee',
'#55546a', '#cf354b', '#00823a', '#8d6c00', '#006fd8', '#a04ac2', '#007c87', '#ffffff'],
ansi256: [235, 124, 22, 94, 26, 61, 24, 254, 240, 160, 22, 94, 26, 91, 23, 231],
roles: { bg: [15, -1], panel: [15, -1], panel2: [15, -1], card: [15, -1], line: [8, 7], ink: [-1, 0], muted: [8, 8], dim: [8, 8], accent: [5, 5], accent2: [4, 4], info: [4, 4], pos: [2, 2], warn: [3, 3], neg: [1, 1], crit: [13, 13] },
tokens256: { bg: 255, panel: 231, panel2: 255, card: 231, line: 253, ink: 235, muted: 240, dim: 242, accent: 61, accent2: 61, info: 25, pos: 23, warn: 94, neg: 160, crit: 125 },
},
};
const SPECTRUM = [
{ name: 'violet', h: 296, lambda: 'λ 436', night: '#c2aef8', nightVivid: '#ab91eb', day: '#7555b8', dayVivid: '#9876e3', ansi16: 5, night256: 147, day256: 61 },
{ name: 'periwinkle', h: 269.8, lambda: 'λ 472', night: '#a2b9ff', nightVivid: '#839ef4', day: '#4961bf', dayVivid: '#6783ec', ansi16: 4, night256: 147, day256: 61 },
{ name: 'azure', h: 243.6, lambda: 'λ 479', night: '#7fc4fb', nightVivid: '#52acee', day: '#006ca9', dayVivid: '#0090de', ansi16: 4, night256: 117, day256: 25 },
{ name: 'cerulean', h: 217.5, lambda: 'λ 485', night: '#64ceea', nightVivid: '#00b8db', day: '#007188', dayVivid: '#0096b3', ansi16: 6, night256: 81, day256: 24 },
{ name: 'cyan', h: 191.3, lambda: 'λ 492', night: '#61d5d0', nightVivid: '#00c3be', day: '#007471', dayVivid: '#009995', ansi16: 6, night256: 80, day256: 23 },
{ name: 'mint', h: 165.1, lambda: 'λ 510', night: '#7dd9b2', nightVivid: '#52cea0', day: '#007655', dayVivid: '#009c71', ansi16: 2, night256: 115, day256: 23 },
{ name: 'jade', h: 138.9, lambda: 'λ 554', night: '#a5d996', nightVivid: '#94d582', day: '#2e760f', dayVivid: '#4c9b32', ansi16: 2, night256: 150, day256: 22 },
{ name: 'lime', h: 112.7, lambda: 'λ 569', night: '#ccd381', nightVivid: '#c9d168', day: '#686c00', dayVivid: '#8a8f00', ansi16: 10, night256: 186, day256: 58 },
{ name: 'citrine', h: 86.5, lambda: 'λ 578', night: '#eac779', nightVivid: '#ebc059', day: '#836300', dayVivid: '#ac8300', ansi16: 3, night256: 186, day256: 94 },
{ name: 'amber', h: 60.4, lambda: 'λ 585', night: '#fab880', nightVivid: '#f8a75f', day: '#9c5600', dayVivid: '#cc7300', ansi16: 3, night256: 216, day256: 94 },
{ name: 'coral', h: 34.2, lambda: 'λ 597', night: '#ffaa96', nightVivid: '#f69077', day: '#b2432a', dayVivid: '#de6448', ansi16: 1, night256: 216, day256: 124 },
{ name: 'rose', h: 8, lambda: 'λ 494c', night: '#faa2b2', nightVivid: '#ec8398', day: '#b13f5d', dayVivid: '#de5f7d', ansi16: 13, night256: 217, day256: 125 },
];
const TERMINAL_GALLERIES = [
{ id: 'fx', h: 279.1, lambda: 'λ 467', night: '#adb5ff', nightVivid: '#9299f3', day: '#5b5cbe', dayVivid: '#7a7eeb', night256: 147, nightVivid256: 105, day256: 61, dayVivid256: 68 },
{ id: 'objects', h: 228.2, lambda: 'λ 483', night: '#6dcaf2', nightVivid: '#2cb3e4', day: '#007093', dayVivid: '#0094c1', night256: 81, nightVivid256: 38, day256: 24, dayVivid256: 31 },
{ id: 'sim', h: 270.6, lambda: 'λ 471', night: '#a3b9ff', nightVivid: '#859ef4', day: '#4a60bf', dayVivid: '#6882ec', night256: 147, nightVivid256: 111, day256: 61, dayVivid256: 68 },
{ id: 'retro', h: 219.8, lambda: 'λ 485', night: '#65cdeb', nightVivid: '#0ab7dd', day: '#00718a', dayVivid: '#0096b6', night256: 81, nightVivid256: 38, day256: 24, dayVivid256: 31 },
{ id: 'text', h: 194.4, lambda: 'λ 492', night: '#60d4d3', nightVivid: '#00c2c1', day: '#007474', dayVivid: '#009999', night256: 80, nightVivid256: 37, day256: 23, dayVivid256: 30 },
{ id: 'loaders', h: 168.9, lambda: 'λ 506', night: '#77d8b7', nightVivid: '#48cda4', day: '#00765a', dayVivid: '#009c78', night256: 115, nightVivid256: 43, day256: 23, dayVivid256: 29 },
{ id: 'progress', h: 135.1, lambda: 'λ 558', night: '#abd893', nightVivid: '#9dd57e', day: '#3b7500', dayVivid: '#579927', night256: 150, nightVivid256: 114, day256: 22, dayVivid256: 64 },
{ id: 'charts', h: 296, lambda: 'λ 436', night: '#c2aef8', nightVivid: '#ab91eb', day: '#7555b8', dayVivid: '#9876e3', night256: 147, nightVivid256: 140, day256: 61, dayVivid256: 98 },
{ id: 'ai', h: 245.2, lambda: 'λ 479', night: '#81c4fc', nightVivid: '#55abef', day: '#006cad', dayVivid: '#008fe2', night256: 117, nightVivid256: 75, day256: 25, dayVivid256: 32 },
{ id: 'status', h: 143.5, lambda: 'λ 550', night: '#9ed99b', nightVivid: '#89d487', day: '#1a781f', dayVivid: '#3d9c3e', night256: 150, nightVivid256: 114, day256: 22, dayVivid256: 64 },
{ id: 'ops', h: 84.2, lambda: 'λ 578', night: '#ecc679', nightVivid: '#edbe59', day: '#856200', dayVivid: '#af8200', night256: 186, nightVivid256: 215, day256: 94, dayVivid256: 100 },
{ id: 'diagrams', h: 126.6, lambda: 'λ 563', night: '#b8d78b', nightVivid: '#afd575', day: '#527100', dayVivid: '#6d9600', night256: 150, nightVivid256: 150, day256: 58, dayVivid256: 64 },
{ id: 'callouts', h: 109.6, lambda: 'λ 570', night: '#d0d280', nightVivid: '#ced065', day: '#6c6b00', dayVivid: '#8f8e00', night256: 186, nightVivid256: 185, day256: 58, dayVivid256: 100 },
{ id: 'input', h: 211.3, lambda: 'λ 487', night: '#60d0e4', nightVivid: '#00bbd3', day: '#007282', dayVivid: '#0097ac', night256: 80, nightVivid256: 38, day256: 24, dayVivid256: 31 },
{ id: 'maps', h: 160.5, lambda: 'λ 519', night: '#83d9ad', nightVivid: '#5fd09a', day: '#00774e', dayVivid: '#009d68', night256: 115, nightVivid256: 79, day256: 22, dayVivid256: 29 },
{ id: 'lab', h: 262.1, lambda: 'λ 474', night: '#98bcff', nightVivid: '#76a2f4', day: '#3664be', dayVivid: '#5487eb', night256: 147, nightVivid256: 75, day256: 25, dayVivid256: 68 },
{ id: 'ascii', h: 33.4, lambda: 'λ 597', night: '#ffaa96', nightVivid: '#f68f78', day: '#b2432c', dayVivid: '#df634a', night256: 216, nightVivid256: 209, day256: 124, dayVivid256: 167 },
];
};
__d[2] = function (__ns) {
const { toOklab } = __m(0);
__e(__ns, { "LIGHT_L": () => LIGHT_L, "modeOfColor": () => modeOfColor, "parseColorFgBg": () => parseColorFgBg, "parseOscColor": () => parseOscColor, "themeForMode": () => themeForMode, "detectThemeSync": () => detectThemeSync, "canQueryBackground": () => canQueryBackground, "queryBackground": () => queryBackground, "detectTheme": () => detectTheme, "detectedTheme": () => detectedTheme, "resetThemeDetection": () => resetThemeDetection }, [], ["LIGHT_L","canQueryBackground","detectTheme","detectThemeSync","detectedTheme","modeOfColor","parseColorFgBg","parseOscColor","queryBackground","resetThemeDetection","themeForMode"]);
const LIGHT_L = 0.6;
const ALIASES = { day: 'light', light: 'light', night: 'dark', dark: 'dark' };
const proc = () => globalThis.process;
function modeOfColor(c) {
return toOklab(c & 0xffffff)[0] > LIGHT_L ? 'light' : 'dark';
}
function parseColorFgBg(v) {
if (typeof v !== 'string' || !v.trim()) return null;
const last = v.trim().split(';').pop().trim();
if (!/^\d{1,3}$/.test(last)) return null;
const n = Number(last);
if (n > 15) return null;
return n === 7 || n >= 9 ? 'light' : 'dark';
}
function parseOscColor(reply) {
if (typeof reply !== 'string') return null;
const m = reply.match(/(?:\x1b\]1[01];)?(rgba?:[0-9a-f/]+|#[0-9a-f]+)/i);
if (!m) return null;
const spec = m[1];
let parts;
if (spec[0] === '#') {
const h = spec.slice(1);
if (h.length % 3 || h.length < 3 || h.length > 12) return null;
const n = h.length / 3;
parts = [h.slice(0, n), h.slice(n, 2 * n), h.slice(2 * n)];
} else {
parts = spec.slice(spec.indexOf(':') + 1).split('/').slice(0, 3);
}
if (parts.length !== 3 || !parts.every((p) => /^[0-9a-f]{1,4}$/i.test(p))) return null;
const [r, g, b] = parts.map((p) => Math.round((parseInt(p, 16) / (16 ** p.length - 1)) * 255));
return (r << 16) | (g << 8) | b;
}
function themeForMode(mode, family = 'prism') {
return `${family}-${mode === 'light' ? 'light' : 'dark'}`;
}
const isCI = (env) => !!(env.CI || env.CONTINUOUS_INTEGRATION || env.BUILD_NUMBER || env.GITHUB_ACTIONS || env.TF_BUILD);
function detectThemeSync({ env = proc()?.env || {}, stdout = proc()?.stdout } = {}) {
const want = String(env.PRISM_TERM_THEME || '').trim().toLowerCase();
if (want && want !== 'auto') {
if (ALIASES[want]) return { mode: ALIASES[want], source: 'PRISM_TERM_THEME' };
return { id: want, mode: /-light$/.test(want) ? 'light' : 'dark', source: 'PRISM_TERM_THEME' };
}
if (!stdout || !stdout.isTTY || isCI(env)) return null;
const mode = parseColorFgBg(env.COLORFGBG);
return mode ? { mode, source: 'COLORFGBG' } : null;
}
function canQueryBackground({ env = proc()?.env || {}, stdin = proc()?.stdin, stdout = proc()?.stdout } = {}) {
if (!stdin || !stdout || !stdin.isTTY || !stdout.isTTY) return false;
if (typeof stdin.setRawMode !== 'function' || stdin.isRaw) return false; 
if (isCI(env) || /^(1|true|yes)$/i.test(env.PRISM_TERM_NO_QUERY || '')) return false;
const term = env.TERM || '';
if (term === 'dumb' || term === 'linux' || /^(vt[0-9]|cons)/.test(term)) return false; 
return true;
}
const OSC11_REPLY = /\x1b\]11;([^\x07\x1b]*)(?:\x07|\x1b\\)/;
const DA1_REPLY = /\x1b\[\?[0-9;]*c/;
function queryBackground({ stdin = proc()?.stdin, stdout = proc()?.stdout, env = proc()?.env || {}, platform = proc()?.platform || '', timeout } = {}) {
if (!canQueryBackground({ env, stdin, stdout })) return Promise.resolve(null);
const ms = Math.max(10, Math.min(1000, Number(timeout ?? env.PRISM_TERM_QUERY_MS ?? 100) || 100));
const sentinel = platform !== 'win32';
return new Promise((resolve) => {
let buf = '', done = false, timer = null;
const finish = (color) => {
if (done) return;
done = true;
clearTimeout(timer);
stdin.removeListener('data', onData);
try { stdin.setRawMode(false); } catch { }
stdin.pause();
const rest = buf.replace(OSC11_REPLY, '').replace(DA1_REPLY, '');
if (rest && typeof stdin.unshift === 'function' && globalThis.Buffer) { try { stdin.unshift(globalThis.Buffer.from(rest, 'latin1')); } catch { } }
resolve(color);
};
const onData = (chunk) => {
buf += typeof chunk === 'string' ? chunk : chunk.toString('latin1');
const osc = buf.match(OSC11_REPLY);
if (osc && (!sentinel || DA1_REPLY.test(buf.slice(osc.index + osc[0].length)))) return finish(parseOscColor(osc[1]));
if (!osc && sentinel && DA1_REPLY.test(buf)) return finish(null); 
};
try {
stdin.setRawMode(true);
stdin.on('data', onData);
stdin.resume();
timer = setTimeout(() => finish(buf.match(OSC11_REPLY) ? parseOscColor(buf.match(OSC11_REPLY)[1]) : null), ms);
stdout.write(sentinel ? '\x1b]11;?\x1b\\\x1b[c' : '\x1b]11;?\x1b\\');
} catch {
finish(null);
}
});
}
let detected; 
async function detectTheme(o = {}) {
const sync = detectThemeSync(o);
if (sync) return (detected = { id: sync.id || themeForMode(sync.mode, o.family), mode: sync.mode, source: sync.source });
const bg = await queryBackground(o);
if (bg != null) {
const mode = modeOfColor(bg);
return (detected = { id: themeForMode(mode, o.family), mode, source: 'OSC 11', background: bg });
}
detected = null;
return { id: themeForMode('dark', o.family), mode: 'dark', source: 'default' };
}
function detectedTheme() {
if (detected === undefined) {
const sync = detectThemeSync();
detected = sync ? { id: sync.id || themeForMode(sync.mode), mode: sync.mode, source: sync.source } : null;
}
return detected;
}
function resetThemeDetection(value) { detected = value; }
};
__d[3] = function (__ns) {
const { THEME_DATA, DEFAULT_THEME_ID, TERMINAL_SCHEMES, SPECTRUM, TERMINAL_GALLERIES } = __m(1);
const { parse, gradient, mix, toOklab, fromOklab, exact256, pin256, setAnsi16Role, NONE } = __m(0);
const { detectedTheme } = __m(2);
__e(__ns, { "THEME_IDS": () => THEME_IDS, "DEFAULT_THEME_ID": () => DEFAULT_THEME_ID, "TERMINAL_SCHEMES": () => TERMINAL_SCHEMES, "SPECTRUM": () => SPECTRUM, "defaultThemeId": () => defaultThemeId, "getTheme": () => getTheme, "listThemes": () => listThemes, "terminalScheme": () => terminalScheme, "PALETTES": () => PALETTES, "PALETTE_NAMES": () => PALETTE_NAMES, "contrastRatio": () => contrastRatio, "legible": () => legible, "fadeMark": () => fadeMark, "palette": () => palette }, [], ["DEFAULT_THEME_ID","PALETTES","PALETTE_NAMES","SPECTRUM","TERMINAL_SCHEMES","THEME_IDS","contrastRatio","defaultThemeId","fadeMark","getTheme","legible","listThemes","palette","terminalScheme"]);
const THEME_KEYS = ['bg', 'panel', 'panel2', 'card', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
const BY_ID = new Map(THEME_DATA.map((t) => [t.id, t]));
const MODE_ALIASES = { day: 'light', light: 'light', night: 'dark', dark: 'dark' };
const THEME_IDS = THEME_DATA.map((t) => t.id);
function defaultThemeId() {
const d = detectedTheme();
return d && BY_ID.has(d.id) ? d.id : DEFAULT_THEME_ID;
}
function getTheme(id) {
if (id && typeof id === 'object') return id; 
const key = id == null || id === '' || id === 'auto' ? defaultThemeId() : String(id);
const mode = MODE_ALIASES[key.toLowerCase()];
const t = (mode && BY_ID.get(`prism-${mode}`)) || BY_ID.get(key)
|| BY_ID.get(`${key}-${detectedTheme()?.mode || 'dark'}`) || BY_ID.get(`${key}-dark`) || BY_ID.get(defaultThemeId());
const out = { id: t.id, name: t.name, ds: t.ds, mode: t.mode };
for (const k of THEME_KEYS) out[k] = parse(t[k]);
return out;
}
function listThemes() {
return THEME_DATA.map((t) => ({ id: t.id, name: t.name, mode: t.mode, accent: t.accent, ds: t.ds }));
}
function terminalScheme(id) {
const s = TERMINAL_SCHEMES[getTheme(id).id];
return s ? { id: getTheme(id).id, name: getTheme(id).name, mode: getTheme(id).mode, ...s, ansi: [...s.ansi] } : null;
}
exact256(...SPECTRUM.flatMap((st) => [st.night, st.nightVivid, st.day, st.dayVivid].map(parse)));
for (const s of Object.values(TERMINAL_SCHEMES)) exact256(...s.ansi.map(parse));
for (const t of [...THEME_DATA].sort((a, b) => (a.ds === 'prism') - (b.ds === 'prism'))) exact256(...THEME_KEYS.map((k) => parse(t[k])));
for (const s of Object.values(TERMINAL_SCHEMES)) (s.ansi256 || []).forEach((i, n) => pin256(parse(s.ansi[n]), i));
for (const st of SPECTRUM) { pin256(parse(st.night), st.night256); pin256(parse(st.day), st.day256); }
for (const g of TERMINAL_GALLERIES || []) {
pin256(parse(g.nightVivid), g.nightVivid256); pin256(parse(g.dayVivid), g.dayVivid256);
pin256(parse(g.night), g.night256); pin256(parse(g.day), g.day256);
}
for (const [id, s] of Object.entries(TERMINAL_SCHEMES)) {
const t = BY_ID.get(id);
if (t) for (const [k, i] of Object.entries(s.tokens256 || {})) pin256(parse(t[k]), i);
}
for (const [id, s] of Object.entries(TERMINAL_SCHEMES)) {
const t = BY_ID.get(id);
if (!t) continue;
for (const [k, [fg, bg]] of Object.entries(s.roles)) {
const c = parse(t[k]);
if (c !== NONE && c !== 0 && c !== 0xffffff) setAnsi16Role(c, fg, bg);
}
}
const spectrumTier = (key) => SPECTRUM.map((st) => st[key]);
const PALETTES = {
prism: { stops: spectrumTier('nightVivid'), light: spectrumTier('dayVivid'), cyclic: true },
'prism-ink': { stops: spectrumTier('night'), light: spectrumTier('day'), cyclic: true },
'prism-sheen': { stops: spectrumTier('nightVivid'), light: ['#b299f3', '#8ba6fd', '#5ab3f7', '#19bfe2', '#00c8c3', '#53cea0', '#8fcf7d', '#c1c95f', '#e5ba53', '#f7a65f', '#fb947c', '#f48a9f'], cyclic: true },
neon: { stops: ['#ff3b6b', '#ff9f1c', '#ffe14d', '#3ddc84', '#2ec5ff', '#7a5cff', '#ff3bd4'], cyclic: true },
fire: { stops: ['#000000', '#1f0500', '#6b1300', '#c43a00', '#ff7a00', '#ffc42e', '#fff4c2', '#ffffff'] },
ocean: { stops: ['#01040c', '#03193a', '#074b80', '#0f8ec2', '#3fd0e8', '#b8f6ff', '#ffffff'] },
aurora: { stops: ['#02040f', '#08303a', '#0f8c6e', '#5ff5a8', '#9b7bff', '#ff7ae0'] },
synthwave: { stops: ['#0d0221', '#2b0f54', '#7b1fa2', '#ff2a6d', '#ff9e3d', '#ffe66d'] },
matrix: { stops: ['#000300', '#002b06', '#007a1e', '#00d43a', '#7dff9c', '#e8ffe8'] },
ice: { stops: ['#020617', '#0c2a4a', '#2563a8', '#60a5fa', '#c7e3ff', '#ffffff'] },
sunset: { stops: ['#14002e', '#4a0e5c', '#a3195b', '#f05a28', '#ffb03a', '#fff1a8'] },
toxic: { stops: ['#020a02', '#123d0b', '#3f8f00', '#a6ff00', '#f4ff8a'] },
magma: { stops: ['#000004', '#2c115f', '#721f81', '#b73779', '#f1605d', '#feb078', '#fcfdbf'] },
viridis: { stops: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
candy: { stops: ['#ff9ad5', '#c39bff', '#8ec5ff', '#9fffe0', '#fff59a'], cyclic: true },
gold: { stops: ['#0b0700', '#3d2600', '#8a5a00', '#d69a00', '#ffd75e', '#fff6d6'] },
mono: { stops: ['#000000', '#ffffff'] },
};
const PALETTE_NAMES = [...Object.keys(PALETTES), 'theme', 'theme-heat'];
const linear = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const wcagLum = (c) => 0.2126 * linear(((c >> 16) & 255) / 255) + 0.7152 * linear(((c >> 8) & 255) / 255) + 0.0722 * linear((c & 255) / 255);
function contrastRatio(a, b) {
const x = wcagLum(a), y = wcagLum(b);
return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function legible(theme, c, ratio = 3) {
const bg = theme.bg;
if (c === NONE || bg === NONE || contrastRatio(c, bg) >= ratio) return c;
const [L, A, B] = toOklab(c);
const darker = wcagLum(bg) > 0.18; 
let lo = darker ? 0 : L, hi = darker ? L : 1;
for (let i = 0; i < 16; i++) {
const mid = (lo + hi) / 2, ok = contrastRatio(fromOklab([mid, A, B]), bg) >= ratio;
if (darker) { if (ok) lo = mid; else hi = mid; } else if (ok) hi = mid; else lo = mid;
}
return fromOklab([darker ? lo : hi, A, B]);
}
function fadeMark(theme, color, k) {
const bg = theme.bg;
if (theme.mode === 'light') k = 1 - (1 - k) * (1 - k);
return bg === NONE ? color : mix(bg, color, k < 0 ? 0 : k > 1 ? 1 : k);
}
function palette(name = 'prism', theme = getTheme(), opts = {}) {
if (Array.isArray(name)) return gradient(name, opts);
if (name === 'theme') return gradient([theme.bg, theme.accent, theme.info, theme.pos, theme.warn, theme.crit], opts);
if (name === 'theme-heat') return gradient([theme.bg, theme.info, theme.pos, theme.warn, theme.neg, theme.ink], opts);
const p = PALETTES[name] || PALETTES.prism;
const stops = p.light && theme && theme.mode === 'light' ? p.light : p.stops;
return gradient(stops, { cyclic: !!p.cyclic, ...opts });
}
};
__d[4] = function (__ns) {

__e(__ns, { "ESC": () => ESC, "CSI": () => CSI, "reset": () => reset, "cursor": () => cursor, "screen": () => screen, "mouse": () => mouse, "title": () => title, "stripAnsi": () => stripAnsi }, [], ["CSI","ESC","cursor","mouse","reset","screen","stripAnsi","title"]);
const ESC = '\x1b';
const CSI = '\x1b[';
const reset = '\x1b[0m';
const cursor = {
hide: '\x1b[?25l',
show: '\x1b[?25h',
home: '\x1b[H',
save: '\x1b7',
restore: '\x1b8',
to: (x, y) => `\x1b[${y + 1};${x + 1}H`,
column: (x) => `\x1b[${x + 1}G`,
up: (n = 1) => (n > 0 ? `\x1b[${n}A` : ''),
down: (n = 1) => (n > 0 ? `\x1b[${n}B` : ''),
right: (n = 1) => (n > 0 ? `\x1b[${n}C` : ''),
left: (n = 1) => (n > 0 ? `\x1b[${n}D` : ''),
};
const screen = {
altOn: '\x1b[?1049h',
altOff: '\x1b[?1049l',
clear: '\x1b[2J',
clearDown: '\x1b[J',
clearLine: '\x1b[2K',
clearLineRight: '\x1b[K',
syncStart: '\x1b[?2026h',
syncEnd: '\x1b[?2026l',
wrapOff: '\x1b[?7l',
wrapOn: '\x1b[?7h',
};
const mouse = {
on: '\x1b[?1000h\x1b[?1006h',
off: '\x1b[?1000l\x1b[?1006l',
};
const title = (s) => `\x1b]0;${String(s).replace(/[\x00-\x1f]/g, '')}\x07`;
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
function stripAnsi(s) {
return String(s).replace(ANSI_RE, '');
}
};
__d[5] = function (__ns) {
const { stripAnsi } = __m(4);
__e(__ns, { "charWidth": () => charWidth, "stringWidth": () => stringWidth, "truncate": () => truncate, "wrap": () => wrap }, [], ["charWidth","stringWidth","truncate","wrap"]);
const ZERO = [
[0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x0610, 0x061a], [0x064b, 0x065f],
[0x0e31, 0x0e31], [0x0e34, 0x0e3a], [0x0e47, 0x0e4e], [0x1ab0, 0x1aff], [0x1dc0, 0x1dff],
[0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x20d0, 0x20ff], [0xfe00, 0xfe0f],
[0xfe20, 0xfe2f], [0xfeff, 0xfeff], [0x1f3fb, 0x1f3ff], [0xe0000, 0xe0fff],
];
const WIDE = [
[0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0],
[0x23f3, 0x23f3], [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f],
[0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5],
[0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5],
[0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728],
[0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
[0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55],
[0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf],
[0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f],
[0xff00, 0xff60], [0xffe0, 0xffe6], [0x16fe0, 0x16fe4], [0x17000, 0x18cff], [0x1b000, 0x1b2ff],
[0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f200, 0x1f251],
[0x1f300, 0x1f320], [0x1f32d, 0x1f335], [0x1f337, 0x1f37c], [0x1f37e, 0x1f393], [0x1f3a0, 0x1f3ca],
[0x1f3cf, 0x1f3d3], [0x1f3e0, 0x1f3f0], [0x1f3f4, 0x1f3f4], [0x1f3f8, 0x1f43e], [0x1f440, 0x1f440],
[0x1f442, 0x1f4fc], [0x1f4ff, 0x1f53d], [0x1f54b, 0x1f54e], [0x1f550, 0x1f567], [0x1f57a, 0x1f57a],
[0x1f595, 0x1f596], [0x1f5a4, 0x1f5a4], [0x1f5fb, 0x1f64f], [0x1f680, 0x1f6c5], [0x1f6cc, 0x1f6cc],
[0x1f6d0, 0x1f6d2], [0x1f6d5, 0x1f6d7], [0x1f6eb, 0x1f6ec], [0x1f6f4, 0x1f6fc], [0x1f7e0, 0x1f7eb],
[0x1f90c, 0x1f93a], [0x1f93c, 0x1f945], [0x1f947, 0x1f9ff], [0x1fa70, 0x1faff], [0x20000, 0x3fffd],
];
function inTable(cp, table) {
let lo = 0, hi = table.length - 1;
while (lo <= hi) {
const mid = (lo + hi) >> 1;
if (cp < table[mid][0]) hi = mid - 1;
else if (cp > table[mid][1]) lo = mid + 1;
else return true;
}
return false;
}
function charWidth(cp) {
if (typeof cp === 'string') cp = cp.codePointAt(0) ?? 0;
if (cp < 0x300) return cp < 32 || (cp >= 0x7f && cp < 0xa0) ? 0 : 1;
if (inTable(cp, ZERO)) return 0;
if (cp === 0x200d) return 0;
return inTable(cp, WIDE) ? 2 : 1;
}
function stringWidth(s) {
let w = 0;
for (const ch of stripAnsi(s)) w += charWidth(ch.codePointAt(0));
return w;
}
function truncate(s, max, ellipsis = '…') {
if (stringWidth(s) <= max) return s;
const ew = stringWidth(ellipsis);
let out = '', w = 0;
for (const ch of s) {
const cw = charWidth(ch.codePointAt(0));
if (w + cw > max - ew) break;
out += ch;
w += cw;
}
return out + ellipsis;
}
function wrap(s, width) {
const out = [];
for (const para of String(s).split('\n')) {
let line = '', w = 0;
for (const word of para.split(/\s+/).filter(Boolean)) {
const ww = stringWidth(word);
if (w && w + 1 + ww > width) { out.push(line); line = ''; w = 0; }
if (ww > width) { out.push(truncate(word, width)); continue; }
line += (w ? ' ' : '') + word;
w += (w ? 1 : 0) + ww;
}
out.push(line);
}
return out;
}
};
__d[6] = function (__ns) {
const { NONE, fgParam, bgParam, normalizeDepth } = __m(0);
const { charWidth } = __m(5);
__e(__ns, { "ATTR": () => ATTR, "lightTerminal": () => lightTerminal, "defaultInk": () => defaultInk, "lightText": () => lightText, "attrParams": () => attrParams, "parseAttr": () => parseAttr, "Surface": () => Surface, "CellBuffer": () => CellBuffer, "View": () => View }, [], ["ATTR","CellBuffer","Surface","View","attrParams","defaultInk","lightTerminal","lightText","parseAttr"]);
const ATTR = Object.freeze({
BOLD: 1, DIM: 2, ITALIC: 4, UNDERLINE: 8, BLINK: 16, INVERSE: 32, STRIKE: 64,
});
const ATTR_SGR = [[1, '1'], [2, '2'], [4, '3'], [8, '4'], [16, '5'], [32, '7'], [64, '9']];
function lightTerminal(surface) {
for (let s = surface, i = 0; s && i < 16; s = s.parent || s.inner, i++) if (s.light16 !== undefined) return !!s.light16;
return false;
}
function defaultInk(surface) {
for (let s = surface, i = 0; s && i < 16; s = s.parent || s.inner, i++) if (s.inkAsDefault !== undefined) return s.inkAsDefault ?? -2;
return -2;
}
function lightText(ch) {
const cp = ch ? ch.codePointAt(0) : 32;
return !((cp >= 0x2580 && cp <= 0x259f) || (cp >= 0x2800 && cp <= 0x28ff) || (cp >= 0x1fb00 && cp <= 0x1fb3b));
}
function attrParams(a) {
if (!a) return '';
let s = '';
for (const [bit, code] of ATTR_SGR) if (a & bit) s += (s ? ';' : '') + code;
return s;
}
function parseAttr(v) {
if (v == null) return undefined;
if (typeof v === 'number') return v;
const names = Array.isArray(v) ? v : String(v).split(/[\s,|]+/);
let a = 0;
for (const n of names) {
const k = String(n).toUpperCase();
if (k === 'UNDERLINED') a |= ATTR.UNDERLINE;
else if (k === 'REVERSE') a |= ATTR.INVERSE;
else if (ATTR[k]) a |= ATTR[k];
}
return a;
}
class Surface {
text(x, y, str, fg, bg, attr) {
x = Math.round(x); y = Math.round(y);
if (y < 0 || y >= this.height) return x + [...String(str)].length;
for (const ch of String(str)) {
const cp = ch.codePointAt(0);
if (ch === '\n') continue;
const w = charWidth(cp);
if (w === 0) continue; 
if (x >= 0 && x < this.width) {
if (w === 2 && x + 1 >= this.width) { this.set(x, y, ' ', fg, bg, attr); x++; break; }
this.set(x, y, ch, fg, bg, attr);
if (w === 2) this.set(x + 1, y, '', fg, bg, attr);
}
x += w;
}
return x;
}
fill(x, y, w, h, ch, fg, bg, attr) {
const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
const x1 = Math.min(this.width, Math.round(x + w)), y1 = Math.min(this.height, Math.round(y + h));
for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.set(xx, yy, ch, fg, bg, attr);
}
view(x, y, w, h) {
return new View(this, x, y, w, h);
}
blit(src, dx = 0, dy = 0, { transparent = false } = {}) {
for (let y = 0; y < src.height; y++) {
for (let x = 0; x < src.width; x++) {
const c = src.get(x, y);
if (!c) continue;
if (transparent && c.ch === ' ' && c.bg === NONE) continue;
this.set(x + dx, y + dy, c.ch, c.fg, c.bg, c.attr);
}
}
}
toString() {
const lines = [];
for (let y = 0; y < this.height; y++) {
let line = '';
for (let x = 0; x < this.width; x++) line += this.get(x, y).ch;
lines.push(line.replace(/\s+$/, ''));
}
return lines.join('\n');
}
toAnsi(depth = 'truecolor') {
depth = normalizeDepth(depth);
const light = depth === '16' && lightTerminal(this), ink = defaultInk(this);
const lines = [];
for (let y = 0; y < this.height; y++) {
let line = '', fg = NONE, bg = NONE, at = 0, styled = false, fgP = '39';
let end = this.width;
while (end > 0) { const c = this.get(end - 1, y); if (c.ch === ' ' && c.bg === NONE && !c.attr) end--; else break; }
for (let x = 0; x < end; x++) {
const c = this.get(x, y);
if (c.ch === '') continue;
if (c.fg === ink) c.fg = NONE;
const fp = light ? fgParam(c.fg, depth, c.bg, lightText(c.ch)) : null;
if (depth === 'mono') {
if (c.attr !== at) { line += `\x1b[0${c.attr ? ';' + attrParams(c.attr) : ''}m`; at = c.attr; styled = true; }
} else if (c.attr !== at) {
const ap = attrParams(c.attr);
line += `\x1b[0${ap ? ';' + ap : ''};${fp ?? fgParam(c.fg, depth)};${bgParam(c.bg, depth)}m`;
fg = c.fg; bg = c.bg; at = c.attr; styled = true; fgP = fp;
} else if (light ? fp !== fgP || c.bg !== bg : c.fg !== fg || c.bg !== bg) {
const parts = [];
if (light ? fp !== fgP : c.fg !== fg) parts.push(fp ?? fgParam(c.fg, depth));
if (c.bg !== bg) parts.push(bgParam(c.bg, depth));
line += `\x1b[${parts.join(';')}m`;
fg = c.fg; bg = c.bg; styled = true; fgP = fp;
}
line += c.ch;
}
if (styled) line += '\x1b[0m';
lines.push(line);
}
return lines.join('\n');
}
}
class CellBuffer extends Surface {
constructor(width, height) {
super();
this.resize(width, height);
}
resize(width, height) {
this.width = Math.max(0, width | 0);
this.height = Math.max(0, height | 0);
const n = this.width * this.height;
this.ch = new Array(n).fill(' ');
this.fg = new Int32Array(n).fill(NONE);
this.bg = new Int32Array(n).fill(NONE);
this.at = new Uint8Array(n);
return this;
}
clear(bg = NONE, fg = NONE) {
this.ch.fill(' ');
this.fg.fill(fg);
this.bg.fill(bg);
this.at.fill(0);
return this;
}
set(x, y, ch, fg, bg, attr) {
x |= 0; y |= 0;
if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
const i = y * this.width + x;
if (ch !== undefined) this.ch[i] = ch;
if (fg !== undefined) this.fg[i] = fg;
if (bg !== undefined) this.bg[i] = bg;
if (attr !== undefined) this.at[i] = attr;
}
get(x, y) {
x |= 0; y |= 0;
if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
const i = y * this.width + x;
return { ch: this.ch[i], fg: this.fg[i], bg: this.bg[i], attr: this.at[i] };
}
clone() {
const b = new CellBuffer(this.width, this.height);
b.ch = this.ch.slice();
b.fg.set(this.fg);
b.bg.set(this.bg);
b.at.set(this.at);
return b;
}
copyFrom(src) {
if (src.width !== this.width || src.height !== this.height) return this.resize(src.width, src.height).copyFrom(src);
for (let i = 0; i < src.ch.length; i++) this.ch[i] = src.ch[i];
this.fg.set(src.fg);
this.bg.set(src.bg);
this.at.set(src.at);
return this;
}
}
class View extends Surface {
constructor(parent, x, y, w, h) {
super();
this.parent = parent;
this.ox = Math.round(x);
this.oy = Math.round(y);
this.width = Math.max(0, Math.round(w));
this.height = Math.max(0, Math.round(h));
}
set(x, y, ch, fg, bg, attr) {
x |= 0; y |= 0;
if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
this.parent.set(x + this.ox, y + this.oy, ch, fg, bg, attr);
}
get(x, y) {
x |= 0; y |= 0;
if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
return this.parent.get(x + this.ox, y + this.oy);
}
clear(bg = NONE, fg = NONE) {
this.fill(0, 0, this.width, this.height, ' ', fg, bg, 0);
return this;
}
}
};
__d[7] = function (__ns) {

__e(__ns, { "glyphClass": () => glyphClass, "blockGeometry": () => blockGeometry, "BRAILLE_BITS": () => BRAILLE_BITS, "brailleDots": () => brailleDots, "sextantCells": () => sextantCells, "boxGeometry": () => boxGeometry, "BOX_CODEPOINTS": () => BOX_CODEPOINTS }, [], ["BOX_CODEPOINTS","BRAILLE_BITS","blockGeometry","boxGeometry","brailleDots","glyphClass","sextantCells"]);
function glyphClass(cp) {
if (cp >= 0x2580 && cp <= 0x259f) return 'block';
if (cp >= 0x2800 && cp <= 0x28ff) return 'braille';
if (cp >= 0x1fb00 && cp <= 0x1fb3b) return 'sextant';
if (cp >= 0x2500 && cp <= 0x257f) return 'box';
return null;
}
const Q = { ul: [0, 0, 0.5, 0.5], ur: [0.5, 0, 0.5, 0.5], ll: [0, 0.5, 0.5, 0.5], lr: [0.5, 0.5, 0.5, 0.5] };
const BLOCKS = new Map([
[0x2580, [[0, 0, 1, 0.5]]],
...[1, 2, 3, 4, 5, 6, 7, 8].map((k) => [0x2580 + k, [[0, 1 - k / 8, 1, k / 8]]]), 
...[7, 6, 5, 4, 3, 2, 1].map((k, i) => [0x2589 + i, [[0, 0, k / 8, 1]]]), 
[0x2590, [[0.5, 0, 0.5, 1]]],
[0x2594, [[0, 0, 1, 1 / 8]]],
[0x2595, [[7 / 8, 0, 1 / 8, 1]]],
[0x2596, [Q.ll]], [0x2597, [Q.lr]], [0x2598, [Q.ul]],
[0x2599, [Q.ul, Q.ll, Q.lr]], [0x259a, [Q.ul, Q.lr]], [0x259b, [Q.ul, Q.ur, Q.ll]],
[0x259c, [Q.ul, Q.ur, Q.lr]], [0x259d, [Q.ur]], [0x259e, [Q.ur, Q.ll]], [0x259f, [Q.ur, Q.ll, Q.lr]],
]);
const SHADES = new Map([[0x2591, 0.25], [0x2592, 0.5], [0x2593, 0.75]]);
function blockGeometry(cp) {
if (SHADES.has(cp)) return { shade: SHADES.get(cp) };
return { rects: BLOCKS.get(cp) || [] };
}
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
function brailleDots(cp) {
const mask = cp - 0x2800;
const out = [];
for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) if (mask & BRAILLE_BITS[dy][dx]) out.push([dx, dy]);
return out;
}
const SEXTANT_MASK = new Map();
for (let m = 1; m < 63; m++) {
if (m === 21 || m === 42) continue;
SEXTANT_MASK.set(0x1fb00 + m - 1 - (m > 21 ? 1 : 0) - (m > 42 ? 1 : 0), m);
}
function sextantCells(cp) {
const m = SEXTANT_MASK.get(cp) || 0;
const out = [];
for (let k = 0; k < 6; k++) if (m & (1 << k)) out.push([k & 1, k >> 1]);
return out;
}
const B = (u, r, d, l, style) => ({ arms: [u, r, d, l], style });
const BOX = new Map([
[0x2500, B(0, 1, 0, 1)], [0x2501, B(0, 2, 0, 2)], [0x2502, B(1, 0, 1, 0)], [0x2503, B(2, 0, 2, 0)],
[0x2504, B(0, 1, 0, 1, 'dash3')], [0x2505, B(0, 2, 0, 2, 'dash3')], [0x2506, B(1, 0, 1, 0, 'dash3')], [0x2507, B(2, 0, 2, 0, 'dash3')],
[0x2508, B(0, 1, 0, 1, 'dash4')], [0x2509, B(0, 2, 0, 2, 'dash4')], [0x250a, B(1, 0, 1, 0, 'dash4')], [0x250b, B(2, 0, 2, 0, 'dash4')],
[0x250c, B(0, 1, 1, 0)], [0x250d, B(0, 2, 1, 0)], [0x250e, B(0, 1, 2, 0)], [0x250f, B(0, 2, 2, 0)],
[0x2510, B(0, 0, 1, 1)], [0x2511, B(0, 0, 1, 2)], [0x2512, B(0, 0, 2, 1)], [0x2513, B(0, 0, 2, 2)],
[0x2514, B(1, 1, 0, 0)], [0x2515, B(1, 2, 0, 0)], [0x2516, B(2, 1, 0, 0)], [0x2517, B(2, 2, 0, 0)],
[0x2518, B(1, 0, 0, 1)], [0x2519, B(1, 0, 0, 2)], [0x251a, B(2, 0, 0, 1)], [0x251b, B(2, 0, 0, 2)],
[0x251c, B(1, 1, 1, 0)], [0x251d, B(1, 2, 1, 0)], [0x251e, B(2, 1, 1, 0)], [0x251f, B(1, 1, 2, 0)],
[0x2520, B(2, 1, 2, 0)], [0x2521, B(2, 2, 1, 0)], [0x2522, B(1, 2, 2, 0)], [0x2523, B(2, 2, 2, 0)],
[0x2524, B(1, 0, 1, 1)], [0x2525, B(1, 0, 1, 2)], [0x2526, B(2, 0, 1, 1)], [0x2527, B(1, 0, 2, 1)],
[0x2528, B(2, 0, 2, 1)], [0x2529, B(2, 0, 1, 2)], [0x252a, B(1, 0, 2, 2)], [0x252b, B(2, 0, 2, 2)],
[0x252c, B(0, 1, 1, 1)], [0x252d, B(0, 1, 1, 2)], [0x252e, B(0, 2, 1, 1)], [0x252f, B(0, 2, 1, 2)],
[0x2530, B(0, 1, 2, 1)], [0x2531, B(0, 1, 2, 2)], [0x2532, B(0, 2, 2, 1)], [0x2533, B(0, 2, 2, 2)],
[0x2534, B(1, 1, 0, 1)], [0x2535, B(1, 1, 0, 2)], [0x2536, B(1, 2, 0, 1)], [0x2537, B(1, 2, 0, 2)],
[0x2538, B(2, 1, 0, 1)], [0x2539, B(2, 1, 0, 2)], [0x253a, B(2, 2, 0, 1)], [0x253b, B(2, 2, 0, 2)],
[0x253c, B(1, 1, 1, 1)], [0x253d, B(1, 1, 1, 2)], [0x253e, B(1, 2, 1, 1)], [0x253f, B(1, 2, 1, 2)],
[0x2540, B(2, 1, 1, 1)], [0x2541, B(1, 1, 2, 1)], [0x2542, B(2, 1, 2, 1)], [0x2543, B(2, 1, 1, 2)],
[0x2544, B(2, 2, 1, 1)], [0x2545, B(1, 1, 2, 2)], [0x2546, B(1, 2, 2, 1)], [0x2547, B(2, 2, 1, 2)],
[0x2548, B(1, 2, 2, 2)], [0x2549, B(2, 1, 2, 2)], [0x254a, B(2, 2, 2, 1)], [0x254b, B(2, 2, 2, 2)],
[0x254c, B(0, 1, 0, 1, 'dash2')], [0x254d, B(0, 2, 0, 2, 'dash2')], [0x254e, B(1, 0, 1, 0, 'dash2')], [0x254f, B(2, 0, 2, 0, 'dash2')],
[0x2550, B(0, 3, 0, 3)], [0x2551, B(3, 0, 3, 0)],
[0x2552, B(0, 3, 1, 0)], [0x2553, B(0, 1, 3, 0)], [0x2554, B(0, 3, 3, 0)],
[0x2555, B(0, 0, 1, 3)], [0x2556, B(0, 0, 3, 1)], [0x2557, B(0, 0, 3, 3)],
[0x2558, B(1, 3, 0, 0)], [0x2559, B(3, 1, 0, 0)], [0x255a, B(3, 3, 0, 0)],
[0x255b, B(1, 0, 0, 3)], [0x255c, B(3, 0, 0, 1)], [0x255d, B(3, 0, 0, 3)],
[0x255e, B(1, 3, 1, 0)], [0x255f, B(3, 1, 3, 0)], [0x2560, B(3, 3, 3, 0)],
[0x2561, B(1, 0, 1, 3)], [0x2562, B(3, 0, 3, 1)], [0x2563, B(3, 0, 3, 3)],
[0x2564, B(0, 3, 1, 3)], [0x2565, B(0, 1, 3, 1)], [0x2566, B(0, 3, 3, 3)],
[0x2567, B(1, 3, 0, 3)], [0x2568, B(3, 1, 0, 1)], [0x2569, B(3, 3, 0, 3)],
[0x256a, B(1, 3, 1, 3)], [0x256b, B(3, 1, 3, 1)], [0x256c, B(3, 3, 3, 3)],
[0x256d, B(0, 1, 1, 0, 'arc')], [0x256e, B(0, 0, 1, 1, 'arc')], [0x256f, B(1, 0, 0, 1, 'arc')], [0x2570, B(1, 1, 0, 0, 'arc')],
[0x2571, B(0, 0, 0, 0, '/')], [0x2572, B(0, 0, 0, 0, '\\')], [0x2573, B(0, 0, 0, 0, 'x')],
[0x2574, B(0, 0, 0, 1)], [0x2575, B(1, 0, 0, 0)], [0x2576, B(0, 1, 0, 0)], [0x2577, B(0, 0, 1, 0)],
[0x2578, B(0, 0, 0, 2)], [0x2579, B(2, 0, 0, 0)], [0x257a, B(0, 2, 0, 0)], [0x257b, B(0, 0, 2, 0)],
[0x257c, B(0, 2, 0, 1)], [0x257d, B(1, 0, 2, 0)], [0x257e, B(0, 1, 0, 2)], [0x257f, B(2, 0, 1, 0)],
]);
function boxGeometry(cp) {
return BOX.get(cp) || null;
}
const BOX_CODEPOINTS = [...BOX.keys()];
};
__d[8] = function (__ns) {
const { NONE, ANSI16, to256, normalizeDepth, ansi16Fg, ansi16Bg, parse } = __m(0);
const { terminalScheme } = __m(3);
const { ATTR } = __m(6);
const { charWidth } = __m(5);
const { glyphClass, blockGeometry, brailleDots, sextantCells, boxGeometry } = __m(7);
__e(__ns, { "FONT_STACK": () => FONT_STACK, "TermCanvas": () => TermCanvas, "fitCells": () => fitCells, "renderToCanvas": () => renderToCanvas, "charWidth": () => charWidth }, [], ["FONT_STACK","TermCanvas","charWidth","fitCells","renderToCanvas"]);
const FONT_STACK = '"Cascadia Mono","Cascadia Code","JetBrains Mono","SF Mono",Menlo,Consolas,"DejaVu Sans Mono","Noto Sans Mono","Liberation Mono",monospace';
function xterm256(n) {
if (n < 16) return ANSI16[n];
if (n >= 232) { const v = 8 + (n - 232) * 10; return (v << 16) | (v << 8) | v; }
const i = n - 16, lv = [0, 95, 135, 175, 215, 255];
return (lv[Math.floor(i / 36)] << 16) | (lv[Math.floor(i / 6) % 6] << 8) | lv[i % 6];
}
const QUANT = {
truecolor: null,
'256': (c) => (c === NONE ? c : xterm256(to256(c))),
mono: () => NONE,
};
function ansiOf(theme) {
const s = theme?.id ? terminalScheme(theme.id) : null;
return s && s.id === theme.id ? s.ansi.map(parse) : ANSI16;
}
const NIGHT = { id: 'prism-dark', bg: 0x0a0c12, ink: 0xe6e6ef };
const INK = { '.': 0.7, ':': 0.8, '-': 0.75, '=': 0.7, '+': 0.42, '*': 0.5, '#': 0.78, '%': 0.72, '@': 0.9, '|': 0.5, '/': 0.48, '\\': 0.48, 'o': 0.5, 'O': 0.62, 'x': 0.5 };
const css = new Map();
function cssColor(c) {
let s = css.get(c);
if (s === undefined) {
if (css.size > 8192) css.clear();
s = '#' + (c & 0xffffff).toString(16).padStart(6, '0');
css.set(c, s);
}
return s;
}
class TermCanvas {
constructor(canvas, { theme, font = FONT_STACK, depth = 'truecolor' } = {}) {
this.canvas = canvas;
this.ctx = canvas.getContext('2d', { alpha: false });
this.font = font;
this.theme = theme || NIGHT;
this.ansi = ansiOf(this.theme);
this.setDepth(depth);
this.cols = 0; this.rows = 0; this.cw = 8; this.chh = 16;
this.prev = null;
this.full = true;
}
setTheme(theme) { this.theme = theme; this.ansi = ansiOf(theme); this.setDepth(this.depth); }
setDepth(depth) {
this.depth = normalizeDepth(depth);
this.quant = this.depth === '16' ? (c) => this._slot(c, ansi16Bg) : QUANT[this.depth];
this.full = true;
}
_slot(c, role) {
if (c === NONE) return c;
const n = role(c);
return n < 0 ? NONE : this.ansi[n] ?? ANSI16[n];
}
layout(cols, rows, cw) {
cw = Math.max(2, Math.round(cw));
if (cols === this.cols && rows === this.rows && cw === this.cw) return;
this.cols = cols; this.rows = rows; this.cw = cw; this.chh = cw * 2;
this.canvas.width = cols * cw;
this.canvas.height = rows * this.chh;
const lw = Math.max(1, Math.round(cw / 7));
this.metrics = {
lw, 
hw: Math.max(lw + 1, Math.round(lw * 2.2)), 
gap: Math.max(lw, Math.round(cw / 4.5)), 
dot: Math.max(1, Math.round(Math.min(cw / 2, this.chh / 4) * 0.66)),
fontPx: Math.max(4, Math.min(Math.floor(cw * 1.62), Math.floor(this.chh * 0.86))),
};
this.minimap = this.metrics.fontPx < 7;
this.prev = null;
this.full = true;
this.fontKey = null; 
}
draw(buffer) {
const { cols, rows, ctx } = this;
if (!cols || !rows) return 0;
const W = buffer.width, n = cols * rows;
if (!this.prev || this.prev.ch.length !== n) {
this.prev = { ch: new Array(n).fill(null), fg: new Int32Array(n), bg: new Int32Array(n), at: new Uint8Array(n) };
this.full = true;
}
const p = this.prev;
if (this.full) {
ctx.fillStyle = cssColor(this.theme.bg);
ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
}
let painted = 0;
for (let y = 0; y < rows; y++) {
for (let x = 0; x < cols; x++) {
const i = y * cols + x, bi = y * W + x;
const ch = buffer.ch[bi], fg = buffer.fg[bi], bg = buffer.bg[bi], at = buffer.at[bi];
const wide = x + 1 < cols && buffer.ch[bi + 1] === '' && ch !== '';
let dirty = this.full || ch !== p.ch[i] || fg !== p.fg[i] || bg !== p.bg[i] || at !== p.at[i];
if (!dirty && wide) { const j = i + 1, bj = bi + 1; dirty = buffer.ch[bj] !== p.ch[j] || buffer.fg[bj] !== p.fg[j] || buffer.bg[bj] !== p.bg[j]; }
if (!dirty) continue;
if (ch === '' && x > 0 && buffer.ch[bi - 1] !== '' && !this.full) {
const owner = bi - 1;
this._cell(x - 1, y, buffer.ch[owner], buffer.fg[owner], buffer.bg[owner], buffer.at[owner], true);
} else if (ch !== '') {
this._cell(x, y, ch, fg, bg, at, wide);
}
p.ch[i] = ch; p.fg[i] = fg; p.bg[i] = bg; p.at[i] = at;
if (wide) { const j = i + 1, bj = bi + 1; p.ch[j] = buffer.ch[bj]; p.fg[j] = buffer.fg[bj]; p.bg[j] = buffer.bg[bj]; p.at[j] = buffer.at[bj]; }
painted++;
}
}
this.full = false;
return painted;
}
_cell(x, y, ch, fg, bg, at, wide) {
const { ctx, cw, chh, theme } = this;
const X = x * cw, Y = y * chh, w = wide ? cw * 2 : cw;
if (this.depth === '16') { fg = this._slot(fg, ansi16Fg); bg = this._slot(bg, ansi16Bg); }
else if (this.quant) { fg = this.quant(fg); bg = this.quant(bg); }
let f = fg === NONE ? theme.ink : fg, b = bg === NONE ? theme.bg : bg;
if (at & ATTR.INVERSE) [f, b] = [b, f];
ctx.fillStyle = cssColor(b);
ctx.fillRect(X, Y, w, chh);
if (ch === ' ' && !(at & (ATTR.UNDERLINE | ATTR.STRIKE))) return;
ctx.fillStyle = cssColor(f);
ctx.strokeStyle = ctx.fillStyle;
ctx.globalAlpha = at & ATTR.DIM ? 0.55 : 1;
if (ch !== ' ') {
const cp = ch.codePointAt(0);
const kind = glyphClass(cp);
if (kind === 'block') this._block(X, Y, cp);
else if (kind === 'braille') this._braille(X, Y, cp);
else if (kind === 'sextant') this._sextant(X, Y, cp);
else if (kind === 'box') this._box(X, Y, cp);
else if (this.minimap) this._mini(X, Y, w, ch);
else this._text(X, Y, w, ch, at);
}
const { lw } = this.metrics;
if (at & ATTR.UNDERLINE) ctx.fillRect(X, Y + chh - lw * 2, w, lw);
if (at & ATTR.STRIKE) ctx.fillRect(X, Y + Math.round(chh / 2), w, lw);
ctx.globalAlpha = 1;
}
_rect(X, Y, rx, ry, rw, rh) {
const { cw, chh } = this;
const x0 = X + Math.round(rx * cw), x1 = X + Math.round((rx + rw) * cw);
const y0 = Y + Math.round(ry * chh), y1 = Y + Math.round((ry + rh) * chh);
if (x1 > x0 && y1 > y0) this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}
_block(X, Y, cp) {
const g = blockGeometry(cp);
if (g.shade) {
const a = this.ctx.globalAlpha;
this.ctx.globalAlpha = a * g.shade;
this.ctx.fillRect(X, Y, this.cw, this.chh);
this.ctx.globalAlpha = a;
return;
}
for (const [rx, ry, rw, rh] of g.rects) this._rect(X, Y, rx, ry, rw, rh);
}
_braille(X, Y, cp) {
const { ctx, cw, chh } = this;
const d = this.metrics.dot;
const dots = brailleDots(cp);
if (d >= 4) {
ctx.beginPath();
for (const [dx, dy] of dots) {
const cx = X + (dx + 0.5) * cw / 2, cy = Y + (dy + 0.5) * chh / 4;
ctx.moveTo(cx + d / 2, cy);
ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
}
ctx.fill();
} else {
for (const [dx, dy] of dots) {
const cx = X + (dx + 0.5) * cw / 2, cy = Y + (dy + 0.5) * chh / 4;
ctx.fillRect(Math.round(cx - d / 2), Math.round(cy - d / 2), d, d);
}
}
}
_sextant(X, Y, cp) {
const { cw, chh, ctx } = this;
for (const [col, row] of sextantCells(cp)) {
const x0 = X + Math.round(col * cw / 2), x1 = X + Math.round((col + 1) * cw / 2);
const y0 = Y + Math.round(row * chh / 3), y1 = Y + Math.round((row + 1) * chh / 3);
ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
}
}
_box(X, Y, cp) {
const g = boxGeometry(cp);
if (!g) return;
const { ctx, cw, chh } = this;
const { lw, hw, gap } = this.metrics;
const cx = X + Math.floor(cw / 2), cy = Y + Math.floor(chh / 2);
const [up, right, down, left] = g.arms;
const thick = (w) => (w === 2 ? hw : lw);
const half = (t) => Math.floor(t / 2);
if (g.style === '/' || g.style === '\\' || g.style === 'x') {
ctx.lineWidth = lw;
ctx.beginPath();
if (g.style !== '\\') { ctx.moveTo(X, Y + chh); ctx.lineTo(X + cw, Y); }
if (g.style !== '/') { ctx.moveTo(X, Y); ctx.lineTo(X + cw, Y + chh); }
ctx.stroke();
return;
}
if (g.style === 'arc') {
const r = Math.max(1, Math.min(cw, chh) / 2);
const ax = cx - half(lw) + lw / 2, ay = cy - half(lw) + lw / 2;
ctx.lineWidth = lw;
ctx.beginPath();
if (right && down) { ctx.moveTo(X + cw, ay); ctx.arcTo(ax, ay, ax, Y + chh, r); ctx.lineTo(ax, Y + chh); }
else if (left && down) { ctx.moveTo(X, ay); ctx.arcTo(ax, ay, ax, Y + chh, r); ctx.lineTo(ax, Y + chh); }
else if (left && up) { ctx.moveTo(X, ay); ctx.arcTo(ax, ay, ax, Y, r); ctx.lineTo(ax, Y); }
else if (right && up) { ctx.moveTo(X + cw, ay); ctx.arcTo(ax, ay, ax, Y, r); ctx.lineTo(ax, Y); }
ctx.stroke();
return;
}
if (g.style && g.style.startsWith('dash')) {
const n = Number(g.style.slice(4));
const t = thick(Math.max(up, right, down, left));
if (right || left) {
const seg = cw / n;
for (let k = 0; k < n; k++) ctx.fillRect(Math.round(X + k * seg + seg * 0.15), cy - half(t), Math.max(1, Math.round(seg * 0.7)), t);
} else {
const seg = chh / n;
for (let k = 0; k < n; k++) ctx.fillRect(cx - half(t), Math.round(Y + k * seg + seg * 0.15), t, Math.max(1, Math.round(seg * 0.7)));
}
return;
}
const hDouble = right === 3 || left === 3, vDouble = up === 3 || down === 3;
const hline = (x0, x1, yy, t) => { if (x1 > x0) ctx.fillRect(x0, yy - half(t), x1 - x0, t); };
const vline = (y0, y1, xx, t) => { if (y1 > y0) ctx.fillRect(xx - half(t), y0, t, y1 - y0); };
const tv = Math.max(thick(up === 3 ? 0 : up), thick(down === 3 ? 0 : down));
const th = Math.max(thick(left === 3 ? 0 : left), thick(right === 3 ? 0 : right));
if (right && right !== 3) hline(cx - (vDouble ? gap : half(tv)), X + cw, cy, thick(right));
if (left && left !== 3) hline(X, cx + (vDouble ? gap : tv - half(tv)), cy, thick(left));
if (down && down !== 3) vline(cy - (hDouble ? gap : half(th)), Y + chh, cx, thick(down));
if (up && up !== 3) vline(Y, cy + (hDouble ? gap : th - half(th)), cx, thick(up));
if (right === 3) {
const s1 = up === 3 ? cx + gap : left === 3 ? cx : down === 3 ? cx - gap : cx;
const s2 = down === 3 ? cx + gap : left === 3 ? cx : up === 3 ? cx - gap : cx;
hline(s1 - half(lw), X + cw, cy - gap, lw);
hline(s2 - half(lw), X + cw, cy + gap, lw);
}
if (left === 3) {
const e1 = up === 3 ? cx - gap : right === 3 ? cx : down === 3 ? cx + gap : cx;
const e2 = down === 3 ? cx - gap : right === 3 ? cx : up === 3 ? cx + gap : cx;
hline(X, e1 + lw - half(lw), cy - gap, lw);
hline(X, e2 + lw - half(lw), cy + gap, lw);
}
if (down === 3) {
const s1 = left === 3 ? cy + gap : up === 3 ? cy : right === 3 ? cy - gap : cy;
const s2 = right === 3 ? cy + gap : up === 3 ? cy : left === 3 ? cy - gap : cy;
vline(s1 - half(lw), Y + chh, cx - gap, lw);
vline(s2 - half(lw), Y + chh, cx + gap, lw);
}
if (up === 3) {
const e1 = left === 3 ? cy - gap : down === 3 ? cy : right === 3 ? cy + gap : cy;
const e2 = right === 3 ? cy - gap : down === 3 ? cy : left === 3 ? cy + gap : cy;
vline(Y, e1 + lw - half(lw), cx - gap, lw);
vline(Y, e2 + lw - half(lw), cx + gap, lw);
}
}
_text(X, Y, w, ch, at) {
const { ctx, chh } = this;
const { fontPx } = this.metrics;
const key = (at & ATTR.ITALIC ? 1 : 0) | (at & ATTR.BOLD ? 2 : 0);
if (key !== this.fontKey) {
ctx.font = `${key & 1 ? 'italic ' : ''}${key & 2 ? '700' : '400'} ${fontPx}px ${this.font}`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
this.fontKey = key;
}
ctx.fillText(ch, X + w / 2, Y + chh / 2 + Math.round(fontPx * 0.04));
}
_mini(X, Y, w, ch) {
const { ctx, cw, chh } = this;
const a = ctx.globalAlpha;
ctx.globalAlpha = a * (INK[ch] ?? 0.62);
if (".,:;'`".includes(ch)) ctx.fillRect(X + Math.floor(cw / 3), Y + Math.round(chh * 0.6), Math.max(1, Math.round(cw / 3)), Math.max(1, Math.round(chh / 6)));
else if ('-_=~'.includes(ch)) ctx.fillRect(X, Y + Math.round(chh * (ch === '_' ? 0.78 : 0.46)), w, Math.max(1, Math.round(chh / (ch === '=' ? 6 : 10))));
else ctx.fillRect(X + (cw > 3 ? 1 : 0), Y + Math.round(chh * 0.22), Math.max(1, w - (cw > 3 ? 1 : 0)), Math.max(1, Math.round(chh * 0.6)));
ctx.globalAlpha = a;
}
}
function fitCells(cols, rows, maxCssW, maxCssH, dpr = globalThis.devicePixelRatio || 1) {
const byW = Math.floor((maxCssW * dpr) / cols);
const byH = maxCssH ? Math.floor((maxCssH * dpr) / (rows * 2)) : byW;
const cw = Math.max(2, Math.min(byW, byH));
return { cw, cssWidth: (cols * cw) / dpr, cssHeight: (rows * cw * 2) / dpr };
}
function renderToCanvas(buffer, canvas, opts = {}) {
const dpr = opts.dpr || globalThis.devicePixelRatio || 1;
const tc = canvas.__prismTerm || (canvas.__prismTerm = new TermCanvas(canvas, opts));
if (opts.theme) tc.setTheme(opts.theme);
const fit = opts.cellWidth
? { cw: Math.round(opts.cellWidth * dpr), cssWidth: buffer.width * opts.cellWidth, cssHeight: buffer.height * opts.cellWidth * 2 }
: fitCells(buffer.width, buffer.height, opts.width || canvas.clientWidth || 640, opts.height || 0, dpr);
tc.layout(buffer.width, buffer.height, fit.cw);
canvas.style.width = `${fit.cssWidth}px`;
canvas.style.height = `${fit.cssHeight}px`;
tc.draw(buffer);
return tc;
}
};
__d[9] = function (__ns) {
const { NONE, luminance, distance2 } = __m(0);
__e(__ns, { "MODES": () => MODES, "MODE_NAMES": () => MODE_NAMES, "ASCII_RAMP": () => ASCII_RAMP, "MONO_RAMP": () => MONO_RAMP, "monoHint": () => monoHint, "pickMode": () => pickMode, "Canvas": () => Canvas }, [], ["ASCII_RAMP","Canvas","MODES","MODE_NAMES","MONO_RAMP","monoHint","pickMode"]);
const MODES = Object.freeze({
braille: { sx: 2, sy: 4 },
sextant: { sx: 2, sy: 3 },
quad: { sx: 2, sy: 2 },
half: { sx: 1, sy: 2 },
ascii: { sx: 1, sy: 1 },
});
const MODE_NAMES = Object.keys(MODES);
const BRAILLE_BITS = [[0x01, 0x08], [0x02, 0x10], [0x04, 0x20], [0x40, 0x80]];
const QUAD_CHARS = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];
const SEXTANT_CHARS = (() => {
const out = new Array(64);
for (let m = 0; m < 64; m++) {
if (m === 0) out[m] = ' ';
else if (m === 63) out[m] = '█';
else if (m === 21) out[m] = '▌';
else if (m === 42) out[m] = '▐';
else out[m] = String.fromCodePoint(0x1fb00 + m - 1 - (m > 21 ? 1 : 0) - (m > 42 ? 1 : 0));
}
return out;
})();
const ASCII_RAMP = ' .:-=+*#%@';
const MONO_RAMP = ' ░▒▓█';
const HALF_SHAPES = [' ', '▀', '▄', '█']; 
const popcount = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
function monoHint(surface) {
for (let s = surface, i = 0; s && i < 16; s = s.parent || s.inner, i++) if (s.monoPaint !== undefined) return s.monoPaint;
return null;
}
const MONO_FLOOR = 0.3;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function pickMode(kind = 'field', caps = {}) {
if (MODES[kind]) return kind;
if (caps.unicode === false) return 'ascii';
if (kind === 'line' || kind === 'dots') return 'braille';
if (kind === 'hires') return caps.sextant ? 'sextant' : 'quad';
return 'half';
}
class Canvas {
constructor(cols, rows, { mode = 'half', dither = false, threshold = 0.08, ramp = ASCII_RAMP, merge = 24, mono = null } = {}) {
if (!MODES[mode]) throw new Error(`unknown canvas mode "${mode}" (expected ${MODE_NAMES.join('|')})`);
this.mode = mode;
this.merge = merge;
this.dither = dither;
this.threshold = threshold;
this.ramp = ramp;
this.mono = mono && mode !== 'braille' ? { ramp: mono.ramp || MONO_RAMP, ref: mono.ref ?? NONE } : null;
this.resize(cols, rows);
}
resize(cols, rows) {
const { sx, sy } = MODES[this.mode];
this.cols = Math.max(0, cols | 0);
this.rows = Math.max(0, rows | 0);
this.sx = sx;
this.sy = sy;
this.width = this.cols * sx;
this.height = this.rows * sy;
this.aspect = (2 * sx) / sy;
this.px = new Int32Array(this.width * this.height).fill(NONE);
return this;
}
clear(color = NONE) {
this.px.fill(color);
return this;
}
set(x, y, c) {
x = Math.floor(x); y = Math.floor(y);
if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
this.px[y * this.width + x] = c;
}
get(x, y) {
x = Math.floor(x); y = Math.floor(y);
if (x < 0 || y < 0 || x >= this.width || y >= this.height) return NONE;
return this.px[y * this.width + x];
}
add(x, y, c) {
x = Math.floor(x); y = Math.floor(y);
if (x < 0 || y < 0 || x >= this.width || y >= this.height || c === NONE) return;
const i = y * this.width + x, o = this.px[i];
if (o === NONE) { this.px[i] = c; return; }
const r = Math.min(255, ((o >> 16) & 255) + ((c >> 16) & 255));
const g = Math.min(255, ((o >> 8) & 255) + ((c >> 8) & 255));
const b = Math.min(255, (o & 255) + (c & 255));
this.px[i] = (r << 16) | (g << 8) | b;
}
blend(x, y, c, a) {
x = Math.floor(x); y = Math.floor(y);
if (x < 0 || y < 0 || x >= this.width || y >= this.height || c === NONE || a <= 0) return;
const i = y * this.width + x, o = this.px[i] === NONE ? 0 : this.px[i];
if (a >= 1) { this.px[i] = c; return; }
const r = ((o >> 16) & 255) + ((((c >> 16) & 255) - ((o >> 16) & 255)) * a);
const g = ((o >> 8) & 255) + ((((c >> 8) & 255) - ((o >> 8) & 255)) * a);
const b = (o & 255) + (((c & 255) - (o & 255)) * a);
this.px[i] = (r << 16) | (g << 8) | (b | 0);
}
shade(fn) {
const { width: W, height: H, px } = this;
for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) px[i] = fn(x, y);
return this;
}
fade(k, floor = 6) {
const px = this.px;
for (let i = 0; i < px.length; i++) {
const c = px[i];
if (c === NONE) continue;
const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
px[i] = r < floor && g < floor && b < floor ? NONE : (r << 16) | (g << 8) | (b | 0);
}
return this;
}
line(x0, y0, x1, y1, c) {
x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
const stx = x0 < x1 ? 1 : -1, sty = y0 < y1 ? 1 : -1;
let err = dx + dy;
for (let n = 0; n < 1e5; n++) {
this.set(x0, y0, c);
if (x0 === x1 && y0 === y1) break;
const e2 = 2 * err;
if (e2 >= dy) { err += dy; x0 += stx; }
if (e2 <= dx) { err += dx; y0 += sty; }
}
return this;
}
path(points, c, closed = false) {
for (let i = 1; i < points.length; i++) this.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], c);
if (closed && points.length > 2) this.line(points.at(-1)[0], points.at(-1)[1], points[0][0], points[0][1], c);
return this;
}
rect(x, y, w, h, c, fill = false) {
if (fill) {
for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(this.height, Math.floor(y + h)); yy++)
for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(this.width, Math.floor(x + w)); xx++) this.px[yy * this.width + xx] = c;
return this;
}
return this.path([[x, y], [x + w - 1, y], [x + w - 1, y + h - 1], [x, y + h - 1]], c, true);
}
ellipse(cx, cy, rx, ry, c, fill = false) {
if (fill) {
for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y++) {
const t = (y - cy) / ry, half = rx * Math.sqrt(Math.max(0, 1 - t * t));
for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) this.set(x, y, c);
}
return this;
}
const steps = Math.max(16, Math.ceil(2 * Math.PI * Math.max(rx, ry)));
let px = cx + rx, py = cy;
for (let i = 1; i <= steps; i++) {
const a = (i / steps) * Math.PI * 2;
const nx = cx + Math.cos(a) * rx, ny = cy + Math.sin(a) * ry;
this.line(px, py, nx, ny, c);
px = nx; py = ny;
}
return this;
}
circle(cx, cy, r, c, fill = false) {
return this.ellipse(cx, cy, r, r / this.aspect, c, fill);
}
polygon(points, c) {
if (points.length < 3) return this;
let minY = Infinity, maxY = -Infinity;
for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
const y0 = Math.max(0, Math.ceil(minY)), y1 = Math.min(this.height - 1, Math.floor(maxY));
const xs = [];
for (let y = y0; y <= y1; y++) {
xs.length = 0;
const sy = y + 0.5;
for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
const [xi, yi] = points[i], [xj, yj] = points[j];
if ((yi > sy) !== (yj > sy)) xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
}
xs.sort((a, b) => a - b);
for (let k = 0; k + 1 < xs.length; k += 2) {
const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.width - 1, Math.floor(xs[k + 1] - 0.5));
for (let x = xa; x <= xb; x++) this.px[y * this.width + x] = c;
}
}
return this;
}
triangle(a, b, c, color) {
return this.polygon([a, b, c], color);
}
bezier(pts, c, steps = 0) {
const n = steps || Math.max(8, Math.ceil(Math.hypot(pts.at(-1)[0] - pts[0][0], pts.at(-1)[1] - pts[0][1])));
const out = [];
for (let i = 0; i <= n; i++) {
const t = i / n, u = 1 - t;
if (pts.length === 3) out.push([u * u * pts[0][0] + 2 * u * t * pts[1][0] + t * t * pts[2][0], u * u * pts[0][1] + 2 * u * t * pts[1][1] + t * t * pts[2][1]]);
else out.push([
u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0],
u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1],
]);
}
return this.path(out, c);
}
draw(src, dx = 0, dy = 0) {
for (let y = 0; y < src.height; y++)
for (let x = 0; x < src.width; x++) {
const c = src.px[y * src.width + x];
if (c !== NONE) this.set(x + dx, y + dy, c);
}
return this;
}
paint(target, ox = 0, oy = 0) {
const mono = this.mono || (this.mode !== 'braille' ? monoHint(target) : null);
if (mono) return this._paintMono(target, ox, oy, mono);
switch (this.mode) {
case 'half': return this._paintHalf(target, ox, oy);
case 'braille': return this._paintBraille(target, ox, oy);
case 'ascii': return this._paintAscii(target, ox, oy);
default: return this._paintBlocks(target, ox, oy, this.mode === 'quad' ? QUAD_CHARS : SEXTANT_CHARS);
}
}
_paintHalf(target, ox, oy) {
const { cols, rows, width: W, px, merge } = this;
for (let cy = 0; cy < rows; cy++) {
const r0 = 2 * cy * W, r1 = r0 + W;
for (let cx = 0; cx < cols; cx++) {
const top = px[r0 + cx], bot = px[r1 + cx];
if (top === NONE && bot === NONE) continue;
if (top === bot || (top !== NONE && bot !== NONE && merge > 0 && distance2(top, bot) <= merge)) target.set(cx + ox, cy + oy, ' ', undefined, top);
else if (top === NONE) target.set(cx + ox, cy + oy, '▄', bot);
else if (bot === NONE) target.set(cx + ox, cy + oy, '▀', top);
else target.set(cx + ox, cy + oy, '▀', top, bot);
}
}
return target;
}
_paintBraille(target, ox, oy) {
const { cols, rows, width: W, px, dither, threshold } = this;
for (let cy = 0; cy < rows; cy++) {
for (let cx = 0; cx < cols; cx++) {
let mask = 0, r = 0, g = 0, b = 0, n = 0;
for (let dy = 0; dy < 4; dy++) {
const row = (cy * 4 + dy) * W + cx * 2;
for (let dx = 0; dx < 2; dx++) {
const c = px[row + dx];
if (c === NONE) continue;
if (dither) {
const x = cx * 2 + dx, y = cy * 4 + dy;
if (luminance(c) <= BAYER4[(y & 3) * 4 + (x & 3)]) continue;
} else if (threshold > 0 && luminance(c) < threshold) continue;
mask |= BRAILLE_BITS[dy][dx];
r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255; n++;
}
}
if (!mask) continue;
let fr = r / n, fg = g / n, fb = b / n;
if (dither) {
const m = Math.max(fr, fg, fb, 1), k = 255 / m;
fr *= k; fg *= k; fb *= k;
}
target.set(cx + ox, cy + oy, String.fromCharCode(0x2800 + mask), (fr << 16) | (fg << 8) | (fb | 0));
}
}
return target;
}
_paintAscii(target, ox, oy) {
const { cols, rows, width: W, px, ramp } = this;
const last = ramp.length - 1;
for (let cy = 0; cy < rows; cy++) {
for (let cx = 0; cx < cols; cx++) {
const c = px[cy * W + cx];
if (c === NONE) continue;
const ch = ramp[Math.min(last, Math.max(1, Math.round(luminance(c) * last)))];
target.set(cx + ox, cy + oy, ch, c);
}
}
return target;
}
_paintMono(target, ox, oy, mono) {
const { cols, rows, width: W, px, sx, sy, mode } = this;
const { ramp, ref } = mono;
const refL = ref === NONE || ref === undefined ? 0 : luminance(ref);
const n = sx * sy, last = ramp.length - 1;
const shapes = mode === 'half' ? HALF_SHAPES : mode === 'quad' ? QUAD_CHARS : mode === 'sextant' ? SEXTANT_CHARS : null;
const N = px.length;
const ink = this._monoInk?.length === N ? this._monoInk : (this._monoInk = new Float32Array(N));
let lo = Infinity, hi = 0;
for (let i = 0; i < N; i++) {
const c = px[i];
if (c === NONE) { ink[i] = -1; continue; }
const v = Math.abs(luminance(c) - refL);
ink[i] = v;
if (v < lo) lo = v;
if (v > hi) hi = v;
}
if (hi === 0 && lo === Infinity) return target; 
let transparent = false;
for (let i = 0; i < N; i++) if (ink[i] < 0) { transparent = true; break; }
const top = Math.max(hi, MONO_FLOOR);
const bot = transparent ? 0 : Math.min(Math.max(0, lo), top - MONO_FLOOR);
const k = 1 / (top - bot);
for (let cy = 0; cy < rows; cy++) {
for (let cx = 0; cx < cols; cx++) {
let sum = 0, opaque = 0, full = 0, seen = 0, seenSum = 0, binary = true;
for (let dy = 0, j = 0; dy < sy; dy++) {
const row = (cy * sy + dy) * W + cx * sx;
for (let dx = 0; dx < sx; dx++, j++) {
const v = ink[row + dx];
if (v < 0) continue;
opaque++;
const q = Math.min(1, Math.max(0, (v - bot) * k));
sum += q;
const lv = Math.round(q * last);
if (lv === last) full |= 1 << j;
else if (lv !== 0) binary = false;
if (lv > 0) { seen |= 1 << j; seenSum += q; }
}
}
if (!opaque) continue;
let ch;
if (shapes && binary) ch = shapes[full];
else if (shapes && opaque < n && seen && seenSum / popcount(seen) >= 0.5) ch = shapes[seen];
else ch = ramp[Math.min(last, Math.round((sum / n) * last))];
target.set(cx + ox, cy + oy, ch, NONE);
}
}
return target;
}
_paintBlocks(target, ox, oy, chars) {
const { cols, rows, width: W, px, sx, sy } = this;
const n = sx * sy;
const cell = new Int32Array(n);
for (let cy = 0; cy < rows; cy++) {
for (let cx = 0; cx < cols; cx++) {
let opaque = 0;
for (let dy = 0, k = 0; dy < sy; dy++)
for (let dx = 0; dx < sx; dx++, k++) {
const c = px[(cy * sy + dy) * W + cx * sx + dx];
cell[k] = c;
if (c !== NONE) opaque++;
}
if (!opaque) continue;
if (opaque < n) {
let mask = 0, r = 0, g = 0, b = 0;
for (let k = 0; k < n; k++) {
const c = cell[k];
if (c === NONE) continue;
mask |= 1 << k;
r += (c >> 16) & 255; g += (c >> 8) & 255; b += c & 255;
}
target.set(cx + ox, cy + oy, chars[mask], ((r / opaque) << 16) | ((g / opaque) << 8) | ((b / opaque) | 0));
continue;
}
let ia = 0, ib = 0, best = -1;
for (let i = 0; i < n; i++)
for (let j = i + 1; j < n; j++) {
const d = distance2(cell[i], cell[j]);
if (d > best) { best = d; ia = i; ib = j; }
}
if (best < 64) {
let r = 0, g = 0, b = 0;
for (let k = 0; k < n; k++) { r += (cell[k] >> 16) & 255; g += (cell[k] >> 8) & 255; b += cell[k] & 255; }
target.set(cx + ox, cy + oy, ' ', undefined, ((r / n) << 16) | ((g / n) << 8) | ((b / n) | 0));
continue;
}
const ca = cell[ia], cb = cell[ib];
let mask = 0, ar = 0, ag = 0, ab = 0, an = 0, br = 0, bg = 0, bb = 0, bn = 0;
for (let k = 0; k < n; k++) {
const c = cell[k];
if (distance2(c, ca) <= distance2(c, cb)) {
mask |= 1 << k; ar += (c >> 16) & 255; ag += (c >> 8) & 255; ab += c & 255; an++;
} else {
br += (c >> 16) & 255; bg += (c >> 8) & 255; bb += c & 255; bn++;
}
}
const fgc = ((ar / an) << 16) | ((ag / an) << 8) | ((ab / an) | 0);
const bgc = ((br / bn) << 16) | ((bg / bn) << 8) | ((bb / bn) | 0);
target.set(cx + ox, cy + oy, chars[mask], fgc, bgc);
}
}
return target;
}
}
};
__d[10] = function (__ns) {

__e(__ns, { "easing": () => easing, "clamp": () => clamp, "lerp": () => lerp, "smoothstep": () => smoothstep, "fract": () => fract, "remap": () => remap, "pingpong": () => pingpong, "tween": () => tween, "rng": () => rng }, [], ["clamp","easing","fract","lerp","pingpong","remap","rng","smoothstep","tween"]);
const { PI, sin, cos, pow, sqrt } = Math;
const easing = {
linear: (t) => t,
inQuad: (t) => t * t,
outQuad: (t) => t * (2 - t),
inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
inCubic: (t) => t * t * t,
outCubic: (t) => 1 - pow(1 - t, 3),
inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2),
inQuart: (t) => t * t * t * t,
outQuart: (t) => 1 - pow(1 - t, 4),
inOutSine: (t) => -(cos(PI * t) - 1) / 2,
outSine: (t) => sin((t * PI) / 2),
inExpo: (t) => (t === 0 ? 0 : pow(2, 10 * t - 10)),
outExpo: (t) => (t === 1 ? 1 : 1 - pow(2, -10 * t)),
inOutExpo: (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2),
outCirc: (t) => sqrt(1 - pow(t - 1, 2)),
outBack: (t) => 1 + 2.70158 * pow(t - 1, 3) + 1.70158 * pow(t - 1, 2),
inOutBack: (t) => {
const c = 1.70158 * 1.525;
return t < 0.5 ? (pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2 : (pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
},
outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : pow(2, -10 * t) * sin((t * 10 - 0.75) * ((2 * PI) / 3)) + 1),
outBounce: (t) => {
const n = 7.5625, d = 2.75;
if (t < 1 / d) return n * t * t;
if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
return n * (t -= 2.625 / d) * t + 0.984375;
},
};
const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
const pingpong = (t) => 1 - Math.abs((t % 2 + 2) % 2 - 1);
function tween(t, start, dur, ease = easing.inOutCubic) {
return ease(clamp((t - start) / dur));
}
function rng(seed = 0x9e3779b9) {
let a = seed >>> 0;
const next = () => {
a = (a + 0x6d2b79f5) >>> 0;
let t = a;
t = Math.imul(t ^ (t >>> 15), t | 1);
t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
next.range = (lo, hi) => lo + next() * (hi - lo);
next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
next.pick = (arr) => arr[Math.floor(next() * arr.length)];
next.gauss = () => { const u = 1 - next(), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
return next;
}
};
__d[11] = function (__ns) {
const { rng } = __m(10);
__e(__ns, { "createNoise": () => createNoise, "noise3": () => noise3, "noise2": () => noise2, "fbm": () => fbm }, [], ["createNoise","fbm","noise2","noise3"]);
const GRAD3 = [
[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
[1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function createNoise(seed = 1337) {
const rand = rng(seed);
const p = new Uint8Array(256).map((_, i) => i);
for (let i = 255; i > 0; i--) {
const j = Math.floor(rand() * (i + 1));
[p[i], p[j]] = [p[j], p[i]];
}
const perm = new Uint8Array(512);
for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
const g = (h, x, y, z) => {
const v = GRAD3[h % 12];
return v[0] * x + v[1] * y + v[2] * z;
};
function noise3(x, y, z = 0) {
const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
const u = fade(x), v = fade(y), w = fade(z);
const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
const l1 = (a, b, t) => a + t * (b - a);
return l1(
l1(l1(g(perm[AA], x, y, z), g(perm[BA], x - 1, y, z), u), l1(g(perm[AB], x, y - 1, z), g(perm[BB], x - 1, y - 1, z), u), v),
l1(l1(g(perm[AA + 1], x, y, z - 1), g(perm[BA + 1], x - 1, y, z - 1), u), l1(g(perm[AB + 1], x, y - 1, z - 1), g(perm[BB + 1], x - 1, y - 1, z - 1), u), v),
w,
);
}
function fbm(x, y, z = 0, octaves = 4, lacunarity = 2, gain = 0.5) {
let sum = 0, amp = 1, freq = 1, norm = 0;
for (let o = 0; o < octaves; o++) {
sum += amp * noise3(x * freq, y * freq, z * freq);
norm += amp;
amp *= gain;
freq *= lacunarity;
}
return sum / norm;
}
return { noise3, noise2: (x, y) => noise3(x, y, 0), fbm };
}
const shared = createNoise();
const noise3 = shared.noise3;
const noise2 = shared.noise2;
const fbm = shared.fbm;
};
__d[12] = function (__ns) {
const { Surface } = __m(6);
const { charWidth } = __m(5);
__e(__ns, { "foldChar": () => foldChar, "foldText": () => foldText, "asciiSurface": () => asciiSurface }, [], ["asciiSurface","foldChar","foldText"]);
const MAP = new Map();
const put = (chars, a) => { for (const c of chars) MAP.set(c, a); };
for (let cp = 0x2500; cp <= 0x257f; cp++) MAP.set(String.fromCodePoint(cp), '+');
put('─━┄┅┈┉╌╍╴╶╸╺╼╾', '-');
put('═', '=');
put('│┃┆┇┊┋╎╏║╵╷╹╻╽╿', '|');
put('╱', '/'); put('╲', '\\'); put('╳', 'X');
put('█▓▉▊▋■▪▮◼▇', '#');
put('▒▚▞', ':');
put('░▖▗▘▝▁▂', '.');
put('▃▄', '_');
put('▅▆▬', '=');
put('▀▔', '"');
put('▏▎▍▌▐▕', '|');
put('▙▛▜▟', '#');
put('●◉⬤◍', 'o'); put('○◌◯', 'o'); put('◆◈❖', '*'); put('◇', 'o'); put('□▯▢', '[');
put('★☆✦✧✶✸✺✹✷⁂☼', '*'); put('•∙⋅·', '.'); put('◐◑◒◓◔◕', 'o');
put('→⇒⟶➜➔➝➞⇢⇨', '>'); put('←⇐⟵⇠⇦', '<'); put('↑⇑⇡⇧', '^'); put('↓⇓⇣⇩', 'v');
put('↗↙', '/'); put('↖↘', '\\'); put('↔⇔', '-'); put('↕⇕', '|'); put('↻↺⟳⟲', '@');
put('▶▸►▹⏵❯›»', '>'); put('◀◂◄◃⏴❮‹«', '<'); put('▲▴△▵⏶', '^'); put('▼▾▽▿⏷', 'v');
put('✔✓☑', '+'); put('✖✗✘☒', 'x'); put('⚠', '!'); put('ℹ', 'i'); put('⚡', '!');
put('—–‒―−', '-'); put('…', '.'); put('×', 'x'); put('÷', '/'); put('±', '+');
put('≥≧', '>'); put('≤≦', '<'); put('≠', '#'); put('≈∼', '~'); put('°', 'o'); put('µμ', 'u');
put('‘’‚′', "'"); put('“”„″', '"'); put('¦‖', '|'); put('§', 'S'); put('¶', 'P');
put('©', 'c'); put('®', 'r'); put('™', 't'); put('€', 'E'); put('£', 'L'); put('¥', 'Y');
put('∞', '8'); put('√', 'v'); put('∑', 'E'); put('∆Δ', 'A'); put('λ', 'l'); put('π', 'p'); put('σ', 's');
put('⎇', 'Y'); put('⎈', '*'); put('⊘⌀', '0'); put('␣', '_'); put('⏎↵', '<');
const BRAILLE_RAMP = ' ..::++##';
const SEXTANT_RAMP = ' ..::+##';
const popcount = (n) => { let k = 0; while (n) { k += n & 1; n >>= 1; } return k; };
function foldChar(c) {
if (!c) return c;
const cp = c.codePointAt(0);
if (cp >= 0x20 && cp < 0x7f) return c;
if (cp < 0x20 || cp === 0x7f) return ' ';
const m = MAP.get(c);
if (m) return m;
if (cp >= 0x2800 && cp <= 0x28ff) return BRAILLE_RAMP[popcount(cp - 0x2800)];
if (cp >= 0x1fb00 && cp <= 0x1fb3b) {
let mask = cp - 0x1fb00 + 1;
if (mask >= 21) mask++;
if (mask >= 42) mask++;
return SEXTANT_RAMP[popcount(mask)];
}
const base = c.normalize('NFD')[0];
if (base && base.codePointAt(0) < 0x7f && base.codePointAt(0) >= 0x20) return base;
return '?';
}
function foldText(s) {
let out = '';
for (const c of String(s)) {
const cp = c.codePointAt(0);
if (cp >= 0x20 && cp < 0x7f) { out += c; continue; }
const w = charWidth(cp);
if (w === 0) continue;
out += w === 2 ? '??' : foldChar(c);
}
return out;
}
class AsciiSurface extends Surface {
constructor(inner) {
super();
this.inner = inner;
this.ascii = true;
}
get width() { return this.inner.width; }
get height() { return this.inner.height; }
set(x, y, ch, fg, bg, attr) {
if (ch !== undefined) ch = ch === '' ? '?' : foldChar(String.fromCodePoint(ch.codePointAt(0)));
return this.inner.set(x, y, ch, fg, bg, attr);
}
get(x, y) { return this.inner.get(x, y); }
clear(bg, fg) { this.inner.clear(bg, fg); return this; }
text(x, y, str, fg, bg, attr) { return super.text(x, y, foldText(str), fg, bg, attr); }
}
function asciiSurface(surface) {
return surface && surface.ascii ? surface : new AsciiSurface(surface);
}
};
__d[13] = function (__ns) {
const { NONE } = __m(0);
const { Canvas, pickMode, ASCII_RAMP, MONO_RAMP } = __m(9);
const { getTheme, palette: makePalette } = __m(3);
const { rng } = __m(10);
const { createNoise } = __m(11);
const { asciiSurface } = __m(12);
__e(__ns, { "createContext": () => createContext }, [], ["createContext"]);
function createContext({ scene = {}, buffer, caps = {}, theme, mode = null, transparent = false, params = {}, seed = 7 }) {
const th = getTheme(theme);
const monoPaint = caps.depth === 'mono' ? { ramp: caps.unicode === false ? ASCII_RAMP : MONO_RAMP, ref: th.bg } : null;
if (buffer) buffer.monoPaint = monoPaint;
let root = buffer;
for (let i = 0; root && (root.parent || root.inner) && i < 16; i++) root = root.parent || root.inner;
if (root) root.light16 = th.mode === 'light';
if (root) root.inkAsDefault = transparent ? th.ink : null;
if (caps.unicode === false) buffer = asciiSurface(buffer);
const ctx = {
width: buffer.width,
height: buffer.height,
buffer,
theme: th,
caps,
mode,
params,
seed,
bg: transparent ? NONE : th.bg,
rng: rng(seed),
noise: createNoise(seed),
canvas(kind = scene.canvas || 'field', opts = {}) {
const { cols = ctx.width, rows = ctx.height, ...rest } = opts;
const m = mode || pickMode(kind, caps);
const dither = m === 'braille' && (kind === 'field' || kind === 'hires');
return new Canvas(cols, rows, { mode: m, dither, mono: monoPaint, ...rest });
},
palette(name, opts) {
return makePalette(params.palette || name || scene.palette || 'prism', th, opts);
},
param(key, def) {
if (!(key in params)) return def;
const v = params[key];
return typeof def === 'number' ? Number(v) : typeof def === 'boolean' ? !/^(0|false|no|off)$/i.test(v) : v;
},
};
return ctx;
}
};
__d[14] = function (__ns) {
const { CellBuffer } = __m(6);
const { createContext } = __m(13);
const { getTheme } = __m(3);
const { normalizeDepth } = __m(0);
const { TermCanvas, fitCells } = __m(8);
__e(__ns, { "WEB_CAPS": () => WEB_CAPS, "prefersReducedMotion": () => prefersReducedMotion, "setGlobalMotion": () => setGlobalMotion, "isGlobalMotionPaused": () => isGlobalMotionPaused, "FacetPlayer": () => FacetPlayer, "mountFacet": () => mountFacet, "playerStats": () => playerStats }, [], ["FacetPlayer","WEB_CAPS","isGlobalMotionPaused","mountFacet","playerStats","prefersReducedMotion","setGlobalMotion"]);
const WEB_CAPS = Object.freeze({ isTTY: false, depth: 'truecolor', unicode: true, braille: true, sextant: true, width: 80, height: 24, program: 'web', platform: 'web' });
const players = new Set();
let raf = 0;
let globalPaused = false;
let motionChosen = false; 
const BUDGET_MS = 9;
let turn = 0;
function pump(now) {
raf = 0;
let again = false;
const list = [...players], n = list.length, start = performance.now();
turn = (turn + 1) % Math.max(1, n);
for (let k = 0; k < n; k++) {
const p = list[(turn + k) % n];
if (!p._wants()) continue;
again = true;
if (performance.now() - start < BUDGET_MS) p._tick(now);
}
if (again) raf = requestAnimationFrame(pump);
}
function wake() { if (!raf && players.size) raf = requestAnimationFrame(pump); }
let reducedQuery;
const prefersReducedMotion = () => {
if (reducedQuery === undefined) reducedQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
return !!reducedQuery?.matches;
};
function setGlobalMotion(paused) {
globalPaused = !!paused;
motionChosen = true;
for (const p of players) if (!globalPaused) p._resync();
wake();
}
const isGlobalMotionPaused = () => globalPaused;
let observer = null;
function observe(p) {
if (!globalThis.IntersectionObserver) { p.visible = true; return; }
observer ||= new IntersectionObserver((entries) => {
for (const e of entries) {
const pl = e.target.__prismPlayer;
if (!pl) continue;
pl.visible = e.isIntersecting;
if (pl.visible) { pl._resync(); wake(); }
}
}, { rootMargin: '0px' }); 
p.canvas.__prismPlayer = p;
observer.observe(p.canvas);
}
class FacetPlayer {
constructor(el, facet, opts = {}) {
this.facet = facet;
this.opts = { fps: 30, speed: 1, autoPause: true, seed: 7, ...opts };
this.canvas = el.tagName === 'CANVAS' ? el : el.appendChild(document.createElement('canvas'));
this.canvas.setAttribute('role', 'img');
this.canvas.setAttribute('aria-label', opts.label || `${facet.title || facet.id} — terminal animation`);
this.tc = new TermCanvas(this.canvas, { depth: this.opts.depth });
this.playing = true;
this.visible = !this.opts.autoPause;
this.stats = { frames: 0, ms: 0 };
this.error = null;
players.add(this);
if (this.opts.autoPause) observe(this);
this._build();
wake();
}
get animated() { return this.facet.animated !== false; }
get still() { return this.opts.still || (!motionChosen && prefersReducedMotion()) || !this.animated; }
get time() { return this.t; }
_size() {
const f = this.facet;
return { cols: this.opts.cols || f.size?.w || 80, rows: this.opts.rows || f.size?.h || 24 };
}
get caps() {
const depth = normalizeDepth(this.opts.depth || 'truecolor'), u = !this.opts.ascii;
return { ...WEB_CAPS, depth, unicode: u, braille: u, sextant: u, width: this._size().cols, height: this._size().rows };
}
_build() {
const { cols, rows } = this._size();
this.theme = getTheme(this.opts.theme);
this.buffer = new CellBuffer(cols, rows);
this.tc.setTheme(this.theme);
this.tc.setDepth(this.opts.depth || 'truecolor');
this._layout();
this.error = null;
try {
const sheenKey = this._sheenKey();
this.sheen = !!sheenKey && this._sheenFor === sheenKey;
const params = this.sheen ? { ...this.opts.params, palette: 'prism-sheen' } : this.opts.params || {};
this.ctx = createContext({ scene: this.facet, buffer: this.buffer, caps: this.caps, theme: this.opts.theme, mode: this.opts.mode || null, params, seed: this.opts.seed, transparent: !!this.opts.transparent });
this.frame = this.facet.setup(this.ctx);
} catch (err) { this._fail(err); return; }
this.t = 0;
this.n = 0;
const loop = this.facet.loop || 8;
const target = this.still ? (this.animated ? Math.min(loop * 0.35, 6) : 0) : (this.opts.warmup ?? Math.min(1.2, loop * 0.15));
this._advanceTo(target);
if (!this.sheen && !this.error && this._fullField()) { this._sheenFor = this._sheenKey(); this._build(); return; }
this._paint();
this._resync();
}
_sheenKey() {
const p = this.opts.params || {};
if (p.palette || this.theme.mode !== 'light' || this.facet.canvas !== 'field' || (this.facet.palette || 'prism') !== 'prism') return '';
const { cols, rows } = this._size();
return `${this.theme.id}|${cols}x${rows}|${JSON.stringify(p)}`;
}
_fullField() {
if (!this._sheenKey()) return false;
const { bg, fg, ch } = this.buffer, base = this.theme.bg;
let n = 0;
for (let i = 0; i < bg.length; i++) if ((bg[i] !== -1 && bg[i] !== base) || (ch[i] !== ' ' && fg[i] !== base)) n++;
return n >= 0.9 * bg.length;
}
_layout() {
const { cols, rows } = this._size();
const dpr = globalThis.devicePixelRatio || 1;
let fit;
if (this.opts.cellWidth) fit = { cw: Math.round(this.opts.cellWidth * dpr), cssWidth: cols * this.opts.cellWidth, cssHeight: rows * this.opts.cellWidth * 2 };
else fit = fitCells(cols, rows, this.opts.fit?.width || this.canvas.parentElement?.clientWidth || 640, this.opts.fit?.height || 0, dpr);
this.tc.layout(cols, rows, fit.cw);
this.canvas.style.width = `${fit.cssWidth}px`;
this.canvas.style.height = `${fit.cssHeight}px`;
}
_advanceTo(target) {
if (!this.frame) return;
try {
const dt = 1 / 15;
if (target <= 0) { this.buffer.clear(this.ctx.bg); this.frame(0, dt, this.n++); return; }
while (this.t < target) {
this.t = Math.min(target, this.t + dt);
this.buffer.clear(this.ctx.bg);
this.frame(this.t, dt, this.n++);
}
} catch (err) { this._fail(err); }
}
_paint() {
if (this.error) return;
this.tc.draw(this.buffer);
}
_fail(err) {
this.error = err;
this.frame = null;
console.error(`[prism-term] facet ${this.facet.id} failed:`, err);
const b = this.buffer;
b.clear(this.theme.bg);
b.text(1, Math.floor(b.height / 2), `⚠ ${this.facet.id}: ${String(err?.message || err)}`.slice(0, b.width - 2), this.theme.neg);
this.tc.draw(b);
}
_wants() { return this.playing && this.visible && !globalPaused && !this.still && !!this.frame; }
_resync() { const now = performance.now(); this.last = now - Math.random() * (1000 / this.opts.fps); this.lastStep = now; }
_tick(now) {
const interval = 1000 / this.opts.fps;
if (now - this.last < interval - 2) return;
this.last = now;
const dt = Math.min(0.1, (now - this.lastStep) / 1000) * this.opts.speed;
this.lastStep = now;
const t0 = performance.now();
try {
this.t += dt;
this.buffer.clear(this.ctx.bg);
this.frame(this.t, dt, this.n++);
this.tc.draw(this.buffer);
} catch (err) { this._fail(err); return; }
this.stats.frames++;
this.stats.ms += performance.now() - t0;
}
play() { this.playing = true; this._resync(); wake(); return this; }
pause() { this.playing = false; return this; }
toggle() { return this.playing ? this.pause() : this.play(); }
restart() { this._build(); wake(); return this; }
set(next = {}) {
const rebuild = ['cols', 'rows', 'theme', 'mode', 'params', 'seed', 'transparent', 'still', 'depth', 'ascii'].some((k) => k in next && JSON.stringify(next[k]) !== JSON.stringify(this.opts[k]));
const relayout = ['fit', 'cellWidth'].some((k) => k in next);
Object.assign(this.opts, next);
if (rebuild) this._build();
else if (relayout) { this._layout(); this.tc.full = true; this._paint(); }
wake();
return this;
}
get avgFrameMs() { return this.stats.frames ? this.stats.ms / this.stats.frames : 0; }
snapshot() { return this.buffer.clone(); }
destroy() {
players.delete(this);
observer?.unobserve(this.canvas);
if (this.canvas.__prismPlayer === this) delete this.canvas.__prismPlayer;
this.frame = null;
}
}
function mountFacet(el, facet, opts) {
return new FacetPlayer(el, facet, opts);
}
function playerStats() {
let active = 0, ms = 0, frames = 0;
for (const p of players) { if (p._wants()) active++; ms += p.stats.ms; frames += p.stats.frames; }
return { players: players.size, active, avgFrameMs: frames ? ms / frames : 0 };
}
};
__d[15] = function (__ns) {
const { CellBuffer, ATTR } = __m(6);
const { NONE, ANSI16 } = __m(0);
const { charWidth } = __m(5);
__e(__ns, { "parseAnsi": () => parseAnsi }, [], ["parseAnsi"]);
function xterm256(n) {
if (n < 16) return ANSI16[n];
if (n >= 232) { const v = 8 + (n - 232) * 10; return (v << 16) | (v << 8) | v; }
const i = n - 16, lv = [0, 95, 135, 175, 215, 255];
return (lv[Math.floor(i / 36)] << 16) | (lv[Math.floor(i / 6) % 6] << 8) | lv[i % 6];
}
function parseAnsi(text, { minWidth = 1, maxWidth = 200, tabSize = 8 } = {}) {
const rows = [];
let row = [], fg = NONE, bg = NONE, at = 0;
const flush = () => { rows.push(row); row = []; };
const s = String(text).replace(/\r\n/g, '\n');
for (let i = 0; i < s.length; i++) {
const c = s[i];
if (c === '\x1b') {
if (s[i + 1] === '[') {
let j = i + 2;
while (j < s.length && !/[@-~]/.test(s[j])) j++;
if (s[j] === 'm') {
const ps = s.slice(i + 2, j).split(';').map((v) => (v === '' ? 0 : Number(v)));
for (let k = 0; k < ps.length; k++) {
const v = ps[k];
if (v === 0) { fg = NONE; bg = NONE; at = 0; }
else if (v === 1) at |= ATTR.BOLD; else if (v === 2) at |= ATTR.DIM; else if (v === 3) at |= ATTR.ITALIC;
else if (v === 4) at |= ATTR.UNDERLINE; else if (v === 7) at |= ATTR.INVERSE; else if (v === 9) at |= ATTR.STRIKE;
else if (v === 22) at &= ~(ATTR.BOLD | ATTR.DIM); else if (v === 23) at &= ~ATTR.ITALIC; else if (v === 24) at &= ~ATTR.UNDERLINE;
else if (v === 27) at &= ~ATTR.INVERSE; else if (v === 29) at &= ~ATTR.STRIKE;
else if (v >= 30 && v <= 37) fg = ANSI16[v - 30]; else if (v >= 90 && v <= 97) fg = ANSI16[v - 82];
else if (v >= 40 && v <= 47) bg = ANSI16[v - 40]; else if (v >= 100 && v <= 107) bg = ANSI16[v - 92];
else if (v === 39) fg = NONE; else if (v === 49) bg = NONE;
else if (v === 38 || v === 48) {
let col = NONE;
if (ps[k + 1] === 2) { col = ((ps[k + 2] & 255) << 16) | ((ps[k + 3] & 255) << 8) | (ps[k + 4] & 255); k += 4; }
else if (ps[k + 1] === 5) { col = xterm256(ps[k + 2] & 255); k += 2; }
if (v === 38) fg = col; else bg = col;
}
}
}
i = j;
} else if (s[i + 1] === ']') {
const end = s.indexOf('\x07', i);
i = end < 0 ? s.length : end;
} else i++;
continue;
}
if (c === '\n') { flush(); continue; }
if (c === '\r') continue;
if (c === '\t') { const n = tabSize - (row.length % tabSize); for (let k = 0; k < n; k++) row.push({ ch: ' ', fg, bg, at }); continue; }
const cp = s.codePointAt(i);
const ch = String.fromCodePoint(cp);
if (ch.length === 2) i++;
const w = charWidth(cp);
if (w === 0) continue;
row.push({ ch, fg, bg, at });
if (w === 2) row.push({ ch: '', fg, bg, at });
}
if (row.length) flush();
while (rows.length && rows.at(-1).length === 0) rows.pop();
const width = Math.min(maxWidth, rows.reduce((w, r) => Math.max(w, r.length), Math.max(1, minWidth)));
const b = new CellBuffer(width, Math.max(1, rows.length));
rows.forEach((r, y) => r.slice(0, width).forEach((c, x) => b.set(x, y, c.ch, c.fg, c.bg, c.at)));
return b;
}
};
__d[16] = function (__ns) {
const __r0 = __m(8);
const __r1 = __m(14);
const __r2 = __m(15);
const __r3 = __m(7);
__e(__ns, { "TermCanvas": () => __r0.TermCanvas, "renderToCanvas": () => __r0.renderToCanvas, "fitCells": () => __r0.fitCells, "FONT_STACK": () => __r0.FONT_STACK, "FacetPlayer": () => __r1.FacetPlayer, "mountFacet": () => __r1.mountFacet, "setGlobalMotion": () => __r1.setGlobalMotion, "isGlobalMotionPaused": () => __r1.isGlobalMotionPaused, "prefersReducedMotion": () => __r1.prefersReducedMotion, "playerStats": () => __r1.playerStats, "WEB_CAPS": () => __r1.WEB_CAPS, "parseAnsi": () => __r2.parseAnsi, "glyphClass": () => __r3.glyphClass, "blockGeometry": () => __r3.blockGeometry, "brailleDots": () => __r3.brailleDots, "sextantCells": () => __r3.sextantCells, "boxGeometry": () => __r3.boxGeometry }, [], ["FONT_STACK","FacetPlayer","TermCanvas","WEB_CAPS","blockGeometry","boxGeometry","brailleDots","fitCells","glyphClass","isGlobalMotionPaused","mountFacet","parseAnsi","playerStats","prefersReducedMotion","renderToCanvas","setGlobalMotion","sextantCells"]);

};
__d[17] = function (__ns) {

__e(__ns, { "GALLERIES": () => GALLERIES, "GALLERY_IDS": () => GALLERY_IDS, "getGallery": () => getGallery }, [], ["GALLERIES","GALLERY_IDS","getGallery"]);
const GALLERIES = [
{
id: 'fx', title: 'FX Store', icon: '✺',
blurb: 'Full-field effects: plasma, fire, fractals, water and light.',
categories: ['Fields', 'Fractals', 'Fire & Water', 'Light & Sky', 'Glitch & Noise'],
},
{
id: 'objects', title: 'Animated Objects', icon: '◈',
blurb: '3D solids, wireframes, globes and mechanical things that move.',
categories: ['3D Solids', 'Wireframes', 'Globes & Planets', 'Mechanical', 'Icons & Logos'],
},
{
id: 'sim', title: 'Particles & Simulations', icon: '✦',
blurb: 'Particles, cellular automata, physics, flocking and weather.',
categories: ['Particles', 'Cellular Automata', 'Physics', 'Life & Flocking', 'Weather'],
},
{
id: 'retro', title: 'Retro & Demoscene', icon: '▚',
blurb: 'Cracktro scrollers, copper bars, BBS-era ANSI art and chiptune visuals.',
categories: ['Intros & Scrollers', 'Raster & Copper', 'BBS & ANSI Art', 'Chiptune Visuals', 'Outrun'],
},
{
id: 'text', title: 'Text Effects', icon: 'Aa',
blurb: 'Banners, bitmap fonts, reveals, glitches and color on type.',
categories: ['Banners & Fonts', 'Reveal & Type', 'Glitch & Distort', 'Color & Light', 'Motion'],
},
{
id: 'loaders', title: 'Spinners & Loaders', icon: '⠿',
blurb: 'Every way to say "working…" in one or two cells.',
categories: ['Classic Spinners', 'Braille Spinners', 'Bars & Pulses', 'Orbits & Shapes', 'Truecolor Spinners'],
},
{
id: 'progress', title: 'Progress & Counters', icon: '▰',
blurb: 'Progress bars, multi-step pipelines, counters, timers and transfer meters.',
categories: ['Progress Bars', 'Steps & Pipelines', 'Counters & Odometers', 'Timers & Countdowns', 'Transfers & ETA'],
},
{
id: 'charts', title: 'Charts & Metrics', icon: '▁▃▆',
blurb: 'Sparklines, line and bar charts, gauges, heatmaps and KPI tiles.',
categories: ['Sparklines', 'Line & Area', 'Bars & Histograms', 'Gauges & Meters', 'Heatmaps & Matrices', 'KPI Tiles'],
},
{
id: 'ai', title: 'AI Working', icon: '✳',
blurb: 'Thinking states, token streams, tool calls and agent pipelines.',
categories: ['Thinking States', 'Token Streams', 'Tool Calls', 'Agents & Pipelines', 'Model Internals'],
},
{
id: 'status', title: 'Notifications & Status', icon: '●',
blurb: 'Toasts, status lines, badges, health indicators and log lines.',
categories: ['Toasts & Alerts', 'Status Lines', 'Badges & Pills', 'Health & Uptime', 'Log Lines'],
},
{
id: 'ops', title: 'Linux & Ops', icon: '$_',
blurb: 'What you see on a real box: monitors, disks, network, services, containers and logins.',
categories: ['System Monitors', 'Disk & Storage', 'Network', 'Processes & Services', 'Containers & Clusters', 'Logs & Journals', 'Login & MOTD', 'Shell Prompts'],
},
{
id: 'diagrams', title: 'Architecture Diagrams', icon: '┌┐',
blurb: 'Box-drawing flows, trees, topologies, sequences and git graphs.',
categories: ['Boxes & Flows', 'Trees & Hierarchies', 'Networks & Topologies', 'Sequence & Timelines', 'Git Graphs'],
},
{
id: 'callouts', title: 'Callouts & Layout', icon: '▌',
blurb: 'Panels, borders, admonitions, tables, dividers and key-value blocks.',
categories: ['Panels & Borders', 'Admonitions', 'Tables', 'Dividers & Headers', 'Key-Value'],
},
{
id: 'input', title: 'Input & Menus', icon: '❯',
blurb: 'TUI controls: selects, checkboxes, text fields, palettes, dialogs and tab bars.',
categories: ['Selects & Lists', 'Toggles & Checkboxes', 'Text Fields', 'Command Palettes', 'Dialogs & Prompts', 'Tabs & Bars'],
},
{
id: 'maps', title: 'Maps & Geo', icon: '◍',
blurb: 'World maps, radar sweeps, routes, arcs and floorplans in braille and blocks.',
categories: ['World Maps', 'Radar & Sonar', 'Routes & Arcs', 'Grids & Floorplans'],
},
{
id: 'lab', title: 'Animation Lab', icon: '∿',
blurb: 'Motion studies: easing curves, springs, timing and the building blocks of animation.',
categories: ['Easing & Timing', 'Springs & Physics', 'Loops & Cycles', 'Transitions'],
},
{
id: 'ascii', title: 'Pure ASCII', icon: '#',
blurb: '7-bit only — no Unicode, no color required. Runs on a VT100, a serial console, anything.',
categories: ['ASCII Animations', 'ASCII Art', 'ASCII Spinners & Bars', 'Classics'],
},
];
const GALLERY_IDS = GALLERIES.map((g) => g.id);
const BY_ID = new Map(GALLERIES.map((g) => [g.id, g]));
const getGallery = (id) => BY_ID.get(id) || null;
};
__d[18] = function (__ns) {
const { NONE, luminance } = __m(0);
__e(__ns, { "zbuffer": () => zbuffer, "tri": () => tri, "sub": () => sub, "cross": () => cross, "dot": () => dot, "norm": () => norm, "drawMesh": () => drawMesh, "sphere": () => sphere, "starfield": () => starfield, "lit": () => lit, "blend": () => blend, "rotX": () => rotX, "rotY": () => rotY, "rotZ": () => rotZ, "mul": () => mul, "apply": () => apply, "transpose": () => transpose, "perspective": () => perspective, "fillPoly": () => fillPoly, "shadow": () => shadow }, [], ["apply","blend","cross","dot","drawMesh","fillPoly","lit","mul","norm","perspective","rotX","rotY","rotZ","shadow","sphere","starfield","sub","transpose","tri","zbuffer"]);
function zbuffer(cv) {
const z = new Float32Array(cv.width * cv.height);
z.fill(Infinity);
return z;
}
function tri(cv, z, a, b, c, ia, ib, ic, shade) {
const W = cv.width, H = cv.height, px = cv.px;
const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
if (!(Math.abs(area) > 1e-9) || x0 > x1 || y0 > y1) return;
const inv = 1 / area;
for (let y = y0; y <= y1; y++) {
const py = y + 0.5;
for (let x = x0; x <= x1; x++) {
const pxc = x + 0.5;
const w0 = ((b[0] - pxc) * (c[1] - py) - (b[1] - py) * (c[0] - pxc)) * inv;
const w1 = ((c[0] - pxc) * (a[1] - py) - (c[1] - py) * (a[0] - pxc)) * inv;
const w2 = 1 - w0 - w1;
if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
const d = w0 * a[2] + w1 * b[2] + w2 * c[2];
const i = y * W + x;
if (d >= z[i]) continue;
const col = shade(w0 * ia + w1 * ib + w2 * ic, x, y);
if (col === NONE) continue;
z[i] = d;
px[i] = col;
}
}
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function drawMesh(cv, z, mesh, { transform, project, light, shade, ambient = 0.16, specular = 0, shininess = 24, camera = [0, 0, -3.2], normals = null, faces = null }) {
const V = mesh.vertices.map(transform);
const P = V.map(project);
const lit = (n, p) => {
let l = Math.max(0, dot(n, light));
let s = 0;
if (specular > 0) {
const v = norm(sub(camera, p));
const h = norm([light[0] + v[0], light[1] + v[1], light[2] + v[2]]);
s = specular * Math.pow(Math.max(0, dot(n, h)), shininess);
}
return ambient + (1 - ambient) * l + s;
};
const VN = normals ? normals.map((n) => norm(sub(transform(n), transform([0, 0, 0])))) : null;
const list = faces || mesh.faces;
list.forEach((f, fi) => {
const a = V[f[0]], b = V[f[1]], c = V[f[2]];
let n = norm(cross(sub(b, a), sub(c, a)));
if (dot(n, sub(a, camera)) > 0) n = [-n[0], -n[1], -n[2]];
const flat = lit(n, a);
for (let k = 1; k + 1 < f.length; k++) {
const i0 = f[0], i1 = f[k], i2 = f[k + 1];
let ia = flat, ib = flat, ic = flat;
if (VN) {
const o = (i) => (dot(VN[i], n) < 0 ? [-VN[i][0], -VN[i][1], -VN[i][2]] : VN[i]);
ia = lit(o(i0), V[i0]); ib = lit(o(i1), V[i1]); ic = lit(o(i2), V[i2]);
}
tri(cv, z, P[i0], P[i1], P[i2], ia, ib, ic, (i, x, y) => shade(i, fi, x, y));
}
});
return P;
}
function sphere(cv, z, cx, cy, r, depth, shade, zr = r * 0.01) {
const W = cv.width, H = cv.height, px = cv.px, asp = cv.aspect;
const ry = r / asp;
const x0 = Math.max(0, Math.floor(cx - r - 1)), x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
for (let y = y0; y <= y1; y++) {
const ny = ((y + 0.5 - cy) * asp) / r;
for (let x = x0; x <= x1; x++) {
const nx = (x + 0.5 - cx) / r;
const q = nx * nx + ny * ny;
if (q > 1) continue;
const nz = -Math.sqrt(1 - q);
const d = depth + nz * zr;
const i = y * W + x;
if (z && d >= z[i]) continue;
const col = shade(nx, ny, nz, x, y);
if (col === NONE) continue;
if (z) z[i] = d;
px[i] = col;
}
}
}
function starfield(rng, n, tint = 0xc8d4ff) {
const stars = Array.from({ length: n }, () => ({ x: rng(), y: rng(), b: 0.25 + rng() * 0.75, ph: rng() * 6.28, sp: 0.6 + rng() * 2.4 }));
return (cv, t, strength = 1, bg = 0x000000) => {
const day = luminance(bg) > 0.5;
for (const s of stars) {
const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
const k = s.b * tw * strength;
if (day && k < 0.6) continue;
cv.set(s.x * cv.width, s.y * cv.height, day ? blend(bg, 0x7a8494, (k - 0.6) * 0.8) : blend(bg, tint, k));
}
};
}
function lit(c, k) {
if (c === NONE) return NONE;
const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
return (r << 16) | (g << 8) | (b | 0);
}
function blend(a, b, t) {
t = t < 0 ? 0 : t > 1 ? 1 : t;
const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
return (r << 16) | (g << 8) | (bl | 0);
}
function rotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function rotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
function mul(A, B) {
const out = new Array(9);
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
return out;
}
function apply(M, p) { return [M[0] * p[0] + M[1] * p[1] + M[2] * p[2], M[3] * p[0] + M[4] * p[1] + M[5] * p[2], M[6] * p[0] + M[7] * p[1] + M[8] * p[2]]; }
function transpose(M) { return [M[0], M[3], M[6], M[1], M[4], M[7], M[2], M[5], M[8]]; }
function perspective(cv, { distance = 3.2, fill = 0.42, cx, cy } = {}) {
const W = cv.width, H = cv.height, asp = cv.aspect;
const s = Math.min(W, H * asp) * fill * distance;
const ox = cx ?? W / 2, oy = cy ?? H / 2;
return (p) => { const d = p[2] + distance; const k = s / Math.max(0.05, d); return [ox + p[0] * k, oy + (p[1] * k) / asp, d]; };
}
function fillPoly(cv, pts, fn) {
if (pts.length < 3) return;
const W = cv.width, H = cv.height, px = cv.px;
let minY = Infinity, maxY = -Infinity;
for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
const ya = Math.max(0, Math.ceil(minY - 0.5)), yb = Math.min(H - 1, Math.floor(maxY - 0.5));
const xs = [];
for (let y = ya; y <= yb; y++) {
const sy = y + 0.5;
xs.length = 0;
for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
const [xi, yi] = pts[i], [xj, yj] = pts[j];
if ((yi > sy) !== (yj > sy)) xs.push(xi + ((sy - yi) / (yj - yi)) * (xj - xi));
}
xs.sort((a, b) => a - b);
for (let k = 0; k + 1 < xs.length; k += 2) {
const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
for (let x = xa; x <= xb; x++) {
const i = y * W + x;
const c = fn(x, y, px[i]);
if (c !== NONE) px[i] = c;
}
}
}
}
function shadow(cv, cx, cy, rx, ry, strength, under) {
const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(cv.width - 1, Math.ceil(cx + rx));
const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(cv.height - 1, Math.ceil(cy + ry));
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
const q = dx * dx + dy * dy;
if (q >= 1) continue;
const a = strength * (1 - q) * (1 - q);
const i = y * cv.width + x;
const old = cv.px[i] === NONE ? under : cv.px[i];
cv.px[i] = blend(old, 0x000000, a);
}
}
};
__d[19] = function (__ns) {
const { perspective, fillPoly, rotX, rotY, mul, apply, blend } = __m(18);
const { ATTR } = __m(6);
const { NONE, gradient, luminance } = __m(0);
const { SPECTRUM: REFRACTION } = __m(3);
__e(__ns, { "default": () => __default }, [], ["default"]);
const fanOf = (dark) => gradient(REFRACTION.map((st) => (dark ? st.night : st.dayVivid)).reverse());
const __default = {
title: 'Prism',
gallery: 'objects',
category: 'Icons & Logos',
kind: 'art',
tags: ['prism', 'logo', 'spectrum', 'light', 'refraction', 'glass'],
order: 5,
description: "Prism's mark: a glass prism turning in 3D, splitting a white beam into a smoothly blended, pulsing spectrum.",
size: { w: 72, h: 24 },
minSize: { w: 24, h: 8 },
loop: 14,
canvas: 'field',
palette: 'prism',
params: { label: { default: 'on', options: ['on', 'off'], label: 'Wordmark' } },
setup(ctx) {
const showLabel = ctx.param('label', 'on') !== 'off' && ctx.height >= 12;
const rows = showLabel ? ctx.height - 2 : ctx.height;
const cv = ctx.canvas(undefined, { rows });
const W = cv.width, H = cv.height, th = ctx.theme;
const project = perspective(cv, { distance: 4.6, fill: 0.34, cx: W * 0.44, cy: H * 0.52 });
const A = [0, -0.95, 0], B = [-0.92, 0.64, 0], C = [0.92, 0.64, 0], Dz = 0.55;
const verts = [[...A], [...B], [...C]].flatMap((p) => [[p[0], p[1], -Dz], [p[0], p[1], Dz]]);
const faces = [
{ v: [0, 2, 4], kind: 'cap' }, { v: [1, 5, 3], kind: 'cap' },
{ v: [0, 1, 3, 2], kind: 'left' }, { v: [0, 4, 5, 1], kind: 'right' }, { v: [2, 3, 5, 4], kind: 'base' },
];
const edges = [[0, 2], [2, 4], [4, 0], [1, 3], [3, 5], [5, 1], [0, 1], [2, 3], [4, 5]];
const dark = luminance(th.bg) < 0.5;
const SPECTRUM = fanOf(dark);
const glass = blend(th.bg, dark ? 0x9fc4ff : 0x5f8fcf, 0.55);
const beamInk = dark ? 0xffffff : blend(th.ink, 0x4a6a90, 0.35);
const edgeInk = dark ? 0xe8f2ff : blend(th.ink, 0x3b5f8a, 0.4);
const lerp3 = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
const under = (x, y) => { const c = cv.get(x, y); return c === NONE ? th.bg : c; };
const over = (x, y, c, a) => { if (x >= 0 && y >= 0 && x < W && y < H) cv.set(x, y, blend(under(x, y), c, Math.min(1, a))); };
const glowAdd = (x, y, c) => {
x = Math.floor(x); y = Math.floor(y);
if (x < 0 || y < 0 || x >= W || y >= H) return;
const o = under(x, y);
cv.set(x, y, (Math.min(255, ((o >> 16) & 255) + ((c >> 16) & 255)) << 16) | (Math.min(255, ((o >> 8) & 255) + ((c >> 8) & 255)) << 8) | Math.min(255, (o & 255) + (c & 255)));
};
return (t) => {
cv.clear();
const M = mul(rotX(-0.2 + Math.sin(t * 0.37) * 0.05), rotY(0.18 + Math.sin(t * 0.45) * 0.45));
const V = verts.map((p) => apply(M, p));
const P = V.map(project);
const proj = (p) => project(apply(M, p));
const E = proj(lerp3(A, B, 0.6)), X = proj(lerp3(A, C, 0.64));
const pulse = (t * 0.55) % 1;
const slope = 0.16;
const y0 = E[1] - E[0] * slope;
for (let x = 0; x <= Math.min(W - 1, Math.floor(E[0])); x++) {
const yl = y0 + (x + 0.5) * slope;
const f = x / Math.max(1, E[0]);
const boost = 1 + 0.9 * Math.exp(-Math.pow((f - pulse * 1.6) * 6, 2));
for (let y = Math.floor(yl - 2.5); y <= Math.ceil(yl + 2.5); y++) {
const d = y + 0.5 - yl;
const k = Math.exp(-(d * d) / 0.55);
if (k < 0.04) continue;
if (!dark) { over(x, y, beamInk, 0.85 * k * Math.min(1.3, boost)); continue; }
const c = Math.round(Math.min(255, 235 * k * boost));
glowAdd(x, y, (c << 16) | (c << 8) | Math.min(255, c + 12));
}
}
const base = 0.12 + Math.sin(t * 0.45) * 0.08, spread = 0.2 + Math.sin(t * 0.31) * 0.035;
const a0 = base - spread, a1 = base + spread;
for (let y = 0; y < H; y++) for (let x = Math.max(0, Math.floor(X[0])); x < W; x++) {
const dx = x + 0.5 - X[0], dy = y + 0.5 - X[1];
if (dx <= 0.5) continue;
const phi = Math.atan2(dy, dx);
if (phi < a0 - 0.03 || phi > a1 + 0.03) continue;
const f = (phi - a0) / (a1 - a0);
const edge = Math.min(1, Math.max(0, Math.min(f + 0.15, 1.15 - f) / 0.15));
const dist = Math.hypot(dx, dy);
const fade = Math.min(1, dist / 5) * (0.75 + 0.25 * Math.exp(-dist / (W * 0.6)));
const travel = 1 + 0.55 * Math.exp(-Math.pow((dist / (W * 0.55) - (pulse * 1.6 - 0.6)) * 4, 2));
const c = SPECTRUM(Math.max(0, Math.min(1, f)));
over(x, y, c, edge * fade * 0.92 * travel);
}
const order = faces.map((f, i) => ({ f, i, d: f.v.reduce((s, k) => s + P[k][2], 0) / f.v.length })).sort((a, b) => b.d - a.d);
for (const { f } of order) {
const pts = f.v.map((k) => [P[k][0], P[k][1]]);
const a = V[f.v[0]], b = V[f.v[1]], c = V[f.v[2]];
const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
const nl = Math.hypot(...n) || 1;
const facing = Math.abs(n[2] / nl);
const alpha = f.kind === 'cap' ? 0.16 : 0.1 + (1 - facing) * 0.3;
const tone = f.kind === 'left' ? blend(glass, 0xffffff, 0.25) : f.kind === 'base' ? blend(glass, th.bg, 0.4) : glass;
fillPoly(cv, pts, (x, y, old) => {
const under = old === NONE ? th.bg : old;
const sheen = Math.max(0, 1 - Math.abs(((x / W) - 0.35 - Math.sin(t * 0.45) * 0.2) * 7)) * 0.18;
return blend(under, blend(tone, 0xffffff, sheen), alpha + sheen);
});
}
cv.line(E[0], E[1], X[0], X[1], blend(th.bg, beamInk, 0.55));
const dmin = Math.min(...P.map((p) => p[2])), dmax = Math.max(...P.map((p) => p[2]));
for (const [i, j] of edges) {
const d = ((P[i][2] + P[j][2]) / 2 - dmin) / Math.max(1e-6, dmax - dmin);
const k = d < 0.5 ? 0.95 - d * 0.5 : 0.32 - (d - 0.5) * 0.4;
cv.line(P[i][0], P[i][1], P[j][0], P[j][1], blend(th.bg, edgeInk, Math.max(0.08, k)));
}
cv.paint(ctx.buffer);
if (showLabel) {
const word = ctx.width >= 30 ? 'P  R  I  S  M' : 'PRISM';
const x0 = Math.max(0, Math.round(ctx.width * 0.44 - word.length / 2));
for (let i = 0; i < word.length; i++) {
if (word[i] === ' ') continue;
ctx.buffer.text(x0 + i, ctx.height - 1, word[i], SPECTRUM(i / Math.max(1, word.length - 1)), undefined, ATTR.BOLD);
}
}
};
},
};
};
__d[20] = function (__ns) {
const { getTheme, palette: makePalette, PALETTES } = __m(3);
const { parse, gradient, NONE, luminance, mix } = __m(0);
const { stringWidth, truncate } = __m(5);
__e(__ns, { "LEFT_EIGHTHS": () => LEFT_EIGHTHS, "LOWER_EIGHTHS": () => LOWER_EIGHTHS, "clamp01": () => clamp01, "themeOf": () => themeOf, "col": () => col, "grad": () => grad, "contrast": () => contrast, "tint": () => tint, "fmt": () => fmt, "fmtDuration": () => fmtDuration, "align": () => align, "zoneColor": () => zoneColor, "DEFAULT_ZONES": () => DEFAULT_ZONES, "seriesColors": () => seriesColors, "extent": () => extent, "bayer": () => bayer }, [], ["DEFAULT_ZONES","LEFT_EIGHTHS","LOWER_EIGHTHS","align","bayer","clamp01","col","contrast","extent","fmt","fmtDuration","grad","seriesColors","themeOf","tint","zoneColor"]);
const LEFT_EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
const LOWER_EIGHTHS = ['', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const ALIASES = {
ok: 'pos', good: 'pos', success: 'pos', healthy: 'pos',
error: 'neg', bad: 'neg', danger: 'neg', fail: 'neg',
warning: 'warn', critical: 'crit', text: 'ink', fg: 'ink', border: 'line',
};
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const themeOf = (opts) => getTheme(opts && opts.theme);
function col(v, theme, fallback = NONE) {
if (v === undefined || v === null) return fallback;
if (typeof v === 'number') return v;
const s = String(v);
const key = ALIASES[s] || s;
if (theme && typeof theme[key] === 'number') return theme[key];
try { return parse(s); } catch { return fallback; }
}
function grad(g, theme, fallback) {
if (typeof g === 'function') return g;
if (Array.isArray(g)) {
return gradient(g.map((c) => (Array.isArray(c) && c.length === 2 && typeof c[0] === 'number' ? [c[0], col(c[1], theme, 0)] : col(c, theme, 0))));
}
if (typeof g === 'string' && (g in PALETTES || g === 'theme' || g === 'theme-heat')) return makePalette(g, theme);
const c = col(g, theme, fallback);
return () => c;
}
const contrast = (bg) => (bg !== NONE && luminance(bg) > 0.55 ? 0x111418 : 0xffffff);
const tint = (c, theme, k = 0.22) => mix(theme.bg, c, k);
function fmt(v, digits = 1) {
if (v === null || v === undefined || Number.isNaN(v)) return '–';
if (typeof v !== 'number') return String(v);
const a = Math.abs(v);
const trim = (s) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
if (a >= 1e12) return trim((v / 1e12).toFixed(digits)) + 'T';
if (a >= 1e9) return trim((v / 1e9).toFixed(digits)) + 'B';
if (a >= 1e6) return trim((v / 1e6).toFixed(digits)) + 'M';
if (a >= 1e4) return trim((v / 1e3).toFixed(digits)) + 'k';
if (Number.isInteger(v)) return String(v);
if (a >= 100) return trim(v.toFixed(0));
if (a >= 10) return trim(v.toFixed(1));
if (a >= 1) return trim(v.toFixed(2));
return trim(v.toPrecision(2));
}
function fmtDuration(s) {
if (!Number.isFinite(s) || s < 0) return '–';
if (s < 10) return `${s.toFixed(1)}s`;
if (s < 60) return `${Math.round(s)}s`;
if (s < 3600) return `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}
function align(text, width, how = 'left') {
const s = truncate(String(text), Math.max(0, width));
const w = stringWidth(s);
const offset = how === 'right' ? width - w : how === 'center' ? Math.floor((width - w) / 2) : 0;
return { text: s, offset: Math.max(0, offset), width: w };
}
function zoneColor(f, thresholds, theme, base) {
let c = base;
for (const [th, zc] of thresholds) if (f >= th) c = col(zc, theme, c);
return c;
}
const DEFAULT_ZONES = [[0.7, 'warn'], [0.9, 'neg']];
const seriesColors = (theme) => [theme.accent, theme.pos, theme.warn, theme.crit, theme.neg, theme.info, theme.ink];
function extent(values, min, max) {
let lo = Infinity, hi = -Infinity;
for (const v of values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
if (min !== undefined && min !== null) lo = min;
if (max !== undefined && max !== null) hi = max;
if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
return [lo, hi];
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];
};
__d[21] = function (__ns) {
const { NONE } = __m(0);
const { ATTR } = __m(6);
const { stringWidth, truncate } = __m(5);
const { themeOf, col } = __m(20);
__e(__ns, { "BORDERS": () => BORDERS, "box": () => box, "rule": () => rule }, [], ["BORDERS","box","rule"]);
const BORDERS = Object.freeze({
round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
single: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
dashed: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '╌', v: '╎' },
ascii: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
});
function placeLabel(s, x, y, w, label, how, fg, bg, attr) {
const avail = w - 4;
if (avail < 1) return;
const text = truncate(` ${label} `, avail + 2);
const tw = stringWidth(text);
const lx = how === 'center' ? x + Math.floor((w - tw) / 2) : how === 'right' ? x + w - 2 - tw : x + 1;
s.text(lx, y, text, fg, bg, attr);
}
function box(surface, x, y, w, h, opts = {}) {
const theme = themeOf(opts);
const b = BORDERS[opts.style] || BORDERS.round;
x = Math.round(x); y = Math.round(y); w = Math.max(0, Math.round(w)); h = Math.max(0, Math.round(h));
if (w <= 0 || h <= 0) return surface.view(x, y, 0, 0);
const color = col(opts.color, theme, theme.line);
const bg = opts.bg !== undefined ? col(opts.bg, theme, NONE) : opts.fill ? theme.panel : undefined;
if (bg !== undefined) surface.fill(x, y, w, h, ' ', undefined, bg, 0);
if (h === 1) {
for (let i = 0; i < w; i++) surface.set(x + i, y, b.h, color, bg);
if (opts.title) placeLabel(surface, x, y, w, opts.title, opts.titleAlign, col(opts.titleColor, theme, theme.ink), bg, ATTR.BOLD);
return surface.view(x, y, 0, 0);
}
if (w === 1) {
for (let j = 0; j < h; j++) surface.set(x, y + j, b.v, color, bg);
return surface.view(x, y, 0, 0);
}
surface.set(x, y, b.tl, color, bg);
surface.set(x + w - 1, y, b.tr, color, bg);
surface.set(x, y + h - 1, b.bl, color, bg);
surface.set(x + w - 1, y + h - 1, b.br, color, bg);
for (let i = 1; i < w - 1; i++) {
surface.set(x + i, y, b.h, color, bg);
surface.set(x + i, y + h - 1, b.h, color, bg);
}
for (let j = 1; j < h - 1; j++) {
surface.set(x, y + j, b.v, color, bg);
surface.set(x + w - 1, y + j, b.v, color, bg);
}
if (opts.title) placeLabel(surface, x, y, w, opts.title, opts.titleAlign, col(opts.titleColor, theme, theme.ink), bg, ATTR.BOLD);
if (opts.footer) placeLabel(surface, x, y + h - 1, w, opts.footer, opts.footerAlign || 'right', col(opts.footerColor, theme, theme.muted), bg, 0);
const pad = opts.padding;
const [pv, ph] = Array.isArray(pad) ? pad : [0, pad || 0];
return surface.view(x + 1 + ph, y + 1 + pv, Math.max(0, w - 2 - 2 * ph), Math.max(0, h - 2 - 2 * pv));
}
function rule(surface, x, y, w, opts = {}) {
const theme = themeOf(opts);
const color = col(opts.color, theme, theme.line);
const ch = opts.char || (opts.style === 'heavy' ? '━' : opts.style === 'double' ? '═' : opts.style === 'ascii' ? '-' : '─');
for (let i = 0; i < w; i++) surface.set(x + i, y, ch, color);
if (opts.label) {
const text = truncate(` ${opts.label} `, Math.max(0, w - 2));
const tw = stringWidth(text);
const lx = opts.align === 'left' ? x + 2 : opts.align === 'right' ? x + w - 2 - tw : x + Math.floor((w - tw) / 2);
surface.text(lx, y, text, col(opts.labelColor, theme, theme.muted));
}
}
};
__d[22] = function (__ns) {
const { box: rawBox } = __m(21);
const { ATTR } = __m(6);
const { NONE, mix } = __m(0);
const { stringWidth, truncate } = __m(5);
__e(__ns, { "ATTR": () => ATTR, "NONE": () => NONE, "mix": () => mix, "stringWidth": () => stringWidth, "truncate": () => truncate, "uni": () => uni, "glyphs": () => glyphs, "bstyle": () => bstyle, "ell": () => ell, "clip": () => clip, "panel": () => panel, "phase": () => phase, "typed": () => typed, "blink": () => blink, "span": () => span, "ease": () => ease, "stepAt": () => stepAt, "spin": () => spin, "fit": () => fit, "center": () => center, "hbar": () => hbar, "scrollbar": () => scrollbar, "tint": () => tint, "button": () => button, "codeLine": () => codeLine }, [], ["ATTR","NONE","blink","bstyle","button","center","clip","codeLine","ease","ell","fit","glyphs","hbar","mix","panel","phase","scrollbar","span","spin","stepAt","stringWidth","tint","truncate","typed","uni"]);
const uni = (ctx) => ctx.caps?.unicode !== false;
const UNI = {
check: '✔', cross: '✖', dot: '●', ring: '○', radioOn: '◉', radioOff: '○',
boxOn: '[✓]', boxOff: '[ ]', boxPart: '[-]',
pointer: '❯', caret: '›', tri: '▸', triDown: '▾', triUp: '▴', triLeft: '◂',
right: '→', left: '←', up: '↑', down: '↓', enter: '⏎',
bullet: '•', mid: '·', ellipsis: '…', star: '★', diamond: '◆', spark: '✦',
bar: '▌', lbar: '▎', block: '█', shade: '░', shade2: '▒', half: '▄',
h: '─', v: '│', hh: '━', vv: '┃', dh: '═', dash: '╌', dot3: '┄',
tee: '├', elbow: '└', teeEnd: '└', branch: '├──', last: '└──', pipe: '│  ', gap: '   ',
sortUp: '▲', sortDown: '▼', info: 'ℹ', warn: '▲', bang: '!', lock: '●',
knob: '●', trackOn: '━', trackOff: '─', cursor: '▌', blockCursor: '█',
};
const ASC = {
check: '+', cross: 'x', dot: '*', ring: 'o', radioOn: '(*)', radioOff: '( )',
boxOn: '[x]', boxOff: '[ ]', boxPart: '[-]',
pointer: '>', caret: '>', tri: '>', triDown: 'v', triUp: '^', triLeft: '<',
right: '->', left: '<-', up: '^', down: 'v', enter: 'RET',
bullet: '*', mid: '.', ellipsis: '...', star: '*', diamond: '*', spark: '*',
bar: '|', lbar: '|', block: '#', shade: '.', shade2: ':', half: '_',
h: '-', v: '|', hh: '=', vv: '|', dh: '=', dash: '-', dot3: '.',
tee: '|', elbow: '`', teeEnd: '`', branch: '|--', last: '`--', pipe: '|  ', gap: '   ',
sortUp: '^', sortDown: 'v', info: 'i', warn: '!', bang: '!', lock: '*',
knob: 'O', trackOn: '=', trackOff: '-', cursor: '_', blockCursor: '#',
};
const glyphs = (ctx) => (uni(ctx) ? UNI : ASC);
const bstyle = (ctx, style = 'round') => (uni(ctx) ? style : 'ascii');
const ell = (ctx) => (uni(ctx) ? '…' : '...');
function clip(ctx, str, w) {
const s = String(str);
if (uni(ctx) || stringWidth(s) <= w) return truncate(s, Math.max(0, w));
return w >= 6 ? truncate(s, w, '...') : truncate(s, Math.max(0, w - 1), '') + (w > 0 ? '.' : '');
}
function panel(ctx, s, x, y, w, h, opts = {}) {
const o = { theme: ctx.theme, ...opts, style: bstyle(ctx, opts.style || 'round') };
if (!uni(ctx)) for (const k of ['title', 'footer']) if (o[k]) o[k] = clip(ctx, o[k], Math.max(0, w - 4));
return rawBox(s, x, y, w, h, o);
}
const phase = (t, loop) => ((t % loop) + loop) % loop;
function typed(text, t, start = 0, cps = 18) {
if (t < start) return '';
return [...text].slice(0, Math.floor((t - start) * cps)).join('');
}
const blink = (t, period = 1) => phase(t, period) < period * 0.6;
const span = (t, a, b) => (t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a));
const ease = (t, a, b) => { const k = span(t, a, b); return k * k * (3 - 2 * k); };
function stepAt(t, times) {
let i = -1;
for (let k = 0; k < times.length; k++) if (t >= times[k]) i = k;
return i;
}
const BRAILLE_SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const ASCII_SPIN = '|/-\\';
const spin = (ctx, t, speed = 1) => (uni(ctx) ? BRAILLE_SPIN[Math.floor(t * 12 * speed) % 10] : ASCII_SPIN[Math.floor(t * 8 * speed) % 4]);
function fit(str, w, how = 'left', ctx) {
const s = ctx ? clip(ctx, str, Math.max(0, w)) : truncate(String(str), Math.max(0, w));
const gap = Math.max(0, w - stringWidth(s));
if (how === 'right') return ' '.repeat(gap) + s;
if (how === 'center') return ' '.repeat(gap >> 1) + s + ' '.repeat(gap - (gap >> 1));
return s + ' '.repeat(gap);
}
function center(s, x, y, w, str, fg, bg, attr, ctx) {
const t = ctx ? clip(ctx, str, Math.max(0, w)) : truncate(String(str), Math.max(0, w));
return s.text(x + Math.max(0, Math.floor((w - stringWidth(t)) / 2)), y, t, fg, bg, attr);
}
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
function hbar(ctx, s, x, y, w, frac, fg, trackColor) {
const f = Math.max(0, Math.min(1, frac)) * w;
const full = Math.floor(f), rem = f - full;
const u = uni(ctx);
const tc = trackColor ?? mix(ctx.theme.bg, fg, 0.28);
for (let i = 0; i < w; i++) {
if (i < full) s.set(x + i, y, u ? '█' : '#', fg);
else if (i === full && u && rem >= 1 / 16) s.set(x + i, y, EIGHTHS[Math.max(1, Math.round(rem * 8))], fg);
else s.set(x + i, y, u ? '░' : '.', tc);
}
return full;
}
function scrollbar(ctx, s, x, y, h, total, first, visible) {
if (total <= visible || h < 2) return;
const u = uni(ctx);
const th = Math.max(1, Math.round((visible / total) * h));
const top = Math.round((first / Math.max(1, total - visible)) * (h - th));
for (let i = 0; i < h; i++) {
const on = i >= top && i < top + th;
s.set(x, y + i, on ? (u ? '┃' : '#') : (u ? '│' : '|'), on ? ctx.theme.muted : ctx.theme.line);
}
}
const tint = (ctx, c, k = 0.18) => mix(ctx.theme.bg, c, k);
function button(ctx, s, x, y, label, { focused = false, color, pressed = false } = {}) {
const th = ctx.theme;
const c = color ?? th.accent;
const text = uni(ctx) ? ` ${label} ` : `[ ${label} ]`;
if (focused) s.text(x, y, text, pressed ? th.ink : th.bg, pressed ? mix(c, th.bg, 0.35) : c, ATTR.BOLD);
else s.text(x, y, text, th.ink, uni(ctx) ? th.panel2 : undefined, 0);
return stringWidth(text);
}
const KW = /\b(const|let|var|function|return|if|else|for|while|import|from|export|default|async|await|class|new|def|in|of|true|false|null|None|self|try|catch|throw)\b/g;
function codeLine(ctx, s, x, y, w, line, bg) {
const th = ctx.theme;
const str = clip(ctx, line, Math.max(0, w));
const colors = new Array([...str].length).fill(th.ink);
const chars = [...str];
const mark = (re, c) => { for (const m of str.matchAll(re)) for (let i = m.index; i < m.index + m[0].length && i < colors.length; i++) colors[i] = c; };
mark(/\b\d+(\.\d+)?\b/g, th.warn);
mark(KW, th.crit);
mark(/\b[A-Za-z_]\w*(?=\()/g, th.info);
mark(/(['"`]).*?\1/g, th.pos);
mark(/(\/\/|#).*$/g, th.dim);
let cx = x;
chars.forEach((ch, i) => { cx = s.text(cx, y, ch, colors[i], bg); });
return cx;
}
};
__d[23] = function (__ns) {
const { uni, mix } = __m(22);
const { wrap } = __m(5);
__m(22);
__e(__ns, { "tokenize": () => tokenize, "reveal": () => reveal, "wrapLines": () => wrapLines, "thinkGlyph": () => thinkGlyph, "shimmer": () => shimmer }, [22], ["ATTR","NONE","blink","bstyle","button","center","clip","codeLine","ease","ell","fit","glyphs","hbar","mix","panel","phase","reveal","scrollbar","shimmer","span","spin","stepAt","stringWidth","thinkGlyph","tint","tokenize","truncate","typed","uni","wrapLines"]);
function tokenize(text) {
return String(text).match(/\s*[A-Za-z]{1,6}|\s*\d{1,3}|\s*[^\sA-Za-z\d]|\s+/g) || [];
}
function reveal(text, t, start = 0, tps = 30) {
const toks = tokenize(text);
const n = Math.max(0, Math.min(toks.length, Math.floor((t - start) * tps)));
return { text: toks.slice(0, n).join(''), n, total: toks.length, done: n >= toks.length, last: n ? toks[n - 1] : '' };
}
const wrapLines = (text, w) => wrap(text, Math.max(1, w));
const SPIN_U = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const SPIN_A = ['.', '+', '*', 'x', '*', '+'];
const thinkGlyph = (ctx, t) => {
const s = uni(ctx) ? SPIN_U : SPIN_A;
return s[Math.floor(t * 8) % s.length];
};
function shimmer(base, hi, i, n, t, period = 1.8, width = 4) {
const head = ((t % period) / period) * (n + width * 2) - width;
const d = Math.abs(i - head);
return d < width ? mix(base, hi, 1 - d / width) : base;
}
};
__d[24] = function (__ns) {
const { NONE, mix } = __m(0);
const { ATTR, CellBuffer, Surface } = __m(6);
const { stringWidth, truncate } = __m(5);
__e(__ns, { "clamp": () => clamp, "lerp": () => lerp, "smooth": () => smooth, "signal": () => signal, "glyphs": () => glyphs, "fold": () => fold, "textFor": () => textFor, "safe": () => safe, "VBLOCKS": () => VBLOCKS, "HBLOCKS": () => HBLOCKS, "vbar": () => vbar, "hbar": () => hbar, "put": () => put, "putR": () => putR, "frame": () => frame, "num": () => num, "healthColor": () => healthColor, "light": () => light, "lift": () => lift, "relLum": () => relLum, "onFill": () => onFill, "tint": () => tint, "memo": () => memo, "NONE": () => NONE, "ATTR": () => ATTR }, [], ["ATTR","HBLOCKS","NONE","VBLOCKS","clamp","fold","frame","glyphs","hbar","healthColor","lerp","lift","light","memo","num","onFill","put","putR","relLum","safe","signal","smooth","textFor","tint","vbar"]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
function signal(ctx, { seed = 1, base = 50, amp = 20, rate = 4, spike = 0, min = -Infinity, max = Infinity, trend = 0 } = {}) {
const n2 = ctx.noise.noise2;
const s = seed * 17.31 + 3.7;
const at = (k) => {
let v = base + amp * (1.15 * n2(k * 0.085, s) + 0.7 * n2(k * 0.29, s + 9.1)) + amp * 0.3 * Math.sin(k * 0.047 + s) + trend * k;
if (spike) { const p = n2(k * 0.021, s + 33.3); if (p > 0.38) v += spike * (p - 0.38) * 6; }
return clamp(v, min, max);
};
return {
at,
window(t, n) { const k0 = Math.floor(t * rate); const out = new Array(n); for (let i = 0; i < n; i++) out[i] = at(k0 - n + 1 + i); return out; },
now(t) { const x = t * rate, k = Math.floor(x); return lerp(at(k), at(k + 1), x - k); },
};
}
function glyphs(ctx) {
const u = ctx.caps?.unicode !== false;
return u
? { u, h: '─', v: '│', tl: '╭', tr: '╮', bl: '╰', br: '╯', dot: '●', ring: '○', up: '▲', down: '▼', bullet: '•', full: '█', shade: '░', mid: '▒', check: '✔', cross: '✖', warn: '▲', info: 'ℹ', arrowR: '▶', tick: '┼', cornerL: '└', dash: '┄', block: '▌', sep: '│' }
: { u, h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+', dot: 'o', ring: 'o', up: '^', down: 'v', bullet: '*', full: '#', shade: '.', mid: ':', check: '+', cross: 'x', warn: '!', info: 'i', arrowR: '>', tick: '+', cornerL: '+', dash: '-', block: '|', sep: '|' };
}
const FOLD = { '→': '->', '←': '<-', '↑': '^', '↓': 'v', '–': '-', '—': '-', '·': '-', '…': '.', '×': 'x', '±': '+/-', '≥': '>=', '≤': '<=', '°': 'o', 'µ': 'u', '•': '*', '✔': '+', '✓': '+', '✖': 'x', '✗': 'x', '▲': '^', '▼': 'v', '●': 'o', '○': 'o', '│': '|', '─': '-', '⇡': '^', '⇣': 'v', '★': '*' };
for (const c of '╭╮╰╯┌┐└┘├┤┬┴┼┏┓┗┛╋╔╗╚╝') FOLD[c] = '+';
for (const c of '━┄┈╌═▔') FOLD[c] = c === '═' ? '=' : '-';
for (const c of '┃┆┊║▏▎▍▌▐▕') FOLD[c] = '|';
for (const c of '█▓▉▊▋■▪▮◼') FOLD[c] = '#';
Object.assign(FOLD, { '▒': ':', '░': '.', '▀': '"', '▁': '.', '▂': '.', '▃': '_', '▄': '_', '▅': '=', '▆': '=', '▇': '#', '▬': '=', '▯': '.', '◆': '*', '◇': 'o', '◉': '@', '◌': '.', '◀': '<', '▶': '>', '▸': '>', '◂': '<', '▴': '^', '▾': 'v', '✦': '*', '☼': '*', '☾': 'C', '⎇': 'Y', '⎈': '*', '‹': '<', '›': '>', '∙': '.', '❯': '>', '⊘': '-', '‖': '=', 'ℹ': 'i' });
const BRAILLE = ' ..::++##';
const foldChar = (c) => {
const cp = c.codePointAt(0);
if (cp >= 0x2800 && cp <= 0x28ff) { let n = cp - 0x2800, k = 0; while (n) { k += n & 1; n >>= 1; } return BRAILLE[k]; }
return FOLD[c] ?? '?';
};
const fold = (s) => { let out = ''; for (const c of String(s)) out += c.codePointAt(0) < 128 ? c : foldChar(c); return out; };
const textFor = (g) => (g.u ? (s) => s : fold);
class Folded extends Surface {
constructor(inner) { super(); this.inner = inner; }
get width() { return this.inner.width; }
get height() { return this.inner.height; }
set(x, y, ch, fg, bg, attr) {
if (ch && ch.length && ch.codePointAt(0) > 127) ch = foldChar(ch)[0];
return this.inner.set(x, y, ch, fg, bg, attr);
}
get(x, y) { return this.inner.get(x, y); }
clear(bg, fg) { return this.inner.clear(bg, fg); }
text(x, y, str, fg, bg, attr) { return super.text(x, y, fold(str), fg, bg, attr); }
}
const safe = (s, g) => (g.u ? s : new Folded(s));
const VBLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const HBLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
const ASCII_V = [' ', '.', '.', '_', '_', '=', '=', '#', '#'];
function vbar(s, x, y0, height, color, g, bg) {
const full = Math.floor(height), rem = Math.round((height - full) * 8);
for (let i = 0; i < full; i++) s.set(x, y0 - i, g.u ? '█' : '#', color, bg);
if (rem > 0) s.set(x, y0 - full, g.u ? VBLOCKS[rem] : ASCII_V[rem], color, bg);
}
function hbar(s, x0, y, len, color, g, bg) {
const full = Math.floor(len), rem = Math.round((len - full) * 8);
for (let i = 0; i < full; i++) s.set(x0 + i, y, g.u ? '█' : '#', color, bg);
if (rem > 0) s.set(x0 + full, y, g.u ? HBLOCKS[rem] : (rem > 4 ? '#' : '-'), color, bg);
}
function put(s, x, y, text, w, fg, bg, attr) {
if (w <= 0) return x;
return s.text(x, y, stringWidth(text) > w ? truncate(text, w) : text, fg, bg, attr);
}
function putR(s, xEnd, y, text, fg, bg, attr) {
return s.text(xEnd - stringWidth(text), y, text, fg, bg, attr);
}
function frame(s, x, y, w, h, color, g, title, titleColor) {
if (w < 2 || h < 2) return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
s.text(x, y, g.tl + g.h.repeat(w - 2) + g.tr, color);
for (let yy = y + 1; yy < y + h - 1; yy++) { s.set(x, yy, g.v, color); s.set(x + w - 1, yy, g.v, color); }
s.text(x, y + h - 1, g.bl + g.h.repeat(w - 2) + g.br, color);
if (title && w > 6) s.text(x + 2, y, ` ${truncate(title, w - 6)} `, titleColor ?? color, undefined, ATTR.BOLD);
return { x: x + 1, y: y + 1, w: w - 2, h: h - 2 };
}
function num(v, d = 1) {
const a = Math.abs(v);
if (a >= 1e9) return (v / 1e9).toFixed(d) + 'B';
if (a >= 1e6) return (v / 1e6).toFixed(d) + 'M';
if (a >= 1e4) return (v / 1e3).toFixed(d) + 'k';
if (a >= 100) return v.toFixed(0);
return v.toFixed(d);
}
const healthColor = (th, h) => (h >= 0.8 ? th.pos : h >= 0.5 ? th.warn : th.neg);
const light = (th) => (th.mode === 'light' ? th.ink : 0xffffff);
const lift = (th, c, k) => mix(c, light(th), k);
function relLum(c) {
const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
return 0.2126 * f((c >> 16) & 255) + 0.7152 * f((c >> 8) & 255) + 0.0722 * f(c & 255);
}
const onFill = (th, fill) => (relLum(fill) > 0.18 ? (th.mode === 'light' ? th.ink : th.bg) : 0xffffff);
const tint = (th, c, k = 0.18) => mix(th.bg, c, k);
function memo() {
let key = null, buf = null;
return (target, x, y, w, h, k, draw) => {
if (w <= 0 || h <= 0) return;
if (!buf || buf.width !== w || buf.height !== h || key !== k) {
buf = new CellBuffer(w, h);
draw(buf);
key = k;
}
for (let yy = 0; yy < h; yy++) {
for (let xx = 0; xx < w; xx++) {
const i = yy * w + xx, ch = buf.ch[i];
if (ch === ' ' && buf.bg[i] === NONE && !buf.at[i]) continue;
target.set(x + xx, y + yy, ch, buf.fg[i], buf.bg[i], buf.at[i]);
}
}
};
}
};
__d[25] = function (__ns) {
const { mix, uni, ATTR, panel, clip, stringWidth } = __m(22);
__m(22);
__e(__ns, { "backdrop": () => backdrop, "clearRect": () => clearRect, "promptLine": () => promptLine, "fuzzyMatch": () => fuzzyMatch, "modal": () => modal, "listAnswer": () => listAnswer }, [22], ["ATTR","NONE","backdrop","blink","bstyle","button","center","clearRect","clip","codeLine","ease","ell","fit","fuzzyMatch","glyphs","hbar","listAnswer","mix","modal","panel","phase","promptLine","scrollbar","span","spin","stepAt","stringWidth","tint","truncate","typed","uni"]);
const BACK = [
['INFO', 'checkout-api', 'GET /cart 200 41ms'],
['INFO', 'payments-worker', 'charge ok order=88412 312ms'],
['WARN', 'checkout-api', 'db pool wait 840ms (20/20 in use)'],
['INFO', 'search-api', 'GET /search?q=tent 200 22ms'],
['INFO', 'gateway', 'POST /checkout 201 212ms'],
['ERROR', 'checkout-api', 'timeout acquiring connection after 5000ms'],
['INFO', 'inventory', 'reserve sku=TNT-2P qty=1 ok'],
['INFO', 'gateway', 'GET /account 200 34ms'],
['WARN', 'payments-worker', 'retrying charge order=88415 attempt=2'],
['INFO', 'search-api', 'reindex shard 3/8 done'],
];
function backdrop(ctx, s, t = 0) {
const th = ctx.theme;
const ink = mix(th.bg, th.muted, 0.3);
const lvl = { INFO: mix(th.bg, th.info, 0.3), WARN: mix(th.bg, th.warn, 0.35), ERROR: mix(th.bg, th.neg, 0.4) };
const base = Math.floor(t / 1.5);
for (let y = 0; y < (s.height ?? ctx.height); y++) {
const [level, svc, msg] = BACK[(y + base) % BACK.length];
const sec = 31 + y + base;
const ts = `12:04:${String(sec % 60).padStart(2, '0')}`;
let x = s.text(0, y, ts, ink);
x = s.text(x + 1, y, level.padEnd(5), lvl[level]);
x = s.text(x + 1, y, svc.padEnd(15), ink);
s.text(x + 1, y, msg, ink);
}
}
function clearRect(ctx, s, x, y, w, h, bg) {
s.fill(x, y, w, h, ' ', undefined, bg ?? ctx.theme.panel);
}
function promptLine(ctx, s, x, y, question, { state = 'active', answer = '' } = {}) {
const th = ctx.theme, u = uni(ctx);
const mark = state === 'done' ? (u ? '✔' : '+') : state === 'error' ? (u ? '✖' : 'x') : '?';
const c = state === 'done' ? th.pos : state === 'error' ? th.neg : th.accent;
let cx = s.text(x, y, mark, c, undefined, ATTR.BOLD);
cx = s.text(cx + 1, y, question, th.ink, undefined, ATTR.BOLD);
if (answer) s.text(cx + 1, y, clip(ctx, answer, Math.max(0, (s.width ?? ctx.width) - cx - 1)), state === 'done' ? th.accent : th.muted);
return cx;
}
function fuzzyMatch(q, s) {
q = q.toLowerCase();
if (!q) return { idx: [], score: 0 };
const idx = [];
let j = 0;
for (let i = 0; i < s.length && j < q.length; i++) if (s[i].toLowerCase() === q[j]) { idx.push(i); j++; }
if (j < q.length) return null;
let score = 0;
for (let k = 1; k < idx.length; k++) score += idx[k] === idx[k - 1] + 1 ? 3 : 0;
score -= idx[0] * 0.05 + s.length * 0.01;
return { idx, score };
}
function modal(ctx, s, x, y, w, h, opts = {}) {
const th = ctx.theme;
const { enter = 1, ...rest } = opts;
const yy = y - Math.round((1 - enter) * 2);
const shade = mix(th.bg, 0x000000, th.mode === 'light' ? 0.06 : 0.35);
for (let r = 1; r <= h; r++) {
for (let c = 2; c <= w + 1; c++) {
if (r < h && c < w) continue;
const cell = s.get(x + c, yy + r);
if (cell) s.set(x + c, yy + r, undefined, mix(shade, cell.fg < 0 ? th.muted : cell.fg, 0.35), shade);
}
}
return panel(ctx, s, x, yy, w, h, { bg: th.panel, ...rest });
}
function listAnswer(items, w) {
for (let n = items.length; n > 0; n--) {
const s = items.slice(0, n).join(', ') + (n < items.length ? ` +${items.length - n}` : '');
if (stringWidth(s) <= w) return s;
}
return `${items.length} selected`;
}
};
__d[26] = function (__ns) {
const { mix, NONE } = __m(0);
const { easing } = __m(10);
__e(__ns, { "cycle": () => cycle, "put": () => put, "grid": () => grid, "pxRect": () => pxRect, "pingPongProgress": () => pingPongProgress, "scenes": () => scenes, "composite": () => composite, "NONE": () => NONE, "transitionSetup": () => transitionSetup }, [], ["NONE","composite","cycle","grid","pingPongProgress","put","pxRect","scenes","transitionSetup"]);
function cycle(t, n, dur) {
const T = n * dur, tl = ((t % T) + T) % T, i = Math.min(n - 1, Math.floor(tl / dur));
return { i, f: (tl - i * dur) / dur };
}
function put(buf, x, y, s, fg, bg, attr, maxW = Infinity) {
if (y < 0 || y >= buf.height || x >= buf.width) return;
let str = String(s);
if (x < 0) { str = str.slice(-x); x = 0; }
str = str.slice(0, Math.max(0, Math.min(maxW, buf.width - x)));
if (str) buf.text(x, y, str, fg, bg, attr);
}
function grid(w, h, cols, rows, gapX = 1, gapY = 1, x0 = 0, y0 = 0) {
const pw = Math.floor((w - gapX * (cols - 1)) / cols), ph = Math.floor((h - gapY * (rows - 1)) / rows);
const out = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: x0 + c * (pw + gapX), y: y0 + r * (ph + gapY), w: pw, h: ph });
return out;
}
const pxRect = (cv, r) => ({ x: r.x * cv.sx, y: r.y * cv.sy, w: r.w * cv.sx, h: r.h * cv.sy });
function pingPongProgress(f, ease, hold = 0.18) {
const g = (1 - 2 * hold) / 2; 
if (f < hold / 2) return 0;
if (f < hold / 2 + g) return ease((f - hold / 2) / g);
if (f < hold * 1.5 + g) return 1;
if (f < hold * 1.5 + 2 * g) return 1 - ease((f - hold * 1.5 - g) / g);
return 0;
}
const hash = (x, y) => ((((x * 374761393) ^ (y * 668265263)) >>> 0) % 10007) / 10007;
function scenes(W, H, asp, rng) {
const clouds = Array.from({ length: 4 }, () => ({ x: rng(), y: 0.12 + rng() * 0.3, w: 0.12 + rng() * 0.12, s: 0.01 + rng() * 0.015 }));
const hill = (x, k) => H * (0.62 + k * 0.12) + Math.sin(x * (0.06 + k * 0.03) + k * 2) * H * 0.06 + Math.sin(x * 0.17 + k) * H * 0.02;
const day = (out, t) => {
const sx = W * 0.7, sy = H * 0.34, sr = Math.min(W, H * asp) * 0.11;
for (let y = 0; y < H; y++) {
const sky = mix(0x2f6fd0, 0xffcf8f, Math.pow(y / H, 1.4));
for (let x = 0; x < W; x++) {
let c = sky;
const d = Math.hypot(x - sx, (y - sy) * asp) / sr;
if (d < 1) c = mix(0xfff1b8, 0xffe07a, d);
else if (d < 3) c = mix(c, 0xfff1b8, 0.5 * Math.pow(1 - (d - 1) / 2, 2));
for (const cl of clouds) {
const cx = (((cl.x + t * cl.s) % 1.3) - 0.15) * W, cy = cl.y * H, cw = cl.w * W;
const q = ((x - cx) / cw) ** 2 + ((y - cy) / (cw * 0.28 / asp)) ** 2;
if (q < 1) c = mix(c, 0xffffff, 0.85 * (1 - q * q));
}
if (y > hill(x, 0)) c = mix(0x3f8f4a, 0x2a6b36, (y - hill(x, 0)) / (H * 0.4));
if (y > hill(x, 1)) c = mix(0x2f7a3a, 0x1d4d26, (y - hill(x, 1)) / (H * 0.3));
out[y * W + x] = c;
}
}
};
const stars = Array.from({ length: Math.round((W * H) / 60) }, () => ({ x: Math.floor(rng() * W), y: Math.floor(rng() * H * 0.6), p: rng() * 6.28 }));
const towers = [];
for (let x = 0; x < W;) {
const w = Math.max(3, Math.round(W * (0.05 + rng() * 0.06))), h = H * (0.22 + rng() * 0.38);
towers.push({ x, w, top: H - h, seed: Math.floor(rng() * 1e6) });
x += w + (rng() < 0.3 ? 1 : 0);
}
const sky = new Int32Array(H);
for (let y = 0; y < H; y++) sky[y] = mix(0x070b1f, 0x2a2c66, Math.pow(y / H, 1.6));
const night = (out, t) => {
for (let y = 0; y < H; y++) out.fill(sky[y], y * W, (y + 1) * W);
for (const s of stars) out[s.y * W + s.x] = mix(sky[s.y], 0xe8ecff, 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + s.p)));
const mx = W * 0.22, my = H * 0.26, mr = Math.min(W, H * asp) * 0.09;
for (let y = Math.floor(my - mr / asp - 1); y <= my + mr / asp + 1; y++) for (let x = Math.floor(mx - mr - 1); x <= mx + mr + 1; x++) {
if (x < 0 || y < 0 || x >= W || y >= H) continue;
const d = Math.hypot(x - mx, (y - my) * asp), d2 = Math.hypot(x - mx - mr * 0.45, (y - my + mr * 0.15 / asp) * asp);
if (d < mr && d2 > mr * 0.85) out[y * W + x] = 0xf4f1d0;
}
for (const tw of towers) {
for (let y = Math.max(0, Math.floor(tw.top)); y < H; y++) for (let x = tw.x; x < Math.min(W, tw.x + tw.w); x++) {
const lx = x - tw.x, ly = y - Math.floor(tw.top);
const win = lx > 0 && lx < tw.w - 1 && ly > 0 && lx % 2 === 1 && ly % 2 === 1;
const on = win && hash(x + tw.seed, y) < 0.45 + 0.1 * Math.sin(t * 0.7 + tw.seed);
out[y * W + x] = on ? mix(0xffc861, 0xfff0b0, hash(x, y + tw.seed)) : mix(0x10142a, 0x1c2140, lx / tw.w);
}
}
};
return { day, night };
}
function composite(px, A, B, n, mask) {
for (let i = 0; i < n; i++) {
const m = mask(i);
px[i] = m <= 0 ? A[i] : m >= 1 ? B[i] : mix(A[i], B[i], m);
}
}
function transitionSetup(ctx, variants, { dur = 4, ease = easing.inOutCubic } = {}) {
const label = ctx.height >= 8;
const cv = ctx.canvas('field', { rows: label ? ctx.height - 1 : ctx.height });
const W = cv.width, H = cv.height, asp = cv.aspect, th = ctx.theme;
const { day, night } = scenes(W, H, asp, ctx.rng);
const A = new Int32Array(W * H), B = new Int32Array(W * H);
return (t) => {
const { i, f } = cycle(t, variants.length, dur);
const v = variants[i];
const p = pingPongProgress(f, v.ease || ease);
day(A, t); night(B, t);
if (v.draw) v.draw(cv.px, A, B, W, H, asp, p);
else for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
const m = p <= 0 ? 0 : p >= 1 ? 1 : v.mask(x + 0.5, y + 0.5, p, W, H, asp);
cv.px[k] = m <= 0 ? A[k] : m >= 1 ? B[k] : mix(A[k], B[k], m);
}
cv.paint(ctx.buffer);
if (label) {
const name = `${i + 1}/${variants.length}  ${v.name}`;
put(ctx.buffer, 1, ctx.height - 1, name, th.ink, undefined, undefined, ctx.width - 2);
const pct = `${Math.round(p * 100)}%`.padStart(4);
if (ctx.width > name.length + 8) put(ctx.buffer, ctx.width - 5, ctx.height - 1, pct, th.muted);
}
};
}
};
__d[27] = function (__ns) {
const { ATTR } = __m(6);
const { NONE, mix } = __m(0);
__e(__ns, { "ATTR": () => ATTR, "NONE": () => NONE, "uni": () => uni, "G": () => G, "C": () => C, "asciify": () => asciify, "writer": () => writer, "hash": () => hash, "pick": () => pick, "walk": () => walk, "typed": () => typed, "blink": () => blink, "clock": () => clock, "pad": () => pad, "lpad": () => lpad, "fixed": () => fixed, "human": () => human, "stream": () => stream, "meter": () => meter, "spark": () => spark, "bashPrompt": () => bashPrompt, "session": () => session, "drawSession": () => drawSession, "wrapParts": () => wrapParts }, [], ["ATTR","C","G","NONE","asciify","bashPrompt","blink","clock","drawSession","fixed","hash","human","lpad","meter","pad","pick","session","spark","stream","typed","uni","walk","wrapParts","writer"]);
const uni = (ctx) => ctx.caps?.unicode !== false;
function G(ctx) {
return uni(ctx)
? { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘', tee: '├', teeL: '┤', teeT: '┬', teeB: '┴', cross: '┼',
branch: '├─', last: '└─', pipe: '│ ', dot: '●', ring: '○', ok: '✓', bad: '✗', arrow: '→', up: '↑', down: '↓',
full: '█', dark: '▓', mid: '▒', light: '░', ell: '…', deg: '°', bullet: '•', tri: '▸', pl: '', plThin: '',
branchIcon: '', warn: '⚠', spark: '▁▂▃▄▅▆▇█', lt: '‹', gt: '›' }
: { h: '-', v: '|', tl: '+', tr: '+', bl: '+', br: '+', tee: '+', teeL: '+', teeT: '+', teeB: '+', cross: '+',
branch: '|-', last: '`-', pipe: '| ', dot: '*', ring: 'o', ok: '+', bad: 'x', arrow: '>', up: '^', down: 'v',
full: '#', dark: '#', mid: '=', light: '.', ell: '.', deg: ' ', bullet: '*', tri: '>', pl: '>', plThin: '>',
branchIcon: '', warn: '!', spark: '_.-=+*#@', lt: '<', gt: '>' };
}
function C(ctx) {
const t = ctx.theme;
return {
fg: t.ink, muted: t.muted, dim: t.dim, line: t.line, bg: ctx.bg, panel: t.panel, panel2: t.panel2,
onFill: t.bg,
green: t.pos, red: t.neg, yellow: t.warn, blue: t.info, magenta: t.crit, accent: t.accent,
cyan: mix(t.info, t.pos, 0.45), orange: mix(t.warn, t.neg, 0.4),
};
}
const ASCII_MAP = {
'─': '-', '━': '-', '═': '=', '│': '|', '┃': '|', '║': '|', '┌': '+', '┐': '+', '└': '+', '┘': '+', '├': '+', '┤': '+',
'┬': '+', '┴': '+', '┼': '+', '╭': '+', '╮': '+', '╰': '+', '╯': '+', '╔': '+', '╗': '+', '╚': '+', '╝': '+',
'●': '*', '○': 'o', '◉': '@', '◯': 'o', '✓': '+', '✔': '+', '✗': 'x', '✖': 'x', '→': '>', '←': '<', '↑': '^', '↓': 'v',
'█': '#', '▓': '#', '▒': '=', '░': '.', '▏': '|', '▎': '|', '▍': '|', '▌': '|', '▋': '|', '▊': '|', '▉': '#',
'▁': '_', '▂': '_', '▃': '.', '▄': '-', '▅': '=', '▆': '+', '▇': '*', '…': '.', '°': ' ', '•': '*', '▸': '>', '▶': '>',
'·': '.', '×': 'x', 'µ': 'u', '⚠': '!', '❯': '>', '❭': '>', '✘': 'x', '⇡': '^', '⇣': 'v', '±': '+', '⎈': '*', '–': '-', '—': '-', '‹': '<', '›': '>', '«': '<', '»': '>', '': '>', '': '>', '': ' ',
};
function asciify(s) {
let out = '';
for (const ch of String(s)) {
const cp = ch.codePointAt(0);
out += cp >= 0x20 && cp <= 0x7e ? ch : ASCII_MAP[ch] ?? (cp < 0x20 ? ' ' : '?');
}
return out;
}
function writer(ctx) {
const b = ctx.buffer;
const a = !uni(ctx);
const W = () => b.width, H = () => b.height;
const fix = (s) => (a ? asciify(s) : String(s));
const put = (x, y, s, fg, bg, attr = 0) => (y < 0 || y >= b.height ? x + [...String(s)].length : b.text(x, y, fix(s), fg, bg, attr));
return {
put,
seg(x, y, parts) { for (const p of parts) if (p) x = put(x, y, p[0], p[1], p[3], p[2] || 0); return x; },
right(xEnd, y, s, fg, bg, attr = 0) { const t = fix(s); return put(xEnd - [...t].length, y, t, fg, bg, attr); },
fill(x, y, w, h, ch, fg, bg) { b.fill(x, y, w, h, ch, fg, bg); },
rowBg(y, bg, x = 0, w = b.width) { b.fill(x, y, w, 1, ' ', undefined, bg); },
hline(x, y, w, ch, fg) { if (w > 0) put(x, y, (a ? asciify(ch) : ch).repeat(w), fg); },
get width() { return W(); },
get height() { return H(); },
ascii: a,
};
}
function hash(n, salt = 0) {
let h = (Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0;
h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0;
h ^= h >>> 15;
return (h >>> 0) / 4294967296;
}
const pick = (arr, n, salt) => arr[Math.floor(hash(n, salt) * arr.length)];
function walk(ctx, key, t, speed = 0.35) {
const v = ctx.noise.fbm(key * 7.31 + 0.5, t * speed, (ctx.seed || 0) * 0.13, 3);
return Math.min(1, Math.max(0, 0.5 + v * 0.95));
}
function typed(text, t, start = 0, cps = 18) {
const n = Math.max(0, Math.floor((t - start) * cps));
return { text: text.slice(0, n), done: n >= text.length, at: start + text.length / cps };
}
const blink = (t, period = 1) => (t % period) < period / 2;
const BASE = Date.UTC(2026, 9, 13, 14, 2, 11) / 1000;
const z2 = (n) => String(n).padStart(2, '0');
function clock(t, offset = 0) {
const s = Math.floor(BASE + offset + t);
const d = new Date(s * 1000);
return {
hms: `${z2(d.getUTCHours())}:${z2(d.getUTCMinutes())}:${z2(d.getUTCSeconds())}`,
hm: `${z2(d.getUTCHours())}:${z2(d.getUTCMinutes())}`,
date: `${d.getUTCFullYear()}-${z2(d.getUTCMonth() + 1)}-${z2(d.getUTCDate())}`,
day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
mon: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()],
dd: z2(d.getUTCDate()),
sec: s,
};
}
const pad = (s, w) => { s = String(s); return s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length); };
const lpad = (s, w) => { s = String(s); return s.length >= w ? s.slice(-w) : ' '.repeat(w - s.length) + s; };
const fixed = (n, d = 1) => Number(n).toFixed(d);
function human(bytes, si = false) {
const k = si ? 1000 : 1024, u = si ? ['B', 'kB', 'MB', 'GB', 'TB'] : ['B', 'K', 'M', 'G', 'T'];
let i = 0;
while (bytes >= k && i < u.length - 1) { bytes /= k; i++; }
return `${bytes >= 100 || i === 0 ? Math.round(bytes) : bytes.toFixed(1)}${u[i]}`;
}
function stream(t, rate, rows, pre = rows) {
const total = pre + Math.floor(t * rate);
const out = [];
for (let i = Math.max(0, total - rows); i < total; i++) out.push(i);
return out;
}
function meter(w, ctx, x, y, width, label, parts, text, { labelColor, bracketColor } = {}) {
const c = C(ctx);
const lab = label;
let cx = w.put(x, y, lab, labelColor ?? c.cyan, undefined, ATTR.BOLD);
cx = w.put(cx, y, '[', bracketColor ?? c.fg, undefined, ATTR.BOLD);
const inner = Math.max(0, x + width - cx - 1);
const t = String(text);
let used = 0;
for (const p of parts) {
const n = Math.max(0, Math.min(inner - used, Math.round(p.v * inner)));
if (n) w.put(cx + used, y, '|'.repeat(n), p.color);
used += n;
}
const tx = cx + inner - t.length;
if (inner > t.length + 1) w.put(tx, y, t, used > tx - cx ? c.fg : c.muted);
w.put(cx + inner, y, ']', bracketColor ?? c.fg, undefined, ATTR.BOLD);
}
function spark(w, ctx, x, y, values, color) {
const g = G(ctx).spark;
let s = '';
for (const v of values) s += g[Math.max(0, Math.min(g.length - 1, Math.round(v * (g.length - 1))))];
w.put(x, y, s, color);
}
function bashPrompt(w, ctx, x, y, { user = 'ops', host = 'node03', dir = '~', root = false } = {}) {
const c = C(ctx);
return w.seg(x, y, [[`${user}@${host}`, root ? c.red : c.green, ATTR.BOLD], [':', c.fg], [dir, c.blue, ATTR.BOLD], [root ? '# ' : '$ ', c.fg]]);
}
function session(ctx, t, steps, { cps = 22, promptOpts = {}, gap = 0.6 } = {}) {
const lines = [];
let at = 0.3;
for (let i = 0; i < steps.length; i++) {
const step = steps[i];
const po = step.prompt ?? promptOpts;
const ty = typed(step.cmd, t, at, cps);
lines.push({ prompt: po, cmd: ty.text, cursor: !ty.done && t >= at, typing: true });
if (!ty.done) return lines;
const outStart = ty.at + 0.25 + (step.wait ?? 0);
if (t < outStart) { lines.at(-1).cursor = blink(t, 0.8); return lines; }
const out = step.out(t - outStart);
for (const l of out) lines.push({ parts: l });
at = outStart + (step.dur ?? 2.5) + gap;
const next = step.after ?? steps[i + 1]?.prompt ?? po;
if (t < at) { lines.push({ prompt: next, cmd: '', cursor: blink(t, 0.8) }); return lines; }
}
lines.push({ prompt: steps.at(-1)?.after ?? steps.at(-1)?.prompt ?? promptOpts, cmd: '', cursor: blink(t, 0.8) });
return lines;
}
function drawSession(w, ctx, lines, x, y0, rows, promptFn = bashPrompt) {
const c = C(ctx);
const vis = lines.slice(-rows);
vis.forEach((l, i) => {
const y = y0 + i;
if (l.parts) { w.seg(x, y, l.parts); return; }
let cx = promptFn(w, ctx, x, y, l.prompt);
cx = w.put(cx, y, l.cmd, c.fg);
if (l.cursor) w.put(cx, y, ' ', c.bg, c.fg);
});
}
function wrapParts(parts, width) {
const rows = [[]];
let col = 0;
for (const [text, ...rest] of parts) {
let s = String(text);
while (s.length) {
if (col >= width) { rows.push([]); col = 0; }
const take = s.slice(0, width - col);
rows.at(-1).push([take, ...rest]);
col += take.length;
s = s.slice(take.length);
}
}
return rows;
}
};
__d[28] = function (__ns) {

__e(__ns, { "defineFont": () => defineFont, "FONTS": () => FONTS, "FONT_NAMES": () => FONT_NAMES, "getFont": () => getFont, "glyph": () => glyph, "hasGlyph": () => hasGlyph }, [], ["FONTS","FONT_NAMES","defineFont","getFont","glyph","hasGlyph"]);
const g = (s) => s.trim().split(/\s+/);
const STANDARD = {
A: g('.###. #...# #...# ##### #...# #...# #...#'),
B: g('####. #...# #...# ####. #...# #...# ####.'),
C: g('.###. #...# #.... #.... #.... #...# .###.'),
D: g('###.. #..#. #...# #...# #...# #..#. ###..'),
E: g('##### #.... #.... ####. #.... #.... #####'),
F: g('##### #.... #.... ####. #.... #.... #....'),
G: g('.###. #...# #.... #.### #...# #...# .####'),
H: g('#...# #...# #...# ##### #...# #...# #...#'),
I: g('### .#. .#. .#. .#. .#. ###'),
J: g('..### ...#. ...#. ...#. ...#. #..#. .##..'),
K: g('#...# #..#. #.#.. ##... #.#.. #..#. #...#'),
L: g('#.... #.... #.... #.... #.... #.... #####'),
M: g('#...# ##.## #.#.# #.#.# #...# #...# #...#'),
N: g('#...# #...# ##..# #.#.# #..## #...# #...#'),
O: g('.###. #...# #...# #...# #...# #...# .###.'),
P: g('####. #...# #...# ####. #.... #.... #....'),
Q: g('.###. #...# #...# #...# #.#.# #..#. .##.#'),
R: g('####. #...# #...# ####. #.#.. #..#. #...#'),
S: g('.#### #.... #.... .###. ....# ....# ####.'),
T: g('##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..'),
U: g('#...# #...# #...# #...# #...# #...# .###.'),
V: g('#...# #...# #...# #...# #...# .#.#. ..#..'),
W: g('#...# #...# #...# #.#.# #.#.# #.#.# .#.#.'),
X: g('#...# #...# .#.#. ..#.. .#.#. #...# #...#'),
Y: g('#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..'),
Z: g('##### ....# ...#. ..#.. .#... #.... #####'),
a: g('..... ..... .###. ....# .#### #...# .####'),
b: g('#.... #.... #.##. ##..# #...# #...# ####.'),
c: g('..... ..... .###. #.... #.... #...# .###.'),
d: g('....# ....# .##.# #..## #...# #...# .####'),
e: g('..... ..... .###. #...# ##### #.... .###.'),
f: g('..##. .#..# .#... ###.. .#... .#... .#...'),
g: g('..... ..... .#### #...# #...# .#### ....# .###.'),
h: g('#.... #.... #.##. ##..# #...# #...# #...#'),
i: g('.#. ... ##. .#. .#. .#. ###'),
j: g('..# ... .## ..# ..# ..# #.# .#.'),
k: g('#.... #.... #..#. #.#.. ##... #.#.. #..#.'),
l: g('##. .#. .#. .#. .#. .#. ###'),
m: g('..... ..... ##.#. #.#.# #.#.# #...# #...#'),
n: g('..... ..... #.##. ##..# #...# #...# #...#'),
o: g('..... ..... .###. #...# #...# #...# .###.'),
p: g('..... ..... ####. #...# #...# ####. #.... #....'),
q: g('..... ..... .#### #...# #...# .#### ....# ....#'),
r: g('..... ..... #.##. ##..# #.... #.... #....'),
s: g('..... ..... .#### #.... .###. ....# ####.'),
t: g('.#... .#... ###.. .#... .#... .#..# ..##.'),
u: g('..... ..... #...# #...# #...# #..## .##.#'),
v: g('..... ..... #...# #...# #...# .#.#. ..#..'),
w: g('..... ..... #...# #...# #.#.# #.#.# .#.#.'),
x: g('..... ..... #...# .#.#. ..#.. .#.#. #...#'),
y: g('..... ..... #...# #...# #...# .#### ....# .###.'),
z: g('..... ..... ##### ...#. ..#.. .#... #####'),
0: g('.###. #...# #..## #.#.# ##..# #...# .###.'),
1: g('..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.'),
2: g('.###. #...# ....# ...#. ..#.. .#... #####'),
3: g('##### ...#. ..#.. ...#. ....# #...# .###.'),
4: g('...#. ..##. .#.#. #..#. ##### ...#. ...#.'),
5: g('##### #.... ####. ....# ....# #...# .###.'),
6: g('..##. .#... #.... ####. #...# #...# .###.'),
7: g('##### ....# ...#. ..#.. .#... .#... .#...'),
8: g('.###. #...# #...# .###. #...# #...# .###.'),
9: g('.###. #...# #...# .#### ....# ...#. .##..'),
' ': g('... ... ... ... ... ... ...'),
'.': g('.. .. .. .. .. ## ##'),
',': g('.. .. .. .. ## .# #.'),
':': g('.. ## ## .. ## ## ..'),
';': g('.. ## ## .. ## .# #.'),
'!': g('# # # # # . #'),
'?': g('.###. #...# ....# ...#. ..#.. ..... ..#..'),
'-': g('.... .... .... #### .... .... ....'),
'_': g('..... ..... ..... ..... ..... ..... #####'),
'+': g('..... ..#.. ..#.. ##### ..#.. ..#.. .....'),
'=': g('..... ..... ##### ..... ##### ..... .....'),
'/': g('..... ....# ...#. ..#.. .#... #.... .....'),
'\\': g('..... #.... .#... ..#.. ...#. ....# .....'),
'(': g('..# .#. #.. #.. #.. .#. ..#'),
')': g('#.. .#. ..# ..# ..# .#. #..'),
'[': g('### #.. #.. #.. #.. #.. ###'),
']': g('### ..# ..# ..# ..# ..# ###'),
'<': g('...# ..#. .#.. #... .#.. ..#. ...#'),
'>': g('#... .#.. ..#. ...# ..#. .#.. #...'),
'#': g('.#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.'),
'%': g('##... ##..# ...#. ..#.. .#... #..## ...##'),
'&': g('.##.. #..#. #.#.. .#... #.#.# #..#. .##.#'),
'*': g('..... ..#.. #.#.# .###. #.#.# ..#.. .....'),
"'": g('# # . . . . .'),
'"': g('#.# #.# ... ... ... ... ...'),
'@': g('.###. #...# #.### #.#.# #.### #.... .###.'),
'$': g('..#.. .#### #.#.. .###. ..#.# ####. ..#..'),
'^': g('..#.. .#.#. #...# ..... ..... ..... .....'),
'~': g('..... ..... .#... #.#.# ...#. ..... .....'),
'|': g('# # # # # # #'),
};
const TINY = {
A: g('.#. #.# ### #.# #.#'),
B: g('##. #.# ##. #.# ##.'),
C: g('.## #.. #.. #.. .##'),
D: g('##. #.# #.# #.# ##.'),
E: g('### #.. ##. #.. ###'),
F: g('### #.. ##. #.. #..'),
G: g('.## #.. #.# #.# .##'),
H: g('#.# #.# ### #.# #.#'),
I: g('### .#. .#. .#. ###'),
J: g('..# ..# ..# #.# .#.'),
K: g('#.# #.# ##. #.# #.#'),
L: g('#.. #.. #.. #.. ###'),
M: g('#...# ##.## #.#.# #...# #...#'),
N: g('#..# ##.# #.## #..# #..#'),
O: g('.#. #.# #.# #.# .#.'),
P: g('##. #.# ##. #.. #..'),
Q: g('.#. #.# #.# ##. .##'),
R: g('##. #.# ##. #.# #.#'),
S: g('.## #.. .#. ..# ##.'),
T: g('### .#. .#. .#. .#.'),
U: g('#.# #.# #.# #.# ###'),
V: g('#.# #.# #.# #.# .#.'),
W: g('#...# #...# #.#.# ##.## #...#'),
X: g('#.# #.# .#. #.# #.#'),
Y: g('#.# #.# .#. .#. .#.'),
Z: g('### ..# .#. #.. ###'),
0: g('### #.# #.# #.# ###'),
1: g('.#. ##. .#. .#. ###'),
2: g('### ..# ### #.. ###'),
3: g('### ..# .## ..# ###'),
4: g('#.# #.# ### ..# ..#'),
5: g('### #.. ### ..# ###'),
6: g('### #.. ### #.# ###'),
7: g('### ..# ..# ..# ..#'),
8: g('### #.# ### #.# ###'),
9: g('### #.# ### ..# ###'),
' ': g('.. .. .. .. ..'),
'.': g('. . . . #'),
',': g('.. .. .. .# #.'),
':': g('. # . # .'),
';': g('.. .# .. .# #.'),
'!': g('# # # . #'),
'?': g('##. ..# .#. ... .#.'),
'-': g('... ... ### ... ...'),
'_': g('... ... ... ... ###'),
'+': g('... .#. ### .#. ...'),
'=': g('... ### ... ### ...'),
'/': g('..# ..# .#. #.. #..'),
'\\': g('#.. #.. .#. ..# ..#'),
'(': g('.# #. #. #. .#'),
')': g('#. .# .# .# #.'),
'[': g('## #. #. #. ##'),
']': g('## .# .# .# ##'),
'<': g('..# .#. #.. .#. ..#'),
'>': g('#.. .#. ..# .#. #..'),
'#': g('.#.#. ##### .#.#. ##### .#.#.'),
'%': g('#.# ..# .#. #.. #.#'),
'&': g('.#.. #.#. .#.. #.#. .#.#'),
'*': g('... #.# .#. #.# ...'),
"'": g('# # . . .'),
'"': g('#.# #.# ... ... ...'),
'@': g('.##. #..# #.## #... .##.'),
'$': g('.## ##. .#. .## ##.'),
'^': g('.#. #.# ... ... ...'),
'~': g('.... .#.# #.#. .... ....'),
'|': g('# # # # #'),
};
const BOLD = {
A: g('.####. ##..## ##..## ###### ##..## ##..## ##..##'),
B: g('#####. ##..## ##..## #####. ##..## ##..## #####.'),
C: g('.##### ##.... ##.... ##.... ##.... ##.... .#####'),
D: g('#####. ##..## ##..## ##..## ##..## ##..## #####.'),
E: g('###### ##.... ##.... #####. ##.... ##.... ######'),
F: g('###### ##.... ##.... #####. ##.... ##.... ##....'),
G: g('.##### ##.... ##.... ##.### ##..## ##..## .#####'),
H: g('##..## ##..## ##..## ###### ##..## ##..## ##..##'),
I: g('#### .##. .##. .##. .##. .##. ####'),
J: g('....## ....## ....## ....## ....## ##..## .####.'),
K: g('##..## ##.##. ####.. ###... ####.. ##.##. ##..##'),
L: g('##.... ##.... ##.... ##.... ##.... ##.... ######'),
M: g('##...## ###.### ####### ##.#.## ##...## ##...## ##...##'),
N: g('##..## ###.## ###### ##.### ##..## ##..## ##..##'),
O: g('.####. ##..## ##..## ##..## ##..## ##..## .####.'),
P: g('#####. ##..## ##..## #####. ##.... ##.... ##....'),
Q: g('.####. ##..## ##..## ##..## ##.### .####. ....##'),
R: g('#####. ##..## ##..## #####. ##.##. ##..## ##..##'),
S: g('.##### ##.... ##.... .####. ....## ....## #####.'),
T: g('###### ..##.. ..##.. ..##.. ..##.. ..##.. ..##..'),
U: g('##..## ##..## ##..## ##..## ##..## ##..## .####.'),
V: g('##..## ##..## ##..## ##..## ##..## .####. ..##..'),
W: g('##...## ##...## ##...## ##.#.## ####### ###.### ##...##'),
X: g('##..## ##..## .####. ..##.. .####. ##..## ##..##'),
Y: g('##..## ##..## .####. ..##.. ..##.. ..##.. ..##..'),
Z: g('###### ....## ...##. ..##.. .##... ##.... ######'),
0: g('.####. ##..## ##.### ###### ###.## ##..## .####.'),
1: g('..##.. .###.. ..##.. ..##.. ..##.. ..##.. .####.'),
2: g('.####. ##..## ....## ...##. ..##.. .##... ######'),
3: g('#####. ....## ....## .####. ....## ....## #####.'),
4: g('...### ..#### .##.## ##..## ###### ....## ....##'),
5: g('###### ##.... #####. ....## ....## ##..## .####.'),
6: g('.####. ##.... ##.... #####. ##..## ##..## .####.'),
7: g('###### ....## ...##. ..##.. ..##.. ..##.. ..##..'),
8: g('.####. ##..## ##..## .####. ##..## ##..## .####.'),
9: g('.####. ##..## ##..## .##### ....## ....## .####.'),
' ': g('... ... ... ... ... ... ...'),
'.': g('.. .. .. .. .. ## ##'),
',': g('.. .. .. .. ## .# #.'),
':': g('.. ## ## .. ## ## ..'),
';': g('.. ## ## .. ## .# #.'),
'!': g('## ## ## ## ## .. ##'),
'?': g('.####. ##..## ....## ...##. ..##.. ...... ..##..'),
'-': g('..... ..... ..... ##### ..... ..... .....'),
'_': g('...... ...... ...... ...... ...... ...... ######'),
'+': g('...... ..##.. ..##.. ###### ..##.. ..##.. ......'),
'=': g('...... ...... ###### ...... ###### ...... ......'),
'/': g('....## ....## ...##. ..##.. .##... ##.... ##....'),
'\\': g('##.... ##.... .##... ..##.. ...##. ....## ....##'),
'(': g('.## ##. ##. ##. ##. ##. .##'),
')': g('##. .## .## .## .## .## ##.'),
'[': g('### ##. ##. ##. ##. ##. ###'),
']': g('### .## .## .## .## .## ###'),
'<': g('...## ..##. .##.. ##... .##.. ..##. ...##'),
'>': g('##... .##.. ..##. ...## ..##. .##.. ##...'),
'#': g('.#..#. ###### .#..#. .#..#. .#..#. ###### .#..#.'),
'%': g('##...# ##..## ...##. ..##.. .##... ##..## #...##'),
'&': g('.###.. ##.##. .###.. .###.# ##.### ##..## .###.#'),
'*': g('...... .#..#. ..##.. ###### ..##.. .#..#. ......'),
"'": g('## ## .. .. .. .. ..'),
'"': g('##.## ##.## ..... ..... ..... ..... .....'),
'@': g('.####. ##..## ##.### ##.### ##.##. ##.... .#####'),
'$': g('..#... .##### ##.#.. .####. ..#.## #####. ..#...'),
'^': g('..##.. .####. ##..## ...... ...... ...... ......'),
'~': g('...... ...... .###.# #.###. ...... ...... ......'),
'|': g('## ## ## ## ## ## ##'),
};
function defineFont(name, width, height, descent, rows) {
return compile(name, width, height, descent, rows);
}
function compile(name, width, height, descent, rows) {
const glyphs = {};
for (const [ch, r] of Object.entries(rows)) {
const w = r[0].length;
const bits = new Uint8Array(w * r.length);
r.forEach((line, y) => { for (let x = 0; x < w; x++) bits[y * w + x] = line[x] === '#' ? 1 : 0; });
glyphs[ch] = { ch, w, h: r.length, rows: r, bits };
}
const tw = Math.max(3, width - 1), trows = [];
for (let y = 0; y < height; y++) trows.push(y === 0 || y === height - 1 ? '#'.repeat(tw) : '#' + '.'.repeat(tw - 2) + '#');
const tbits = new Uint8Array(tw * height);
trows.forEach((line, y) => { for (let x = 0; x < tw; x++) tbits[y * tw + x] = line[x] === '#' ? 1 : 0; });
const tofu = { ch: '�', w: tw, h: height, rows: trows, bits: tbits };
return { name, width, height, descent, spacing: 1, lineSpacing: 1, glyphs, tofu };
}
const FONTS = {
standard: compile('standard', 5, 7, 1, STANDARD),
tiny: compile('tiny', 3, 5, 0, TINY),
bold: compile('bold', 6, 7, 0, BOLD),
};
const FONT_NAMES = Object.keys(FONTS);
function getFont(font = 'standard') {
if (font && typeof font === 'object' && font.glyphs) return font;
return FONTS[font] || FONTS.standard;
}
function glyph(font, ch) {
const f = getFont(font);
return f.glyphs[ch] || f.glyphs[String(ch).toUpperCase()] || f.tofu;
}
function hasGlyph(font, ch) {
return Object.prototype.hasOwnProperty.call(getFont(font).glyphs, ch);
}
};
__d[29] = function (__ns) {
const { mix, rgb, NONE } = __m(0);
const { glyph, getFont } = __m(28);
__e(__ns, { "clamp01": () => clamp01, "fract": () => fract, "lerpc": () => lerpc, "shade": () => shade, "ground": () => ground, "dim": () => dim, "VGA": () => VGA, "VGA_NAME": () => VGA_NAME, "bbsPalette": () => bbsPalette, "textMask": () => textMask, "maskAt": () => maskAt, "hash2": () => hash2, "fontPx": () => fontPx, "makeStars": () => makeStars }, [], ["VGA","VGA_NAME","bbsPalette","clamp01","dim","fontPx","fract","ground","hash2","lerpc","makeStars","maskAt","shade","textMask"]);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fract = (v) => v - Math.floor(v);
const lerpc = (a, b, t) => mix(a, b, clamp01(t));
function shade(theme, k) {
return theme.mode === 'light' ? lerpc(theme.bg, theme.line, k * 2.2) : lerpc(theme.bg, 0x000000, k);
}
const ground = (theme) => (theme.mode === 'light' ? theme.bg : 0x000000);
function dim(c, k) {
if (c === NONE) return NONE;
return rgb(((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k);
}
const VGA = [
0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];
const VGA_NAME = {
black: 0, blue: 1, green: 2, cyan: 3, red: 4, magenta: 5, brown: 6, gray: 7,
dark: 8, lblue: 9, lgreen: 10, lcyan: 11, lred: 12, lmagenta: 13, yellow: 14, white: 15,
};
function bbsPalette(ctx) {
if (ctx.param('colors', 'vga') !== 'theme') return VGA;
const t = ctx.theme;
const d = (c, k) => dim(c, k);
return [
t.bg, d(t.info, 0.65), d(t.pos, 0.65), d(t.accent, 0.65), d(t.neg, 0.65), d(t.crit, 0.65), d(t.warn, 0.6), t.muted,
t.dim, t.info, t.pos, t.accent, t.neg, t.crit, t.warn, t.ink,
];
}
function textMask(text, { font = 'bold', spacing = 1 } = {}) {
const f = getFont(font);
const glyphs = [...String(text)].map((ch) => (ch === ' ' ? { w: Math.max(2, f.width - 2), h: f.height, bits: null } : glyph(f, ch)));
const h = f.height;
let w = 0;
const cols = [];
for (const g of glyphs) { cols.push(w); w += g.w + spacing; }
w = Math.max(1, w - spacing);
const bits = new Uint8Array(w * h);
glyphs.forEach((g, i) => {
if (!g.bits) return;
const gh = Math.min(h, g.h);
for (let y = 0; y < gh; y++) for (let x = 0; x < g.w; x++) if (g.bits[y * g.w + x]) bits[y * w + cols[i] + x] = 1;
});
return { w, h, bits, cols, glyphs };
}
function maskAt(m, x, y, sx = 1, sy = sx) {
const mx = Math.floor(x / sx), my = Math.floor(y / sy);
if (mx < 0 || my < 0 || mx >= m.w || my >= m.h) return 0;
return m.bits[my * m.w + mx];
}
function hash2(x, y, s = 0) {
let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
h = Math.imul(h ^ (h >>> 13), 1274126177);
return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function fontPx(cv, targetCells, fontH = 7) {
const L = Math.max(0.5, (targetCells * 2) / fontH); 
return { sx: Math.max(1, Math.round(L * cv.sx)), sy: Math.max(1, Math.round((L * cv.sy) / 2)) };
}
function makeStars(rng, w, h, n) {
return Array.from({ length: n }, () => [rng() * w, rng() * h, rng()]);
}
};
export { __m, __d, __e };
