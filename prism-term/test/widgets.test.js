// Widget geometry + spinner integrity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CellBuffer } from '../src/buffer.js';
import { NONE } from '../src/color.js';
import { getTheme } from '../src/palettes.js';
import { stringWidth } from '../src/width.js';
import {
  box, rule, progressBar, sparkline, barChart, meter, lineChart, heatmap, gauge, table, logView, badge, statusDot, kpi, fmt,
} from '../src/widgets/index.js';
import { SPINNERS, SPINNER_NAMES, spinnerFrame, drawSpinner } from '../src/spinners.js';

const theme = getTheme();
const row = (b, y) => Array.from({ length: b.width }, (_, x) => b.get(x, y).ch).join('');

/** Assert nothing was drawn outside [x, x+w) × [y, y+h). */
function assertInside(b, x, y, w, h) {
  for (let yy = 0; yy < b.height; yy++)
    for (let xx = 0; xx < b.width; xx++) {
      if (xx >= x && xx < x + w && yy >= y && yy < y + h) continue;
      const c = b.get(xx, yy);
      assert.ok(c.ch === ' ' && c.fg === NONE && c.bg === NONE, `cell (${xx},${yy}) touched: ${JSON.stringify(c)}`);
    }
}

test('box draws corners, edges and a left-aligned title; returns the interior view', () => {
  const b = new CellBuffer(20, 6);
  const inner = box(b, 1, 1, 12, 4, { title: 'CPU' });
  assert.equal(b.get(1, 1).ch, '╭');
  assert.equal(b.get(12, 1).ch, '╮');
  assert.equal(b.get(1, 4).ch, '╰');
  assert.equal(b.get(12, 4).ch, '╯');
  assert.equal(b.get(1, 2).ch, '│');
  assert.equal(row(b, 1).slice(1, 13), '╭ CPU ─────╮');
  assert.deepEqual([inner.width, inner.height, inner.ox, inner.oy], [10, 2, 2, 2]);
  assertInside(b, 1, 1, 12, 4);
});

test('box styles, centered titles, padding, and degenerate sizes', () => {
  const b = new CellBuffer(20, 5);
  box(b, 0, 0, 20, 5, { style: 'double', title: 'Hi', titleAlign: 'center', footer: 'v1' });
  assert.equal(b.get(0, 0).ch, '╔');
  assert.equal(row(b, 0).trim(), '╔═══════ Hi ═══════╗');
  assert.match(row(b, 4), /v1 ═╝$/);
  const v = box(new CellBuffer(10, 10), 0, 0, 10, 10, { padding: [1, 2] });
  assert.deepEqual([v.width, v.height], [4, 6]);
  for (const [w, h] of [[0, 0], [1, 1], [1, 5], [5, 1], [2, 2]]) {
    const t = new CellBuffer(6, 6);
    assert.doesNotThrow(() => box(t, 1, 1, w, h, { title: 'long title' }));
    assertInside(t, 1, 1, w, h);
  }
  const a = new CellBuffer(6, 3);
  box(a, 0, 0, 6, 3, { style: 'ascii' });
  assert.equal(row(a, 0), '+----+');
  rule(a, 0, 1, 6, { label: 'x' });
  assert.equal(row(a, 1), '─ x ──');
});

test('progressBar eighth-block math', () => {
  const at = (v) => { const b = new CellBuffer(10, 1); progressBar(b, 0, 0, 10, v); return b; };
  const full = (b, i) => b.get(i, 0).ch === ' ' && b.get(i, 0).bg !== theme.panel2;
  let b = at(0);
  for (let i = 0; i < 10; i++) assert.equal(b.get(i, 0).bg, theme.panel2, 'empty track');
  b = at(0.5);
  for (let i = 0; i < 5; i++) assert.ok(full(b, i), `cell ${i} filled`);
  for (let i = 5; i < 10; i++) assert.equal(b.get(i, 0).bg, theme.panel2);
  b = at(0.33); // 26.4 eighths → 3 full + ▎ (2/8)
  for (let i = 0; i < 3; i++) assert.ok(full(b, i));
  assert.equal(b.get(3, 0).ch, '▎');
  assert.equal(b.get(3, 0).bg, theme.panel2);
  b = at(1);
  for (let i = 0; i < 10; i++) assert.ok(full(b, i));
  assert.deepEqual(progressBar(new CellBuffer(10, 1), 0, 0, 10, 0.33), { barX: 0, barWidth: 10, filled: 3.25 });
});

