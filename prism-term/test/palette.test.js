// Refraction terminal palette: Day/Night detection, depth mapping (256 / 16 /
// mono) and the terminal emulator scheme exports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseColorFgBg, parseOscColor, modeOfColor, detectThemeSync, canQueryBackground,
  queryBackground, detectTheme, detectedTheme, resetThemeDetection, themeForMode,
} from '../src/theme-detect.js';
import { getTheme, defaultThemeId, palette, terminalScheme, THEME_IDS, DEFAULT_THEME_ID, TERMINAL_SCHEMES, SPECTRUM, PALETTE_NAMES } from '../src/palettes.js';
import { to256, nearest256, pinned256, to16, ansi16Fg, ansi16Bg, fgParam, bgParam, toOklab, hex, NONE, ANSI16 } from '../src/color.js';
import { FORMATS, exportTheme, schemeFor, formatId, themeFileName } from '../src/theme-export.js';
import { TERMINAL_GALLERIES } from '../src/themes.js';
import { CellBuffer } from '../src/buffer.js';
import { box } from '../src/widgets/box.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = ['bg', 'panel', 'panel2', 'card', 'line', 'ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
const TTY = { isTTY: true };
const lin = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
const relLum = (c) => 0.2126 * lin((c >> 16) & 255) + 0.7152 * lin((c >> 8) & 255) + 0.0722 * lin(c & 255);
const contrast = (a, b) => { const x = relLum(a), y = relLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ── the theme chain ─────────────────────────────────────────────────────────
test('Prism Night is the default; Prism Day and Night lead the theme list', () => {
  assert.equal(DEFAULT_THEME_ID, 'prism-dark');
  assert.deepEqual(THEME_IDS.slice(0, 2), ['prism-dark', 'prism-light']);
  assert.equal(getTheme().id, 'prism-dark'); // tests are not a TTY: no detection
  assert.equal(getTheme('auto').id, 'prism-dark');
  assert.equal(getTheme('day').id, 'prism-light');
  assert.equal(getTheme('night').id, 'prism-dark');
  assert.equal(getTheme('prism').id, 'prism-dark');
  assert.equal(getTheme('prism-light').name, 'Prism Day');
  assert.equal(getTheme('prism-dark').name, 'Prism Night');
  for (const id of ['prism-dark', 'prism-light']) {
    const th = getTheme(id);
    for (const k of TOKENS) assert.equal(typeof th[k], 'number', `${id}.${k}`);
    assert.ok(TERMINAL_SCHEMES[id], `${id} has a terminal scheme`);
  }
  assert.equal(SPECTRUM.length, 12);
  assert.ok(PALETTE_NAMES.includes('prism') && PALETTE_NAMES.includes('prism-ink') && PALETTE_NAMES.includes('neon'));
  // the prism palette (Refraction's spectrum) follows the theme's mode
  assert.equal(palette('prism', getTheme('prism-dark'))(0), hex(SPECTRUM[0].nightVivid));
  assert.equal(palette('prism', getTheme('prism-light'))(0), hex(SPECTRUM[0].dayVivid));
  assert.equal(palette('prism-ink', getTheme('primer-light'))(0), hex(SPECTRUM[0].day));
});

test('src/themes.js is in step with the registry and design tokens (sync-themes --check)', (t) => {
  if (!fs.existsSync(path.join(ROOT, '..', 'prism-mcp-server', 'utils', 'themes.js'))) return t.skip('no sibling prism-mcp-server checkout');
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-themes.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
});

// ── Day / Night detection ───────────────────────────────────────────────────
test('COLORFGBG: the background index decides', () => {
  assert.equal(parseColorFgBg('15;0'), 'dark');
  assert.equal(parseColorFgBg('0;15'), 'light');
  assert.equal(parseColorFgBg('0;7'), 'light');
  assert.equal(parseColorFgBg('7;8'), 'dark');
  assert.equal(parseColorFgBg('12;default;0'), 'dark');
  assert.equal(parseColorFgBg('0;default;11'), 'light');
  for (const v of ['default;default', '', undefined, 'abc', '1;300']) assert.equal(parseColorFgBg(v), null, String(v));
});

test('OSC 11 replies parse in every common spelling', () => {
  assert.equal(parseOscColor('\x1b]11;rgb:f6f6/f5f5/f9f9\x1b\\'), 0xf6f5f9);
  assert.equal(parseOscColor('\x1b]11;rgb:0a0a/0c0c/1212\x07'), 0x0a0c12);
  assert.equal(parseOscColor('rgb:0a/0c/12'), 0x0a0c12);
  assert.equal(parseOscColor('rgb:f/f/f'), 0xffffff);
  assert.equal(parseOscColor('rgba:ffff/0000/8080/ffff'), 0xff0080);
  assert.equal(parseOscColor('#fff'), 0xffffff);
  assert.equal(parseOscColor('#0a0c12'), 0x0a0c12);
  assert.equal(parseOscColor('#00000a0c0012'), 0x000000 | (0x0a << 8) | 0x00);
  for (const v of ['', 'rgb:zz/00/00', 'hello', null]) assert.equal(parseOscColor(v), null);
  assert.equal(modeOfColor(0xf6f5f9), 'light');
  assert.equal(modeOfColor(0x0a0c12), 'dark');
  assert.equal(modeOfColor(0x8a8a8a), 'light'); // OKLab L > .6 counts as light
  assert.equal(modeOfColor(0x777777), 'dark');
  assert.equal(themeForMode('light'), 'prism-light');
  assert.equal(themeForMode('dark', 'primer'), 'primer-dark');
});

test('detectThemeSync: PRISM_TERM_THEME always wins; COLORFGBG only on a TTY outside CI', () => {
  assert.deepEqual(detectThemeSync({ env: { PRISM_TERM_THEME: 'day' }, stdout: { isTTY: false } }), { mode: 'light', source: 'PRISM_TERM_THEME' });
  assert.deepEqual(detectThemeSync({ env: { PRISM_TERM_THEME: 'Night' }, stdout: TTY }), { mode: 'dark', source: 'PRISM_TERM_THEME' });
  assert.equal(detectThemeSync({ env: { PRISM_TERM_THEME: 'primer-light' }, stdout: TTY }).id, 'primer-light');
  assert.equal(detectThemeSync({ env: { COLORFGBG: '0;15' }, stdout: { isTTY: false } }), null, 'pipes and files stay deterministic');
  assert.equal(detectThemeSync({ env: { COLORFGBG: '0;15', CI: 'true' }, stdout: TTY }), null, 'CI stays deterministic');
  assert.deepEqual(detectThemeSync({ env: { COLORFGBG: '0;15' }, stdout: TTY }), { mode: 'light', source: 'COLORFGBG' });
  assert.deepEqual(detectThemeSync({ env: { COLORFGBG: '15;0', PRISM_TERM_THEME: 'auto' }, stdout: TTY }), { mode: 'dark', source: 'COLORFGBG' });
  assert.equal(detectThemeSync({ env: {}, stdout: TTY }), null);
});

/** A fake TTY stdin that records raw-mode changes; `answer` replies to what stdout writes. */
function fakeTerminal(answer) {
  const stdin = new EventEmitter();
  Object.assign(stdin, {
    isTTY: true, isRaw: false, raw: [], resumed: 0, paused: 0, unshifted: [],
    setRawMode(v) { this.isRaw = v; this.raw.push(v); return this; },
    resume() { this.resumed++; return this; },
    pause() { this.paused++; return this; },
    unshift(b) { this.unshifted.push(String(b)); },
  });
  const stdout = { isTTY: true, written: '', write(s) { this.written += s; if (answer) setTimeout(() => answer(s, stdin), 2); return true; } };
  return { stdin, stdout };
}

test('OSC 11 query: answered → color; raw mode restored, replies swallowed, typed keys handed back', async () => {
  const { stdin, stdout } = fakeTerminal((q, i) => {
    assert.match(q, /\x1b\]11;\?\x1b\\/);
    i.emit('data', Buffer.from('x\x1b]11;rgb:f8f8/f7f7/fbfb\x1b\\'));
    i.emit('data', Buffer.from('\x1b[?62;22c'));
  });
  const t0 = Date.now();
  const c = await queryBackground({ stdin, stdout, env: { TERM: 'xterm-256color' }, platform: 'linux', timeout: 500 });
  assert.equal(c, 0xf8f7fb);
  assert.ok(Date.now() - t0 < 400, 'ends on the DA1 reply, not the timeout');
  assert.deepEqual(stdin.raw, [true, false]);
  assert.equal(stdin.isRaw, false);
  assert.equal(stdin.listenerCount('data'), 0);
  assert.ok(stdin.paused >= 1);
  assert.deepEqual(stdin.unshifted, ['x'], 'the key typed during the query is not lost');
});

