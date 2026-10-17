// app-waveform — live audio flowing across a block of keys.
//
// The span canvas includes the physical gaps between keys (hidden behind the bezel),
// so the wave keeps its true position as it travels: it slips into a gap and
// re-emerges in the next key exactly where it should — gap-compensated motion.
// Geometry is emitted per key cell (each cell's paths are clamped to its own window),
// so API 1.2 culling gives every key a small slice, and keys the wave doesn't reach
// stay byte-identical frame to frame.
//
// Data: ctx.data.audio = { levels: number[] (peak 0–1, oldest first), rate (Hz), level }
// from the audio source (src/apps/sources/audio.js → src/audio/analyzer.js); without it
// a deterministic 120 BPM groove plays (seamless every 16 s).
//
// Styles: 'smooth' — a filled envelope with a lifted core and crisp edges; 'bars' — one
// capsule per level sample (crisp at 72 px; a new sample pushes every bar one pitch along).
// Layouts ('auto' picks per block shape):
//   rows      (auto) each row is the next stretch of time, like lines of text — newest bottom-right
//   mirror    one mirrored envelope across the whole block (best with an odd row count: the axis sits in a key)
//   skyline   the envelope rises from the bottom edge
//   pour      time runs down from the top (tall blocks)

import { surface } from '../../scene/index.js';
import { audioOf } from './_data.js';
import { keyGlass, rampFill, bandPath, smoothLine, glowDot, whiteOf, lift, PALETTE_OPTIONS, colorAt, path, rect, n, clamp } from './_kit.js';

export const LAYOUTS = ['auto', 'mirror', 'rows', 'skyline', 'pour'];

/** The layout a block gets under 'auto': rows (each row a lane whose axis sits inside its keys). */
export const autoLayout = () => 'rows';

/**
 * Display curve. Normalized music sits high and tight (floor ≈ 0.4, body ≈ 0.5, hits ≈ 0.95),
 * so levels are expanded around the floor, then shaped per lane: the typical body fills
 * ~3/4 of one key's half-height wherever a lane's amplitude spans several keys, so hits
 * reach the outer keys while the body stays in the key that holds the axis.
 */
export const expand = (v) => clamp((v - 0.22) / 0.78);
const BODY = expand(0.52);
const gammaFor = (amp, K) => clamp(Math.log(Math.min(0.92, 0.75 / (amp / (K / 2)))) / Math.log(BODY), 0.6, 2.4);
const ampOf = (L, v) => L.amp * (L.floor + (1 - L.floor) * expand(v) ** L.gamma);

/** Level at an age (s) from a levels ring buffer (the newest sample is frac / rate s old). */
function levelAt(A, age, span) {
  const N = A.levels.length;
  const idx = N - 1 - (age * A.rate - A.frac);
  if (idx < -0.5) return 0;
  const half = span * A.rate * 0.5;
  if (half <= 0.75) {
    const c = clamp(idx, 0, N - 1), i = Math.floor(c), f = c - i;
    return A.levels[i] + ((A.levels[Math.min(N - 1, i + 1)] ?? A.levels[i]) - A.levels[i]) * f;
  }
  let m = 0;
  for (let i = Math.max(0, Math.floor(idx - half)); i <= Math.min(N - 1, Math.ceil(idx + half)); i++) m = Math.max(m, A.levels[i]);
  return m;
}

// Lane coordinates: `along` runs with time (x for horizontal lanes, y for 'pour'), `across`
// carries amplitude (y, or x). Age grows from the lane's origin: h lanes flow right → left.
const ageAt = (L, along, pps) => L.age0 + (L.v ? along - L.o : L.o - along) / pps;
const xy = (L, along, across) => (L.v ? [across, along] : [along, across]);
const cellRange = (L, c) => (L.v ? { a0: c.y, a1: c.y + c.h, c0: c.x, c1: c.x + c.w } : { a0: c.x, a1: c.x + c.w, c0: c.y, c1: c.y + c.h });

