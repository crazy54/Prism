// Fonts, banners, gradient text, text effects and the Text scenes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FONTS, glyph, hasGlyph, defineFont } from '../src/text/fonts.js';
import { banner, bannerCanvas, drawBanner, measureBanner, gradientText, BANNER_MODES } from '../src/text/banner.js';
import { EFFECTS, EFFECT_NAMES, animateText, effectDuration } from '../src/text/effects.js';
import { CellBuffer } from '../src/buffer.js';
import { stripAnsi } from '../src/ansi.js';
import { NONE } from '../src/color.js';
import { renderScene } from '../src/render.js';
import bannerScene from '../src/facets/text/banner.js';
import textfxScene from '../src/facets/text/textfx.js';

test('every glyph has rectangular rows and the font height (+descent)', () => {
  for (const f of Object.values(FONTS)) {
    for (const [ch, g] of Object.entries(f.glyphs)) {
      assert.ok(g.rows.every((r) => r.length === g.w), `${f.name} ${JSON.stringify(ch)} ragged`);
      assert.ok(g.h === f.height || (f.descent && g.h === f.height + f.descent), `${f.name} ${JSON.stringify(ch)} height ${g.h}`);
      assert.ok(g.w >= 1 && g.w <= f.width + 2, `${f.name} ${JSON.stringify(ch)} width ${g.w}`);
      assert.equal(g.bits.length, g.w * g.h);
    }
  }
});

test('fonts cover A–Z, 0–9 and the required punctuation', () => {
  const required = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;!?-_+=/\\()[]<>#%&*\'"@$^~|';
  for (const f of Object.values(FONTS)) for (const ch of required) assert.ok(hasGlyph(f, ch), `${f.name} missing ${JSON.stringify(ch)}`);
  assert.ok(hasGlyph('standard', 'g') && FONTS.standard.glyphs.g.h === 8, 'standard has descending lowercase');
});

test('glyph falls back to uppercase, then tofu', () => {
  assert.equal(glyph('bold', 'a'), FONTS.bold.glyphs.A);
  assert.equal(glyph('tiny', '€'), FONTS.tiny.tofu);
  assert.equal(glyph('nope', 'A'), FONTS.standard.glyphs.A);
});