test('OSC 11 query: DA1 only (no OSC 11 support) ends at once; silence ends at the timeout', async () => {
  let a = fakeTerminal((q, i) => i.emit('data', '\x1b[?1;2c'));
  let t0 = Date.now();
  assert.equal(await queryBackground({ ...a, env: {}, platform: 'linux', timeout: 800 }), null);
  assert.ok(Date.now() - t0 < 600);
  assert.equal(a.stdin.isRaw, false);
  a = fakeTerminal(null);
  t0 = Date.now();
  assert.equal(await queryBackground({ ...a, env: {}, platform: 'linux', timeout: 40 }), null);
  assert.ok(Date.now() - t0 >= 35);
  assert.equal(a.stdin.isRaw, false);
  assert.equal(a.stdin.listenerCount('data'), 0);
  // Windows (ConPTY answers DA1 itself): only the OSC reply or the timeout ends it, and no DA1 is sent.
  a = fakeTerminal((q, i) => i.emit('data', '\x1b]11;rgb:0a0a/0c0c/1212\x07'));
  assert.equal(await queryBackground({ ...a, env: {}, platform: 'win32', timeout: 300 }), 0x0a0c12);
  assert.doesNotMatch(a.stdout.written, /\x1b\[c/);
});

test('OSC 11 query is skipped for pipes, CI, consoles, opt-out and a stdin someone else owns', async () => {
  const both = fakeTerminal(null);
  assert.equal(canQueryBackground({ ...both, env: {} }), true);
  assert.equal(canQueryBackground({ stdin: both.stdin, stdout: { isTTY: false }, env: {} }), false);
  assert.equal(canQueryBackground({ stdin: { isTTY: false }, stdout: both.stdout, env: {} }), false);
  for (const env of [{ CI: '1' }, { GITHUB_ACTIONS: 'true' }, { TERM: 'dumb' }, { TERM: 'linux' }, { PRISM_TERM_NO_QUERY: '1' }]) {
    assert.equal(canQueryBackground({ ...both, env }), false, JSON.stringify(env));
  }
  both.stdin.isRaw = true;
  assert.equal(canQueryBackground({ ...both, env: {} }), false);
  const piped = { stdin: { isTTY: false }, stdout: { isTTY: false, write() { throw new Error('must not write'); } } };
  assert.equal(await queryBackground({ ...piped, env: {} }), null);
});

test('detectTheme caches its answer for getTheme()\'s default', async () => {
  try {
    const light = fakeTerminal((q, i) => i.emit('data', '\x1b]11;rgb:ffff/ffff/ffff\x1b\\\x1b[?62c'));
    const r = await detectTheme({ ...light, env: {}, platform: 'linux' });
    assert.deepEqual([r.id, r.mode, r.source], ['prism-light', 'light', 'OSC 11']);
    assert.equal(detectedTheme().id, 'prism-light');
    assert.equal(defaultThemeId(), 'prism-light');
    assert.equal(getTheme().id, 'prism-light');
    assert.equal(getTheme('primer').id, 'primer-light', 'a family follows the detected mode');
    assert.equal(getTheme('cloudscape-dark').id, 'cloudscape-dark', 'an explicit theme always wins');
    const env = await detectTheme({ env: { PRISM_TERM_THEME: 'night' }, stdout: TTY });
    assert.equal(env.id, 'prism-dark');
    const none = await detectTheme({ env: {}, stdin: { isTTY: false }, stdout: { isTTY: false } });
    assert.deepEqual([none.id, none.source], ['prism-dark', 'default']);
    assert.equal(getTheme().id, 'prism-dark');
  } finally {
    resetThemeDetection();
  }
});

// ── depth mapping ───────────────────────────────────────────────────────────
const TEXT = ['ink', 'muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit'];
const CUBE = [0, 95, 135, 175, 215, 255];
const x256 = (i) => (i < 232 ? (CUBE[Math.floor((i - 16) / 36)] << 16) | (CUBE[Math.floor((i - 16) / 6) % 6] << 8) | CUBE[(i - 16) % 6] : (8 + (i - 232) * 10) * 0x010101);
// Worst contrast of c over the backgrounds 256-color text sits on: the terminal's
// own (unfilled cells) and every theme surface as it quantizes.
const worst256 = (id, c) => {
  const th = getTheme(id), bgs = [hex(TERMINAL_SCHEMES[id].background), ...['bg', 'panel', 'panel2', 'card'].map((k) => x256(to256(th[k])))];
  return Math.min(...bgs.map((b) => contrast(c, b)));
};

test('256 colors: Oklab nearest of 16–255; every Prism token lands on its designed index', () => {
  assert.equal(to256(0x000000), 16);
  assert.equal(to256(0xffffff), 231);
  for (const id of ['prism-dark', 'prism-light']) {
    const th = getTheme(id), want = TERMINAL_SCHEMES[id].tokens256;
    assert.ok(Object.keys(want).length >= 10);
    for (const [k, idx] of Object.entries(want)) assert.equal(to256(th[k]), idx, `${id}.${k}`);
    // The designed index is the exact nearest, unless that nearest misses 4.5:1 as text.
    for (const k of TOKENS) {
      const n = nearest256(th[k]);
      if (to256(th[k]) !== n) assert.ok(TEXT.includes(k) && worst256(id, x256(n)) < 4.5, `${id}.${k} is exact`);
    }
  }
  // perceptual: the lavender accent stays a lavender (not the gray an RGB metric picks)
  assert.equal(to256(hex('#b8a2f2')), 147);
  // never the user-remappable 0–15, and the LUT agrees with the exhaustive search
  // everywhere except near-ties
  let r = 12345, worst = 0, off = 0;
  const lab256 = (i) => toOklab(i < 232 ? (([0, 95, 135, 175, 215, 255][Math.floor((i - 16) / 36)] << 16) | ([0, 95, 135, 175, 215, 255][Math.floor((i - 16) / 6) % 6] << 8) | [0, 95, 135, 175, 215, 255][(i - 16) % 6]) : (8 + (i - 232) * 10) * 0x010101);
  const d = (c, i) => { const p = toOklab(c), q = lab256(i); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  for (let n = 0; n < 3000; n++) {
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    const c = r & 0xffffff, a = to256(c), b = pinned256(c) ?? nearest256(c); // a designed (pinned) cell is exact by definition
    assert.ok(a >= 16 && a <= 255);
    worst = Math.max(worst, d(c, a) - d(c, b));
    if (a !== b) off++;
  }
  // the 18-bit LUT keys on 6 bits/channel, so a few colors land one near-tie away
  assert.ok(worst < 0.04, `LUT within ~1 JND of exact (worst ΔE ${worst.toFixed(4)})`);
  assert.ok(off / 3000 < 0.1, `LUT matches the exhaustive search for ≥ 90% of colors (${off} differ)`);
});

test('256 colors: Prism text (tokens, spectrum ink, gallery ink) clears 4.5:1 on every 256-color surface; gallery marks 3:1', () => {
  for (const [id, mode] of [['prism-dark', 'night'], ['prism-light', 'day']]) {
    const th = getTheme(id);
    const ok = (c, need, what) => { const i = to256(c), r = worst256(id, x256(i)); assert.ok(r >= need, `${id} ${what} → ${i}: ${r.toFixed(2)}:1`); };
    for (const k of TEXT) ok(th[k], 4.5, k);
    for (const st of SPECTRUM) ok(hex(st[mode]), 4.5, `${st.name} ink`);
    for (const g of TERMINAL_GALLERIES) { ok(hex(g[mode]), 4.5, `${g.id} ink`); ok(hex(g[`${mode}Vivid`]), 3, `${g.id} vivid`); }
    for (const [n, i] of (TERMINAL_SCHEMES[id].ansi256 || []).entries()) {
      if ((mode === 'night' && n === 0) || (mode === 'day' && (n === 7 || n === 15))) continue; // background-role slots (Day: light white / bright white)
      assert.ok(worst256(id, x256(i)) >= 4.5, `${id} ANSI ${n} → ${i}`);
    }
  }
  // Day's teal ink (text, λ 492 since tokens 1.3.0) would land on the too-light nearest, 30 #008787 (4.09:1 on the Day terminal).
  assert.equal(to256(hex('#007474')), 23);
  assert.equal(TERMINAL_GALLERIES.length, 17);
});

test('16 colors: Prism tokens use their designed ANSI slots; bg / ink are the terminal\'s own', () => {
  const n = getTheme('prism-dark'), d = getTheme('prism-light');
  const fg = (c) => fgParam(c, '16'), bg = (c) => bgParam(c, '16');
  // Night
  assert.equal(bg(n.bg), '49');
  assert.equal(fg(n.ink), '39');
  assert.deepEqual([n.accent, n.info, n.pos, n.warn, n.neg].map(fg), ['35', '34', '32', '33', '31']);
  assert.equal(fg(n.crit), '95');
  assert.equal(fg(n.muted), '37');
  assert.equal(fg(n.dim), '90');
  assert.equal(fg(n.line), '90');
  assert.equal(bg(n.panel), '40');
  assert.equal(fg(n.bg), '30', 'text on an accent fill stays dark');
  assert.equal(bg(n.ink), '107');
  // Day
  assert.equal(bg(d.bg), '49');
  assert.equal(fg(d.ink), '39');
  assert.equal(bg(d.card), '49');
  assert.deepEqual([d.accent, d.info, d.pos, d.warn, d.neg].map(fg), ['35', '34', '32', '33', '31']);
  assert.equal(fg(d.muted), '90');
  assert.equal(fg(d.dim), '90', 'Day 7 / 15 are light fills, so dim text takes bright black');
  assert.equal(fg(d.line), '90');
  assert.equal(bg(d.line), '47');
  assert.equal(fg(d.bg), '97', 'text on an accent fill stays light');
  assert.equal(bg(d.ink), '40');
  // the slots carrying text read at AA on their own scheme's background
  for (const id of ['prism-dark', 'prism-light']) {
    const s = TERMINAL_SCHEMES[id];
    for (const k of ['muted', 'dim', 'accent', 'accent2', 'info', 'pos', 'warn', 'neg', 'crit']) {
      const slot = s.roles[k][0];
      assert.ok(contrast(hex(s.ansi[slot]), hex(s.background)) >= 4.5, `${id}.${k} → slot ${slot}`);
    }
  }
  // other themes and art colors keep the plain nearest-xterm mapping
  const cs = getTheme('cloudscape-dark');
  assert.equal(ansi16Fg(cs.accent), to16(cs.accent));
  assert.equal(ansi16Bg(0xffffff), 15, 'pure white is never pinned');
  assert.equal(fgParam(0xff0000, '16'), '91');
  assert.equal(bgParam(0x000000, '16'), '40');
});

test('16 colors: hue-preserving OKLCH classification (no pastel collapses to gray)', () => {
  for (let i = 0; i < 16; i++) assert.equal(to16(ANSI16[i]), i, `xterm slot ${i} maps to itself`);
  const family = (n) => (n < 0 ? n : n % 8);
  // every Refraction spectrum stop, in every tier, lands on a chromatic family —
  // the one tokens.json's hueToAnsi16 names (lime is read as yellow, like xterm's own yellow)
  for (const st of SPECTRUM) {
    const want = st.name === 'lime' ? 3 : family(st.ansi16);
    for (const k of ['night', 'nightVivid', 'day', 'dayVivid']) {
      const n = to16(hex(st[k]));
      assert.ok(n !== 0 && n !== 7 && n !== 8 && n !== 15, `${st.name}.${k} is not a gray (${n})`);
      assert.equal(family(n), want, `${st.name}.${k} → ${n}`);
    }
  }
  assert.equal(to16(hex('#b8a2f2')), 13, 'the Night accent, off-role, is still a magenta');
  assert.equal(to16(0x808080), 8);
  assert.equal(to16(0x0c2a4a), 0, 'deep navy reads as black, not as a loud blue');
});

test('mono and 7-bit stay readable: no color SGR, ASCII only', () => {
  for (const id of ['prism-dark', 'prism-light']) {
    const th = getTheme(id);
    assert.equal(fgParam(th.accent, 'mono'), '39');
    assert.equal(bgParam(th.panel, 'mono'), '49');
    const b = new CellBuffer(30, 5);
    b.clear(th.bg);
    box(b, 0, 0, 30, 5, { title: 'Prism', theme: th, fill: true, ascii: true });
    b.text(2, 2, 'status: ok', th.pos);
    const mono = b.toAnsi('mono');
    assert.doesNotMatch(mono, /\x1b\[[0-9;]*(38|48);/, 'no color in mono');
    assert.match(mono, /status: ok/);
  }
});

// ── terminal emulator schemes ───────────────────────────────────────────────
/** Minimal TOML (the subset the exports use): tables, strings, string arrays, numbers, booleans. */
function parseToml(src) {
  const root = {};
  let cur = root;
  for (const [n, raw] of src.split('\n').entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let m = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (m) { cur = root; for (const k of m[1].split('.')) cur = cur[k] ??= {}; continue; }
    m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!m) throw new Error(`TOML line ${n + 1}: ${raw}`);
    if (m[1] in cur) throw new Error(`TOML duplicate key ${m[1]}`);
    const v = m[2].trim();
    if (/^"/.test(v)) cur[m[1]] = JSON.parse(v);
    else if (/^\[.*\]$/.test(v)) cur[m[1]] = JSON.parse(v);
    else if (/^(true|false)$/.test(v)) cur[m[1]] = v === 'true';
    else if (/^-?\d+(\.\d+)?$/.test(v)) cur[m[1]] = Number(v);
    else throw new Error(`TOML value line ${n + 1}: ${v}`);
  }
  return root;
}

/** Minimal plist XML parser (dict / key / real / integer / string / true / false). */
function parsePlist(xml) {
  const body = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '');
  const tokens = body.match(/<[^>]+>|[^<]+/g).map((t) => t.trim()).filter(Boolean);
  let i = 0;
  const expect = (t) => { if (tokens[i] !== t) throw new Error(`plist: expected ${t}, got ${tokens[i]}`); i++; };
  const text = (tag) => { expect(`<${tag}>`); const v = tokens[i].startsWith('<') ? '' : tokens[i++]; expect(`</${tag}>`); return v; };
  const value = () => {
    const t = tokens[i];
    if (t === '<dict>') { i++; const o = {}; while (tokens[i] !== '</dict>') { const k = text('key'); if (k in o) throw new Error('dup key ' + k); o[k] = value(); } i++; return o; }
    if (t === '<real>' || t === '<integer>') { const v = Number(text(t.slice(1, -1))); if (!Number.isFinite(v)) throw new Error('bad number'); return v; }
    if (t === '<string>') return text('string');
    if (t === '<data>') return text('data').replace(/\s+/g, '');
    if (t === '<true/>' || t === '<false/>') { i++; return t === '<true/>'; }
    throw new Error('plist: unexpected ' + t);
  };
  expect('<plist version="1.0">');
  const v = value();
  expect('</plist>');
  if (i !== tokens.length) throw new Error('plist: trailing content');
  return v;
}

/** Minimal INI: sections and key=value (foot, Konsole). */
function parseIni(src, { comment = '#' } = {}) {
  const out = {};
  let sec = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(comment)) continue;
    const m = line.match(/^\[([^\]]+)\]$/);
    if (m) { if (out[m[1]]) throw new Error('dup section ' + m[1]); sec = out[m[1]] = {}; continue; }
    const kv = line.match(/^([A-Za-z0-9_-]+)=(.*)$/);
    if (!kv || !sec) throw new Error('INI: ' + raw);
    if (kv[1] in sec) throw new Error('dup key ' + kv[1]);
    sec[kv[1]] = kv[2];
  }
  return out;
}