test('progressBar with label, percent, ascii fallback, out-of-range values', () => {
  const b = new CellBuffer(30, 1);
  const r = progressBar(b, 0, 0, 30, 0.5, { label: 'Load', showPercent: true });
  assert.equal(r.barX, 5);
  assert.equal(r.barWidth, 30 - 5 - 5);
  assert.match(row(b, 0), /^Load .* {2}50%$/);
  const a = new CellBuffer(12, 1);
  progressBar(a, 0, 0, 12, 0.5, { ascii: true });
  assert.equal(row(a, 0), '[#####-----]');
  for (const v of [-1, 2, NaN, undefined]) assert.doesNotThrow(() => progressBar(new CellBuffer(5, 1), 0, 0, 5, v));
  assert.doesNotThrow(() => progressBar(new CellBuffer(2, 1), 0, 0, 2, 0.5, { label: 'too long', showPercent: true }));
});

test('sparkline maps min → ▁ and max → █, keeps the tail, aligns', () => {
  const b = new CellBuffer(8, 1);
  sparkline(b, 0, 0, 8, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(row(b, 0), '▁▂▃▄▅▆▇█');
  const c = new CellBuffer(4, 1);
  const r = sparkline(c, 0, 0, 4, [100, 0, 5, 10, 0, 10]);
  assert.equal(row(c, 0), '▅█▁█');
  assert.equal(r.drawn, 4);
  assert.deepEqual([r.min, r.max], [0, 10]);
  const d = new CellBuffer(6, 1);
  sparkline(d, 0, 0, 6, [1, 2], { align: 'right' });
  assert.equal(row(d, 0), '    ▁█');
  const e = new CellBuffer(4, 1);
  sparkline(e, 0, 0, 4, [5, 5, 5], { min: 0, max: 10 });
  assert.equal(row(e, 0).trim(), '▅▅▅');
  const f = new CellBuffer(6, 3);
  sparkline(f, 1, 1, 3, [0, 10, 20, 30, 40, 50], { style: 'braille' });
  assertInside(f, 1, 1, 3, 1);
  assert.ok([...row(f, 1)].some((ch) => ch >= '⠁' && ch <= '⣿'));
});

test('lineChart stays inside its rect, labels axes, merges fill', () => {
  const b = new CellBuffer(60, 20);
  const data = Array.from({ length: 50 }, (_, i) => 50 + 40 * Math.sin(i / 5));
  const r = lineChart(b, 5, 3, 40, 12, [{ data, label: 'p50' }, { data: data.map((v) => v * 0.6), label: 'p10' }], {
    fill: true, grid: true, labels: ['-5m', '-2m', 'now'],
  });
  assertInside(b, 5, 3, 40, 12);
  assert.ok(r.plotW > 30 && r.plotH > 5);
  assert.match(row(b, 3), /● p50 {2}● p10/);
  assert.match(row(b, 14), /-5m.*now/);
  const braille = [];
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) { const ch = b.get(x, y).ch; if (ch > '⠀' && ch <= '⣿') braille.push(ch); }
  assert.ok(braille.length > 40, 'plots braille dots');
  for (const [w, h] of [[0, 0], [2, 1], [5, 2], [8, 3]]) {
    const t = new CellBuffer(10, 5);
    assert.doesNotThrow(() => lineChart(t, 1, 1, w, h, [1, 2, 3]));
    assertInside(t, 1, 1, w, h);
  }
  assert.doesNotThrow(() => lineChart(new CellBuffer(20, 6), 0, 0, 20, 6, [[5, 5, 5]]));
});

test('barChart vertical + horizontal precision and containment', () => {
  const b = new CellBuffer(30, 12);
  barChart(b, 2, 1, 20, 10, [{ label: 'a', value: 10 }, { label: 'b', value: 5 }, { label: 'c', value: 0 }]);
  assertInside(b, 2, 1, 20, 10);
  const h = new CellBuffer(30, 4);
  barChart(h, 0, 0, 30, 4, [{ label: 'api', value: 100 }, { label: 'db', value: 50 }], { horizontal: true });
  assert.match(row(h, 0), /^api █+ 100$/);
  const fulls = [...row(h, 1)].filter((c) => c === '█').length;
  const fullsA = [...row(h, 0)].filter((c) => c === '█').length;
  assert.ok(Math.abs(fulls - fullsA / 2) <= 1, 'half value → about half length');
  assert.doesNotThrow(() => barChart(new CellBuffer(3, 2), 0, 0, 3, 2, [1, 2, 3, 4, 5, 6]));
});

