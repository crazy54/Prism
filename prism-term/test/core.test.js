// Core engine tests: color math, buffers, canvas encodings, the diff renderer
// (verified through a VT emulator), capability detection and CLI parsing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  NONE, rgb, hex, toHex, hsl, parse, mix, mixOklab, gradient, to256, to16, fgParam, bgParam, luminance,
} from '../src/color.js';
import { CellBuffer, ATTR, parseAttr } from '../src/buffer.js';
import { Canvas, MODE_NAMES, pickMode } from '../src/canvas.js';
import { Screen } from '../src/screen.js';
import { detect, withOverrides } from '../src/caps.js';
import { charWidth, stringWidth, truncate, wrap } from '../src/width.js';
import { stripAnsi } from '../src/ansi.js';
import { getTheme, palette, THEME_IDS, PALETTE_NAMES } from '../src/palettes.js';
import { renderScene } from '../src/render.js';
import { toHtml, toAnimatedHtml } from '../src/export.js';
import { rng, easing } from '../src/easing.js';
import { createNoise } from '../src/noise.js';
import { meshes, projector, rotate } from '../src/math3d.js';
import { parseArgs } from '../cli.js';
import { VT, fakeTTY } from './vt.js';

const TC = { isTTY: true, depth: 'truecolor', unicode: true, braille: true, sextant: true, width: 40, height: 12 };

// ── color ────────────────────────────────────────────────────────────────
test('color: pack/parse round-trips', () => {
  assert.equal(rgb(255, 128, 0), 0xff8000);
  assert.equal(hex('#f80'), 0xff8800);
  assert.equal(toHex(0x0a0b0c), '#0a0b0c');
  assert.equal(parse('rgb(1, 2, 3)'), 0x010203);
  assert.equal(parse('none'), NONE);
  assert.equal(parse(null), NONE);
  assert.equal(hsl(0, 1, 0.5), 0xff0000);
  assert.throws(() => hex('nope'));
});