const HEX = /^#[0-9a-f]{6}$/;
const toHexStr = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Pull the 16 ANSI colors (and the background) back out of each format. */
/** Minimal binary plist reader (bplist00): ints, ASCII strings, data, UIDs, arrays, dicts. */
function parseBplist(buf) {
  assert.equal(buf.subarray(0, 8).toString('latin1'), 'bplist00');
  const t = buf.subarray(buf.length - 32);
  const offSize = t[6], refSize = t[7], num = Number(t.readBigUInt64BE(8)), top = Number(t.readBigUInt64BE(16)), table = Number(t.readBigUInt64BE(24));
  const uint = (at, n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + buf[at + k]; return v; };
  const offs = Array.from({ length: num }, (_, k) => uint(table + k * offSize, offSize));
  const obj = (k) => {
    let at = offs[k];
    const m = buf[at], hi = m >> 4;
    let n = m & 15;
    if ((hi === 4 || hi === 5 || hi === 10 || hi === 13) && n === 15) { const w = 1 << (buf[at + 1] & 15); n = uint(at + 2, w); at += 1 + w; }
    at++;
    if (hi === 1) return uint(at, 1 << (m & 15));
    if (hi === 8) return { uid: uint(at, n + 1) };
    if (hi === 5) return buf.subarray(at, at + n).toString('latin1');
    if (hi === 4) return buf.subarray(at, at + n);
    if (hi === 10) return Array.from({ length: n }, (_, j) => obj(uint(at + j * refSize, refSize)));
    if (hi === 13) { const o = {}; for (let j = 0; j < n; j++) o[obj(uint(at + j * refSize, refSize))] = obj(uint(at + (n + j) * refSize, refSize)); return o; }
    throw new Error(`bplist: marker 0x${m.toString(16)}`);
  };
  return obj(top);
}