/** Smooth envelope for one cell: { body, core, edges } path data ('' when the wave doesn't reach it). */
function cellEnvelope(A, L, R, pps, step, m) {
  const lo = Math.max(R.a0 - m, L.v ? L.o : L.o - L.len), hi = Math.min(R.a1 + m, L.v ? L.o + L.len : L.o);
  if (hi <= lo) return null;
  const C0 = R.c0 - m, C1 = R.c1 + m;
  const k0 = Math.floor(lo / step), k1 = Math.ceil(hi / step);
  const oT = [], oB = [], iT = [], iB = [], runsT = [], runsB = [];
  let hit = false, runT = null, runB = null;
  for (let k = k0; k <= k1; k++) {
    const al = clamp(k * step, lo, hi);
    const v = levelAt(A, ageAt(L, al, pps), step / pps);
    const a = ampOf(L, v), c = a * (0.34 + 0.26 * expand(v));
    const top = L.axis - a, bot = L.mirror ? L.axis + a : L.axis;
    const t = clamp(top, C0, C1), b = clamp(bot, C0, C1);
    if (b - t > 0.05) hit = true;
    oT.push(xy(L, al, t)); oB.push(xy(L, al, b));
    iT.push(xy(L, al, clamp(L.axis - c, C0, C1))); iB.push(xy(L, al, clamp(L.mirror ? L.axis + c : L.axis, C0, C1)));
    // edges only where the envelope's boundary lies inside this cell
    if (top >= C0 && top <= C1) { if (!runT) runsT.push((runT = [])); runT.push(xy(L, al, top)); } else runT = null;
    if (L.mirror && bot >= C0 && bot <= C1) { if (!runB) runsB.push((runB = [])); runB.push(xy(L, al, bot)); } else runB = null;
  }
  if (!hit) return null;
  const edges = [...runsT, ...runsB].filter((r) => r.length > 1).map(smoothLine).join('');
  return { body: bandPath(oT, oB), core: bandPath(iT, iB), edges };
}

/** Every bar of a lane: one per level sample (grouped when the flow is slow), at its age. */
function laneBars(A, L, pps, bw) {
  const pitch = pps / A.rate;
  const group = Math.max(1, Math.ceil((bw * 1.7) / pitch));
  const N = A.levels.length, out = [];
  for (let k = 0; ; k++) {
    const age = (k * group + A.frac) / A.rate;
    const s = (age - L.age0) * pps;
    if (s > L.len + bw) break;
    const i1 = N - 1 - k * group;
    if (i1 < 0) break;
    if (s < -bw) continue;
    let v = 0;
    for (let j = 0; j < group && i1 - j >= 0; j++) v = Math.max(v, A.levels[i1 - j]);
    const a = ampOf(L, v);
    out.push({ along: L.v ? L.o + s : L.o - s, a, c: a * (0.3 + 0.25 * expand(v)) });
  }
  return out;
}

/** Bars inside one cell: { d, dc } stroke path data. Caps that cross a cell edge end in the gap. */
function cellBars(bars, L, R, bw) {
  const cap = bw / 2, C0 = R.c0 - bw, C1 = R.c1 + bw;
  let d = '', dc = '';
  const seg = (al, p, q) => { const [x1, y1] = xy(L, al, p), [x2, y2] = xy(L, al, q); return `M${n(x1, 1)} ${n(y1, 1)}L${n(x2, 1)} ${n(y2, 1)}`; };
  for (const b of bars) {
    if (b.along < R.a0 - bw || b.along > R.a1 + bw) continue;
    const a = Math.max(cap * 0.2, b.a - cap);
    const p = Math.max(L.axis - a, C0), q = Math.min(L.mirror ? L.axis + a : L.axis - cap * 0.2, C1);
    if (q - p > 0.05) d += seg(b.along, p, q);
    if (b.c > cap * 0.6) {
      const pc = Math.max(L.axis - b.c, C0), qc = Math.min(L.mirror ? L.axis + b.c : L.axis - cap * 0.2, C1);
      if (qc - pc > 0.05) dc += seg(b.along, pc, qc);
    }
  }
  return { d, dc };
}