test('color: mixing and gradients', () => {
  assert.equal(mix(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(mix(NONE, 0x123456, 0.3), 0x123456);
  assert.equal(mixOklab(0xff0000, 0x0000ff, 0), 0xff0000);
  const g = gradient(['#000000', '#ffffff']);
  assert.equal(g(0), 0x000000);
  assert.equal(g(1), 0xffffff);
  assert.ok(luminance(g(0.5)) > 0.3 && luminance(g(0.5)) < 0.7);
  const cyc = gradient(['#ff0000', '#00ff00', '#0000ff'], { cyclic: true });
  assert.equal(cyc(0), cyc(1));
  assert.equal(cyc(-0.25), cyc(0.75));
});

test('color: terminal quantization', () => {
  assert.equal(to256(0x000000), 16);
  assert.equal(to256(0xffffff), 231);
  assert.equal(to256(0x808080), 244);
  assert.equal(to16(0xff0000), 9);
  assert.equal(fgParam(0x010203, 'truecolor'), '38;2;1;2;3');
  assert.equal(fgParam(NONE, 'truecolor'), '39');
  assert.equal(bgParam(0xffffff, '256'), '48;5;231');
  assert.equal(fgParam(0xff0000, '16'), '91');
  assert.equal(bgParam(0x000000, '16'), '40');
  assert.equal(fgParam(0xff0000, 'mono'), '39');
});

// ── width / ansi ─────────────────────────────────────────────────────────
test('width: wide, zero-width and helpers', () => {
  assert.equal(charWidth('a'), 1);
  assert.equal(charWidth('漢'), 2);
  assert.equal(charWidth('🚀'), 2);
  assert.equal(charWidth('́'), 0);
  assert.equal(charWidth('⣿'), 1);
  assert.equal(charWidth('🬗'), 1);
  assert.equal(charWidth('ｱ'), 1);
  assert.equal(stringWidth('\x1b[31mhi\x1b[0m漢'), 4);
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.deepEqual(wrap('the quick brown fox', 9), ['the quick', 'brown fox']);
  assert.equal(stripAnsi('\x1b[38;2;1;2;3mx\x1b]0;t\x07y'), 'xy');
});

// ── buffer ───────────────────────────────────────────────────────────────
test('buffer: text, undefined keeps, wide chars, views clip', () => {
  const b = new CellBuffer(6, 2);
  b.fill(0, 0, 6, 2, ' ', undefined, 0x111111);
  b.text(0, 0, 'a漢b', 0xff0000);
  assert.equal(b.get(0, 0).ch, 'a');
  assert.equal(b.get(1, 0).ch, '漢');
  assert.equal(b.get(2, 0).ch, '');
  assert.equal(b.get(3, 0).ch, 'b');
  assert.equal(b.get(3, 0).bg, 0x111111, 'undefined bg keeps background');
  const v = b.view(4, 1, 5, 5);
  assert.equal(v.width, 5);
  v.text(0, 0, 'xyz');
  assert.equal(b.get(4, 1).ch, 'x');
  assert.equal(b.get(5, 1).ch, 'y');
  v.set(-1, 0, 'Q');
  assert.ok(!b.toString().includes('Q'));
  assert.equal(b.get(99, 99), null);
  assert.equal(parseAttr('bold,underline'), ATTR.BOLD | ATTR.UNDERLINE);
});

test('buffer: toAnsi round-trips through a VT', () => {
  const b = new CellBuffer(10, 2);
  b.text(0, 0, 'hello', 0x00ff00, 0x000080);
  b.text(2, 1, 'world', 0xff00ff);
  const vt = new VT(10, 2);
  vt.feed(b.toAnsi('truecolor').replace('\n', '\r\n'));
  assert.equal(vt.text(), b.toString());
  assert.equal(vt.cells[0][0].fg, 0x00ff00);
  assert.equal(vt.cells[0][0].bg, 0x000080);
  assert.ok(!b.toAnsi('mono').includes('\x1b'));
});

// ── canvas ───────────────────────────────────────────────────────────────
test('canvas: mode geometry and aspect', () => {
  const expect = { braille: [2, 4, 1], sextant: [2, 3, 4 / 3], quad: [2, 2, 2], half: [1, 2, 1], ascii: [1, 1, 2] };
  for (const m of MODE_NAMES) {
    const cv = new Canvas(10, 5, { mode: m });
    assert.equal(cv.width, 10 * expect[m][0], m);
    assert.equal(cv.height, 5 * expect[m][1], m);
    assert.ok(Math.abs(cv.aspect - expect[m][2]) < 1e-9, m);
  }
  assert.equal(pickMode('line', { unicode: true }), 'braille');
  assert.equal(pickMode('hires', { unicode: true, sextant: false }), 'quad');
  assert.equal(pickMode('hires', { unicode: true, sextant: true }), 'sextant');
  assert.equal(pickMode('field', { unicode: false }), 'ascii');
  assert.throws(() => new Canvas(1, 1, { mode: 'bogus' }));
});

test('canvas: braille dot encoding', () => {
  const cv = new Canvas(1, 1, { mode: 'braille' });
  const b = new CellBuffer(1, 1);
  cv.set(0, 0, 0xffffff); cv.paint(b);
  assert.equal(b.get(0, 0).ch, '⠁');
  cv.clear(); cv.set(1, 3, 0xffffff); b.clear(); cv.paint(b);
  assert.equal(b.get(0, 0).ch, '⢀');
  cv.clear(0xffffff); cv.paint(b);
  assert.equal(b.get(0, 0).ch, '⣿');
});

test('canvas: half-block and quadrant two-color encoding', () => {
  const b = new CellBuffer(1, 1);
  const half = new Canvas(1, 1, { mode: 'half' });
  half.set(0, 0, 0xff0000); half.set(0, 1, 0x0000ff); half.paint(b);
  assert.deepEqual([b.get(0, 0).ch, b.get(0, 0).fg, b.get(0, 0).bg], ['▀', 0xff0000, 0x0000ff]);
  const quad = new Canvas(1, 1, { mode: 'quad' });
  quad.clear(0x000000); quad.set(0, 0, 0xffffff); quad.set(1, 1, 0xffffff);
  b.clear(); quad.paint(b);
  const c = b.get(0, 0);
  assert.ok((c.ch === '▚' && c.fg === 0xffffff && c.bg === 0) || (c.ch === '▞' && c.fg === 0 && c.bg === 0xffffff));
  const sx = new Canvas(1, 1, { mode: 'sextant' });
  sx.set(0, 0, 0xffffff); sx.set(0, 1, 0xffffff); sx.set(0, 2, 0xffffff);
  b.clear(); sx.paint(b);
  assert.equal(b.get(0, 0).ch, '▌');
});

test('canvas: transparency leaves target untouched', () => {
  const b = new CellBuffer(4, 2);
  b.text(0, 0, 'keep');
  for (const m of MODE_NAMES) {
    const cv = new Canvas(4, 2, { mode: m });
    cv.paint(b);
    assert.equal(b.toString().split('\n')[0], 'keep', m);
  }
});

test('canvas: primitives stay in bounds and fill', () => {
  const cv = new Canvas(10, 5, { mode: 'braille' });
  cv.line(-50, -50, 500, 500, 0xffffff);
  cv.circle(10, 10, 6, 0xff0000, true);
  cv.polygon([[0, 0], [19, 0], [10, 19]], 0x00ff00);
  cv.bezier([[0, 19], [10, -10], [19, 19]], 0x0000ff);
  cv.rect(2, 2, 5, 5, 0xffff00);
  assert.equal(cv.px.length, 20 * 20);
  assert.ok(cv.px.some((c) => c === 0x00ff00));
  cv.fade(0.01);
  assert.ok(cv.px.every((c) => c === NONE));
});

// ── renderer ─────────────────────────────────────────────────────────────
function screenOn(out, opts = {}) {
  return new Screen({ output: out, input: { isTTY: false }, caps: TC, keys: false, ...opts });
}

test('screen: diff renderer output reproduces the back buffer', async () => {
  const out = fakeTTY({ columns: 30, rows: 8 });
  const s = screenOn(out).start();
  const vt = new VT(30, 8);
  const r = rng(3);
  for (let f = 0; f < 12; f++) {
    for (let k = 0; k < 40; k++) {
      s.buffer.set(r.int(0, 29), r.int(0, 7), r.pick(['a', '▀', '⣿', ' ', '🬗', '█']), r.int(0, 0xffffff), r.pick([NONE, r.int(0, 0xffffff)]));
    }
    const before = out.chunks.length;
    s.render({ force: true });
    vt.feed(out.chunks.slice(before).join(''));
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 30; x++) {
        const c = s.buffer.get(x, y);
        // a wide glyph overwritten on its left half leaves an orphan '' — terminals show it blank
        if (c.ch === '') continue;
        assert.equal(vt.cells[y][x].ch, c.ch, `frame ${f} char at ${x},${y}`);
        // a space's fg and a full block's bg are invisible, so the renderer may skip them
        if (c.ch !== ' ') assert.equal(vt.cells[y][x].fg, c.fg, `frame ${f} fg at ${x},${y}`);
        if (c.ch !== '█') assert.equal(vt.cells[y][x].bg, c.bg, `frame ${f} bg at ${x},${y}`);
      }
  }
  s.stop();
});

test('screen: unchanged frames emit nothing; changes are minimal and synchronized', () => {
  const out = fakeTTY({ columns: 20, rows: 4 });
  const s = screenOn(out).start();
  s.buffer.text(0, 0, 'static', 0xffffff);
  s.render({ force: true });
  const n = out.chunks.length;
  s.render({ force: true });
  assert.equal(out.chunks.length, n, 'identical frame writes nothing');
  s.buffer.set(5, 2, 'X', 0xff0000);
  s.render({ force: true });
  const last = out.chunks.at(-1);
  assert.ok(last.startsWith('\x1b[?2026h') && last.endsWith('\x1b[?2026l'));
  assert.ok(last.includes('\x1b[3;6H'), 'cursor moved straight to the changed cell');
  assert.ok(stripAnsi(last) === 'X');
  s.stop();
});

test('screen: fullscreen start/stop restores the terminal', () => {
  const out = fakeTTY();
  const s = screenOn(out).start();
  s.stop();
  const all = out.output;
  assert.ok(all.includes('\x1b[?1049h') && all.includes('\x1b[?1049l'));
  assert.ok(all.indexOf('\x1b[?25l') < all.lastIndexOf('\x1b[?25h'));
  assert.ok(all.endsWith('\x1b[?25h'));
});

test('screen: inline mode reserves rows, uses relative moves, leaves output', () => {
  const out = fakeTTY({ columns: 20, rows: 10 });
  const s = screenOn(out, { mode: 'inline', height: 3 }).start();
  assert.equal(s.height, 3);
  s.buffer.text(0, 2, 'bottom');
  s.render({ force: true });
  s.buffer.text(0, 0, 'top');
  s.render({ force: true });
  s.stop();
  const all = out.output;
  assert.ok(!all.includes('\x1b[?1049h'), 'no alt screen');
  assert.ok(!/\x1b\[\d+;\d+H/.test(all), 'no absolute cursor moves inline');
  const vt = new VT(20, 10);
  vt.feed(all);
  assert.equal(vt.text().split('\n').slice(0, 3).join('|'), 'top||bottom');
  assert.equal(vt.y, 3, 'cursor parked below the region');
});

test('screen: resize repaints at the new size', () => {
  const out = fakeTTY({ columns: 20, rows: 5 });
  const s = new Screen({ output: out, input: { isTTY: false }, caps: TC, keys: false }).start();
  let resized = null;
  s.on('resize', (r) => { resized = r; });
  out.columns = 30; out.rows = 7;
  out.emit('resize');
  assert.deepEqual(resized, { width: 30, height: 7 });
  assert.equal(s.buffer.width, 30);
  s.stop();
});

test('screen: run() stops after duration and restores', async () => {
  const out = fakeTTY({ columns: 10, rows: 3 });
  const s = screenOn(out);
  let frames = 0;
  await s.run((t) => { frames++; s.buffer.text(0, 0, String(Math.floor(t * 10))); }, { fps: 60, duration: 0.15 });
  assert.ok(frames >= 3, `ran ${frames} frames`);
  assert.ok(out.output.endsWith('\x1b[?25h'));
});

// ── caps ─────────────────────────────────────────────────────────────────
test('caps: env-driven detection and overrides', () => {
  const tty = { isTTY: true, columns: 100, rows: 30 };
  assert.equal(detect({ stream: tty, env: { COLORTERM: 'truecolor', LANG: 'en_US.UTF-8' }, platform: 'linux' }).depth, 'truecolor');
  assert.equal(detect({ stream: tty, env: { TERM: 'xterm-256color', LANG: 'C.UTF-8' }, platform: 'linux' }).depth, '256');
  assert.equal(detect({ stream: tty, env: { NO_COLOR: '1' }, platform: 'linux' }).depth, 'mono');
  assert.equal(detect({ stream: tty, env: { FORCE_COLOR: '2' }, platform: 'linux' }).depth, '256');
  assert.equal(detect({ stream: { isTTY: false }, env: {}, platform: 'linux' }).depth, 'mono');
  assert.equal(detect({ stream: tty, env: { TERM: 'linux' }, platform: 'linux' }).unicode, false);
  assert.equal(detect({ stream: tty, env: { TERM: 'xterm-kitty', LANG: 'en_US.UTF-8' }, platform: 'linux' }).sextant, true);
  const c = detect({ stream: tty, env: { WT_SESSION: 'x' }, platform: 'win32' });
  assert.equal(c.depth, 'truecolor');
  assert.equal(c.unicode, true);
  assert.equal(c.width, 100);
  const o = withOverrides(c, { ascii: true });
  assert.equal(o.unicode, false);
  assert.equal(o.sextant, false);
  assert.equal(withOverrides(c, { depth: '16' }).depth, '16');
});

// ── themes / palettes / misc ────────────────────────────────────────────
test('themes and palettes resolve', () => {
  assert.ok(THEME_IDS.includes('prism-dark') && THEME_IDS.includes('prism-light') && THEME_IDS.includes('cloudscape-dark'));
  const t = getTheme('primer');
  assert.equal(t.id, 'primer-dark');
  assert.equal(getTheme('nope').id, 'prism-dark', 'unknown ids fall back to the default, Prism Night');
  assert.equal(getTheme().id, 'prism-dark');
  for (const k of ['bg', 'ink', 'accent', 'pos', 'warn', 'neg']) assert.equal(typeof t[k], 'number');
  for (const n of PALETTE_NAMES) assert.equal(typeof palette(n, t)(0.5), 'number');
});

test('rng, easing, noise, math3d are sane', () => {
  const a = rng(1), b = rng(1);
  assert.equal(a(), b());
  for (const [name, fn] of Object.entries(easing)) {
    assert.ok(Math.abs(fn(0)) < 1e-9, `${name}(0)`);
    assert.ok(Math.abs(fn(1) - 1) < 1e-9, `${name}(1)`);
  }
  const n = createNoise(5);
  const v = n.fbm(0.3, 0.7, 0.1);
  assert.ok(v > -1 && v < 1);
  assert.equal(n.noise3(1, 2, 3), createNoise(5).noise3(1, 2, 3));
  for (const m of Object.values(meshes)) {
    const mesh = m();
    assert.ok(mesh.vertices.length && mesh.edges.length);
    for (const [i, j] of mesh.edges) assert.ok(mesh.vertices[i] && mesh.vertices[j]);
  }
  const p = projector(new Canvas(40, 20, { mode: 'braille' }))(rotate([0, 0, 0], 1, 1, 1));
  assert.deepEqual(p.slice(0, 2), [40, 40]);
});

// ── render + export ──────────────────────────────────────────────────────
test('offscreen render + html export', async () => {
  const { findScene } = await import('../src/scenes/index.js');
  const plasma = await findScene('plasma');
  const buf = renderScene(plasma, { width: 30, height: 8, t: 1 });
  assert.equal(buf.width, 30);
  assert.ok(buf.toString().trim().length > 0);
  const html = toHtml(buf, { title: 'x' });
  assert.ok(html.startsWith('<!doctype html>') && html.includes('<pre class="pt">'));
  assert.ok(!/https?:\/\//.test(html), 'export is offline');
  const anim = toAnimatedHtml([buf, buf], { fps: 10 });
  assert.ok(anim.includes('setInterval') && anim.includes('prefers-reduced-motion'));
  // Blinking cells blink in HTML too (and stop under reduced motion).
  const b = new CellBuffer(4, 1);
  b.text(0, 0, 'WAIT', 0xffffff, NONE, ATTR.BLINK);
  const blink = toHtml(b);
  assert.ok(blink.includes('animation:pt-blink') && blink.includes('@keyframes pt-blink'));
});

// ── cli ──────────────────────────────────────────────────────────────────
test('cli: argument parsing', () => {
  const a = parseArgs(['play', 'plasma', '--theme', 'primer-dark', '--set', 'speed=2', '--set', 'text=a=b', '--no-hud', '--size', '80x24', '--transparent']);
  assert.deepEqual(a._, ['play', 'plasma']);
  assert.equal(a.theme, 'primer-dark');
  assert.deepEqual(a.set, { speed: '2', text: 'a=b' });
  assert.equal(a.hud, false);
  assert.equal(a.size, '80x24');
  assert.equal(a.transparent, true);
  const b = parseArgs(['spin', '--text', 'Build', '--', 'npm', 'test', '--watch']);
  assert.deepEqual(b.rest, ['npm', 'test', '--watch']);
  assert.equal(b.text, 'Build');
  assert.equal(parseArgs(['--palette=fire']).set.palette, 'fire');
});

test('ticker: hits a 60 fps target despite coarse OS timers', async () => {
  const { ticker } = await import('../src/loop.js');
  const n = await new Promise((resolve) => {
    let frames = 0;
    const h = ticker(() => { frames++; }, { fps: 60 });
    setTimeout(() => { h.stop(); resolve(frames); }, 1000);
  });
  // Loose bound for busy CI machines; a naive setTimeout(16) loop on Windows manages ~32.
  assert.ok(n >= 45, `only ${n} frames in 1s`);
});

test('ascii folding: one column per glyph, every category covered', async () => {
  const { foldChar, foldText, asciiSurface } = await import('../src/ascii.js');
  for (const [u, a] of [['─', '-'], ['│', '|'], ['╭', '+'], ['█', '#'], ['░', '.'], ['⣿', '#'], ['⠁', '.'], ['🬗', ':'], ['→', '>'], ['✔', '+'], ['é', 'e'], ['…', '.'], ['≥', '>']]) {
    assert.equal(foldChar(u), a, `${u} → ${a}`);
  }
  assert.equal(foldText('╭─ CPU 52% ─╮'), '+- CPU 52% -+');
  assert.equal(foldText('漢x'), '??x', 'wide glyphs keep their two columns');
  const b = new CellBuffer(6, 1);
  const s = asciiSurface(b);
  s.text(0, 0, '▕█▏ ok');
  s.set(5, 0, '●');
  assert.equal(b.toString(), '|#| oo');
  assert.equal(asciiSurface(s), s, 'idempotent');
});

// ── mono depth: luminance ramp instead of color ─────────────────────────
test('canvas mono: a color field becomes a normalized luminance ramp (Unicode 5 levels, 7-bit ≥ 8)', async () => {
  const { MONO_RAMP, ASCII_RAMP, monoHint } = await import('../src/canvas.js');
  const field = (mode, ramp) => {
    const cv = new Canvas(40, 2, { mode, mono: { ramp, ref: 0x0a0c12 } });
    // mid-luminance only (0.3 … 0.7): the stretch must still use the whole ramp
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) { const v = Math.round(77 + (x / (cv.width - 1)) * 102); cv.set(x, y, rgb(v, v, v)); }
    const b = new CellBuffer(40, 2); cv.paint(b);
    return b;
  };
  for (const mode of ['half', 'quad', 'sextant']) {
    const b = field(mode, MONO_RAMP);
    assert.deepEqual([...new Set(b.ch)].sort(), [...MONO_RAMP].sort(), `${mode}: every level of ${MONO_RAMP}`);
    assert.ok(b.ch.indexOf('█') > b.ch.indexOf('░'), 'brighter → denser');
    assert.ok(Array.from(b.fg).every((c) => c === NONE), 'mono cells use the default fg');
  }
  const a = field('ascii', ASCII_RAMP);
  assert.ok(new Set(a.ch).size >= 8, `7-bit ramp uses ≥ 8 levels (got ${[...new Set(a.ch)].join('')})`);
  assert.ok([...a.ch].every((c) => c.charCodeAt(0) < 0x7f));
  // Day (light) background: ink is contrast against the background, so dark pixels are dense
  const day = new Canvas(2, 1, { mode: 'half', mono: { ref: 0xf6f5f9 } });
  day.set(0, 0, 0x111111); day.set(0, 1, 0x111111); day.set(1, 0, 0xeeeeee); day.set(1, 1, 0xeeeeee);
  const db = new CellBuffer(2, 1); day.paint(db);
  assert.equal(db.ch[0], '█'); assert.equal(db.ch[1], ' ');
  // the hint: views and wrappers inherit the scene buffer's monoPaint
  const root = new CellBuffer(4, 4); root.monoPaint = { ramp: MONO_RAMP, ref: NONE };
  assert.equal(monoHint(root.view(1, 1, 2, 2).view(0, 0, 1, 1)), root.monoPaint);
  assert.equal(monoHint(new CellBuffer(1, 1)), null);
});

test('canvas mono: shapes stay crisp (banners, bars), braille keeps its dots, transparent cells untouched', () => {
  const cv = new Canvas(4, 1, { mode: 'half', mono: { ref: 0 } });
  cv.set(0, 0, 0xffffff);                          // top only  → ▀
  cv.set(1, 1, 0xffffff);                          // bottom    → ▄
  cv.set(2, 0, 0xffffff); cv.set(2, 1, 0xffffff);  // both      → █
  const b = new CellBuffer(4, 1); b.set(3, 0, 'x');
  cv.paint(b);
  assert.deepEqual(b.ch, ['▀', '▄', '█', 'x']);
  const br = new Canvas(1, 1, { mode: 'braille', mono: { ref: 0 } });
  assert.equal(br.mono, null, 'braille dots already carry the picture');
  const plain = new Canvas(1, 1, { mode: 'half' });
  plain.set(0, 0, 0xff0000); plain.set(0, 1, 0x0000ff);
  const pb = new CellBuffer(1, 1); plain.paint(pb);
  assert.equal(pb.ch[0], '▀', 'color depths are unchanged');
});

test('renderScene at mono: color fields shade with ░▒▓█ and snapshots carry no color', () => {
  const caps = { depth: 'mono', unicode: true, braille: true, sextant: false };
  const plasmaLike = { id: 't', setup: (ctx) => { const cv = ctx.canvas('field'); return (t) => { for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) { const v = 128 + 127 * Math.sin(x / 3 + y / 5 + t); cv.set(x, y, rgb(v, v * 0.4, 255 - v)); } cv.paint(ctx.buffer); }; } };
  const b = renderScene(plasmaLike, { width: 40, height: 10, t: 0.5, fps: 10, caps });
  const half = b.ch.filter((c) => c === '▀' || c === '▄').length;
  assert.ok(half / b.ch.length < 0.1, `not a wall of half blocks (${half})`);
  assert.ok(new Set(b.ch.filter((c) => '░▒▓█'.includes(c))).size >= 3);
  assert.ok(!b.toAnsi('mono').includes('\x1b'));
  const seven = renderScene(plasmaLike, { width: 40, height: 10, t: 0.5, fps: 10, caps: { ...caps, unicode: false } });
  assert.ok(new Set(seven.ch).size >= 8, '7-bit: a ≥ 8-level ASCII ramp');
});

// ── TUI hygiene: signals, suspend / resume, window title ────────────────
test('screen: SIGHUP / SIGTERM / SIGINT exit 128 + signo and restore the terminal', () => {
  const real = process.exit;
  const codes = [];
  try {
    process.exit = (c) => { codes.push(c); };
    for (const [sig, code] of [['SIGHUP', 129], ['SIGTERM', 143], ['SIGINT', 130]]) {
      const out = fakeTTY({ columns: 20, rows: 4 });
      const s = new Screen({ output: out, input: { isTTY: false }, caps: { ...TC, width: 20, height: 4 }, title: 'prism' });
      s.start();
      assert.match(out.output, /\x1b\]0;prism\x07/, 'title set');
      process.emit(sig, sig);
      assert.equal(codes.at(-1), code, sig);
      assert.match(out.output, /\x1b\[\?1049l/, 'alt screen left');
      assert.match(out.output, /\x1b\[\?25h$/, 'cursor shown last');
    }
  } finally { process.exit = real; }
});

test('screen: Ctrl-Z suspends (terminal handed back) and SIGCONT resumes with a full repaint', () => {
  const out = fakeTTY({ columns: 10, rows: 3 });
  const input = Object.assign(new (class extends EventEmitter {})(), { isTTY: true, raw: false, setRawMode(v) { this.raw = v; }, resume() {}, pause() {} });
  const s = new Screen({ output: out, input, caps: { ...TC, width: 10, height: 3 } });
  s.start();
  s.buffer.text(0, 0, 'hello', 0xffffff);
  s.render({ force: true });
  assert.equal(input.raw, true);
  s.title = 'prism';
  s._pause();
  assert.equal(input.raw, false, 'cooked mode for the shell');
  assert.ok(out.output.endsWith('\x1b[23;0t'), "the user's title is back while suspended");
  assert.match(out.output.slice(-60), /\x1b\[\?1049l.*\x1b\[\?25h/s, 'alt screen off, cursor shown');
  assert.equal(s.render({ force: true }), false, 'no frames while suspended');
  const before = out.output.length;
  s._resume();
  assert.equal(input.raw, true);
  assert.match(out.output.slice(before), /\x1b\[\?1049h/);
  assert.match(out.output.slice(before), /\x1b\[22;0t\x1b\]0;prism\x07/, 'pushed and set again: the stack stays balanced');
  s.render({ force: true });
  assert.match(out.output.slice(before), /hello/, 'everything repainted');
  s.stop();
});

test('caps: the locale is the first non-empty of LC_ALL, LC_CTYPE, LANG (LC_ALL=C beats a UTF-8 LANG)', () => {
  const tty = { isTTY: true, columns: 80, rows: 24 };
  const u = (env) => detect({ stream: tty, env: { TERM: 'xterm-256color', ...env }, platform: 'linux' }).unicode;
  assert.equal(u({ LC_ALL: 'C', LANG: 'en_US.UTF-8' }), false);
  assert.equal(u({ LC_CTYPE: 'POSIX', LANG: 'en_US.UTF-8' }), false);
  assert.equal(u({ LC_ALL: '', LC_CTYPE: 'en_US.UTF-8', LANG: 'C' }), true);
  assert.equal(u({ LANG: 'C.UTF-8' }), true);
  assert.equal(u({}), true, 'no locale at all: assume UTF-8');
});