/** '#rrggbb' from a Terminal.app color: base64 → NSKeyedArchiver bplist → NSColor NSRGB. */
function terminalAppColor(b64) {
  const a = parseBplist(Buffer.from(b64, 'base64'));
  assert.equal(a.$archiver, 'NSKeyedArchiver');
  const o = a.$objects[a.$top.root.uid];
  assert.equal(a.$objects[o.$class.uid].$classname, 'NSColor');
  assert.equal(o.NSColorSpace, 1);
  const [r, g, b] = o.NSRGB.toString('latin1').replace(/\0$/, '').split(' ').map(Number);
  return toHexStr(r * 255, g * 255, b * 255);
}

const READERS = {
  'windows-terminal': (t) => { const o = JSON.parse(t); const n = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white']; return { bg: o.background, ansi: [...n, ...n.map((x) => 'bright' + x[0].toUpperCase() + x.slice(1))].map((k) => o[k]), name: o.name }; },
  vscode: (t) => { const o = JSON.parse(t)['workbench.colorCustomizations']; const n = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White']; return { bg: o['terminal.background'], ansi: [...n.map((x) => o['terminal.ansi' + x]), ...n.map((x) => o['terminal.ansiBright' + x])] }; },
  iterm2: (t) => {
    const o = parsePlist(t);
    const c = (k) => { const d = o[k]; for (const p of ['Red', 'Green', 'Blue', 'Alpha']) assert.ok(d[`${p} Component`] >= 0 && d[`${p} Component`] <= 1); assert.equal(d['Color Space'], 'sRGB'); return toHexStr(d['Red Component'] * 255, d['Green Component'] * 255, d['Blue Component'] * 255); };
    return { bg: c('Background Color'), ansi: Array.from({ length: 16 }, (_, i) => c(`Ansi ${i} Color`)) };
  },
  alacritty: (t) => { const o = parseToml(t).colors; const n = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']; assert.ok(o.cursor.cursor && o.selection.background); return { bg: o.primary.background, ansi: [...n.map((k) => o.normal[k]), ...n.map((k) => o.bright[k])] }; },
  wezterm: (t) => { const o = parseToml(t); assert.ok(o.metadata.name); return { bg: o.colors.background, ansi: [...o.colors.ansi, ...o.colors.brights], name: o.metadata.name }; },
  kitty: (t) => {
    const kv = {};
    for (const line of t.split('\n')) { if (!line.trim() || line.startsWith('#')) continue; const m = line.match(/^([a-z0-9_]+) (#[0-9a-f]{6})$/); assert.ok(m, `kitty line: ${line}`); kv[m[1]] = m[2]; }
    return { bg: kv.background, ansi: Array.from({ length: 16 }, (_, i) => kv[`color${i}`]) };
  },
  ghostty: (t) => {
    const pal = [], kv = {};
    for (const line of t.split('\n')) { if (!line.trim() || line.startsWith('#')) continue; const m = line.match(/^([a-z-]+) = (.+)$/); assert.ok(m, `ghostty line: ${line}`); if (m[1] === 'palette') { const p = m[2].match(/^(\d+)=(#[0-9a-f]{6})$/); pal[+p[1]] = p[2]; } else kv[m[1]] = m[2]; }
    return { bg: kv.background, ansi: pal };
  },
  foot: (t) => { const c = parseIni(t).colors; const h = (v) => (assert.match(v, /^[0-9a-f]{6}$/), '#' + v); return { bg: h(c.background), ansi: [...Array.from({ length: 8 }, (_, i) => h(c[`regular${i}`])), ...Array.from({ length: 8 }, (_, i) => h(c[`bright${i}`]))] }; },
  konsole: (t) => {
    const o = parseIni(t);
    const c = (sec) => { const m = o[sec].Color.match(/^(\d+),(\d+),(\d+)$/); assert.ok(m, sec); return toHexStr(+m[1], +m[2], +m[3]); };
    for (const s of ['General', 'Foreground', 'ForegroundIntense', 'ForegroundFaint', 'BackgroundIntense', 'BackgroundFaint']) assert.ok(o[s], s);
    return { bg: c('Background'), ansi: [...Array.from({ length: 8 }, (_, i) => c(`Color${i}`)), ...Array.from({ length: 8 }, (_, i) => c(`Color${i}Intense`))], name: o.General.Description };
  },
  xresources: (t) => {
    const kv = {};
    for (const line of t.split('\n')) { if (!line.trim() || line.startsWith('!')) continue; const m = line.match(/^\*\.([A-Za-z0-9]+):\s+(#[0-9a-f]{6})$/); assert.ok(m, `Xresources line: ${line}`); kv[m[1]] = m[2]; }
    return { bg: kv.background, ansi: Array.from({ length: 16 }, (_, i) => kv[`color${i}`]) };
  },
  'gnome-terminal': (t) => {
    assert.ok(t.startsWith('#!/bin/sh\n'));
    // every dconf command sits inside the printed heredoc: the script itself only reads (gsettings get)
    const [pre, rest] = t.split('cat <<EOF\n');
    const [heredoc, post] = rest.split('\nEOF\n');
    const code = (pre + post).split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
    assert.doesNotMatch(code, /dconf|gsettings set|gsettings reset/);
    for (const m of code.matchAll(/gsettings (\S+)/g)) assert.ok(m[1] === 'get' || m[1] === '>/dev/null', `gsettings ${m[1]} — the script may only read`);
    const pal = heredoc.match(/palette "\[(.+)\]"$/m)[1].split(', ').map((s) => s.replace(/'/g, ''));
    for (const line of heredoc.split('\n')) assert.match(line, /^dconf write \$P\/[a-z-]+ (true|false|"'#[0-9a-f]{6}'"|"\[.+\]")$/, line);
    return { bg: heredoc.match(/background-color "'(#[0-9a-f]{6})'"/)[1], ansi: pal };
  },
  ptyxis: (t) => {
    const o = parseIni(t);
    const g = (sec) => ({ bg: o[sec].Background, ansi: Array.from({ length: 16 }, (_, i) => o[sec][`Color${i}`]) });
    assert.deepEqual(g('Light'), g('Dark'), 'both style groups carry the theme');
    for (const k of ['Foreground', 'Cursor']) assert.match(o.Dark[k], HEX);
    return { ...g('Dark'), name: o.Palette.Name };
  },
  'xfce4-terminal': (t) => {
    const o = parseIni(t).Scheme;
    assert.equal(o.ColorCursorUseDefault, 'FALSE');
    return { bg: o.ColorBackground, ansi: o.ColorPalette.split(';'), name: o.Name };
  },
  'terminal-app': (t) => {
    const o = parsePlist(t);
    assert.equal(o.type, 'Window Settings');
    const n = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];
    for (const k of ['TextColor', 'CursorColor', 'SelectionColor']) assert.match(terminalAppColor(o[k]), HEX);
    return { bg: terminalAppColor(o.BackgroundColor), ansi: [...n.map((x) => terminalAppColor(o[`ANSI${x}Color`])), ...n.map((x) => terminalAppColor(o[`ANSIBright${x}Color`]))], name: o.name };
  },
  osc: (t) => {
    assert.ok(t.startsWith('#!/bin/sh\n'));
    const code = t.split('\n').filter((l) => l && !l.startsWith('#'));
    assert.equal(code.length, 1, 'one printf line');
    assert.match(code[0], /^printf '(\\033\][0-9;]+;#[0-9a-f]{6}\\007)+'$/);
    const pal = [];
    for (const m of code[0].matchAll(/\\033\]4;(\d+);(#[0-9a-f]{6})\\007/g)) pal[+m[1]] = m[2];
    return { bg: code[0].match(/\\033\]11;(#[0-9a-f]{6})/)[1], ansi: pal };
  },
};

test('FORMATS: fifteen terminal emulators (+ OSC codes), each with a reader-validated file per theme', () => {
  assert.deepEqual(Object.keys(FORMATS).sort(), Object.keys(READERS).sort());
  assert.equal(Object.keys(FORMATS).length, 15);
  for (const id of ['prism-dark', 'prism-light']) {
    const s = schemeFor(id);
    assert.equal(s.derived, false);
    assert.equal(s.ansi.length, 16);
    for (const c of [...s.ansi, s.background, s.foreground, s.cursor, s.selectionBackground]) assert.match(c, HEX);
    for (const [fmt, read] of Object.entries(READERS)) {
      const text = exportTheme(fmt, id);
      assert.ok(text.endsWith('\n') && !text.includes('\r'), `${fmt} ends in one LF, no CR`);
      const got = read(text);
      assert.deepEqual(got.ansi, s.ansi, `${fmt}/${id} ANSI 0–15 round-trip`);
      assert.equal(got.bg, s.background, `${fmt}/${id} background`);
      if (got.name) assert.equal(got.name, s.name);
    }
  }
});

test('the GNOME Terminal script runs, prints, and changes nothing', (t) => {
  let sh = null;
  for (const cand of ['sh', 'C:/Program Files/Git/usr/bin/sh.exe']) { try { execFileSync(cand, ['-c', 'exit 0']); sh = cand; break; } catch { /* next */ } }
  if (!sh) return t.skip('no POSIX sh on this machine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-gnome-'));
  try {
    const f = path.join(dir, 'prism-night.sh');
    fs.writeFileSync(f, exportTheme('gnome-terminal', 'prism-dark'));
    execFileSync(sh, ['-n', f]);
    // with a profile id the script reads nothing at all; it only prints
    const out = execFileSync(sh, [f, 'abc-123'], { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    assert.ok(lines.length >= 10);
    for (const line of lines) assert.match(line, /^dconf write \/org\/gnome\/terminal\/legacy\/profiles:\/:abc-123\/[a-z-]+ /);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('exportTheme: aliases, derived schemes for other themes, clear errors', () => {
  assert.equal(formatId('wt'), 'windows-terminal');
  assert.equal(formatId('iTerm'), 'iterm2');
  assert.equal(formatId('gnome'), 'gnome-terminal');
  assert.equal(formatId('nope'), null);
  assert.equal(exportTheme('wt', 'day'), exportTheme('windows-terminal', 'prism-light'));
  assert.equal(themeFileName('alacritty', 'prism-light'), 'prism-day.toml');
  assert.equal(themeFileName('ghostty', 'prism-dark'), 'prism-night');
  const derived = schemeFor('primer-dark');
  assert.equal(derived.derived, true);
  assert.equal(derived.ansi[1], '#f85149', 'red is the theme\'s neg');
  assert.equal(READERS.kitty(exportTheme('kitty', 'primer-dark')).ansi.length, 16);
  assert.throws(() => exportTheme('hyperterm', 'prism-dark'), /unknown terminal format/);
  assert.throws(() => exportTheme('kitty', 'chartreuse'), /unknown theme/);
  assert.equal(terminalScheme('primer-dark'), null);
  assert.equal(terminalScheme('prism-light').name, 'Prism Day');
});

test('themes/ holds the generated files, up to date (export-themes --check)', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'export-themes.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date \(30 files/);
  assert.equal(NONE, -1);
});

test('Day 16 colors: light 7 / 15 in the scheme; never white text on the default background; status bars ≥ 4.5:1', async () => {
  const { ansi16Text } = await import('../src/color.js');
  const { renderScene } = await import('../src/render.js');
  const day = TERMINAL_SCHEMES['prism-light'];
  assert.ok(contrast(hex(day.ansi[7]), hex(day.background)) < 1.5 && contrast(hex(day.ansi[15]), hex(day.background)) < 1.5, 'Day white / bright white are light (fills), as in Solarized / Tango light');
  const on = (t, f) => contrast(hex(day.ansi[t]), hex(day.ansi[f]));
  for (const f of [1, 2, 3, 4, 5, 6]) { assert.ok(on(15, f) >= 4.5, `bright white on ${f}`); assert.ok(on(7, f) >= 4.5, `white on ${f}`); }
  for (const f of [9, 10, 11, 12, 13, 14]) assert.ok(on(15, f) >= 4.5, `bright white on ${f}`);
  for (const f of [7, 15]) for (const t of [0, 8]) assert.ok(on(t, f) >= 4.5, `${t} on light fill ${f}`);
  const d = getTheme('prism-light'), n = getTheme('prism-dark');
  // the rule itself
  assert.equal(ansi16Text(0xffffff, NONE, true), 8, 'white text on the default bg → bright black');
  assert.equal(ansi16Text(0xffffff, d.accent, true), 15, 'white text on a colored fill stays white');
  assert.equal(ansi16Text(d.ink, d.pos, true), 15, 'default-fg text on a dark fill → bright white (status bars)');
  assert.equal(ansi16Text(d.ink, NONE, true), -1);
  assert.equal(ansi16Text(0xffffff, NONE, false), 15, 'dark terminals are unchanged');
  // through the serializer: a scene putting white-ish text on the default bg and ink on a green bar
  const scene = { id: 't', setup: (ctx) => () => { ctx.buffer.text(0, 0, 'faint', 0xdddddd); ctx.buffer.text(0, 1, 'BAR', ctx.theme.ink, ctx.theme.pos); ctx.buffer.text(6, 0, '▀▀', 0xffffff); } };
  const sgrState = (s) => { const out = []; let fg = 39, bg = 49; for (const m of s.matchAll(/\x1b\[([0-9;]*)m|([^\x1b\n]+)/g)) { if (m[1] !== undefined) { for (const p of (m[1] || '0').split(';').map(Number)) { if (p === 0) { fg = 39; bg = 49; } else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97) || p === 39) fg = p; else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107) || p === 49) bg = p; } } else out.push([m[2], fg, bg]); } return out; };
  const dayOut = sgrState(renderScene(scene, { width: 10, height: 2, t: 0, theme: 'prism-light', transparent: true, caps: { depth: '16' } }).toAnsi('16'));
  assert.ok(!dayOut.some(([t, fg, bg]) => /[a-z]/i.test(t) && (fg === 37 || fg === 97) && bg === 49), JSON.stringify(dayOut));
  assert.ok(dayOut.some(([t, fg, bg]) => t.includes('BAR') && fg === 97 && bg === 42), 'status bar text is bright white on green');
  assert.ok(dayOut.some(([t, fg]) => t.includes('▀▀') && fg === 97), 'pixel glyphs keep their (fill) color');
  const nightOut = sgrState(renderScene(scene, { width: 10, height: 2, t: 0, theme: 'prism-dark', transparent: true, caps: { depth: '16' } }).toAnsi('16'));
  assert.ok(nightOut.some(([t, fg]) => t.includes('faint') && (fg === 37 || fg === 97)), 'Night keeps light text');
  void n;
});