export default {
  id: 'app-waveform',
  title: 'Waveform Across Keys',
  category: 'Audio',
  description: 'Audio flowing across a block of keys, gap-compensated so the wave slips behind each bezel. Live from sound capture in the plugin; simulated until one runs.',
  tags: ['audio', 'waveform', 'live', 'span', 'music', 'level', 'oscilloscope', 'gap-compensated', 'stream', 'streaming', 'visualizer'],
  surface: 'span',
  span: { cols: 'all', rows: 'all' },
  data: ['audio'],
  fps: 15,
  loop: 16,
  params: {
    style: { type: 'select', default: 'smooth', options: ['smooth', 'bars'], label: 'Style' },
    layout: { type: 'select', default: 'auto', options: LAYOUTS, label: 'Layout' },
    palette: { type: 'select', default: 'auto', options: PALETTE_OPTIONS, label: 'Palette' },
    speed: { type: 'number', default: 1, min: 0.25, max: 3, step: 0.05, label: 'Flow speed' },
    gain: { type: 'number', default: 1, min: 0.3, max: 2, step: 0.05, label: 'Gain' },
  },
  order: 10,
  render(ctx) {
    const d = surface(ctx);
    const { w, h, grid, params: p } = ctx;
    keyGlass(d, grid, { index: false });
    const K = Math.min(grid.key.w, grid.key.h);
    const layout = p.layout === 'auto' ? autoLayout(grid) : p.layout;
    const pitchX = grid.key.w + grid.gapX, pitchY = grid.key.h + grid.gapY;
    const vertical = layout === 'pour';
    const pps = p.speed * 1.3 * (vertical ? pitchY : pitchX);
    const margin = K * 0.1;
    const nLanes = layout === 'rows' ? grid.rows : 1;
    const seconds = ((vertical ? h : w) * nLanes) / pps + 0.4;
    const A0 = audioOf(ctx, { count: Math.ceil(seconds * 30) + 4, rate: 30 });
    const A = p.gain === 1 ? A0 : { ...A0, levels: A0.levels.map((v) => clamp(v * p.gain)) };

    const lanes = [];
    const lane = (o) => lanes.push({ floor: 0.04, mirror: true, v: false, ...o, gamma: gammaFor(o.mirror === false ? o.amp / 2 : o.amp, K) });
    if (layout === 'pour') lane({ v: true, o: 0, axis: w / 2, len: h, amp: w / 2 - margin, age0: 0 });
    else if (layout === 'rows') {
      for (let r = 0; r < grid.rows; r++) lane({ o: w, axis: r * pitchY + grid.key.h / 2, len: w, amp: grid.key.h / 2 - margin * 0.8, age0: ((grid.rows - 1 - r) * w) / pps, row: grid.row + r });
    } else if (layout === 'skyline') lane({ o: w, axis: h - margin * 0.7, len: w, amp: h - margin * 1.7, age0: 0, mirror: false, floor: 0.05 });
    else lane({ o: w, axis: h / 2, len: w, amp: h / 2 - margin, age0: 0 });

    const dark = d.dark, pal = p.palette;
    const total = Math.max(1e-6, seconds - 0.4);
    const ramp = (f) => 0.14 + 0.86 * f ** 1.3;          // f: 0 oldest … 1 newest
    const bw = Math.max(1.5, Math.min(K * 0.034, (pps / A.rate) * 0.56));
    const step = Math.max(2, K / 24), m = Math.min(grid.gapX, grid.gapY, K * 0.1) * 0.45;
    for (const L of lanes) {
      const end = L.v ? L.o + L.len : L.o - L.len;
      const geo = L.v ? { x1: L.axis, y1: L.o, x2: L.axis, y2: end } : { x1: L.o, y1: L.axis, x2: end, y2: L.axis };
      const newF = (f) => 1 - clamp((L.age0 + (f * L.len) / pps) / total);
      const stops = (op, k = 0) => Array.from({ length: 7 }, (_, i) => { const f = i / 6, af = newF(f); const c = colorAt(ctx, pal, 0.12 + 0.88 * af); return [f, k ? lift(d, c, k) : c, op(af)]; });
      const cells = grid.cells.filter((c) => L.row === undefined || c.row === L.row);
      if (p.style === 'bars') {
        const body = rampFill(d, stops((af) => (dark ? 0.95 : 0.9) * ramp(af)), { ...geo, name: 'bars' });
        const core = rampFill(d, stops((af) => 0.85 * ramp(af) ** 1.5, dark ? 0.55 : 0.4), { ...geo, name: 'core' });
        const bars = laneBars(A, L, pps, bw);
        for (const c of cells) {
          const B = cellBars(bars, L, cellRange(L, c), bw);
          if (B.d) d.add(path(B.d, { fill: 'none', stroke: body, strokeWidth: n(bw), strokeLinecap: 'round' }));
          if (B.dc) d.add(path(B.dc, { fill: 'none', stroke: core, strokeWidth: n(bw * 0.5), strokeLinecap: 'round' }));
        }
      } else {
        const body = rampFill(d, stops((af) => (dark ? 0.6 : 0.5) * ramp(af)), { ...geo, name: 'body' });
        const core = rampFill(d, stops((af) => 0.85 * ramp(af), dark ? 0.5 : 0.35), { ...geo, name: 'core' });
        const edge = rampFill(d, stops((af) => 0.3 + 0.7 * ramp(af)), { ...geo, name: 'edge' });
        const ew = Math.max(1, d.m.line * 0.8);
        for (const c of cells) {
          const g = cellEnvelope(A, L, cellRange(L, c), pps, step, m);
          if (!g) continue;
          d.add(path(g.body, { fill: body }));
          d.add(path(g.core, { fill: core }));
          if (g.edges) d.add(path(g.edges, { fill: 'none', stroke: edge, strokeWidth: n(ew), strokeLinejoin: 'round', strokeLinecap: 'round' }));
        }
      }
      // the Beam: the lane's axis as a hairline of white light, drawn per key it crosses
      if (L.mirror) for (const c of cells) {
        const R = cellRange(L, c);
        if (L.axis < R.c0 || L.axis > R.c1) continue;
        const [x, y] = xy(L, R.a0, L.axis - d.m.hair / 2);
        d.add(rect({ x, y, width: L.v ? d.m.hair : R.a1 - R.a0, height: L.v ? R.a1 - R.a0 : d.m.hair, fill: d.colors.beam || whiteOf(d), fillOpacity: dark ? 0.22 : 0.3 }));
      }
    }
    // the live head: where sound enters, a short white bar with a glint
    const L0 = layout === 'rows' ? lanes[lanes.length - 1] : lanes[0];
    const inset = d.m.safe * 1.2;
    const hal = L0.v ? L0.o + inset : L0.o - inset;
    const a = Math.max(d.m.bold, ampOf(L0, levelAt(A, inset / pps + L0.age0, 1 / A.rate)));
    const cellOf = grid.cells.find((c) => { const R = cellRange(L0, c); return hal >= R.a0 && hal <= R.a1 && L0.axis >= R.c0 && L0.axis <= R.c1; })
      || grid.cells.find((c) => { const R = cellRange(L0, c); return hal >= R.a0 && hal <= R.a1 && L0.axis > R.c1 - 1e-6 && L0.axis <= R.c1 + K; });
    const R = cellRange(L0, cellOf || grid.cells[grid.cells.length - 1]);
    const p1 = clamp(L0.axis - a, R.c0 + d.m.safe * 0.5, R.c1), p2 = clamp(L0.mirror ? L0.axis + a : L0.axis, R.c0, R.c1 - d.m.safe * 0.5);
    const [x1, y1] = xy(L0, hal, p1), [x2, y2] = xy(L0, hal, p2);
    const [hx, hy] = xy(L0, hal, clamp(L0.axis, R.c0, R.c1));
    d.add(path(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, { stroke: whiteOf(d), strokeWidth: n(Math.max(1.25, d.m.line)), strokeOpacity: 0.92, strokeLinecap: 'round' }));
    // the glint: the newest color by night and day (an ink glow would read as a smudge on pearl)
    d.add(glowDot(d, { cx: hx, cy: hy, r: d.m.bold * 0.8, color: colorAt(ctx, pal, 1), opacity: 0.9, core: false }));
    d.add(glowDot(d, { cx: hx, cy: hy, r: d.m.line, color: dark ? whiteOf(d) : lift(d, colorAt(ctx, pal, 1), 0.45), opacity: 0.6, rings: 1 }));
    return d.svg();
  },
};