function inkExtent(buf) {
  let maxX = -1, maxY = -1;
  for (let y = 0; y < buf.height; y++)
    for (let x = 0; x < buf.width; x++) {
      const c = buf.get(x, y);
      if (c.ch !== ' ' || c.bg !== NONE) { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    }
  return { width: maxX + 1, height: maxY + 1 };
}

test('measureBanner matches the drawn extent in every mode', () => {
  for (const mode of BANNER_MODES)
    for (const font of Object.keys(FONTS))
      for (const opts of [{}, { shadow: true }, { outline: true }, { scale: 2 }]) {
        const o = { font, mode, fill: '#ffffff', ...opts };
        const m = measureBanner('Hi 42!', o);
        const buf = new CellBuffer(m.width + 6, m.height + 6);
        const r = drawBanner(buf, 0, 0, 'Hi 42!', o);
        assert.deepEqual({ width: r.width, height: r.height }, m, `${font}/${mode} ${JSON.stringify(opts)}`);
        const ext = inkExtent(buf);
        assert.ok(ext.width <= m.width && ext.height <= m.height, `${font}/${mode} ink overflows measure`);
        assert.ok(ext.width >= m.width - 1 && ext.height >= m.height - 1, `${font}/${mode} measure too loose: ${JSON.stringify(ext)} vs ${JSON.stringify(m)}`);
      }
});

test('banners handle empty text, unknown characters and multiple lines', () => {
  assert.deepEqual(measureBanner(''), { width: 0, height: 0 });
  assert.equal(banner('', { depth: 'truecolor' }), '');
  const buf = new CellBuffer(4, 2);
  assert.doesNotThrow(() => drawBanner(buf, 0, 0, 'WAY TOO WIDE ☃', { font: 'bold' }));
  const two = measureBanner('AB\nC', { font: 'standard', mode: 'block' });
  assert.equal(two.height, 7 * 2 + 1);
  assert.equal(bannerCanvas('x', { mode: 'braille' }).mode, 'braille');
});

test('stretch multiplies the mode scale; defineFont fonts work wherever a name does', () => {
  // ascii's base scale is [2, 1]: stretch [1, 2] gives [2, 2], unlike scale [1, 2] which replaces it.
  assert.deepEqual(measureBanner('HI', { mode: 'ascii', stretch: [1, 2] }), measureBanner('HI', { mode: 'ascii', scale: [2, 2] }));
  assert.notDeepEqual(measureBanner('HI', { mode: 'ascii', stretch: [1, 2] }), measureBanner('HI', { mode: 'ascii', scale: [1, 2] }));
  const f = defineFont('dot', 1, 1, 0, { '.': ['#'] });
  assert.equal(glyph(f, '.').w, 1);
  assert.equal(glyph(f, 'Q'), f.tofu);
  assert.deepEqual(measureBanner('..', { font: f, mode: 'block' }), { width: 3, height: 1 });
});

test('banner() emits ANSI that strips to non-empty glyph art; mono has no escapes', () => {
  const s = banner('PROTEUS', { font: 'bold', fill: 'prism', shadow: true, depth: 'truecolor' });
  assert.ok(s.includes('\x1b['));
  assert.ok(stripAnsi(s).replace(/\s/g, '').length > 20);
  const mono = banner('OK', { font: 'tiny', depth: 'mono', shadow: true });
  assert.ok(!mono.includes('\x1b'));
  assert.ok(mono.includes('█') || mono.includes('▀') || mono.includes('▄'));
});

test('gradientText respects depth', () => {
  assert.equal(gradientText('hello world', 'prism', { depth: 'mono' }), 'hello world');
  const tc = gradientText('hello', 'aurora', { depth: 'truecolor' });
  assert.match(tc, /\x1b\[38;2;\d+;\d+;\d+m/);
  assert.equal(stripAnsi(tc), 'hello');
  assert.match(gradientText('hi', ['#ff0000', '#0000ff'], { depth: '256' }), /\x1b\[38;5;\d+m/);
  assert.match(gradientText('hi', '#ff0000', { depth: '16' }), /\x1b\[(9[0-7]|3[0-7])m/);
  assert.equal(gradientText('', 'prism', { depth: 'truecolor' }), '');
});

test('every effect is safe at t=0, mid, end, on empty text, tiny and View surfaces', () => {
  for (const name of EFFECT_NAMES) {
    const { fn } = EFFECTS[name];
    const dur = effectDuration(name, 'Hello, world');
    for (const text of ['Hello, world', '', ' ', 'wide 漢字 ok']) {
      for (const t of [0, dur / 2, dur, dur * 3]) {
        for (const big of [false, true]) {
          const buf = new CellBuffer(60, 14);
          const opts = big ? { font: 'standard', mode: 'half' } : {};
          assert.doesNotThrow(() => fn(buf, 1, 3, text, t, opts), `${name} big=${big} t=${t} "${text}"`);
          assert.doesNotThrow(() => fn(buf.view(5, 2, 10, 3), 'center', 'center', text, t, opts));
          assert.doesNotThrow(() => fn(new CellBuffer(1, 1), 0, 0, text, t, opts));
          assert.doesNotThrow(() => fn(buf, 0, 0, text, t, { ...opts, final: true }));
        }
      }
    }
  }
});

test('one-shot effects settle to the real text', () => {
  for (const name of ['typewriter', 'decrypt', 'fadeIn', 'wipe']) {
    const buf = new CellBuffer(30, 1);
    const done = EFFECTS[name].fn(buf, 0, 0, 'root cause found', 10, {});
    assert.equal(done, true, name);
    assert.equal(buf.toString(), 'root cause found', name);
  }
  const mid = new CellBuffer(30, 1);
  EFFECTS.typewriter.fn(mid, 0, 0, 'abcdef', 0.1, { cps: 20 });
  assert.equal(mid.toString().replace(/[▌_]/, ''), 'ab');
});

test('effects draw only inside a View', () => {
  const buf = new CellBuffer(40, 10);
  const v = buf.view(10, 3, 12, 4);
  for (const name of EFFECT_NAMES) {
    EFFECTS[name].fn(v, 0, 0, 'overflowing text that is long', 0.7, {});
    EFFECTS[name].fn(v, 0, 0, 'BIG', 0.7, { font: 'bold', mode: 'half' });
  }
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 40; x++) {
      const inside = x >= 10 && x < 22 && y >= 3 && y < 7;
      if (!inside) assert.equal(buf.get(x, y).ch, ' ', `leak at ${x},${y}`);
    }
});

test('animateText on a non-TTY stream writes plain text only', async () => {
  const chunks = [];
  const stream = { isTTY: false, write: (s) => { chunks.push(s); return true; } };
  await animateText('Root cause: pool exhausted', { effect: 'decrypt', stream });
  await animateText('PROTEUS', { effect: 'shimmer', font: 'bold', stream });
  assert.deepEqual(chunks, ['Root cause: pool exhausted\n', 'PROTEUS\n']);
  await assert.rejects(() => animateText('x', { effect: 'nope', stream }));
});

test('animateText animates inline on a TTY-like stream and leaves the final text', async () => {
  let out = '';
  const stream = { isTTY: true, columns: 40, rows: 10, write: (s, cb) => { out += s; cb && setImmediate(cb); return true; }, on() {}, off() {} };
  await animateText('done!', { effect: 'typewriter', stream, fps: 60, cps: 200 });
  assert.ok(out.includes('\x1b[?2026h'), 'synchronized frames');
  // Frames are diffs, so the text can arrive piecewise — every glyph must have been drawn.
  const plain = stripAnsi(out);
  for (const ch of 'done!') assert.ok(plain.includes(ch), `missing ${ch}`);
  assert.ok(out.endsWith('\x1b[?25h'), 'cursor restored at the end');
});

test('Text scenes render in every mode, theme and size', () => {
  for (const scene of [bannerScene, textfxScene]) {
    for (const mode of [null, 'half', 'quad', 'sextant', 'braille', 'ascii'])
      for (const [w, h] of [[100, 30], [40, 12], [8, 3], [1, 1]]) {
        const buf = renderScene(scene, { width: w, height: h, t: 1.3, fps: 10, mode });
        assert.equal(buf.width, w);
      }
    const light = renderScene(scene, { width: 80, height: 24, t: 9, fps: 5, theme: 'primer-light' });
    assert.ok(light.toString().trim().length > 0);
    const ascii = renderScene(scene, { width: 80, height: 24, t: 2, fps: 5, caps: { unicode: false, sextant: false } });
    assert.ok(!/[▀-▟⠀-⣿]/.test(ascii.toString()), `${scene.title} uses unicode blocks in ascii caps`);
  }
  const custom = renderScene(bannerScene, { width: 100, height: 30, t: 1.5, params: { text: 'PROTEUS' } });
  assert.ok(custom.toString().length > 0);
});