test('gauge, heatmap, meter, table, logView, badge, statusDot, kpi render within bounds', () => {
  const b = new CellBuffer(40, 12);
  gauge(b, 2, 1, 20, 8, 0.73, { label: 'CPU' });
  assertInside(b, 2, 1, 20, 8);
  assert.match(b.toString(), /73%/);
  assert.match(b.toString(), /CPU/);
  const g2 = new CellBuffer(20, 10);
  gauge(g2, 0, 0, 20, 10, 0.95, { style: 'ring' });
  assert.match(g2.toString(), /95%/);
  for (const [w, h] of [[1, 1], [3, 1], [4, 2]]) assert.doesNotThrow(() => gauge(new CellBuffer(5, 3), 0, 0, w, h, 0.5, { label: 'x' }));

  const hm = new CellBuffer(10, 4);
  const r = heatmap(hm, 0, 0, [[0, 1, 2], [3, 4, 5], [6, 7, 8]]);
  assert.deepEqual([r.width, r.height], [3, 2]);
  assert.equal(hm.get(0, 0).ch, '▀');
  assert.notEqual(hm.get(0, 0).fg, hm.get(0, 0).bg);
  assert.equal(hm.get(0, 1).ch, '▀');
  assert.equal(hm.get(0, 1).bg, NONE);

  const m = new CellBuffer(10, 1);
  meter(m, 0, 0, 10, 0.5);
  assert.equal(row(m, 0), '▰▰▰▰▰▱▱▱▱▱');

  const t = new CellBuffer(30, 5);
  const lines = table(t, 0, 0, 30, [{ svc: 'api', p99: 120 }, { svc: 'db', p99: 9 }], {
    columns: [{ key: 'svc', title: 'Service' }, { key: 'p99', title: 'p99', align: 'right', width: 6 }],
  });
  assert.equal(lines, 3);
  assert.equal(row(t, 0).trimEnd(), 'Service    p99');
  assert.equal(row(t, 1).trimEnd(), 'api        120');
  assert.equal(row(t, 2).trimEnd(), 'db           9');
  assert.equal(t.get(0, 2).bg, theme.panel, 'zebra stripe');
  const narrow = new CellBuffer(10, 3);
  table(narrow, 0, 0, 10, [{ a: 'abcdefghijkl', b: 'mnopqrstu' }]);
  assert.ok(stringWidth(row(narrow, 1).trimEnd()) <= 10);

  const lg = new CellBuffer(40, 3);
  logView(lg, 0, 0, 40, 2, [{ level: 'info', msg: 'old' }, { time: '12:00:01', level: 'warn', msg: 'pool 80%' }, { level: 'error', msg: 'timeout' }]);
  assert.equal(row(lg, 0).trimEnd(), '12:00:01 WARN  pool 80%');
  assert.equal(row(lg, 1).trimEnd(), 'ERROR timeout');
  assert.equal(lg.get(0, 1).fg, theme.neg);

  const bd = new CellBuffer(20, 1);
  const bw = badge(bd, 0, 0, 'CRIT', { color: 'crit' });
  assert.equal(bw, 6);
  assert.equal(row(bd, 0).slice(0, 6), '▐CRIT▌');
  assert.equal(bd.get(1, 0).bg, theme.crit);
  const sd = new CellBuffer(20, 1);
  assert.equal(statusDot(sd, 0, 0, 'down', { label: 'db' }), 4);
  assert.equal(sd.get(0, 0).fg, theme.neg);

  const k = new CellBuffer(30, 6);
  kpi(k, 1, 0, 24, 6, { label: 'Latency', value: 182, unit: 'ms', delta: -4.2, goodWhen: 'down', trend: [1, 3, 2, 5, 4, 6] });
  assertInside(k, 1, 0, 24, 6);
  assert.match(k.toString(), /Latency/);
  assert.match(k.toString(), /182 ms/);
  assert.match(k.toString(), /▼ 4\.2%/);
});

test('fmt compacts numbers', () => {
  assert.equal(fmt(12), '12');
  assert.equal(fmt(12345), '12.3k');
  assert.equal(fmt(2_500_000), '2.5M');
  assert.equal(fmt(0.0312), '0.031');
  assert.equal(fmt(3.14159), '3.14');
  assert.equal(fmt(NaN), '–');
});

test('spinners: ≥30, every one width-stable and non-empty', () => {
  assert.ok(SPINNER_NAMES.length >= 30, `${SPINNER_NAMES.length} spinners`);
  for (const name of SPINNER_NAMES) {
    const s = SPINNERS[name];
    assert.ok(s.frames.length >= 2, `${name} has frames`);
    assert.ok(s.interval > 0, `${name} interval`);
    const widths = new Set(s.frames.map(stringWidth));
    assert.equal(widths.size, 1, `${name} width-stable (${[...widths]})`);
    assert.ok([...widths][0] >= 1, `${name} visible`);
  }
});

test('spinnerFrame advances with time; drawSpinner colors palette spinners per character', () => {
  assert.equal(spinnerFrame('dots', 0), '⠋');
  assert.equal(spinnerFrame('dots', 0.08), '⠙');
  assert.equal(spinnerFrame('dots', 0.8), '⠋');
  const b = new CellBuffer(10, 1);
  const end = drawSpinner(b, 1, 0, 'wave', 0.3);
  assert.equal(end, 9);
  const colors = new Set(Array.from({ length: 8 }, (_, i) => b.get(1 + i, 0).fg));
  assert.ok(colors.size > 1, 'gradient across characters');
  const c = new CellBuffer(4, 1);
  drawSpinner(c, 0, 0, 'dots', 0, { color: 'neg' });
  assert.equal(c.get(0, 0).fg, theme.neg);
});
